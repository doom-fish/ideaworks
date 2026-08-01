import { useRef, useState } from 'react'
import { Button, Chip, Panel, wordField } from './ui'
import { WorkedExample } from './WorkedExample'
import { fmtClock, useTimer } from '../lib/useTimer'
import type { Phase } from '../exercises/types'

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
        <WorkedExample phase={phase} defaultOpen={words.every((w) => !w.trim())} />
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
