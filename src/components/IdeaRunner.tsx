import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Exercise, Phase, Prompt } from '../exercises/types'
import type { IdeaRecord } from '../engine/db'
import { cosDist, cosine, embedder } from '../engine/embedder'
import {
  CLICHE_THRESHOLD,
  FAR_THRESHOLD,
  RELEVANCE_PROMPT,
  RELEVANCE_PROP,
  RELEVANCE_USE,
} from '../engine/calibration'
import { fmtClock, useTimer } from '../lib/useTimer'
import { Button, Chip, Panel, proseField, wordField } from './ui'

export interface LiveIdea extends IdeaRecord {
  category?: string
  /** index of the phase this was written in */
  phase: number
  /** for transform entries: the text this was a response to */
  source?: string
  /** does this entry count toward the score? */
  scored: boolean
  /** live, cheap feedback computed as you commit each entry */
  live?: { dCliche: number; cliche: boolean; offTask: boolean }
}

interface Props {
  exercise: Exercise
  prompt: Prompt
  onFinish: (ideas: LiveIdea[], durationMs: number) => void
  onQuit: () => void
}

/**
 * Phase-driven generation runner.
 *
 * Exercises that ask you to change stance mid-session used to signal it with a
 * toast that disappeared after nine seconds, so nothing actually switched. Here
 * a phase change is a real transition the user acknowledges: the task, the
 * input, the button and what gets scored all change together, and a transform
 * phase walks your own earlier answers back at you one at a time.
 *
 * The quota and the late-session emphasis remain, because originality rises
 * across a session (Beaty & Silvia 2012) and almost everyone stops early.
 */
export function IdeaRunner({ exercise, prompt, onFinish, onQuit }: Props) {
  const [ideas, setIdeas] = useState<LiveIdea[]>([])
  const [text, setText] = useState('')
  const [category, setCategory] = useState('')
  const [phaseIdx, setPhaseIdx] = useState(0)
  const [transformIdx, setTransformIdx] = useState(0)
  const [nudge, setNudge] = useState<string | null>(null)
  const [shownNudges, setShownNudges] = useState<number[]>([])
  // The task panel is tall — on a phone it took half the viewport and left the
  // list of your own ideas in a sliver. It collapses to a single line once you
  // start writing, and any phase change re-opens it so a new task is never
  // missed.
  const [briefOpen, setBriefOpen] = useState(true)
  const startRef = useRef(Date.now())
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const phases = exercise.phases
  const phase: Phase = phases[phaseIdx]
  const isLastPhase = phaseIdx === phases.length - 1

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
  const currentSource = sources[transformIdx]

  const bannedCategories = useMemo(
    () =>
      exercise.requiresCategory
        ? ideas.map((i) => (i.category ?? '').trim().toLowerCase()).filter(Boolean)
        : [],
    [ideas, exercise.requiresCategory],
  )

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

  useEffect(() => {
    inputRef.current?.focus()
  }, [phaseIdx, transformIdx])

  useEffect(() => {
    setBriefOpen(true)
  }, [phaseIdx])

  const scoreLive = async (entry: LiveIdea, t: string) => {
    if (exercise.scoring !== 'vs-prompt' || !entry.scored) return
    try {
      const [iv] = await embedder.embed([t])
      const cl = prompt.cliches?.length ? await embedder.embed(prompt.cliches) : []
      const pr = prompt.props?.length ? await embedder.embed(prompt.props) : []
      const [promptVec] = await embedder.embed([prompt.label])
      const dCliche = cl.length ? Math.min(...cl.map((c) => cosDist(c, iv))) : 0.9
      const simProp = pr.length ? Math.max(...pr.map((x) => cosine(x, iv))) : 0
      const simUse = cl.length ? Math.max(...cl.map((c) => cosine(c, iv))) : 0
      const grounded = pr.length > 0 || cl.length > 0
      const onTask = grounded
        ? simProp >= RELEVANCE_PROP || simUse >= RELEVANCE_USE
        : cosine(promptVec, iv) >= RELEVANCE_PROMPT
      setIdeas((s) =>
        s.map((x) =>
          x.atMs === entry.atMs
            ? {
                ...x,
                live: {
                  dCliche,
                  cliche: cl.length > 0 && dCliche < CLICHE_THRESHOLD,
                  offTask: !onTask,
                },
              }
            : x,
        ),
      )
    } catch {
      /* live feedback is best-effort */
    }
  }

  const add = async () => {
    const t = text.trim()
    if (!t) return
    if (exercise.requiresCategory && phase.kind === 'generate') {
      const c = category.trim().toLowerCase()
      if (!c || bannedCategories.includes(c)) return
    }
    const entry: LiveIdea = {
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
    setBriefOpen(false)
    if (phase.kind === 'transform') setTransformIdx((i) => i + 1)
    void scoreLive(entry, t)
  }

  const phaseMin = phase.min ?? 0
  const canAdvance =
    phase.kind === 'transform' ? transformIdx >= sources.length : inPhase.length >= phaseMin
  const advance = () => {
    setNudge(null)
    setTransformIdx(0)
    setPhaseIdx((i) => i + 1)
  }

  const scoredCount = ideas.filter((i) => i.scored).length
  const quotaMet = !exercise.quota || scoredCount >= exercise.quota
  const lowTime = remaining < 30
  const transformDone = phase.kind === 'transform' && transformIdx >= sources.length
  const extra = exercise.layout.extraKey
    ? (prompt.data?.[exercise.layout.extraKey] as string | undefined)
    : undefined

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-3 p-3 sm:gap-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden sm:inline">
            <Chip tone="accent">{exercise.name}</Chip>
          </span>
          {phases.length > 1 && (
            <Chip tone="neutral" title={`Phase ${phaseIdx + 1} of ${phases.length}`}>
              {phaseIdx + 1}/{phases.length} · {phase.label}
            </Chip>
          )}
          {exercise.quota && phase.scored && (
            <Chip tone={quotaMet ? 'good' : 'neutral'}>
              {scoredCount}/{exercise.quota}
            </Chip>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`font-mono text-lg tabular-nums ${lowTime ? 'text-warn' : 'text-muted'}`}>
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

      {/* The task, stated as an instruction — not a template blob. */}
      {briefOpen ? (
        <Panel className="p-4 sm:p-5">
          <button
            onClick={() => setBriefOpen(false)}
            className="flex w-full items-start gap-3 text-left"
          >
            <p className="flex-1 text-base font-medium leading-snug text-fg sm:text-lg">
              {phase.task}
            </p>
            <span className="mt-0.5 shrink-0 text-xs text-muted">hide</span>
          </button>
          {phase.hint && (
            <p className="mt-2 text-sm leading-relaxed text-muted">{phase.hint}</p>
          )}

          <div className="mt-3 rounded-xl border border-line bg-panel2/50 p-3">
            <div className="text-[10px] uppercase tracking-[.14em] text-muted">
              {exercise.layout.subjectLabel}
            </div>
            <p className="mt-1 text-[15px] leading-relaxed text-fg">{prompt.label}</p>
          </div>

          {extra ? (
            <div
              className={`mt-2 rounded-xl border p-3 ${
                exercise.layout.extraTone === 'constraint'
                  ? 'border-warn/40 bg-warn/10'
                  : 'border-accent2/30 bg-accent2/10'
              }`}
            >
              <div
                className={`text-[10px] uppercase tracking-[.14em] ${
                  exercise.layout.extraTone === 'constraint' ? 'text-warn' : 'text-accent2'
                }`}
              >
                {exercise.layout.extraLabel}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-fg/90">{extra}</p>
            </div>
          ) : null}
        </Panel>
      ) : (
        <button
          onClick={() => setBriefOpen(true)}
          className="w-full rounded-xl border border-line bg-panel/60 px-3 py-2 text-left"
        >
          <div className="flex items-start gap-2">
            <span className="min-w-0 flex-1 text-sm leading-snug text-fg line-clamp-2">
              {prompt.label}
            </span>
            <span className="mt-0.5 shrink-0 text-[11px] text-muted">task</span>
          </div>
          {/* The constraint or source stays on screen even when collapsed: it is
              not context, it is part of the instruction. */}
          {extra && (
            <p
              className={`mt-1 line-clamp-2 text-[11px] leading-snug ${
                exercise.layout.extraTone === 'constraint' ? 'text-warn' : 'text-accent2'
              }`}
            >
              {exercise.layout.extraLabel}: {extra}
            </p>
          )}
        </button>
      )}

      {nudge && (
        <div className="rise flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          <span className="flex-1">{nudge}</span>
          <button onClick={() => setNudge(null)} className="shrink-0 opacity-60 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Transform phases put the source in front of you rather than asking you
          to remember what you were supposed to be inverting. */}
      {phase.kind === 'transform' && currentSource && (
        <Panel className="border-danger/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] uppercase tracking-[.14em] text-danger">
              {phase.sourceLabel} {transformIdx + 1}/{sources.length}
            </div>
            <span className="text-[11px] text-muted">{sources.length - transformIdx} left</span>
          </div>
          <p className="mt-1.5 text-[15px] leading-snug text-fg">"{currentSource.text}"</p>
        </Panel>
      )}

      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto rounded-2xl border border-line bg-panel/40 p-3"
      >
        {ideas.length === 0 && phase.empty && (
          <p className="p-6 text-center text-sm leading-relaxed text-muted">{phase.empty}</p>
        )}
        {ideas.map((idea, i) => (
          <div
            key={i}
            className={`rise flex items-start gap-3 rounded-xl border px-3 py-2 ${
              idea.scored
                ? 'border-line/60 bg-panel2/60'
                : 'border-line/40 bg-panel2/25 opacity-70'
            }`}
          >
            <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-xs text-muted">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              {idea.source && (
                <p className="truncate text-[11px] text-muted/80">↳ from "{idea.source}"</p>
              )}
              <p className="break-words text-sm text-fg">{idea.text}</p>
              {idea.category && (
                <span className="mt-1 inline-block text-[11px] text-muted">
                  category: {idea.category}
                </span>
              )}
            </div>
            {!idea.scored && (
              <Chip tone="neutral" title="Scaffolding for the next phase — not scored.">
                setup
              </Chip>
            )}
            {idea.scored && idea.live?.offTask && (
              <Chip tone="bad" title="This does not engage the task, so it will not score.">
                off-task
              </Chip>
            )}
            {idea.scored && idea.live && !idea.live.offTask && idea.live.cliche && (
              <Chip tone="warn" title="Close to a well-known stock answer.">
                stock answer
              </Chip>
            )}
            {idea.scored &&
              idea.live &&
              !idea.live.offTask &&
              !idea.live.cliche &&
              idea.live.dCliche > FAR_THRESHOLD && (
                <Chip tone="good" title="On-task and far from the stereotyped responses.">
                  far
                </Chip>
              )}
          </div>
        ))}
      </div>

      {exercise.requiresCategory && bannedCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted">burned:</span>
          {bannedCategories.map((c) => (
            <span
              key={c}
              className="rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-[11px] text-danger line-through"
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {!transformDone && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {exercise.requiresCategory && phase.kind === 'generate' && (
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              {...wordField}
              placeholder="category"
              className="w-full rounded-xl border border-line bg-panel2 px-3 py-3 text-sm outline-none placeholder:text-muted/60 focus:border-accent sm:w-40"
            />
          )}
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void add()
              }
            }}
            {...proseField}
            placeholder={phase.placeholder}
            className="flex-1 rounded-xl border border-line bg-panel2 px-4 py-3 text-sm outline-none placeholder:text-muted/60 focus:border-accent"
          />
          <Button onClick={() => void add()} disabled={!text.trim()}>
            {phase.verb}
          </Button>
        </div>
      )}

      {/* Advancing is an explicit act, so the change of stance actually lands. */}
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted">
          {!isLastPhase
            ? canAdvance
              ? `Ready for "${phases[phaseIdx + 1].label}" when you are.`
              : phase.kind === 'transform'
                ? `Invert the remaining ${sources.length - transformIdx}.`
                : `${phaseMin - inPhase.length} more before the next phase.`
            : quotaMet
              ? 'Quota met. Keep going anyway — your best idea is usually still ahead.'
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
    </div>
  )
}
