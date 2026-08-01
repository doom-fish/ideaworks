import { useRef, useState } from 'react'
import { Button, Chip, Panel, proseField } from './ui'
import { WorkedExample } from './WorkedExample'
import { fmtClock, useTimer } from '../lib/useTimer'
import { gradePart, type PartGrade } from '../data/genericParts'
import type { Phase, Prompt } from '../exercises/types'

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
        <WorkedExample phase={phase} defaultOpen={parts.length === 0} />
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
