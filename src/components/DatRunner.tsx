import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Button, Chip, Panel, wordField } from './ui'
import { WorkedExample } from './WorkedExample'
import { fmtClock, useTimer } from '../lib/useTimer'
import { DAT_TAKE, datValid } from '../engine/scoring'
import type { Phase } from '../exercises/types'

/* ------------------------------------------------------------------ DAT --- */

/*
 * Ten boxes, of which only the first seven valid words are scored. Both numbers
 * are properties of the published instrument (Olson et al. 2021), not tunables,
 * and the three spare boxes exist so a proper noun or a typo need not cost you a
 * scored slot.
 *
 * The scored count and the word-validity rule are imported rather than restated
 * here. They were restated once, and the copies disagreed — this screen accepted
 * a leading hyphen the scorer rejects, so a box could read as counted and then
 * be silently dropped. On an exercise taken monthly as a benchmark, a mark that
 * disagrees with the score corrupts the trend it exists to measure.
 */
const COUNT = 10
const SCORED = DAT_TAKE

/*
 * Each box is in exactly one of these states. `scored` and `extra` are both
 * valid words; they differ only in whether the word landed inside the first
 * seven survivors. They are drawn differently on purpose, so which boxes
 * actually move the score is visible rather than something you have to infer.
 */
type Slot = 'empty' | 'invalid' | 'duplicate' | 'scored' | 'extra'

/*
 * Classify all ten boxes in one left-to-right pass that mirrors scoreDAT()
 * exactly: trim, lower-case, reject anything that is not a single hyphenated
 * word, reject a repeat of an earlier survivor, and treat only the first seven
 * survivors as scored. Keeping this identical to the scorer is the entire point
 * of showing validity live — the marks a user sees while typing have to be the
 * same validity the score is computed from later, or the feedback is a lie, and
 * on a benchmark people repeat monthly a lie quietly corrupts their own trend.
 */
function classify(words: string[]): Slot[] {
  const seen = new Set<string>()
  let valid = 0
  return words.map((w) => {
    const t = w.trim().toLowerCase()
    if (!t) return 'empty'
    if (!datValid(t)) return 'invalid'
    if (seen.has(t)) return 'duplicate'
    seen.add(t)
    valid += 1
    return valid <= SCORED ? 'scored' : 'extra'
  })
}

function markerTitle(s: Slot): string {
  switch (s) {
    case 'scored':
      return 'Counts — one of your first seven valid words.'
    case 'extra':
      return 'Valid, but only your first seven valid words are scored.'
    case 'duplicate':
      return 'Already used — a repeat is skipped.'
    case 'invalid':
      return 'Not a single word — letters and hyphens only.'
    default:
      return ''
  }
}

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
  const [words, setWords] = useState<string[]>(() => Array(COUNT).fill(''))
  const [focus, setFocus] = useState<number | null>(0)
  const [pulse, setPulse] = useState<Record<number, 'ok' | 'bad'>>({})
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const startRef = useRef(Date.now())

  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish
  const finish = () =>
    onFinishRef.current(
      words.filter((w) => w.trim()),
      Date.now() - startRef.current,
    )

  // useTimer always calls the latest callback, so this closure sees the current
  // words; when the four minutes expire we hand over whatever is on screen and
  // let the scorer discard the invalid ones, exactly as a manual finish would.
  const { remaining, progress } = useTimer(seconds, true, () => finish())

  const slots = useMemo(() => classify(words), [words])

  /*
   * A half-typed word is briefly invalid — "ice c" on the way to "ice-cream"
   * contains a space, and "ban" is a repeat on the way to a second "banana".
   * Flashing the box you are editing red on every keystroke is worse than
   * silence, so the focused box never shows a rejection; its problem surfaces
   * only once you leave it. Positive validity is safe to show live, so only the
   * negative states are held back here.
   */
  const shown = useMemo<Slot[]>(
    () => slots.map((s, i) => (i === focus && (s === 'invalid' || s === 'duplicate') ? 'empty' : s)),
    [slots, focus],
  )

  const validCount = slots.reduce((n, s) => n + (s === 'scored' || s === 'extra' ? 1 : 0), 0)
  const scoredCount = Math.min(validCount, SCORED)
  const remainingToScore = Math.max(0, SCORED - validCount)
  const problems = shown.reduce(
    (a, s) => {
      if (s === 'duplicate') a.dupes += 1
      else if (s === 'invalid') a.invalid += 1
      return a
    },
    { dupes: 0, invalid: 0 },
  )

  /*
   * Give the feedback a body. A word that lands valid pops its number; a box
   * that turns red on blur shakes once. Because the red state is suppressed
   * while a box is focused, that shake fires precisely when you commit a box and
   * move on — the natural moment for a rejection to register. This is the only
   * motion tied to what you typed: nothing here reacts to how *original* a word
   * is, because that figure is a benchmark and must not leak during entry, or it
   * turns the task into word-by-word hill-climbing and stops being comparable.
   */
  const prevShown = useRef<Slot[]>(Array.from({ length: COUNT }, () => 'empty' as Slot))
  useEffect(() => {
    const next: Record<number, 'ok' | 'bad'> = {}
    shown.forEach((s, i) => {
      const p = prevShown.current[i]
      const isValid = s === 'scored' || s === 'extra'
      const wasValid = p === 'scored' || p === 'extra'
      const isBad = s === 'invalid' || s === 'duplicate'
      const wasBad = p === 'invalid' || p === 'duplicate'
      if (isValid && !wasValid) next[i] = 'ok'
      else if (isBad && !wasBad) next[i] = 'bad'
    })
    prevShown.current = shown
    if (Object.keys(next).length) setPulse((m) => ({ ...m, ...next }))
  }, [shown])

  const clearPulse = (i: number) =>
    setPulse((m) => {
      if (!(i in m)) return m
      const rest = { ...m }
      delete rest[i]
      return rest
    })

  useEffect(() => {
    inputs.current[0]?.focus()
  }, [])

  const focusAt = (i: number) => inputs.current[i]?.focus()
  const setWord = (i: number, v: string) => setWords((s) => s.map((x, j) => (j === i ? v : x)))

  // Enter walks to the next box and submits from the last one; the arrows step a
  // whole row through the two columns; Backspace out of an empty box steps back.
  // A benchmark should never make a fast typist reach for the mouse mid-run.
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (i < COUNT - 1) focusAt(i + 1)
      else if (validCount >= 2) finish()
    } else if (e.key === 'ArrowDown' && i + 2 < COUNT) {
      e.preventDefault()
      focusAt(i + 2)
    } else if (e.key === 'ArrowUp' && i - 2 >= 0) {
      e.preventDefault()
      focusAt(i - 2)
    } else if (e.key === 'Backspace' && !words[i] && i > 0) {
      e.preventDefault()
      focusAt(i - 1)
    }
  }

  const clockTone = remaining < 10 ? 'text-danger' : remaining < 30 ? 'text-warn' : 'text-muted'
  const footer =
    validCount === 0
      ? 'Scored on your first seven valid words.'
      : validCount < SCORED
        ? `${remainingToScore} more ${remainingToScore === 1 ? 'word' : 'words'} fill the seven that are scored.`
        : 'Your seven scored words are in — score whenever you are ready.'
  const problemNote = (() => {
    const parts = [
      problems.dupes ? `${problems.dupes} ${problems.dupes === 1 ? 'repeat' : 'repeats'}` : '',
      problems.invalid
        ? `${problems.invalid} ${problems.invalid === 1 ? "that isn't one word" : "that aren't one word"}`
        : '',
    ].filter(Boolean)
    return parts.length ? `${parts.join(' and ')} won't be scored.` : ''
  })()

  return (
    <div className="mx-auto flex h-[100dvh] max-w-2xl flex-col gap-3 p-4 sm:gap-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <Chip tone="accent">Divergent Association</Chip>
        <div className="flex items-center gap-3">
          <span className={`font-mono text-lg tabular-nums ${clockTone}`}>{fmtClock(remaining)}</span>
          <Button variant="ghost" onClick={onQuit}>
            Abandon
          </Button>
        </div>
      </div>

      <div className="h-1 shrink-0 overflow-hidden rounded-full bg-panel2">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ${
            remaining < 30 ? 'bg-warn' : 'bg-gradient-to-r from-accent to-accent2'
          }`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto sm:gap-4">
        <Panel className="p-4 sm:p-5">
          <p className="text-base font-medium leading-snug sm:text-lg">{phase.task}</p>
          {phase.hint && <p className="mt-2 text-sm leading-relaxed text-muted">{phase.hint}</p>}
          <WorkedExample phase={phase} defaultOpen={words.every((w) => !w.trim())} />
          <p className="mt-3 text-sm text-muted">Single common nouns only — no names, no jargon.</p>
        </Panel>

        {/* The legend states what turns a box red; the counter states how many
            of the seven scored slots are filled. Between them a user always
            knows what counts as valid and how many are left — never a score. */}
        <div className="flex items-center justify-between gap-3 px-0.5">
          <span className="text-[11px] leading-snug text-muted">
            One word per box · letters and hyphens · no repeats
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted">
            <span
              key={scoredCount}
              className={`tick inline-block font-semibold ${
                scoredCount >= SCORED ? 'text-accent2' : 'text-fg'
              }`}
            >
              {scoredCount}
            </span>
            {' / '}
            {SCORED} scored
            {validCount > SCORED && <span className="text-muted/70"> · +{validCount - SCORED}</span>}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {words.map((w, i) => {
            const s = shown[i]
            const bad = s === 'invalid' || s === 'duplicate'
            const badge =
              bad ? 'text-danger' : s === 'scored' ? 'text-accent2' : s === 'extra' ? 'text-muted' : 'text-muted/60'
            return (
              <div key={i} className="pop-in stagger relative" style={{ '--i': i } as CSSProperties}>
                <span
                  className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs tabular-nums ${badge}`}
                >
                  <span
                    className={pulse[i] === 'ok' ? 'tick inline-block' : 'inline-block'}
                    onAnimationEnd={() => clearPulse(i)}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </span>
                <input
                  {...wordField}
                  ref={(el) => {
                    inputs.current[i] = el
                  }}
                  value={w}
                  onChange={(e) => setWord(i, e.target.value)}
                  onFocus={() => setFocus(i)}
                  onBlur={() => setFocus((f) => (f === i ? null : f))}
                  onKeyDown={(e) => onKey(e, i)}
                  onAnimationEnd={() => clearPulse(i)}
                  aria-label={`Noun ${i + 1}`}
                  className={`w-full rounded-xl border bg-panel2 py-3 pl-10 pr-9 text-sm outline-none transition-colors focus:border-accent ${
                    bad ? 'border-danger/70' : s === 'scored' ? 'border-accent2/50' : 'border-line'
                  } ${pulse[i] === 'bad' ? 'shake' : ''}`}
                />
                {s !== 'empty' && (
                  <span
                    className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold ${
                      bad ? 'text-danger' : s === 'scored' ? 'text-accent2' : 'text-muted'
                    }`}
                    title={markerTitle(s)}
                  >
                    {bad ? '✕' : '✓'}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {problemNote && (
          <p className="rise px-0.5 text-[11px] leading-snug text-danger/90">{problemNote}</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted">{footer}</p>
        <Button onClick={finish} disabled={validCount < 2}>
          {phase.verb}
        </Button>
      </div>
    </div>
  )
}
