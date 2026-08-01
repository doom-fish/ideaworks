import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Exercise, Prompt } from '../exercises/types'
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
  /** live, cheap feedback computed as you type-and-enter */
  live?: { dCliche: number; cliche: boolean; offTask: boolean }
}

interface Props {
  exercise: Exercise
  prompt: Prompt
  onFinish: (ideas: LiveIdea[], durationMs: number) => void
  onQuit: () => void
}

/**
 * Generic generation runner. Deliberately hostile to stopping early: the quota,
 * the timed nudges and the late-session emphasis all exist because originality
 * rises across a session (Beaty & Silvia 2012) and almost everyone quits before
 * their best ideas arrive.
 */
export function IdeaRunner({ exercise, prompt, onFinish, onQuit }: Props) {
  const [ideas, setIdeas] = useState<LiveIdea[]>([])
  const [text, setText] = useState('')
  const [category, setCategory] = useState('')
  const [nudge, setNudge] = useState<string | null>(null)
  const [shownNudges, setShownNudges] = useState<number[]>([])
  const [stageIdx, setStageIdx] = useState(0)
  const startRef = useRef(Date.now())
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const finish = useCallback(() => {
    onFinish(ideas, Date.now() - startRef.current)
  }, [ideas, onFinish])

  const finishRef = useRef(finish)
  finishRef.current = finish

  const { remaining, progress } = useTimer(exercise.seconds, true, () => finishRef.current())

  const bannedCategories = useMemo(
    () =>
      exercise.requiresCategory
        ? ideas.map((i) => (i.category ?? '').trim().toLowerCase()).filter(Boolean)
        : [],
    [ideas, exercise.requiresCategory],
  )

  // Timed nudges
  useEffect(() => {
    const next = exercise.nudges?.findIndex(
      (n, i) => progress >= n.at && !shownNudges.includes(i),
    )
    if (next !== undefined && next >= 0) {
      setShownNudges((s) => [...s, next])
      setNudge(exercise.nudges![next].text)
      const t = setTimeout(() => setNudge(null), 9000)
      return () => clearTimeout(t)
    }
  }, [progress, exercise.nudges, shownNudges])

  // Stage rotation (perspective shift)
  useEffect(() => {
    if (!exercise.stages?.length) return
    const idx = Math.min(
      exercise.stages.length - 1,
      Math.floor(progress * exercise.stages.length),
    )
    setStageIdx(idx)
  }, [progress, exercise.stages])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [ideas.length])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const add = async () => {
    const t = text.trim()
    if (!t) return
    if (exercise.requiresCategory) {
      const c = category.trim().toLowerCase()
      if (!c) return
      if (bannedCategories.includes(c)) return
    }
    const idea: LiveIdea = {
      text: t,
      atMs: Date.now() - startRef.current,
      category: exercise.requiresCategory ? category.trim() : undefined,
    }
    setIdeas((s) => [...s, idea])
    setText('')
    setCategory('')

    // Live feedback — non-blocking, updates the row once it lands. Telling you
    // immediately that something is off-task or a stock answer is far more
    // useful than finding out five minutes later.
    if (exercise.scoring === 'vs-prompt') {
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
            x.atMs === idea.atMs
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
        /* scoring is best-effort during the session */
      }
    }
  }

  const quotaMet = !exercise.quota || ideas.length >= exercise.quota
  const stage = exercise.stages?.[stageIdx]
  const lowTime = remaining < 30

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      {/* header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Chip tone="accent">{exercise.name}</Chip>
          {exercise.quota && (
            <Chip tone={quotaMet ? 'good' : 'neutral'}>
              {ideas.length}/{exercise.quota}
            </Chip>
          )}
        </div>
        <div className="flex items-center gap-3">
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

      {/* prompt */}
      <Panel className="p-5">
        <div className="text-[10px] uppercase tracking-[.14em] text-muted">Prompt</div>
        <p className="mt-2 whitespace-pre-line text-lg leading-relaxed text-fg">
          {exercise.promptTemplate(prompt)}
        </p>
        {stage && (
          <div className="mt-4 rounded-xl border border-accent/30 bg-accent/10 p-3">
            <div className="text-[10px] uppercase tracking-[.14em] text-accent">
              Now answer as · {stage.label}
            </div>
            <p className="mt-1 text-sm text-fg/90">{stage.instruction}</p>
          </div>
        )}
      </Panel>

      {nudge && (
        <div className="rise rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          {nudge}
        </div>
      )}

      {/* ideas */}
      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto rounded-2xl border border-line bg-panel/40 p-3"
      >
        {ideas.length === 0 && (
          <p className="p-6 text-center text-sm text-muted">
            Nothing yet. First ideas are supposed to be bad — get them out of the way.
          </p>
        )}
        {ideas.map((idea, i) => (
          <div
            key={i}
            className="rise flex items-start gap-3 rounded-xl border border-line/60 bg-panel2/60 px-3 py-2"
          >
            <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-xs text-muted">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm text-fg">{idea.text}</p>
              {idea.category && (
                <span className="mt-1 inline-block text-[11px] text-muted">
                  category: {idea.category}
                </span>
              )}
            </div>
            {idea.live?.offTask && (
              <Chip
                tone="bad"
                title="This does not seem to engage the object or the problem at all, so it will not score. Originality only counts when the answer is actually an answer."
              >
                off-task
              </Chip>
            )}
            {idea.live && !idea.live.offTask && idea.live.cliche && (
              <Chip tone="warn" title="This is close to a well-known stock answer for this prompt.">
                stock answer
              </Chip>
            )}
            {idea.live && !idea.live.offTask && !idea.live.cliche &&
              idea.live.dCliche > FAR_THRESHOLD && (
                <Chip tone="good" title="On-task and far from the stereotyped responses.">
                  far
                </Chip>
              )}
          </div>
        ))}
      </div>

      {/* banned categories */}
      {exercise.requiresCategory && bannedCategories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
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

      {/* input */}
      <div className="flex flex-col gap-2 sm:flex-row">
        {exercise.requiresCategory && (
          <input
            {...wordField}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="category"
            className="w-full rounded-xl border border-line bg-panel2 px-3 py-3 text-sm outline-none placeholder:text-muted/60 focus:border-accent sm:w-40"
          />
        )}
        <input
          {...proseField}
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void add()
            }
          }}
          placeholder="One idea, then Enter…"
          className="flex-1 rounded-xl border border-line bg-panel2 px-4 py-3 text-sm outline-none placeholder:text-muted/60 focus:border-accent"
        />
        <Button onClick={() => void add()} disabled={!text.trim()}>
          Bank it
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted">
          {quotaMet
            ? 'Quota met. Keep going anyway — your best idea is usually still ahead.'
            : `${(exercise.quota ?? 0) - ideas.length} more before this session counts.`}
        </p>
        <Button variant="soft" onClick={finish} disabled={ideas.length < 2}>
          Finish & score
        </Button>
      </div>
    </div>
  )
}
