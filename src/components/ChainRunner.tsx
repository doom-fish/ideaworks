import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Chip, Panel, wordField } from './ui'
import { WorkedExample } from './WorkedExample'
import { fmtClock, useTimer } from '../lib/useTimer'
import { scoreChain } from '../engine/scoring'
import { CHAIN_GOOD, CHAIN_WEAK } from '../engine/calibration'
import { SPRING, useSprings } from '../lib/spring'
import type { Phase } from '../exercises/types'

/* -------------------------------------------------------- Semantic chain -- */

interface Step {
  from: string
  to: string
  d: number
}

type Band = 'far' | 'near' | 'close'

/**
 * Which side of the calibrated thresholds a jump landed on.
 *
 * These bands are the entire point of the drill, so they are read straight from
 * the empirically derived cut-offs (calibration.ts) and never softened. A jump
 * only counts as "far" once it clears 0.70 — the distance at which genuinely
 * unrelated word pairs actually begin — and is "too close" once it drops to
 * 0.60 or below, where related pairs sit. Flattering that boundary would coach
 * exactly the reflex the exercise is trying to break.
 */
const bandOf = (d: number): Band => (d > CHAIN_GOOD ? 'far' : d > CHAIN_WEAK ? 'near' : 'close')

const BAND: Record<
  Band,
  { text: string; ring: string; dot: string; wire: string; verdict: string }
> = {
  far: {
    text: 'text-accent2',
    ring: 'border-accent2/45 bg-accent2/10',
    dot: 'bg-accent2',
    wire: 'var(--color-accent2)',
    verdict: 'far',
  },
  near: {
    text: 'text-warn',
    ring: 'border-warn/45 bg-warn/10',
    dot: 'bg-warn',
    wire: 'var(--color-warn)',
    verdict: 'closer',
  },
  close: {
    text: 'text-danger',
    ring: 'border-danger/45 bg-danger/10',
    dot: 'bg-danger',
    wire: 'var(--color-danger)',
    verdict: 'too close',
  },
}

/**
 * The gap between two words is the jump made physical: a lazy drift leaves them
 * almost touching, a real leap opens a wide space you have to travel. The
 * number itself is still printed verbatim — this only lets you feel it before
 * you read it. 1.05 is the practical ceiling of the on-device metric (the
 * results screen divides by the same value), so the widest honest jump fills
 * the gap and nothing has to be exaggerated to look impressive.
 */
const GAP_MIN = 16
const GAP_SPAN = 92
const D_CEIL = 1.05
const amp = (d: number) => Math.max(0, Math.min(1, d / D_CEIL))
const gapPx = (a: number) => GAP_MIN + a * GAP_SPAN

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
  const [steps, setSteps] = useState<Step[]>([])
  const [reject, setReject] = useState<string | null>(null)
  const [shaking, setShaking] = useState(false)
  const [failed, setFailed] = useState(false)
  const start = useRef(Date.now())
  // Every submit bumps this; a resolved score only applies if it is still the
  // newest request. The input is deliberately never blocked while a jump is
  // scoring, so two embeds can be in flight at once and an earlier, shorter
  // result must not be allowed to clobber a later, complete one.
  const seq = useRef(0)
  // Whether any jump has been measured yet. The first embed also loads the
  // model, so the very first pending state says so instead of implying the
  // wait is normal.
  const warmed = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)

  const ref = useRef(onFinish)
  ref.current = onFinish
  const { remaining, progress } = useTimer(seconds, true, () =>
    ref.current(words, Date.now() - start.current),
  )

  // Per-step gap amplitudes, sprung so a jump physically opens up as its score
  // lands. The integrator is the shared one from lib/spring, whose settle check
  // lives outside the fixed-substep loop — the placement that a past bug got
  // wrong, freezing every animation at zero on frames shorter than one substep.
  const amps = useMemo(() => steps.map((s) => amp(s.d)), [steps])
  const gaps = useSprings(amps, SPRING.bouncy)

  const jumps = words.length - 1
  const finished = jumps >= length
  const pending = jumps > steps.length && !failed

  const runScore = (chain: string[]) => {
    const mine = ++seq.current
    setFailed(false)
    void (async () => {
      try {
        const res = await scoreChain(chain)
        if (mine !== seq.current) return
        warmed.current = true
        setSteps(res.steps)
      } catch {
        if (mine !== seq.current) return
        setFailed(true)
      }
    })()
  }

  const submit = () => {
    const t = text.trim().toLowerCase()
    if (!t) return
    // A repeat is the one hard error here — the chain is a set of distinct
    // words, and silently swallowing the click would read as the app being
    // broken. Reject it loudly, keep the text so it can be edited, and never
    // let it reach the scorer, which would happily report a distance of zero.
    if (words.includes(t)) {
      setReject(t === seed ? 'That is the starting word.' : `“${t}” is already in the chain.`)
      setShaking(true)
      return
    }
    const next = [...words, t]
    setReject(null)
    setWords(next)
    setText('')
    runScore(next)
  }

  // Keep the newest word and the gap it opened in view without yanking the
  // whole screen; the panel above stays put.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [words.length, steps.length])

  const last = steps[steps.length - 1]
  const lowTime = remaining <= 20
  const clockTone = remaining <= 10 ? 'text-danger' : lowTime ? 'text-warn' : 'text-muted'

  return (
    <div className="mx-auto flex h-[100dvh] max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Chip tone="accent">Semantic Stretch</Chip>
          <Chip tone={finished ? 'good' : 'neutral'}>
            {jumps}/{length} jumps
          </Chip>
        </div>
        <div className="flex items-center gap-3">
          <span className={`font-mono text-lg tabular-nums transition-colors ${clockTone}`}>
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

      <Panel className="p-5">
        <p className="text-lg font-medium leading-snug">{phase.task}</p>
        {phase.hint && <p className="mt-2 text-sm leading-relaxed text-muted">{phase.hint}</p>}
        <WorkedExample phase={phase} defaultOpen={steps.length === 0} />
      </Panel>

      {/* Legend, stated in the real numbers rather than the copy's aspiration,
          so the colours on the trail are self-explanatory and honest. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent2" /> far · above {CHAIN_GOOD.toFixed(2)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-warn" /> closing in
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-danger" /> too close · {CHAIN_WEAK.toFixed(2)} or under
        </span>
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-line bg-panel/40 p-4"
      >
        <div className="flex flex-col">
          {words.map((w, i) => {
            const step = i >= 1 ? steps[i - 1] : undefined
            const band = step ? bandOf(step.d) : null
            const isPending = i >= 1 && i > steps.length && pending
            const isFailed = i >= 1 && i > steps.length && failed
            const gap = step ? gapPx(gaps[i - 1] ?? 0) : GAP_MIN

            return (
              <div key={i}>
                {i >= 1 && (
                  <div className="flex items-stretch gap-3">
                    <div className="flex w-4 justify-center">
                      <div
                        className={`w-[3px] rounded-full ${
                          isPending ? 'shimmer bg-line/70' : isFailed ? 'bg-danger/30' : ''
                        }`}
                        style={{
                          height: gap,
                          background: step
                            ? `linear-gradient(to bottom, var(--color-line), ${BAND[band as Band].wire})`
                            : undefined,
                          boxShadow: band === 'far' ? `0 0 12px -2px ${BAND.far.wire}` : undefined,
                        }}
                      />
                    </div>
                    <div className="flex items-center">
                      {step ? (
                        <span
                          className={`pop-in inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] tabular-nums ${
                            BAND[band as Band].ring
                          } ${BAND[band as Band].text}`}
                        >
                          {step.d.toFixed(2)}
                          <span className="font-sans tracking-wide">
                            {BAND[band as Band].verdict}
                          </span>
                        </span>
                      ) : isFailed ? (
                        <span className="inline-flex items-center gap-2 text-[11px] text-muted">
                          couldn’t measure that jump
                          <button
                            onClick={() => runScore(words)}
                            className="press rounded-md border border-line bg-panel2 px-2 py-0.5 text-fg hover:border-accent/60"
                          >
                            retry
                          </button>
                        </span>
                      ) : (
                        <span className="shimmer rounded-full bg-panel2 px-2.5 py-0.5 text-[11px] text-muted">
                          {warmed.current ? 'measuring…' : 'waking the model…'}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="flex w-4 justify-center">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ring-2 ring-ink ${
                        i === 0
                          ? 'bg-accent'
                          : isPending
                            ? 'pulsering bg-accent'
                            : isFailed
                              ? 'bg-danger'
                              : BAND[band as Band].dot
                      }`}
                    />
                  </div>
                  <div
                    className={`flex items-center rounded-xl border px-3 py-1.5 text-sm ${
                      i === 0
                        ? 'border-accent/40 bg-accent/10 text-accent'
                        : step
                          ? `${BAND[band as Band].ring} text-fg ${
                              band === 'far' ? 'flare' : band === 'close' ? 'shake' : ''
                            }`
                          : 'border-line bg-panel2 text-fg'
                    }`}
                  >
                    <span className={i === 0 || (step && band !== 'close') ? 'pop-in' : ''}>{w}</span>
                    {i === 0 && (
                      <span className="ml-2 text-[10px] uppercase tracking-[.14em] text-accent/70">
                        start
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {words.length === 1 && (
            <p className="mt-3 pl-7 text-[12px] leading-relaxed text-muted">
              Your first jump starts here — reach for something with no link at all to “{seed}”.
            </p>
          )}
          {finished && (
            <div className="mt-4 flex items-center gap-3">
              <div className="flex w-4 justify-center">
                <span className="h-2.5 w-2.5 rounded-full bg-accent2 ring-2 ring-ink" />
              </div>
              <p className="text-[12px] text-accent2">
                Chain complete — you can keep stretching, or score it now.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* The result of an async jump is announced for screen readers, which
          otherwise get nothing back from a distance that simply appears. */}
      <div aria-live="polite" className="sr-only">
        {last ? `${last.to}: ${BAND[bandOf(last.d)].verdict}, distance ${last.d.toFixed(2)}` : ''}
      </div>

      <div>
        <div className="flex gap-2">
          <input
            autoFocus
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              if (reject) setReject(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            onAnimationEnd={() => setShaking(false)}
            {...wordField}
            aria-label="Your next word"
            placeholder={`somewhere far from “${words[words.length - 1]}”…`}
            className={`flex-1 rounded-xl border bg-panel2 px-4 py-3 text-sm outline-none focus:border-accent ${
              reject ? 'border-danger/60' : 'border-line'
            } ${shaking ? 'shake' : ''}`}
          />
          <Button onClick={submit} disabled={!text.trim()}>
            Jump
          </Button>
        </div>
        <div className="mt-1.5 h-4 px-1">
          {reject && <p className="text-[11px] text-danger">{reject}</p>}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          variant={finished ? 'primary' : 'soft'}
          className={finished ? 'pulsering' : ''}
          onClick={() => onFinish(words, Date.now() - start.current)}
          disabled={words.length < 3}
        >
          Finish &amp; score
        </Button>
      </div>
    </div>
  )
}
