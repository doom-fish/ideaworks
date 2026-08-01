import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Chip, Panel, wordField } from './ui'
import { WorkedExample } from './WorkedExample'
import { useTimer } from '../lib/useTimer'
import type { Phase } from '../exercises/types'

/* ------------------------------------------------------------------ CRA --- */

/**
 * How the item currently on screen ended.
 *
 * The runner keeps no history: the parent gives every item its own `key`, so a
 * new item is a fresh mount and this only ever describes the one puzzle in
 * front of you. Solving and failing are deliberately asymmetric. A solve
 * celebrates and then advances on its own, because the reward is the word
 * arriving whole and not the button press that follows it. A miss — the clock
 * ran out, or you asked to see it — instead holds on the answer and waits for a
 * deliberate Next, because studying the solution is how an item is learned, and
 * that studying is the entire reason a normed set exists (Bowden &
 * Jung-Beeman 2003).
 */
type Status = 'playing' | 'solved' | 'timeout' | 'gaveup'

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
  const [status, setStatus] = useState<Status>('playing')
  // A wrong guess is a transient, not a screen. It flashes a rejection and
  // clears itself, so it never becomes a state you have to dismiss — the whole
  // intent is that missing feels like nothing happened and you simply keep
  // typing, which is also how you avoid rewarding a frantic guess.
  const [wrong, setWrong] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const start = useRef(Date.now())
  // Elapsed time is captured the instant the item settles, not when the result
  // is finally handed up. Otherwise the roughly three-quarters of a second of
  // solved celebration would be counted into the time-to-insight, which the
  // results screen reports as a median and which the norming literature treats
  // as the item's defining measurement.
  const resultMs = useRef(0)
  // onResult must fire exactly once per item. The auto-advance timer and a key
  // or tap to skip both race to settle a solve, and either is allowed to win.
  const settled = useRef(false)

  const over = status !== 'playing'

  const settle = (solved: boolean) => {
    if (settled.current) return
    settled.current = true
    onResult(solved, resultMs.current)
  }

  const { remaining } = useTimer(seconds, !over, () => {
    // The clock is the only thing that can end an item without the user acting,
    // so running out is its own outcome rather than a silent give-up.
    setStatus((s) => {
      if (s !== 'playing') return s
      resultMs.current = seconds * 1000
      return 'timeout'
    })
  })

  const submit = () => {
    if (over) return
    const g = guess.trim()
    if (!g) return
    if (g.toLowerCase() === answer.toLowerCase()) {
      resultMs.current = Date.now() - start.current
      setStatus('solved')
    } else {
      // Keep the word where it is and select it: the rejection is the shake,
      // and the next keystroke either edits or replaces it without a trip to
      // backspace. A wrong answer should cost as close to nothing as possible.
      setWrong(true)
      inputRef.current?.select()
    }
  }

  const giveUp = () => {
    if (over) return
    resultMs.current = Date.now() - start.current
    setStatus('gaveup')
  }

  // The shake is a one-shot animation, so it must be armed and disarmed. Left
  // permanently applied, submitting the same wrong word twice would do nothing
  // the second time, and the miss would go unacknowledged.
  useEffect(() => {
    if (!wrong) return
    const t = setTimeout(() => setWrong(false), 340)
    return () => clearTimeout(t)
  }, [wrong])

  // A solve advances by itself after a beat long enough to register the word
  // and short enough that the loop never feels gated behind an animation.
  useEffect(() => {
    if (status !== 'solved') return
    const t = setTimeout(() => settle(true), 750)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  // Once an item is over, Enter or space carries you onward without reaching
  // for the pointer: forward off a solve, on to the next after a miss.
  // Deliberately not any key — a stray letter from someone already reaching for
  // the next answer should not silently swallow the reward or the answer.
  useEffect(() => {
    if (!over) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        settle(status === 'solved')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over, status])

  // Fraction of the clock still unspent, driving the depleting fuse that sits
  // between the puzzle and the answer field.
  const frac = Math.max(0, Math.min(1, remaining / seconds))
  const secs = Math.ceil(remaining)
  // Colour and a little movement arrive only near the end, so the clock has
  // presence as it drains without spending the whole thirty seconds shouting.
  // There is no red until the final moments, because panic narrows attention
  // and insight needs the width rather than the tunnel.
  const urgent = status === 'playing' && remaining <= 10
  const critical = status === 'playing' && remaining <= 4

  const barColor =
    status === 'solved'
      ? 'bg-accent2'
      : over
        ? 'bg-line'
        : critical
          ? 'bg-danger'
          : urgent
            ? 'bg-warn'
            : 'bg-accent'
  const numColor = critical ? 'text-danger' : urgent ? 'text-warn' : 'text-muted'

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col p-4 sm:p-6">
      <div className="flex shrink-0 items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">
            <Chip tone="accent">Remote Associates</Chip>
          </span>
          {/* Where you are in the round, not a tally: the parent knows which
              past items landed, this component does not, so the pills claim
              position only and never quietly imply a score. */}
          <div className="flex items-center gap-1.5" aria-label={`Item ${index + 1} of ${total}`}>
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === index ? 'w-4 bg-accent' : i < index ? 'w-1.5 bg-muted/50' : 'w-1.5 bg-line'
                }`}
              />
            ))}
          </div>
        </div>
        <Button variant="ghost" onClick={onQuit}>
          Abandon
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <Panel className="p-6 sm:p-8">
          {/* The three cues are the whole puzzle, so they take the type. They
              cascade in on each new item, which is what turns moving to the
              next one into an arrival rather than a swap. */}
          <div className="flex flex-col items-center gap-1.5 sm:gap-2">
            {cues.map((c, i) => (
              <div
                key={i}
                className="pop-in stagger text-center text-[26px] leading-none font-semibold tracking-[.06em] uppercase sm:text-4xl"
                style={{ '--i': i } as CSSProperties}
              >
                {c}
              </div>
            ))}
          </div>

          {/* The clock lives in the line of sight between the words and your
              answer rather than in a corner you must look away to read. It is a
              fuse: it empties, warms, and only at the very end reddens. */}
          <div className="mt-6 mb-5 flex items-center gap-3">
            {/* Once the item is over the count reads blank, but the blank is a
                non-breaking space rather than an empty string on purpose: an
                empty inline box has no line height, which would collapse this
                row by the height of a digit and, since the panel is centred,
                drift the cues downward the instant an item settled. The space
                holds the line open so nothing above it moves. */}
            <span
              key={critical ? secs : 'calm'}
              className={`w-7 shrink-0 text-right font-mono text-sm tabular-nums transition-colors ${numColor} ${
                critical ? 'tick' : ''
              }`}
            >
              {over ? '\u00A0' : secs}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel2">
              <div
                className={`h-full rounded-full transition-[width] duration-200 ease-linear ${barColor}`}
                style={{ width: `${frac * 100}%` }}
              />
            </div>
          </div>

          {/* One fixed-height stage for every outcome, so the cues above never
              jump as the answer field gives way to a result and back. It is
              sized to the tallest state — the input, its commit button, and the
              give-up line during play — because a min-height that the playing
              content overran would let the panel grow by those few pixels and
              nudge the cues up out from under you at the very moment you were
              reading them. */}
          <div className="flex min-h-[150px] flex-col justify-center">
            {status === 'playing' && (
              <div className="flex flex-col gap-3">
                {/* Font size is intentionally left to the global rule that pins
                    inputs to 16px on touch devices; anything smaller makes iOS
                    zoom on focus and never zoom back. */}
                <input
                  ref={inputRef}
                  autoFocus
                  {...wordField}
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  enterKeyHint="go"
                  placeholder={phase.placeholder}
                  className={`w-full rounded-xl border bg-panel2 px-4 py-3 text-center outline-none transition-colors focus:border-accent ${
                    wrong ? 'shake border-danger/70' : 'border-line'
                  }`}
                />
                {/* Enter submits, but the commit is also a real button, because
                    on a phone the return key is out of sight and every other
                    exercise here gives you something to press. The min height
                    lifts the shared 36px button to a 44px touch target, which is
                    the one place in this exercise where a fast, repeated tap has
                    to land first time. */}
                <Button className="min-h-[44px] w-full" onClick={submit} disabled={!guess.trim()}>
                  {phase.verb}
                </Button>
                <div className="flex justify-center">
                  {/* Padded past its ink so the hit area clears a fingertip,
                      while the type stays small enough that giving up never
                      looks like the intended move. */}
                  <button
                    onClick={giveUp}
                    className="px-3 py-1.5 text-xs text-muted underline decoration-muted/40 underline-offset-4 transition-colors hover:text-fg"
                  >
                    give up &amp; show answer
                  </button>
                </div>
              </div>
            )}

            {status === 'solved' && (
              /* The whole reward is tappable so the impatient never wait on the
                 celebration; those who do nothing are carried on by the timer. */
              <button
                type="button"
                onClick={() => settle(true)}
                aria-live="polite"
                className="press flex w-full flex-col items-center gap-3 text-center"
              >
                <span className="flare inline-flex items-center gap-2 rounded-2xl border border-accent2/40 bg-accent2/10 px-5 py-2.5">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 text-accent2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="pop-in text-3xl font-semibold text-accent2">{answer}</span>
                </span>
                <span className="text-sm text-muted">
                  links {cues[0]}, {cues[1]} and {cues[2]}
                </span>
              </button>
            )}

            {(status === 'timeout' || status === 'gaveup') && (
              <div aria-live="polite" className="flex flex-col items-center gap-3 text-center">
                <div className="text-[10px] tracking-[.14em] text-muted uppercase">
                  {status === 'timeout' ? 'Time — the link was' : 'The link was'}
                </div>
                <div className="pop-in text-3xl font-semibold text-warn">{answer}</div>
                <Button variant="soft" className="mt-1 min-h-[44px] w-full" onClick={() => settle(false)}>
                  Next
                </Button>
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* Kept out of the result states on purpose. While you solve, the task
          line and the example are support; once the answer is on screen they
          are noise, and the example is itself a solved item that would hand the
          move over if it sat open beneath a live puzzle. The row still reserves
          its height when empty so that settling an item never slides the cues
          up or down — their position is the one thing on this screen that has to
          stay nailed in place. */}
      <div className="flex min-h-[100px] shrink-0 flex-col items-center pt-4">
        {status === 'playing' && (
          <>
            {phase.hint && (
              <p className="text-center text-[11px] leading-relaxed text-muted">{phase.hint}</p>
            )}
            <WorkedExample phase={phase} />
          </>
        )}
      </div>
    </div>
  )
}
