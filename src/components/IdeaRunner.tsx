import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Exercise, Phase, Prompt } from '../exercises/types'
import type { IdeaRecord } from '../engine/db'
import { cosDist, cosine, embedder } from '../engine/embedder'
import {
  CLICHE_THRESHOLD,
  FAR_THRESHOLD,
  RELEVANCE_PROMPT,
  RELEVANCE_PROP,
  RELEVANCE_SOURCE,
  RELEVANCE_USE,
} from '../engine/calibration'
import { fmtClock, useTimer } from '../lib/useTimer'
import { Button, Chip, Panel, categoryStyle, proseField, wordField } from './ui'
import { WorkedExample } from './WorkedExample'
import { PromptBar, RunnerShell } from './RunnerShell'
import { GrowingInput } from './GrowingInput'
import { Constellation, CoverageMeter, QuotaRing } from './LiveFeedback'

export interface LiveIdea extends IdeaRecord {
  /**
   * A stable identity, independent of position and of atMs. Positional keys
   * mis-animate the entrance springs when an earlier entry is deleted, and atMs
   * is not guaranteed unique when two entries are committed inside the same
   * millisecond, so it also can't safely key the live-score patch.
   */
  id: number
  category?: string
  /** index of the phase this was written in */
  phase: number
  /** for transform entries: the text this was a response to */
  source?: string
  /** does this entry count toward the score? */
  scored: boolean
  /** live, cheap feedback computed as you commit each entry */
  live?: { dCliche: number; cliche: boolean; offTask: boolean }
  /** embedding, kept so the live meters can update without re-embedding */
  vec?: Float32Array
}

interface Props {
  exercise: Exercise
  prompt: Prompt
  onFinish: (ideas: LiveIdea[], durationMs: number) => void
  onQuit: () => void
}

type Tone = ReturnType<typeof categoryStyle>

/**
 * Phase-driven generation runner.
 *
 * Exercises that ask you to change stance mid-session used to signal it with a
 * toast that disappeared after nine seconds, so nothing actually switched. Here
 * a phase change is a real transition the user acknowledges: the task, the
 * input, the button and what gets scored all change together, and a transform
 * phase walks your own earlier answers back at you one at a time.
 *
 * Eleven exercises share this screen, and the point is that they should not
 * feel like one screen with the words swapped. Everything that can key off the
 * catalog's structure does: the category tints the whole frame, the phase
 * stepper only appears when there is a sequence to move through, scaffolding
 * phases say so, a transform phase pins the answer being inverted in front of
 * you, and the category-per-idea exercise turns its ban list into the visible
 * spine of the task. The quota and the late-session emphasis remain, because
 * originality rises across a session (Beaty & Silvia 2012) and almost everyone
 * stops early — but it is never celebrated as volume.
 */
export function IdeaRunner({ exercise, prompt, onFinish, onQuit }: Props) {
  const [ideas, setIdeas] = useState<LiveIdea[]>([])
  const [text, setText] = useState('')
  const [category, setCategory] = useState('')
  const [phaseIdx, setPhaseIdx] = useState(0)
  const [nudge, setNudge] = useState<string | null>(null)
  const [shownNudges, setShownNudges] = useState<number[]>([])
  // A rejected entry (duplicate, missing or already-burned category) explains
  // itself instead of failing silently: a message, and a shake on the offending
  // field. Without this the commit simply did nothing and the user could not
  // tell whether the app had frozen or refused them.
  const [notice, setNotice] = useState<{ field: 'text' | 'category'; msg: string } | null>(null)
  const [shakeField, setShakeField] = useState<'text' | 'category' | null>(null)
  // The task panel is tall — on a phone it took half the viewport and left the
  // list of your own ideas in a sliver. It collapses to a single line once you
  // start writing, and any phase change re-opens it so a new task is never
  // missed.
  const [briefOpen, setBriefOpen] = useState(true)
  const startRef = useRef(Date.now())
  const idRef = useRef(0)
  const noticeTimer = useRef<number | undefined>(undefined)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const categoryRef = useRef<HTMLInputElement>(null)

  const phases = exercise.phases
  const phase: Phase = phases[phaseIdx]
  const isLastPhase = phaseIdx === phases.length - 1
  // The category hue is the exercise's identity. It is deliberately carried
  // through from the catalog list and the results screen so that a de-fixation
  // drill and an analogy drill do not read as the same task in a different font.
  const tone = categoryStyle(exercise.category)

  const finish = useCallback(() => {
    onFinish(ideas, Date.now() - startRef.current)
  }, [ideas, onFinish])
  const finishRef = useRef(finish)
  finishRef.current = finish

  const { remaining, progress } = useTimer(exercise.seconds, true, () => finishRef.current())

  const inPhase = useMemo(() => ideas.filter((i) => i.phase === phaseIdx), [ideas, phaseIdx])

  /** For a transform phase: the entries being inverted, in order. */
  const sources = useMemo(
    () => (phase.kind === 'transform' ? ideas.filter((i) => i.phase === phaseIdx - 1) : []),
    [ideas, phase.kind, phaseIdx],
  )
  // Which source is on deck is simply how many responses this phase already
  // holds. Deriving it rather than tracking a separate counter is what lets a
  // transform answer be deleted and corrected — the source it belonged to
  // reappears on its own.
  const transformIdx = phase.kind === 'transform' ? inPhase.length : 0
  const currentSource = sources[transformIdx]

  const requiresCat = Boolean(exercise.requiresCategory) && phase.kind === 'generate'
  const bannedCategories = useMemo(
    () =>
      exercise.requiresCategory
        ? ideas.map((i) => (i.category ?? '').trim().toLowerCase()).filter(Boolean)
        : [],
    [ideas, exercise.requiresCategory],
  )
  const categoryClash =
    requiresCat && category.trim() !== '' && bannedCategories.includes(category.trim().toLowerCase())

  useEffect(() => {
    const next = exercise.nudges?.findIndex((n, i) => progress >= n.at && !shownNudges.includes(i))
    if (next !== undefined && next >= 0) {
      setShownNudges((s) => [...s, next])
      setNudge(exercise.nudges![next].text)
    }
  }, [progress, exercise.nudges, shownNudges])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [ideas.length])

  // The category field is the first thing you fill on the exercise that bans
  // repeats, so it takes focus there; everywhere else the idea field does. A
  // new phase, or the next source in a transform, always lands you back in the
  // input rather than making you reach for it.
  // The axis phase is a pair, and the pair reads left to right, so the left
  // field is the one that should be waiting for you.
  const leadsWithSecondField =
    (exercise.requiresCategory && phase.kind === 'generate') || / … /.test(phase.placeholder)

  useEffect(() => {
    const primary = leadsWithSecondField ? categoryRef : inputRef
    primary.current?.focus()
  }, [phaseIdx, transformIdx, leadsWithSecondField])

  useEffect(() => {
    setBriefOpen(true)
  }, [phaseIdx])

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  const reject = (field: 'text' | 'category', msg: string) => {
    setNotice({ field, msg })
    setShakeField(field)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600)
  }

  const scoreLive = async (entry: LiveIdea, t: string) => {
    if (!entry.scored) return
    try {
      const [iv] = await embedder.embed([t])
      let live: LiveIdea['live']
      if (entry.source) {
        // A transform entry is a response to an earlier answer, not to the
        // prompt. Judged against the prompt a good inversion reads as off-task —
        // on the calibration set a valid inversion sits ~0.08 from the original
        // problem but ~0.60 from the failure it inverts — so its live relevance
        // is anchored to the source exactly as the final scorer does, and the
        // cliché bank (which is about the object's stock uses) has nothing to
        // say about it.
        const [sv] = await embedder.embed([entry.source])
        live = { dCliche: 0, cliche: false, offTask: cosine(sv, iv) < RELEVANCE_SOURCE }
      } else if (exercise.scoring === 'vs-prompt') {
        const cl = prompt.cliches?.length ? await embedder.embed(prompt.cliches) : []
        const pr = prompt.props?.length ? await embedder.embed(prompt.props) : []
        // Must match what the final scorer uses. For exercises where the label
        // is a heading rather than the task — Compare Two Cases asks "what do
        // these share?" while the thing being answered is a separate problem —
        // anchoring live feedback on the label judged answers against the wrong
        // text.
        const [promptVec] = await embedder.embed([exercise.promptTemplate(prompt)])
        const dCliche = cl.length ? Math.min(...cl.map((c) => cosDist(c, iv))) : 0.9
        const simProp = pr.length ? Math.max(...pr.map((x) => cosine(x, iv))) : 0
        const simUse = cl.length ? Math.max(...cl.map((c) => cosine(c, iv))) : 0
        const grounded = pr.length > 0 || cl.length > 0
        const onTask = grounded
          ? simProp >= RELEVANCE_PROP || simUse >= RELEVANCE_USE
          : cosine(promptVec, iv) >= RELEVANCE_PROMPT
        live = { dCliche, cliche: cl.length > 0 && dCliche < CLICHE_THRESHOLD, offTask: !onTask }
      }
      // The embedding is kept even for pairwise exercises, which have no cliché
      // or property bank and so get no per-idea flags: their whole signal is how
      // far your own answers sit from one another, which is exactly what the
      // live spread map and coverage meter draw, so it is worth showing there
      // above all.
      setIdeas((s) => s.map((x) => (x.id === entry.id ? { ...x, vec: iv, live } : x)))
    } catch {
      /* live feedback is best-effort */
    }
  }

  const add = () => {
    const t = text.trim()
    if (!t) return
    // A repeat inside the current phase is almost always a stray second Enter or
    // a genuinely forgotten idea; either way it is wasted, so it bounces with a
    // reason. Transform phases are exempt: two different failures can honestly
    // invert to the same fix.
    if (phase.kind === 'generate' && inPhase.some((i) => i.text.trim().toLowerCase() === t.toLowerCase())) {
      reject('text', 'That one is already on your list.')
      return
    }
    if (requiresCat) {
      const c = category.trim().toLowerCase()
      if (!c) {
        reject('category', 'Name the category it belongs to first.')
        return
      }
      if (bannedCategories.includes(c)) {
        reject('category', `“${category.trim()}” is burned — that is the point, find a new angle.`)
        return
      }
    }
    const entry: LiveIdea = {
      id: idRef.current++,
      text: t,
      atMs: Date.now() - startRef.current,
      phase: phaseIdx,
      scored: phase.scored,
      category: exercise.requiresCategory ? category.trim() : undefined,
      source: phase.kind === 'transform' ? currentSource?.text : undefined,
    }
    setIdeas((s) => [...s, entry])
    setText('')
    setCategory('')
    setNotice(null)
    setBriefOpen(false)
    void scoreLive(entry, t)
  }

  const remove = (id: number) => {
    setIdeas((s) => s.filter((i) => i.id !== id))
    setNotice(null)
    // Correcting an entry should drop you straight back into writing rather than
    // leaving focus on a button that is about to disappear.
    const primary = leadsWithSecondField ? categoryRef : inputRef
    primary.current?.focus()
  }

  const phaseMin = phase.min ?? 0
  const canAdvance =
    phase.kind === 'transform' ? transformIdx >= sources.length : inPhase.length >= phaseMin
  const advance = () => {
    setNudge(null)
    setNotice(null)
    setPhaseIdx((i) => i + 1)
  }

  const scoredCount = ideas.filter((i) => i.scored).length
  const scoredWithVec = ideas.filter((i) => i.scored && i.vec)
  const scoredVecs = scoredWithVec.map((i) => i.vec as Float32Array)
  const scoredFlags = scoredWithVec.map((i) => ({
    offTask: i.live?.offTask,
    cliche: i.live?.cliche,
  }))
  const quotaMet = !exercise.quota || scoredCount >= exercise.quota
  const lowTime = remaining < 30
  const transformDone = phase.kind === 'transform' && transformIdx >= sources.length
  const extra = exercise.layout.extraKey
    ? (prompt.data?.[exercise.layout.extraKey] as string | undefined)
    : undefined
  const subjectText = exercise.layout.twoCases
    ? String(prompt.data?.target ?? prompt.label)
    : prompt.label

  /*
   * An axis is not a sentence, and typing "silent … deafening" into a prose box
   * asks you to type the ellipsis yourself and hope you got the shape right.
   * Dimension Mapper's first phase is the only place in the catalogue that wants
   * a pair, and it announces itself in its own placeholder — "one end … the
   * other end" — so the two halves get a field each with the ellipsis already
   * standing between them, and what you are being asked for stops needing
   * explanation.
   */
  const axisPhase = leadsWithSecondField && / … /.test(phase.placeholder)
  const [axisLo, axisHi] = phase.placeholder.split(' … ')

  const dockInput = transformDone ? (
    <Panel className="pop-in border-accent2/40 bg-accent2/5 p-3 text-sm text-accent2">
      Every one inverted. Finish when you are ready.
    </Panel>
  ) : (
    <div className="flex flex-col gap-2">
      {/* Transform phases put the source in front of you rather than asking you
          to remember what you were supposed to be inverting, which means it
          belongs with the input and not up in the scrolling history. Keying it
          to the source id springs each new one in as you walk down the list. */}
      {phase.kind === 'transform' && currentSource && (
        <SourceCard
          key={currentSource.id}
          label={phase.sourceLabel ?? 'Source'}
          index={transformIdx}
          total={sources.length}
          text={currentSource.text}
        />
      )}

      {axisPhase ? (
        <div className="flex items-center gap-2">
          <input
            ref={categoryRef}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                inputRef.current?.focus()
              }
            }}
            {...wordField}
            placeholder={axisLo}
            aria-label="One end of the axis"
            className="min-w-0 flex-1 rounded-xl border border-line bg-panel2 px-3 py-3 text-sm outline-none placeholder:text-muted/60 focus:border-accent"
          />
          <span aria-hidden className="shrink-0 text-muted">
            …
          </span>
          <input
            ref={inputRef as React.Ref<HTMLInputElement>}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            {...wordField}
            placeholder={axisHi}
            aria-label="The other end of the axis"
            className={`min-w-0 flex-1 rounded-xl border border-line bg-panel2 px-3 py-3 text-sm outline-none placeholder:text-muted/60 focus:border-accent ${
              shakeField === 'text' ? 'shake' : ''
            }`}
          />
          <Button onClick={() => add()} disabled={!text.trim() || !category.trim()}>
            {phase.verb}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          {requiresCat && (
            <input
              ref={categoryRef}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value)
                if (notice?.field === 'category') setNotice(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  inputRef.current?.focus()
                }
              }}
              onAnimationEnd={() => setShakeField((s) => (s === 'category' ? null : s))}
              {...wordField}
              placeholder="category"
              aria-label="Category"
              className={`w-full shrink-0 rounded-xl border bg-panel2 px-3 py-3 text-sm outline-none placeholder:text-muted/60 focus:border-accent sm:w-40 ${
                categoryClash ? 'border-danger/70' : 'border-line'
              } ${shakeField === 'category' ? 'shake' : ''}`}
            />
          )}
          <GrowingInput
            inputRef={inputRef as React.Ref<HTMLTextAreaElement>}
            value={text}
            onChange={(v) => {
              setText(v)
              if (notice?.field === 'text') setNotice(null)
            }}
            onCommit={add}
            onAnimationEnd={() => setShakeField((s) => (s === 'text' ? null : s))}
            {...proseField}
            placeholder={phase.placeholder}
            aria-label="Your entry"
            className={`w-full sm:flex-1 border-line ${shakeField === 'text' ? 'shake' : ''}`}
          />
          <Button onClick={() => add()} disabled={!text.trim()} className="sm:mb-0.5">
            {phase.verb}
          </Button>
        </div>
      )}

      {notice ? (
        <p className="px-1 text-[12px] leading-snug text-danger">{notice.msg}</p>
      ) : (
        categoryClash && (
          <p className="px-1 text-[12px] leading-snug text-danger">
            Already burned — find one you have not used.
          </p>
        )
      )}
    </div>
  )

  const dockFooter = (
    /* Advancing is an explicit act, so the change of stance actually lands. */
    <div className="flex items-center justify-between gap-3">
      <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted">
        {!isLastPhase
          ? canAdvance
            ? `Ready for “${phases[phaseIdx + 1].label}” when you are.`
            : phase.kind === 'transform'
              ? `${sources.length - transformIdx} left to invert.`
              : `${phaseMin - inPhase.length} more before the next phase.`
          : quotaMet
            ? 'Quota met — keep going, your best idea is usually still ahead.'
            : `${(exercise.quota ?? 0) - scoredCount} more before this session counts.`}
      </p>
      {!isLastPhase ? (
        <Button onClick={advance} disabled={!canAdvance}>
          Next · {phases[phaseIdx + 1].label}
        </Button>
      ) : (
        <Button variant="soft" onClick={finish} disabled={scoredCount < 2}>
          Finish &amp; score
        </Button>
      )}
    </div>
  )

  return (
    <RunnerShell
      header={
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
              <span className="truncate text-sm font-semibold text-fg">{exercise.name}</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {exercise.quota && phase.scored ? (
                <QuotaRing count={scoredCount} quota={exercise.quota} />
              ) : null}
              <span
                className={`font-mono text-lg tabular-nums ${lowTime ? 'text-warn' : 'text-muted'}`}
              >
                {fmtClock(remaining)}
              </span>
              <Button variant="ghost" onClick={onQuit}>
                Abandon
              </Button>
            </div>
          </div>

          <div className="h-1 overflow-hidden rounded-full bg-panel2">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-accent2 transition-[width] duration-200"
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          {/* The stepper only exists when there is a sequence to move through,
              which is itself a signal: a single-phase exercise stays visibly
              simpler. */}
          {phases.length > 1 && <PhaseRail phases={phases} phaseIdx={phaseIdx} tone={tone} />}
        </>
      }
      prompt={
        <PromptBar
          label={exercise.layout.subjectLabel}
          subject={subjectText}
          extraLabel={exercise.layout.extraLabel}
          extra={extra ?? undefined}
          extraTone={exercise.layout.extraTone}
          accent={tone.dot}
        />
      }
      dock={
        <>
          {/* The ban list is the whole spine of Category Burn, so it lives next
              to the input as a running tally of what you have spent rather than
              as a footnote. */}
          {exercise.requiresCategory && bannedCategories.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-[.1em] text-muted">burned</span>
              {bannedCategories.map((c) => (
                <span
                  key={c}
                  className="pop-in rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-[11px] text-danger line-through"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
          {dockInput}
          {dockFooter}
        </>
      }
    >
      {/* min-h-full lets the answer panel grow into the space the brief is not
          using, so the region reads as one continuous surface instead of a card
          floating above a gap. */}
      <div className="flex min-h-full flex-col gap-3">
        {/* The task, stated as an instruction — not a template blob. Re-mounting
            it per phase replays the entrance, which is what makes a phase change
            land as an arrival rather than a silent word-swap. */}
        {briefOpen ? (
        <Panel key={phaseIdx} className="pop-in overflow-hidden p-4 sm:p-5">
          <div className={`-mx-4 -mt-4 mb-3 h-1.5 sm:-mx-5 sm:-mt-5 ${tone.dot}`} aria-hidden />
          {!phase.scored && (
            <div className="mb-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel2 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[.12em] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-muted/70" aria-hidden />
                Setup · not scored
              </span>
            </div>
          )}
          <button
            onClick={() => setBriefOpen(false)}
            className="press flex w-full items-start gap-3 text-left"
          >
            <p className="flex-1 text-base font-medium leading-snug text-fg sm:text-lg">
              {phase.task}
            </p>
            <span className="mt-0.5 shrink-0 text-xs text-muted">hide</span>
          </button>
          {phase.hint && <p className="mt-2 text-sm leading-relaxed text-muted">{phase.hint}</p>}

          {/* Opens itself for the phase you have not started yet: the moment of
              "what do they actually want here" is before the first entry, and on
              a multi-phase exercise that moment recurs at the top of every phase,
              not only at the very start. Once you are writing the whole brief
              collapses and takes the example with it. */}
          {inPhase.length === 0 && (
            <WorkedExample key={phase.label} phase={phase} defaultOpen />
          )}

          {/* Both cases stay on screen together: the comparison is the active
              ingredient, and showing them in sequence loses the effect. */}
          {exercise.layout.twoCases && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(['caseA', 'caseB'] as const).map((k, n) => (
                <div key={k} className="rounded-xl border border-accent2/25 bg-accent2/5 p-3">
                  <div className="text-[10px] uppercase tracking-[.14em] text-accent2">
                    Case {n + 1}
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-fg/90">
                    {String(prompt.data?.[k] ?? '')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : (
        /* Collapsed, this is a way back to the hint and the example — not a
           reminder of the subject, which no longer goes anywhere. */
        <button
          onClick={() => setBriefOpen(true)}
          className="press flex w-full items-start gap-2 rounded-xl border border-line bg-panel/60 px-3 py-2 text-left"
        >
          <span className="min-w-0 flex-1 text-sm leading-snug text-muted line-clamp-2">
            {phase.task}
          </span>
          <span className="mt-0.5 shrink-0 text-[11px] text-muted/70">show</span>
        </button>
      )}

      {nudge && (
        <div className="pop-in flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          <span className="flex-1">{nudge}</span>
          <button
            onClick={() => setNudge(null)}
            aria-label="Dismiss"
            className="press -my-1 -mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Live feedback belongs with the answers it describes, so it scrolls with
          them rather than holding space above a list you are trying to read. */}
      {scoredVecs.length >= 2 && (
        <div className="space-y-2">
          <Constellation vectors={scoredVecs} flags={scoredFlags} />
          <div className="flex justify-end">
            <CoverageMeter vectors={scoredVecs} />
          </div>
        </div>
      )}

      <div
        ref={listRef}
        className="flex-1 space-y-1.5 rounded-2xl border border-line bg-panel/40 p-3"
      >
        {ideas.length === 0 && phase.empty && (
          <p className="p-6 text-center text-sm leading-relaxed text-muted">{phase.empty}</p>
        )}
        {ideas.map((idea, i) => (
          <IdeaRow
            key={idea.id}
            idea={idea}
            index={i}
            deletable={idea.phase === phaseIdx}
            onDelete={() => remove(idea.id)}
          />
        ))}
      </div>
      </div>
    </RunnerShell>
  )
}


/**
 * The phase stepper. Small on purpose — two or three dots and the name of where
 * you are — because it has to survive a 390px screen where Perspective Shift's
 * role names ("As a marine biologist") would never fit spelled out in a row.
 * The completed dots fill in the exercise's own colour, the current one carries
 * the label and ticks when it becomes current, so advancing is a visible beat.
 */
function PhaseRail({ phases, phaseIdx, tone }: { phases: Phase[]; phaseIdx: number; tone: Tone }) {
  return (
    <div className="flex items-center gap-2 overflow-hidden" aria-label={`Phase ${phaseIdx + 1} of ${phases.length}`}>
      {phases.map((p, i) => {
        const done = i < phaseIdx
        const current = i === phaseIdx
        return (
          <div key={p.label} className="flex shrink-0 items-center gap-2 last:min-w-0 last:shrink">
            {i > 0 && (
              <span className={`h-px w-3 rounded-full sm:w-5 ${done ? tone.dot : 'bg-line'}`} aria-hidden />
            )}
            <span
              className={`grid h-6 min-w-6 place-items-center rounded-full border px-1.5 text-[11px] font-semibold tabular-nums ${
                current
                  ? `tick ${tone.border} ${tone.bg} ${tone.text}`
                  : done
                    ? `border-transparent text-ink ${tone.dot}`
                    : 'border-line/70 text-muted/70'
              }`}
              aria-current={current ? 'step' : undefined}
            >
              {done ? '✓' : i + 1}
            </span>
            {current && (
              <span className={`truncate text-xs font-medium ${tone.text}`}>{p.label}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * The anchor for a transform phase. It is styled off the danger colour because
 * it is the failure you are undoing, and it counts down so the last one reads
 * as the last one rather than as just another card.
 */
function SourceCard({
  label,
  index,
  total,
  text,
}: {
  label: string
  index: number
  total: number
  text: string
}) {
  const remaining = total - index
  return (
    <Panel className="pop-in border-danger/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[.14em] text-danger">
          {label} {index + 1}/{total}
        </div>
        <span className={`text-[11px] ${remaining === 1 ? 'font-medium text-danger' : 'text-muted'}`}>
          {remaining === 1 ? 'last one' : `${remaining} left`}
        </span>
      </div>
      <p className="mt-1.5 text-[15px] leading-snug text-fg">“{text}”</p>
    </Panel>
  )
}

/**
 * One committed entry. Scaffolding entries are dimmed and labelled; a transform
 * entry shows what it inverted and never carries a cliché or "far" badge, since
 * those are judged against a bank that does not apply to it. Only entries in the
 * phase you are currently writing can be deleted — earlier phases are committed,
 * which keeps a transform from losing the source another answer was built on.
 */
function IdeaRow({
  idea,
  index,
  deletable,
  onDelete,
}: {
  idea: LiveIdea
  index: number
  deletable: boolean
  onDelete: () => void
}) {
  const live = idea.live
  const transform = Boolean(idea.source)
  return (
    <div
      className={`pop-in flex items-start gap-2.5 rounded-xl border px-3 py-2 ${
        idea.scored ? 'border-line/60 bg-panel2/60' : 'border-line/40 bg-panel2/25 opacity-70'
      }`}
    >
      <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-xs text-muted">{index + 1}</span>
      <div className="min-w-0 flex-1">
        {idea.source && (
          <p className="truncate text-[11px] text-muted/80">↳ inverting “{idea.source}”</p>
        )}
        <p className="break-words text-sm text-fg">{idea.text}</p>
        {idea.category && (
          <span className="mt-1 inline-flex items-center rounded-full border border-line bg-panel px-2 py-0.5 text-[11px] text-muted">
            {idea.category}
          </span>
        )}
      </div>
      {!idea.scored ? (
        <Chip tone="neutral" title="Scaffolding for the next phase — not scored.">
          setup
        </Chip>
      ) : live?.offTask ? (
        <Chip tone="bad" title="This does not engage the task, so it will not score.">
          off-task
        </Chip>
      ) : !transform && live && live.cliche ? (
        <Chip tone="warn" title="Close to a well-known stock answer.">
          stock answer
        </Chip>
      ) : !transform && live && live.dCliche > FAR_THRESHOLD ? (
        <Chip tone="good" title="On-task and far from the stereotyped responses.">
          far
        </Chip>
      ) : null}
      {deletable && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Remove this entry"
          className="press -my-1 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-lg leading-none text-muted/40 hover:bg-danger/10 hover:text-danger"
        >
          ×
        </button>
      )}
    </div>
  )
}
