import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { EXERCISES } from './exercises/catalog'
import { pickPrompt, type Exercise, type Prompt } from './exercises/types'
import { principleOfDay, recommend } from './exercises/plan'
import {
  allSessions,
  db,
  migrateLegacyDatabase,
  type SessionMetrics,
  type SessionRecord,
} from './engine/db'
import { embedder } from './engine/embedder'
import { scoreChain, scoreDAT, scoreDivergent, scorePairwise, type ScoredIdea } from './engine/scoring'
import { craByTier, type CraItem } from './data/cra'
import { CHAIN_GOOD, CHAIN_WEAK } from './engine/calibration'
import { STRETCH_SEEDS } from './data/prompts'
import type { PartGrade } from './data/genericParts'
import { Button, Chip, Panel, categoryStyle } from './components/ui'
import { WorkedExample } from './components/WorkedExample'
import { IdeaRunner, type LiveIdea } from './components/IdeaRunner'
import { ChainRunner } from './components/ChainRunner'
import { DatRunner } from './components/DatRunner'
import { DecomposeRunner } from './components/DecomposeRunner'
import { RatRunner } from './components/RatRunner'
import { SessionResult } from './components/SessionResult'
import { JudgeGate } from './components/JudgeGate'
import { Scoring, ScoringError } from './components/Scoring'
import { Progress } from './components/Progress'

type View = 'home' | 'brief' | 'run' | 'judge' | 'result' | 'progress' | 'library'

interface Result {
  exercise: Exercise
  ideas: ScoredIdea[]
  metrics: SessionMetrics
  headline?: { label: string; value: string; hint?: string }
  /** embeddings for the semantic map, when the exercise has meaningful ones */
  vectors?: Float32Array[]
}

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

export default function App() {
  const [view, setView] = useState<View>('home')
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [note, setNote] = useState('')
  const [scoring, setScoring] = useState(false)
  const [scoreError, setScoreError] = useState<string | null>(null)
  /** The last finisher, kept so a failed scoring run can be retried verbatim. */
  const [retry, setRetry] = useState<(() => void) | null>(null)
  /** Raw text of the pending session, so ideas survive a scoring failure. */
  const [pendingTexts, setPendingTexts] = useState<string[]>([])

  const [craQueue, setCraQueue] = useState<CraItem[]>([])
  const [craIdx, setCraIdx] = useState(0)
  const [craLog, setCraLog] = useState<{ item: CraItem; solved: boolean; ms: number }[]>([])

  const embedStatus = useSyncExternalStore(
    embedder.subscribe,
    () => `${embedder.status}:${Math.round(embedder.progress)}`,
  )
  const [status, progressPct] = embedStatus.split(':')

  const refresh = useCallback(async () => setSessions(await allSessions()), [])

  useEffect(() => {
    // Adopt any history from before the rename before the first read, so the
    // trend lines are never briefly missing old sessions.
    void migrateLegacyDatabase().then(refresh)
    void embedder.warm()
  }, [refresh])

  const rec = useMemo(() => recommend(sessions), [sessions])
  const principle = useMemo(() => principleOfDay(), [])

  const seenFor = useCallback(
    (id: string) => sessions.filter((s) => s.exerciseId === id).slice(-12).map((s) => s.promptKey),
    [sessions],
  )

  const begin = (ex: Exercise) => {
    setExercise(ex)
    setNote('')
    if (ex.kind === 'rat') {
      const tier = pickTier(sessions)
      const seen = sessions
        .filter((s) => s.exerciseId === 'cra')
        .flatMap((s) => s.ideas.map((i) => i.text))
      setCraQueue(shuffle(craByTier(tier, seen)).slice(0, 8))
      setCraIdx(0)
      setCraLog([])
      setPrompt({ key: `tier${tier}`, label: `Tier ${tier}` })
    } else if (ex.kind === 'chain') {
      const seed = STRETCH_SEEDS[Math.floor(Math.random() * STRETCH_SEEDS.length)]
      setPrompt({ key: seed, label: seed })
    } else {
      setPrompt(pickPrompt(ex, seenFor(ex.id)))
    }
    setView('brief')
  }

  const save = async (
    ex: Exercise,
    p: Prompt,
    ideas: { text: string; atMs: number }[],
    metrics: SessionMetrics,
    durationMs: number,
  ) => {
    const record: SessionRecord = {
      id: uid(),
      exerciseId: ex.id,
      promptKey: p.key,
      // Store the resolved task, not the generic heading. For Compare Two Cases
      // the label is "what do these share?", which tells you nothing about
      // which session it was when you look back at your history.
      promptLabel: ex.promptTemplate(p).split('\n')[0].slice(0, 160),
      startedAt: Date.now() - durationMs,
      durationMs,
      ideas,
      metrics,
      aiAssisted: false,
    }
    await db.sessions.put(record)
    await refresh()
    return record.id
  }

  const [lastId, setLastId] = useState<string | null>(null)
  const [judged, setJudged] = useState<number | null>(null)

  /** Past agreement outcomes, used to show a running judgement hit-rate. */
  const judgeHistory = useMemo(
    () =>
      sessions
        .filter((s) => typeof s.judgedCorrect === 'boolean')
        .sort((a, b) => a.startedAt - b.startedAt)
        .map((s) => s.judgedCorrect as boolean),
    [sessions],
  )

  /**
   * Open-generation sessions with enough ideas go through a judgement gate
   * before any score is shown, so the user commits to their own assessment
   * before a number anchors it.
   */
  const goToResult = (ex: Exercise, ideaCount: number) => {
    setJudged(null)
    setView(ex.kind === 'idea-list' && ideaCount >= 4 ? 'judge' : 'result')
  }

  const commitJudgement = async (index: number, failureMode: string) => {
    setJudged(index)
    if (result && lastId) {
      const top = [...result.ideas].sort((a, b) => b.originality - a.originality)[0]
      const correct = result.ideas.indexOf(top) === index
      await db.sessions.update(lastId, {
        judgedBestIndex: index,
        judgedCorrect: correct,
        failureMode,
      })
      await refresh()
    }
    setView('result')
  }

  /**
   * Every scoring path runs through here.
   *
   * Scoring depends on a ~19 MB model that may fail to load, and an unhandled
   * rejection anywhere in a finisher would strand the user on a spinner with
   * their session unrecoverable. Failures surface as a real error state that
   * keeps the ideas and offers a retry.
   */
  const runScoring = useCallback(
    (texts: string[], job: () => Promise<void>) => {
      const attempt = () => {
        setPendingTexts(texts)
        setScoreError(null)
        setScoring(true)
        void job()
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err)
            setScoreError(msg || 'Unknown scoring error.')
          })
          .finally(() => setScoring(false))
      }
      setRetry(() => () => {
        setScoring(true)
        void embedder.reset().then(attempt)
      })
      attempt()
    },
    [],
  )

  /* ---------------------------------------------------------- finishers -- */

  const finishIdeaList = (ideas: LiveIdea[], durationMs: number) => {
    if (!exercise || !prompt) return
    const ex = exercise
    const pr = prompt
    // Only scored entries are graded. Scaffolding phases — the deliberately
    // terrible ideas in Reverse Brainstorm, the abstract mechanism in Far-Domain
    // Analogy — would otherwise be judged as if they were proposed solutions,
    // which is both wrong and demoralising.
    const scored = ideas.filter((i) => i.scored)
    const plain = scored.map((i) => ({ text: i.text, atMs: i.atMs, source: i.source }))
    const all = ideas.map((i) => ({ text: i.text, atMs: i.atMs, source: i.source }))
    runScoring(plain.map((p) => p.text), async () => {
      const res =
        ex.scoring === 'pairwise'
          ? await scorePairwise(plain, ex.promptTemplate(pr))
          : await scoreDivergent(
              ex.promptTemplate(pr),
              plain,
              pr.cliches ?? [],
              pr.props ?? [],
            )
      setLastId(await save(ex, pr, all, res.metrics, durationMs))
      setResult({ exercise: ex, ideas: res.ideas, metrics: res.metrics, vectors: res.vectors })
      goToResult(ex, res.ideas.length)
    })
  }

  const finishDat = (words: string[], durationMs: number) => {
    if (!exercise || !prompt) return
    const ex = exercise
    const pr = prompt
    runScoring(words, async () => {
    const res = await scoreDAT(words)
    const datVectors = await embedder.embed(res.used)
    const metrics: SessionMetrics = {
      fluency: res.used.length,
      originality: Math.round(res.score),
      peakOriginality: Math.round(res.score),
      flexibility: res.used.length,
      elaboration: 1,
      serialGain: 0,
    }
    setLastId(
      await save(ex, pr, res.used.map((w, i) => ({ text: w, atMs: i })), metrics, durationMs),
    )
    setResult({
      exercise: ex,
      ideas: res.used.map((w, i) => {
        // Per-word contribution: how far this word sits from the other six.
        const mine = res.pairs.filter((p) => p.a === w || p.b === w)
        const avg = mine.reduce((a, p) => a + p.d, 0) / (mine.length || 1)
        const nearest = mine.reduce((a, p) => (p.d < a.d ? p : a), mine[0])
        return {
          text:
            nearest && nearest.d < 0.55
              ? `${w}  —  closest to "${nearest.a === w ? nearest.b : nearest.a}"`
              : w,
          atMs: i,
          relevance: 1,
          dCliche: 0.9,
          dSelf: nearest?.d ?? 0.9,
          originality: Math.round(avg * 100),
          cliche: (nearest?.d ?? 1) < 0.45,
          offTask: false,
        }
      }),
      metrics,
      vectors: datVectors,
      headline: {
        label: `DAT distance · ${res.band.label}`,
        value: res.score.toFixed(1),
        hint:
          `${res.band.detail} Mean pairwise semantic distance across your first ${res.used.length} valid words.` +
          (res.rejected.length ? ` Skipped: ${res.rejected.join(', ')}.` : '') +
          ' Measured with an on-device model, so this is not comparable to the published GloVe-based norms — compare it to your own earlier scores.',
      },
    })
    setView('result')
    })
  }

  const finishChain = (words: string[], durationMs: number) => {
    if (!exercise || !prompt) return
    const ex = exercise
    const pr = prompt
    runScoring(words, async () => {
    const res = await scoreChain(words)
    const metrics: SessionMetrics = {
      fluency: words.length,
      originality: res.score,
      peakOriginality: Math.round(Math.max(...res.steps.map((s) => s.d), 0) * 100),
      flexibility: res.steps.filter((s) => s.d > CHAIN_GOOD).length,
      elaboration: 1,
      serialGain: 0,
    }
    setLastId(
      await save(ex, pr, words.map((w, i) => ({ text: w, atMs: i })), metrics, durationMs),
    )
    setResult({
      exercise: ex,
      ideas: res.steps.map((s, i) => ({
        text: `${s.from} → ${s.to}`,
        atMs: i,
        relevance: 1,
        dCliche: 0.9,
        dSelf: s.d,
        originality: Math.min(100, Math.round((s.d / 1.05) * 100)),
        cliche: s.d < CHAIN_WEAK,
        offTask: false,
      })),
      metrics,
      headline: {
        label: 'Stretch score',
        value: String(res.score),
        hint: `Weakest jump was ${res.weakest.toFixed(2)}. A chain is only as good as the step where you fell back into free association.`,
      },
    })
    setView('result')
    })
  }

  const finishDecompose = (parts: PartGrade[], durationMs: number) => {
    if (!exercise || !prompt) return
    const ex = exercise
    const pr = prompt
    runScoring(parts.map((p) => p.text), async () => {
    const clean = parts.filter((p) => p.flags.length === 0)
    const pct = parts.length ? Math.round((clean.length / parts.length) * 100) : 0
    const metrics: SessionMetrics = {
      fluency: parts.length,
      originality: pct,
      peakOriginality: pct,
      flexibility: clean.length,
      elaboration:
        Math.round(
          (parts.reduce((a, p) => a + p.text.split(/\s+/).length, 0) / (parts.length || 1)) * 10,
        ) / 10,
      serialGain: 0,
    }
    setLastId(
      await save(ex, pr, parts.map((p, i) => ({ text: p.text, atMs: i })), metrics, durationMs),
    )
    setResult({
      exercise: ex,
      ideas: parts.map((p, i) => ({
        text: p.text + (p.flags.length ? `   ⟵ "${p.flags.join('", "')}" implies a use` : ''),
        atMs: i,
        relevance: 1,
        dCliche: 0.9,
        dSelf: 1,
        originality: p.flags.length ? 20 : 90,
        cliche: p.flags.length > 0,
        offTask: false,
      })),
      metrics,
      headline: {
        label: 'Function-free parts',
        value: `${clean.length}/${parts.length}`,
        hint: 'Parts described with no word that implies a use. That decomposition is what lets you see the feature everyone else walks past.',
      },
    })
    setView('result')
    })
  }

  const finishCra = useCallback(async () => {
    if (!exercise || !prompt) return
    const solved = craLog.filter((l) => l.solved)
    const pct = Math.round((solved.length / (craLog.length || 1)) * 100)
    const metrics: SessionMetrics = {
      fluency: craLog.length,
      originality: pct,
      peakOriginality: pct,
      flexibility: solved.length,
      elaboration: solved.length
        ? Math.round(solved.reduce((a, l) => a + l.ms, 0) / solved.length / 100) / 10
        : 0,
      serialGain: 0,
    }
    setLastId(
      await save(
        exercise,
        prompt,
        craLog.map((l, i) => ({ text: l.item.cues.join('-'), atMs: i })),
        metrics,
        craLog.reduce((a, l) => a + l.ms, 0),
      ),
    )
    setResult({
      exercise,
      ideas: craLog.map((l, i) => ({
        text: `${l.item.cues.join(' · ')} → ${l.item.answer}`,
        atMs: i,
        relevance: 1,
        dCliche: 0.9,
        dSelf: 1,
        originality: l.solved ? 100 : 0,
        cliche: false,
        offTask: false,
      })),
      metrics,
      headline: {
        label: 'Solved',
        value: `${solved.length}/${craLog.length}`,
        hint: solved.length
          ? `Median time to insight ${Math.round(median(solved.map((s) => s.ms)) / 100) / 10}s. Difficulty adapts next round.`
          : 'Nothing landed this round. Difficulty adapts down next time.',
      },
    })
    setView('result')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [craLog, exercise, prompt])

  /* --------------------------------------------------------------- views -- */

  // Scoring and its failure mode are checked before any runner, so a stalled
  // or failed model can never leave the user stuck inside a finished session.
  if (scoreError) {
    return (
      <Shell view={view} setView={setView}>
        <ScoringError
          message={scoreError}
          ideas={pendingTexts}
          onRetry={() => retry?.()}
          onSkip={() => {
            setScoreError(null)
            setView('home')
          }}
        />
      </Shell>
    )
  }

  if (scoring) {
    return (
      <Shell view={view} setView={setView}>
        <Scoring
          onCancel={() => {
            setScoring(false)
            setScoreError('Scoring cancelled before it finished.')
          }}
        />
      </Shell>
    )
  }

  if (view === 'run' && exercise && prompt) {
    const quit = () => setView('home')
    if (exercise.kind === 'dat')
      return (
        <DatRunner
          phase={exercise.phases[0]}
          seconds={exercise.seconds}
          onFinish={finishDat}
          onQuit={quit}
        />
      )
    if (exercise.kind === 'chain')
      return (
        <ChainRunner
          phase={exercise.phases[0]}
          seed={prompt.label}
          seconds={exercise.seconds}
          length={exercise.quota ?? 8}
          onFinish={finishChain}
          onQuit={quit}
        />
      )
    if (exercise.kind === 'decompose')
      return (
        <DecomposeRunner
          phase={exercise.phases[0]}
          prompt={prompt}
          seconds={exercise.seconds}
          quota={exercise.quota ?? 6}
          onFinish={finishDecompose}
          onQuit={quit}
        />
      )
    if (exercise.kind === 'rat') return <CraSession />
    return <IdeaRunner exercise={exercise} prompt={prompt} onFinish={finishIdeaList} onQuit={quit} />
  }

  function CraSession() {
    const item = craQueue[craIdx]
    useEffect(() => {
      if (!item && craLog.length) void finishCra()
    }, [item])
    if (!item) return <Loading label="Wrapping up…" />
    return (
      <RatRunner
        key={craIdx}
        phase={exercise!.phases[0]}
        cues={item.cues}
        answer={item.answer}
        seconds={exercise!.seconds}
        index={craIdx}
        total={craQueue.length}
        onResult={(solved, ms) => {
          setCraLog((l) => [...l, { item, solved, ms }])
          setCraIdx((i) => i + 1)
        }}
        onQuit={() => setView('home')}
      />
    )
  }

  if (view === 'judge' && result) {
    return (
      <Shell view={view} setView={setView}>
        <JudgeGate ideas={result.ideas} onCommit={(i, f) => void commitJudgement(i, f)} />
      </Shell>
    )
  }

  if (view === 'result' && result) {
    return (
      <Shell view={view} setView={setView}>
        <SessionResult
          exercise={result.exercise}
          ideas={result.ideas}
          metrics={result.metrics}
          headline={result.headline}
          vectors={result.vectors}
          judgedIndex={judged}
          judgeHistory={judgeHistory}
          note={note}
          onNote={setNote}
          onDone={async () => {
            if (lastId && note.trim()) {
              await db.sessions.update(lastId, { note: note.trim() })
              await refresh()
            }
            setView('home')
          }}
          onAgain={() => begin(result.exercise)}
        />
      </Shell>
    )
  }

  if (view === 'brief' && exercise && prompt) {
    return (
      <Shell view={view} setView={setView}>
        <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="accent">{exercise.category}</Chip>
            <Chip>{Math.round(exercise.seconds / 60)} min</Chip>
            {exercise.quota && <Chip>min {exercise.quota}</Chip>}
          </div>
          <h2 className="text-3xl font-semibold tracking-tight">{exercise.name}</h2>
          <p className="text-muted">{exercise.trains}</p>

          {/* Show the actual task and, where there is one, the shape of the
              session. Multi-phase exercises change what you are doing partway
              through, and being told that up front is the difference between a
              deliberate switch and a confusing one. */}
          <Panel className="p-5">
            <div className="text-[10px] uppercase tracking-[.14em] text-muted">
              {exercise.phases.length > 1
                ? `What you'll do · ${exercise.phases.length} phases`
                : 'What you\'ll do'}
            </div>
            <ol className="mt-3 space-y-3">
              {exercise.phases.map((ph, i) => (
                <li key={ph.label} className="flex gap-3">
                  <span
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${
                      i === 0 ? 'bg-accent text-white' : 'bg-panel2 text-muted'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm leading-relaxed text-fg">{ph.task}</p>
                    {ph.hint && <p className="mt-0.5 text-xs leading-relaxed text-muted">{ph.hint}</p>}
                    {!ph.scored && (
                      <span className="mt-1 inline-block text-[11px] text-muted/80">
                        setup for the next phase — not scored
                      </span>
                    )}
                    <div>
                      <WorkedExample phase={ph} />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel className="p-5">
            <div className="text-[10px] uppercase tracking-[.14em] text-muted">Good to know</div>
            <ul className="mt-3 space-y-2">
              {exercise.howTo.map((h) => (
                <li key={h} className="flex gap-2.5 text-sm leading-relaxed">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  {h}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="p-5">
            <div className="text-[10px] uppercase tracking-[.14em] text-muted">Why this works</div>
            <p className="mt-2 text-sm leading-relaxed text-fg/85">{exercise.evidence.claim}</p>
            <ul className="mt-3 space-y-1">
              {exercise.evidence.citations.map((c) => (
                <li key={c} className="text-[11px] text-muted">
                  {c}
                </li>
              ))}
            </ul>
          </Panel>

          {status === 'error' ? (
            <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-xs text-danger">
              The scoring model failed to load, so this session could not be scored at the end.
              <button
                onClick={() => {
                  void embedder.reset().then(() => embedder.warm())
                }}
                className="ml-2 underline hover:no-underline"
              >
                retry now
              </button>
            </div>
          ) : (
            status !== 'ready' && (
              <div className="rounded-xl border border-line bg-panel2/60 px-4 py-3 text-xs text-muted">
                Fetching the scoring model ({progressPct}%) — about 19 MB, once, then cached. You
                can start now; scoring happens at the end.
              </div>
            )
          )}

          <div className="flex flex-wrap gap-2">
            <Button className="flex-1" onClick={() => setView('run')}>
              Start · {Math.round(exercise.seconds / 60)} min
            </Button>
            {exercise.prompts.length > 1 && (
              <Button variant="soft" onClick={() => setPrompt(pickPrompt(exercise, [prompt.key]))}>
                Different prompt
              </Button>
            )}
          </div>
        </div>
      </Shell>
    )
  }

  if (view === 'progress')
    return (
      <Shell view={view} setView={setView}>
        <Progress sessions={sessions} />
      </Shell>
    )

  if (view === 'library')
    return (
      <Shell view={view} setView={setView}>
        <Library />
      </Shell>
    )

  return (
    <Shell view={view} setView={setView}>
      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
        <Panel className="relative overflow-hidden p-6">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative">
            <div className="text-[10px] uppercase tracking-[.14em] text-muted">
              Today's principle
            </div>
            <p className="mt-2 text-lg leading-relaxed">{principle.text}</p>
            <p className="mt-2 text-[11px] text-muted">{principle.source}</p>
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[.14em] text-muted">
                Recommended next
              </div>
              <h3 className="mt-1 text-xl font-semibold">{rec.exercise.name}</h3>
              <p className="mt-1 text-sm text-muted">{rec.reason}</p>
            </div>
            <Button onClick={() => begin(rec.exercise)} className="pulsering">
              Begin
            </Button>
          </div>
        </Panel>

        <div>
          <h3 className="mb-3 text-sm font-medium text-muted">All exercises</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {EXERCISES.map((ex) => {
              const n = sessions.filter((s) => s.exerciseId === ex.id).length
              const cat = categoryStyle(ex.category)
              return (
                <button
                  key={ex.id}
                  onClick={() => begin(ex)}
                  className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-panel/60 p-4 pl-5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-accent/50 hover:bg-panel2/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0"
                >
                  {/* A colour spine per category: twelve identical cards are
                      impossible to skim, and category is what you choose by. */}
                  <span
                    aria-hidden
                    className={`absolute inset-y-0 left-0 w-1 ${cat.dot} opacity-60 transition-opacity group-hover:opacity-100`}
                  />
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium leading-snug">{ex.name}</span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
                        n
                          ? 'border-accent2/30 bg-accent2/10 text-accent2'
                          : 'border-line bg-panel2 text-muted'
                      }`}
                    >
                      {n ? `${n}×` : 'new'}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-snug text-muted">{ex.blurb}</p>
                  {/* mt-auto keeps the meta row on the baseline of every card in
                      the row, however many lines the blurb takes. */}
                  <div className="mt-auto flex items-center gap-2 pt-3 text-[11px]">
                    <span className={`rounded-full border px-2 py-0.5 ${cat.border} ${cat.bg} ${cat.text}`}>
                      {ex.category}
                    </span>
                    <span className="text-muted">{Math.round(ex.seconds / 60)} min</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </Shell>
  )
}

/* ------------------------------------------------------------- chrome ---- */

function Shell({
  children,
  view,
  setView,
}: {
  children: React.ReactNode
  view: View
  setView: (v: View) => void
}) {
  const tabs: [View, string][] = [
    ['home', 'Train'],
    ['progress', 'Progress'],
    ['library', 'Method'],
  ]
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-line/60 bg-ink/90 backdrop-blur-md supports-[backdrop-filter]:bg-ink/70">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <button onClick={() => setView('home')} className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent2 text-sm font-bold text-ink">
              ↯
            </span>
            <span className="font-semibold tracking-tight">Ideaworks</span>
          </button>
          <nav className="flex gap-1">
            {tabs.map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  view === v ? 'bg-panel2 text-fg' : 'text-muted hover:text-fg'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 pb-10">{children}</main>
    </div>
  )
}

function Loading({ label }: { label: string }) {
  return (
    <div className="grid h-full min-h-[60vh] place-items-center p-10">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
        <p className="mt-4 text-sm text-muted">{label}</p>
      </div>
    </div>
  )
}

function Library() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">The method</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Every exercise traces to published work, and the app is built as much around what the
          evidence says to <em>avoid</em> as what it says to do.
        </p>
      </div>

      <Panel className="p-5">
        <h3 className="font-medium">What this app deliberately does not do</h3>
        <ul className="mt-3 space-y-3 text-sm leading-relaxed text-fg/85">
          <li>
            <strong className="text-danger">No AI generates ideas for you.</strong> An EEG study
            found people who wrote with an LLM showed the weakest neural connectivity, could not
            quote back their own output, and stayed disengaged even after the assistant was taken
            away — "cognitive debt". Separately, AI-assisted writers produced individually better
            but collectively more homogeneous work. Turning you into a drone is the specific
            failure mode this app is designed against.
            <span className="mt-1 block text-[11px] text-muted">
              Kosmyna et al. (2025), MIT Media Lab, arXiv:2506.08872 · Doshi &amp; Hauser (2024),
              Science Advances
            </span>
          </li>
          <li>
            <strong className="text-danger">No leaderboards or public scores.</strong> Competitive
            and evaluative framing raises evaluation apprehension, which pushes people toward safe,
            conventional answers.
            <span className="mt-1 block text-[11px] text-muted">
              Amabile, Creativity in Context (1996)
            </span>
          </li>
          <li>
            <strong className="text-danger">No points for volume, no streak guilt.</strong>{' '}
            Rewarding quantity produces idea-dumping; obligation-shaped streaks convert an
            intrinsically motivated activity into a chore, which is exactly the shift that
            undermines creative performance.
          </li>
          <li>
            <strong className="text-danger">No example answers before you generate.</strong>{' '}
            Showing examples fixates people on them even when they are explicitly told to be
            original. That is why the cliché bank is only ever revealed after you have finished.
            <span className="mt-1 block text-[11px] text-muted">
              Jansson &amp; Smith (1991), Design Studies 12(1), 3–11
            </span>
          </li>
        </ul>
      </Panel>

      <Panel className="p-5">
        <h3 className="font-medium">How honest are the numbers?</h3>
        <p className="mt-2 text-sm leading-relaxed text-fg/85">
          Scoring runs entirely on your device using sentence embeddings (all-MiniLM-L6-v2).
          Nothing you write leaves the browser. Embedding-based originality scoring correlates with
          human raters at roughly r = .3–.4; fine-tuned LLM scorers reach about r = .8. So any
          single score is noisy. What is meaningful is your own slope across many sessions, and the
          within-session late lift, which is a construct-valid signal.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-fg/85">
          Expectations should be modest. The largest meta-analysis of creativity training — 169
          studies, 844 effect sizes — put the effect at d ≈ 0.53 unadjusted and d ≈ 0.29–0.32 after
          correcting for publication bias. Real, but not transformative. This is a slow skill and
          anyone promising otherwise is selling something.
        </p>
        <p className="mt-2 text-[11px] text-muted">
          Sio &amp; Lortie-Forgues (2024), Psychological Bulletin 150(5), 554–585 · Scott, Leritz
          &amp; Mumford (2004), Creativity Research Journal 16(4), 361–388 · Beaty &amp; Johnson
          (2021), Behavior Research Methods 53, 757–780
        </p>
      </Panel>

      <Panel className="p-5">
        <h3 className="font-medium">Where each exercise comes from</h3>
        <div className="mt-4 space-y-4">
          {EXERCISES.map((ex) => (
            <div key={ex.id} className="border-l-2 border-line pl-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{ex.name}</span>
                <Chip>{ex.category}</Chip>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-fg/80">{ex.evidence.claim}</p>
              <ul className="mt-1.5 space-y-0.5">
                {ex.evidence.citations.map((c) => (
                  <li key={c} className="text-[11px] text-muted">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="p-5">
        <h3 className="font-medium">Claims we refuse to make</h3>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-fg/85">
          <li>
            · "Right-brain thinking" is not a real mechanism. Creative cognition is a
            default-mode / executive-control network interaction.
          </li>
          <li>
            · TRIZ and Synectics as popularly taught have little rigorous support. SCAMPER has
            modest support and appears here only as an anti-fixation scaffold, never as the core.
          </li>
          <li>
            · Believing you can become more creative does not, on its own, make you more creative.
            Technique plus repetition does the work.
          </li>
          <li>
            · Reverse Brainstorm and Counterfactual World are included for variety and are labelled
            in-app as thin on direct evidence.
          </li>
          <li>
            · The Torrance Tests are not used as a benchmark here — they are coachable and predict
            real-world creative achievement weakly.
          </li>
        </ul>
      </Panel>
    </div>
  )
}

/* -------------------------------------------------------------- helpers -- */

function pickTier(sessions: SessionRecord[]): 1 | 2 | 3 {
  const cra = sessions.filter((s) => s.exerciseId === 'cra').slice(-3)
  if (!cra.length) return 1
  const rate = cra.reduce((a, s) => a + s.metrics.originality, 0) / cra.length
  if (rate > 70) return 3
  if (rate > 40) return 2
  return 1
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
