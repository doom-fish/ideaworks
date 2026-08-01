import { useRef, useState } from 'react'
import { Button, Chip, Panel, wordField } from './ui'
import { WorkedExample } from './WorkedExample'
import { fmtClock, useTimer } from '../lib/useTimer'
import { scoreChain } from '../engine/scoring'
import { CHAIN_GOOD, CHAIN_WEAK } from '../engine/calibration'
import type { Phase } from '../exercises/types'

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
        <WorkedExample phase={phase} defaultOpen={steps.length === 0} />
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
