import { useEffect, useRef, useState } from 'react'
import { Button, Chip, Panel, wordField } from './ui'
import { WorkedExample } from './WorkedExample'
import { useTimer } from '../lib/useTimer'
import type { Phase } from '../exercises/types'

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
      {/* Left closed here: this is a 30-second timed puzzle, and the example is
          itself a solved item. Opening it by default would hand over the move
          just as the clock starts. */}
      <div className="flex justify-center">
        <WorkedExample phase={phase} />
      </div>
    </div>
  )
}
