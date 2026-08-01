import { useEffect, useRef, useState } from 'react'
import { Button, Chip, Panel, proseField, wordField } from './ui'
import { fmtClock, useTimer } from '../lib/useTimer'
import { scoreChain } from '../engine/scoring'
import { CHAIN_GOOD, CHAIN_WEAK } from '../engine/calibration'
import { gradePart, type PartGrade } from '../data/genericParts'
import type { Phase, Prompt } from '../exercises/types'

/* ------------------------------------------------------------------ DAT --- */

export function DatRunner({
  phase,
  seconds,
  onFinish,
  onQuit,
}: {
  phase: Phase
  seconds: number
  onFinish: (words: string[], durationMs: number) => void
  onQuit: () => void
}) {
  const [words, setWords] = useState<string[]>(Array(10).fill(''))
  const start = useRef(Date.now())
  const ref = useRef(onFinish)
  ref.current = onFinish
  const { remaining, progress } = useTimer(seconds, true, () =>
    ref.current(
      words.filter((w) => w.trim()),
      Date.now() - start.current,
    ),
  )

  const filled = words.filter((w) => w.trim()).length
  const dupes = new Set(
    words
      .map((w) => w.trim().toLowerCase())
      .filter((w, i, a) => w && a.indexOf(w) !== i),
  )

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <Chip tone="accent">Divergent Association</Chip>
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg tabular-nums text-muted">{fmtClock(remaining)}</span>
          <Button variant="ghost" onClick={onQuit}>
            Abandon
          </Button>
        </div>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-panel2">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent2"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <Panel className="p-5">
        <p className="text-lg font-medium leading-snug">{phase.task}</p>
        {phase.hint && <p className="mt-2 text-sm leading-relaxed text-muted">{phase.hint}</p>}
        <p className="mt-2 text-sm text-muted">
          Single common nouns only — no names, no jargon.
        </p>
      </Panel>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
        {words.map((w, i) => {
          const dup = dupes.has(w.trim().toLowerCase())
          const invalid = w.trim() && !/^[a-zA-Z-]+$/.test(w.trim())
          return (
            <div key={i} className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted">
                {String(i + 1).padStart(2, '0')}
              </span>
              <input
                {...wordField}
                value={w}
                autoFocus={i === 0}
                onChange={(e) => setWords((s) => s.map((x, j) => (j === i ? e.target.value : x)))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const next = document.querySelectorAll<HTMLInputElement>('input[data-dat]')
                    next[i + 1]?.focus()
                  }
                }}
                data-dat
                className={`w-full rounded-xl border bg-panel2 py-3 pl-10 pr-3 text-sm outline-none transition-colors focus:border-accent ${
                  dup || invalid ? 'border-danger/60' : 'border-line'
                }`}
              />
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted">{filled}/10 · scored on the first 7 valid words</span>
        <Button
          onClick={() =>
            onFinish(words.filter((w) => w.trim()), Date.now() - start.current)
          }
          disabled={filled < 4}
        >
          Score it
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ CRA --- */

export function RatRunner({
  phase,
  cues,
  answer,
  seconds,
  index,
  total,
  onResult,
  onQuit,
}: {
  phase: Phase
  cues: [string, string, string]
  answer: string
  seconds: number
  index: number
  total: number
  onResult: (solved: boolean, ms: number) => void
  onQuit: () => void
}) {
  const [guess, setGuess] = useState('')
  const [reveal, setReveal] = useState(false)
  const [wrong, setWrong] = useState(false)
  const start = useRef(Date.now())
  const done = useRef(false)

  const { remaining } = useTimer(seconds, !reveal, () => {
    if (!done.current) {
      done.current = true
      setReveal(true)
    }
  })

  useEffect(() => {
    setGuess('')
    setReveal(false)
    setWrong(false)
    done.current = false
    start.current = Date.now()
  }, [cues])

  const submit = () => {
    if (guess.trim().toLowerCase() === answer.toLowerCase()) {
      done.current = true
      onResult(true, Date.now() - start.current)
    } else {
      setWrong(true)
      setTimeout(() => setWrong(false), 500)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col justify-center gap-6 p-6">
      <div className="flex items-center justify-between">
        <Chip tone="accent">
          Remote Associates · {index + 1}/{total}
        </Chip>
        <Button variant="ghost" onClick={onQuit}>
          Abandon
        </Button>
      </div>

      <Panel className={`p-8 ${wrong ? 'border-danger/60' : ''}`}>
        <div className="space-y-3 text-center">
          {cues.map((c) => (
            <div key={c} className="text-2xl font-semibold tracking-wide uppercase">
              {c}
            </div>
          ))}
        </div>
        <div className="my-6 h-px bg-line" />
        {reveal ? (
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-[.14em] text-muted">Answer</div>
            <div className="mt-1 text-3xl font-semibold text-warn">{answer}</div>
            <Button
              className="mt-5"
              variant="soft"
              onClick={() => onResult(false, Date.now() - start.current)}
            >
              Next
            </Button>
          </div>
        ) : (
          /* enterKeyHint makes a phone keyboard show "go" instead of a generic
             return key, and the explicit button below means you never have to
             discover that Enter submits. */
          <div className="flex flex-col items-center gap-3">
            <input
              autoFocus
              {...wordField}
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              enterKeyHint="go"
              placeholder="the connecting word"
              className="w-full rounded-xl border border-line bg-panel2 px-4 py-3 text-center text-lg outline-none focus:border-accent"
            />
            {/* Pressing Enter is invisible on a phone, so the commit is a real
                button like every other exercise. */}
            <Button className="w-full" onClick={submit} disabled={!guess.trim()}>
              {wrong ? 'Not that one' : 'Submit answer'}
            </Button>
            <div className="flex w-full items-center justify-between">
              <span className="font-mono text-sm tabular-nums text-muted">
                {Math.ceil(remaining)}s
              </span>
              <button
                onClick={() => setReveal(true)}
                className="text-xs text-muted underline hover:text-fg"
              >
                give up &amp; show answer
              </button>
            </div>
          </div>
        )}
      </Panel>
      <p className="text-center text-[11px] leading-relaxed text-muted">{phase.hint}</p>
    </div>
  )
}

/* -------------------------------------------------------- Generic Parts --- */

export function DecomposeRunner({
  phase,
  prompt,
  seconds,
  quota,
  onFinish,
  onQuit,
}: {
  phase: Phase
  prompt: Prompt
  seconds: number
  quota: number
  onFinish: (parts: PartGrade[], durationMs: number) => void
  onQuit: () => void
}) {
  const [parts, setParts] = useState<PartGrade[]>([])
  const [text, setText] = useState('')
  const [showHint, setShowHint] = useState(false)
  const start = useRef(Date.now())
  const ref = useRef(onFinish)
  ref.current = onFinish
  const { remaining, progress } = useTimer(seconds, true, () =>
    ref.current(parts, Date.now() - start.current),
  )

  const live = text.trim() ? gradePart(text) : null

  const add = () => {
    if (!text.trim()) return
    setParts((s) => [...s, gradePart(text.trim())])
    setText('')
  }

  const clean = parts.filter((p) => p.flags.length === 0).length

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Chip tone="accent">Generic Parts</Chip>
          <Chip tone={clean >= quota ? 'good' : 'neutral'}>
            {clean}/{quota} clean
          </Chip>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg tabular-nums text-muted">{fmtClock(remaining)}</span>
          <Button variant="ghost" onClick={onQuit}>
            Abandon
          </Button>
        </div>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-panel2">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent2"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <Panel className="p-5">
        <p className="text-lg font-medium leading-snug">{phase.task}</p>
        {phase.hint && <p className="mt-2 text-sm leading-relaxed text-muted">{phase.hint}</p>}
        <div className="mt-4 rounded-xl border border-line bg-panel2/50 p-3">
          <div className="text-[10px] uppercase tracking-[.14em] text-muted">Object</div>
          <p className="mt-1 text-base text-fg">{prompt.label}</p>
        </div>
        {prompt.data?.hint ? (
          showHint ? (
            <p className="mt-3 rounded-lg border border-line bg-panel2/60 p-2 text-xs text-muted">
              {prompt.data.hint as string}
            </p>
          ) : (
            <button
              onClick={() => setShowHint(true)}
              className="mt-3 text-xs text-muted underline hover:text-fg"
            >
              show hint
            </button>
          )
        ) : null}
      </Panel>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto rounded-2xl border border-line bg-panel/40 p-3">
        {parts.length === 0 && (
          <p className="p-6 text-center text-sm text-muted">
            Every object has more parts than you think. Keep subdividing.
          </p>
        )}
        {parts.map((p, i) => (
          <div
            key={i}
            className={`rise flex items-start gap-3 rounded-xl border px-3 py-2 ${
              p.flags.length ? 'border-danger/40 bg-danger/5' : 'border-accent2/30 bg-accent2/5'
            }`}
          >
            <span className="mt-0.5 w-5 text-right font-mono text-xs text-muted">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">{p.text}</p>
              {p.flags.length > 0 && (
                <p className="mt-1 text-[11px] text-danger">
                  implies a use: {p.flags.join(', ')} — describe the shape instead
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {live && live.flags.length > 0 && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          "{live.flags.join('", "')}" names a function, not a form.
        </div>
      )}

      <div className="flex gap-2">
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          {...proseField}
          placeholder="e.g. thin flexible string of twisted fibre"
          className="flex-1 rounded-xl border border-line bg-panel2 px-4 py-3 text-sm outline-none focus:border-accent"
        />
        <Button onClick={add} disabled={!text.trim()}>
          Add part
        </Button>
      </div>

      <div className="flex justify-end">
        <Button
          variant="soft"
          onClick={() => onFinish(parts, Date.now() - start.current)}
          disabled={parts.length < 2}
        >
          Finish & score
        </Button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------- Semantic chain -- */

export function ChainRunner({
  phase,
  seed,
  seconds,
  length,
  onFinish,
  onQuit,
}: {
  phase: Phase
  seed: string
  seconds: number
  length: number
  onFinish: (words: string[], durationMs: number) => void
  onQuit: () => void
}) {
  const [words, setWords] = useState<string[]>([seed])
  const [text, setText] = useState('')
  const [steps, setSteps] = useState<{ from: string; to: string; d: number }[]>([])
  const start = useRef(Date.now())
  const ref = useRef(onFinish)
  ref.current = onFinish
  const { remaining, progress } = useTimer(seconds, true, () =>
    ref.current(words, Date.now() - start.current),
  )

  const add = async () => {
    const t = text.trim().toLowerCase()
    if (!t || words.includes(t)) return
    const next = [...words, t]
    setWords(next)
    setText('')
    const res = await scoreChain(next)
    setSteps(res.steps)
  }

  const done = words.length - 1 >= length

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Chip tone="accent">Semantic Stretch</Chip>
          <Chip tone={done ? 'good' : 'neutral'}>
            {words.length - 1}/{length}
          </Chip>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg tabular-nums text-muted">{fmtClock(remaining)}</span>
          <Button variant="ghost" onClick={onQuit}>
            Abandon
          </Button>
        </div>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-panel2">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent2"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <Panel className="p-5">
        <p className="text-lg font-medium leading-snug">{phase.task}</p>
        {phase.hint && <p className="mt-2 text-sm leading-relaxed text-muted">{phase.hint}</p>}
      </Panel>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-line bg-panel/40 p-4">
        <div className="flex flex-col gap-0">
          {words.map((w, i) => {
            const step = steps[i - 1]
            return (
              <div key={i}>
                {i > 0 && (
                  <div className="flex items-center gap-2 pl-4">
                    <div
                      className="w-px bg-line"
                      style={{ height: 26 + (step ? step.d * 26 : 0) }}
                    />
                    {step && (
                      <span
                        className={`font-mono text-[11px] tabular-nums ${
                          step.d > CHAIN_GOOD
                            ? 'text-accent2'
                            : step.d > CHAIN_WEAK
                              ? 'text-warn'
                              : 'text-danger'
                        }`}
                      >
                        {step.d.toFixed(2)}
                        {step.d <= CHAIN_WEAK && ' · too close'}
                      </span>
                    )}
                  </div>
                )}
                <div className="rise flex items-center gap-3">
                  <span
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      i === 0
                        ? 'border-accent/40 bg-accent/10 text-accent'
                        : 'border-line bg-panel2 text-fg'
                    }`}
                  >
                    {w}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex gap-2">
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
          {...wordField}
          placeholder={`something with nothing to do with "${words[words.length - 1]}"…`}
          className="flex-1 rounded-xl border border-line bg-panel2 px-4 py-3 text-sm outline-none focus:border-accent"
        />
        <Button onClick={() => void add()} disabled={!text.trim()}>
          Jump
        </Button>
      </div>

      <div className="flex justify-end">
        <Button
          variant="soft"
          onClick={() => onFinish(words, Date.now() - start.current)}
          disabled={words.length < 3}
        >
          Finish & score
        </Button>
      </div>
    </div>
  )
}
