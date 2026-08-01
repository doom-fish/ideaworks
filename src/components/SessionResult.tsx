import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button, Chip, Panel, Stat, proseField } from './ui'
import { JudgementVerdict } from './JudgeGate'
import { SemanticMap } from './SemanticMap'
import { SPRING, useSpring } from '../lib/spring'
import {
  CHAIN_GOOD,
  CLICHE_THRESHOLD,
  DUPLICATE_DISTANCE,
  FAR_THRESHOLD,
  datBand,
} from '../engine/calibration'
import type { ScoredIdea } from '../engine/scoring'
import type { SessionMetrics } from '../engine/db'
import type { Exercise, ExerciseKind } from '../exercises/types'

/** What a single response is called, per exercise kind. */
const UNIT: Record<ExerciseKind, { one: string; many: string; list: string }> = {
  'idea-list': { one: 'Ideas', many: 'ideas', list: 'All ideas' },
  dat: { one: 'Words', many: 'words', list: 'Your words' },
  rat: { one: 'Puzzles', many: 'puzzles', list: 'All puzzles' },
  decompose: { one: 'Parts', many: 'parts', list: 'All parts' },
  chain: { one: 'Jumps', many: 'jumps', list: 'Every jump' },
}

/**
 * How originality was measured for this exercise, which changes what an honest
 * badge can claim.
 *
 *   bank   — distance from a bank of stereotyped responses. Only the two
 *            Alternate-Uses-style exercises carry one, and for those "far from
 *            the usual" is a real, measured statement.
 *   spread — distance between your own answers (the DAT, and any open prompt
 *            with no cliché bank). Nothing here measured "the usual", so a
 *            far-from-stereotype badge would be describing a quantity that was
 *            never computed — the precise kind of invented confidence this app
 *            refuses.
 */
type ScoreMode = 'bank' | 'spread'

type Badge = { tone: 'good' | 'warn' | 'bad' | 'neutral'; label: string }

type StatSpec = {
  label: string
  value: string | number
  hint: string
  tone?: 'fg' | 'accent' | 'accent2' | 'warn'
}

/**
 * The stat block is built per exercise kind rather than shown generically.
 * Reusing "originality" and "categories" labels across a word-association task,
 * an insight puzzle and a decomposition drill would put a confident-looking
 * number next to a quantity that does not mean that — which is exactly the kind
 * of false precision this app is supposed to avoid.
 */
function statsFor(kind: ExerciseKind, m: SessionMetrics): StatSpec[] {
  switch (kind) {
    case 'rat':
      return [
        { label: 'Puzzles', value: m.fluency, hint: 'How many you were shown.' },
        {
          label: 'Solved',
          value: m.flexibility,
          tone: 'accent2',
          hint: 'Solved before the timer ran out.',
        },
        {
          label: 'Solve rate',
          value: `${m.originality}%`,
          tone: 'accent',
          hint: 'Difficulty adapts to keep this in a workable range rather than making you feel clever.',
        },
        {
          label: 'Avg time',
          value: m.elaboration ? `${m.elaboration}s` : '—',
          hint: 'Mean time to solution on the ones you got. Insight solutions tend to arrive whole rather than gradually.',
        },
      ]
    case 'dat':
      return [
        { label: 'Words used', value: m.fluency, hint: 'Valid words, first seven are scored.' },
        {
          label: 'Distance',
          value: m.originality,
          tone: 'accent2',
          hint: 'Mean pairwise semantic distance ×100. Interpreted against reference distributions measured with this same on-device model.',
        },
      ]
    case 'chain':
      return [
        { label: 'Jumps', value: m.fluency - 1, hint: 'Steps in your chain.' },
        {
          label: 'Score',
          value: m.originality,
          tone: 'accent',
          hint: 'Mean step distance, weighted toward your weakest jump.',
        },
        {
          label: 'Best jump',
          value: m.peakOriginality,
          tone: 'accent2',
          hint: 'Your longest single leap.',
        },
        {
          label: 'Strong steps',
          value: m.flexibility,
          hint: 'Jumps above 0.80 — genuinely unrelated rather than loosely associated.',
        },
      ]
    case 'decompose':
      return [
        { label: 'Parts', value: m.fluency, hint: 'How many parts you named.' },
        {
          label: 'Function-free',
          value: m.flexibility,
          tone: 'accent2',
          hint: 'Parts described with no word that implies a use.',
        },
        {
          label: 'Clean rate',
          value: `${m.originality}%`,
          tone: 'accent',
          hint: 'The proportion of your labels that describe form rather than function.',
        },
        {
          label: 'Detail',
          value: m.elaboration,
          hint: 'Average words per part. Generic descriptions are usually longer than fixed ones — that is the point.',
        },
      ]
    default:
      return [
        { label: 'Ideas', value: m.fluency, hint: 'How many ideas you banked.' },
        {
          label: 'Mean orig.',
          value: m.originality,
          tone: 'accent',
          hint: 'Average semantic-distance originality across the session, 0-100.',
        },
        {
          label: 'Peak',
          value: m.peakOriginality,
          tone: 'accent2',
          hint: 'Your best single idea. This is the number that matters most — one outlier beats ten decent ones.',
        },
        {
          label: 'Categories',
          value: m.flexibility,
          hint: 'Distinct semantic clusters your ideas spanned (flexibility).',
        },
        {
          label: 'Late lift',
          value: `${m.serialGain > 0 ? '+' : ''}${m.serialGain}`,
          tone: m.serialGain > 0 ? 'accent2' : 'warn',
          hint: 'Second half minus first half. Positive means you kept searching after your obvious answers ran out — the serial order effect showing up in your own data.',
        },
      ]
  }
}

/**
 * Reveal the result one block at a time, top to bottom.
 *
 * This screen is the payoff of a five-to-seven-minute effort, and dropping the
 * whole thing on screen at once squanders it: a considered order lets the eye
 * land on the user's best idea before the statistics about it, which is the
 * order in which they actually want to feel this. The cadence is deliberately
 * brisk and the sequence is skippable, because the one thing a staged reveal
 * must never do is make someone wait on an animation to read their own results.
 *
 * Under prefers-reduced-motion it collapses to a single frame. Everything here
 * is decorative and nothing about the result depends on the motion, so for a
 * user who has asked for stillness it simply appears.
 */
function useStagedReveal(count: number) {
  const reduce = useMemo(
    () =>
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const [stage, setStage] = useState(reduce ? count : 0)
  useEffect(() => {
    if (reduce) {
      setStage(count)
      return
    }
    setStage(0)
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setStage(i)
      if (i >= count - 1) window.clearInterval(id)
    }, 95)
    return () => window.clearInterval(id)
  }, [count, reduce])
  const revealAll = useCallback(() => setStage(count), [count])
  return { stage, revealAll, animating: !reduce && stage < count - 1 }
}

/**
 * Counts a numeric headline up to its value.
 *
 * Falls back to plain text for anything non-numeric (scores like "3/8"), rather
 * than animating a string into nonsense.
 */
function SpringNumber({ text }: { text: string }) {
  const n = Number(text)
  const numeric = text.trim() !== '' && Number.isFinite(n)
  const v = useSpring(numeric ? n : 0, SPRING.soft, 0.08)
  if (!numeric) return <>{text}</>
  const decimals = (text.split('.')[1] ?? '').length
  return <>{v.toFixed(decimals)}</>
}

/** A bar and a counter that spring to their value, staggered down the list. */
function ScoreBar({ value, delay }: { value: number; delay: number }) {
  const v = useSpring(value, SPRING.snappy, delay)
  return (
    <div className="flex items-center gap-2">
      {/*
        The bar is a desktop luxury. On a 390px row it competes with the idea
        text for width, and the words are the thing that matters, so below the
        `sm` breakpoint it drops away and the number alone carries the score.
      */}
      <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-panel2 sm:block">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent2"
          style={{ width: `${Math.max(0, Math.min(100, v))}%` }}
        />
      </div>
      <span className="w-7 text-right font-mono text-xs tabular-nums text-muted">
        {Math.round(v)}
      </span>
    </div>
  )
}

/** One-line explanation of why the hero idea scored what it did. */
function heroWhy(idea: ScoredIdea, mode: ScoreMode): string {
  if (mode === 'spread') {
    return 'This exercise scores how far each answer sits from your others rather than distance from a stock bank, and this one sat furthest from the rest of your set — which is exactly what the number rewards.'
  }
  const distance =
    idea.dCliche > FAR_THRESHOLD
      ? 'it sits clear of every stock answer for this prompt'
      : idea.dCliche >= CLICHE_THRESHOLD
        ? 'it steps well away from the usual answers'
        : 'it was your furthest from the stock answers, even though it stayed near the well-trodden ones'
  const own = idea.dSelf >= DUPLICATE_DISTANCE ? ', and it restates nothing else you wrote' : ''
  return `The score is distance from the responses almost everyone gives: here ${distance}${own}.`
}

/**
 * The badge beside an idea, reusing the exact words the live runner shows during
 * the session — "off-task", "stock", "far" — so the vocabulary carries the same
 * meaning before and after the numbers land. In spread mode there is no bank to
 * be far from, so the only honest badge is the near-duplicate one.
 */
function ideaBadge(idea: ScoredIdea, mode: ScoreMode): Badge | null {
  if (idea.offTask) return { tone: 'bad', label: 'off-task' }
  if (mode === 'spread') {
    return idea.cliche ? { tone: 'warn', label: 'near-duplicate' } : null
  }
  if (idea.cliche) return { tone: 'warn', label: 'stock' }
  if (idea.dSelf < DUPLICATE_DISTANCE) return { tone: 'neutral', label: 'echo' }
  if (idea.dCliche > FAR_THRESHOLD) return { tone: 'good', label: 'far' }
  return null
}

/** The badge for one row of the full list, which differs by exercise kind. */
function rowBadge(kind: ExerciseKind, idea: ScoredIdea, isExtreme: boolean, mode: ScoreMode): Badge | null {
  if (kind === 'idea-list') return ideaBadge(idea, mode)
  if (kind === 'rat')
    return idea.originality > 0
      ? { tone: 'good', label: 'solved' }
      : { tone: 'neutral', label: 'missed' }
  if (kind === 'decompose')
    return idea.cliche ? { tone: 'warn', label: 'names a use' } : { tone: 'good', label: 'clean' }
  if (kind === 'dat') return isExtreme ? { tone: 'warn', label: 'closest pair' } : null
  // chain: dSelf is the step distance, so the smallest one is the jump where the
  // chain fell back into association, and anything past the calibrated bar is a
  // genuinely unrelated leap worth marking.
  if (isExtreme) return { tone: 'warn', label: 'weakest' }
  return idea.dSelf > CHAIN_GOOD ? { tone: 'good', label: 'strong' } : null
}

/** Colour for the one big headline number, honest about what it can claim. */
function numberTone(kind: ExerciseKind, value: string): string {
  // Only the DAT reports a raw distance with published interpretation bands, so
  // it is the single headline whose colour can honestly track "how wide" —
  // teal once past what random nouns score, amber below it. Every other
  // headline is a count or a ratio with no calibrated meaning attached, so it
  // stays neutral rather than implying a verdict the engine has not earned.
  if (kind === 'dat') {
    const band = datBand(Number(value))
    return band.min >= 76 ? 'text-accent2' : band.min >= 69 ? 'text-fg' : 'text-warn'
  }
  return 'text-accent2'
}

/**
 * Whether the headline earns a threshold flare.
 *
 * Reserved for a genuinely clean outcome and always defined by a quality bar,
 * never by volume: the app never celebrates producing more, so nothing here
 * fires because a list got long.
 */
function headlineFlare(kind: ExerciseKind, m: SessionMetrics, value: string): boolean {
  switch (kind) {
    case 'dat':
      return datBand(Number(value)).min >= 76
    case 'chain':
      return m.fluency > 1 && m.flexibility === m.fluency - 1
    case 'decompose':
    case 'rat':
      return m.fluency > 0 && m.flexibility === m.fluency
    default:
      return false
  }
}

function SessionHeader({ exercise }: { exercise: Exercise }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[.14em] text-muted">Session complete</div>
        <h2 className="text-2xl font-semibold tracking-tight">{exercise.name}</h2>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">{exercise.trains}</p>
      </div>
      <Chip tone="accent">{exercise.category}</Chip>
    </div>
  )
}

function Headline({
  kind,
  headline,
  flare,
}: {
  kind: ExerciseKind
  headline: { label: string; value: string; hint?: string }
  flare: boolean
}) {
  return (
    <Panel className={`p-6 text-center ${flare ? 'flare' : ''}`}>
      <div className="text-[10px] uppercase tracking-[.14em] text-muted">{headline.label}</div>
      <div
        className={`mt-1 text-6xl font-semibold tabular-nums ${numberTone(kind, headline.value)}`}
      >
        <SpringNumber text={headline.value} />
      </div>
      {headline.hint && (
        <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-muted">{headline.hint}</p>
      )}
    </Panel>
  )
}

/**
 * The user's own words, presented as the hero of the screen.
 *
 * Everything else on this page is a statistic about their thinking; this is the
 * thinking itself, so it gets the largest type and the only warm wash of colour
 * on an otherwise neutral page. The number is present but demoted beneath the
 * words, and it is immediately followed by *why* it scored that way — the single
 * most valuable thing this screen can say, and the developer's longest-standing
 * complaint about earlier versions that showed a bare figure.
 */
function HeroIdea({
  idea,
  index,
  total,
  serialOrder,
  mode,
  flare,
}: {
  idea: ScoredIdea
  index: number
  total: number
  serialOrder: boolean
  mode: ScoreMode
  flare: boolean
}) {
  const score = useSpring(idea.originality, SPRING.soft, 0.14)
  const standoutChip =
    mode === 'spread'
      ? 'most separated'
      : idea.dCliche > FAR_THRESHOLD
        ? 'far from the usual'
        : null
  const fromSecondHalf = serialOrder && index + 1 > total / 2
  return (
    <Panel className={`pop-in relative overflow-hidden p-6 ${flare ? 'flare' : ''}`}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-accent2/10"
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-[.14em] text-muted">
            {serialOrder ? 'Your most distant idea' : 'Your strongest entry'}
          </div>
          {standoutChip && <Chip tone="good">{standoutChip}</Chip>}
        </div>
        <p className="mt-3 text-xl leading-relaxed sm:text-2xl">{idea.text}</p>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-2xl font-semibold tabular-nums text-accent2">
            {Math.round(score)}
            <span className="ml-1 text-xs font-normal text-muted">/100 originality</span>
          </span>
          {serialOrder && (
            <span className="text-xs text-muted">
              Idea #{index + 1} of {total}
              {fromSecondHalf && ' — from the second half, as usual'}
            </span>
          )}
        </div>
        <p className="mt-4 border-t border-line/60 pt-3 text-xs leading-relaxed text-muted">
          {heroWhy(idea, mode)}
        </p>
      </div>
    </Panel>
  )
}

/**
 * Shown for an open-generation session that produced no scorable standout —
 * either because everything missed the task, or because nothing broke away from
 * the obvious. Naming an off-task "winner" would be dishonest (its distance
 * score measures nothing), so instead the screen says plainly what happened.
 */
function NoStandoutNotice({ allOffTask }: { allOffTask: boolean }) {
  return (
    <Panel className="border-warn/30 p-5">
      <div className="text-[10px] uppercase tracking-[.14em] text-warn">No standout this time</div>
      <p className="mt-2 text-sm leading-relaxed text-fg/85">
        {allOffTask
          ? 'Nothing this session engaged the task, so there is no originality to report. A distance score for an off-task answer measures nothing, and inventing one would be exactly the false confidence this app refuses — usually it means the prompt was read a different way than intended, not that the thinking was poor.'
          : 'Everything you wrote landed on the well-worn answers this time; nothing broke away from the responses almost everyone gives. That is the fixation this exercise trains against, and the list below is where you can see them together.'}
      </p>
    </Panel>
  )
}

function StatStrip({ stats }: { stats: StatSpec[] }) {
  return (
    <div className="space-y-2">
      <div
        className={`grid grid-cols-2 gap-2 ${stats.length >= 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}
      >
        {stats.map((s) => (
          <Stat key={s.label} label={s.label} value={s.value} hint={s.hint} tone={s.tone} />
        ))}
      </div>
      {/*
        If a number is going to sit here looking authoritative, its uncertainty
        has to be just as legible. The whole premise of the app is refusing to
        imply more confidence than an on-device embedding model has earned, so
        the caveat is on the page next to the figures, not hidden in a footnote.
      */}
      <p className="px-1 text-[11px] leading-relaxed text-muted">
        On-device scoring agrees with human raters only moderately (about r = .3–.4). Read every
        figure here as a training signal and a trend, not a verdict.
      </p>
    </div>
  )
}

function SemanticSection({
  ideas,
  vectors,
  clusters,
}: {
  ideas: ScoredIdea[]
  vectors: Float32Array[]
  clusters: number
}) {
  return (
    <Panel className="p-5">
      <div className="grid items-center gap-5 sm:grid-cols-[1fr_auto]">
        <SemanticMap
          vectors={vectors}
          height={250}
          items={ideas.map((i) => ({ label: i.text, score: i.originality, offTask: i.offTask }))}
        />
        <div className="sm:max-w-[15rem]">
          <div className="text-[10px] uppercase tracking-[.14em] text-muted">
            Where your ideas landed
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            The same distances that produced your score, drawn as a map. Ideas sitting on top of
            each other really are near-duplicates. The labelled points are the ones that defined the
            outer edge of your thinking.
          </p>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums text-accent2">{clusters}</span>
            <span className="text-xs text-muted">distinct clusters</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted/80">
            Points that never separate are one idea wearing different words.
          </p>
        </div>
      </div>
    </Panel>
  )
}

/**
 * The serial-order effect, read back from the user's own session.
 *
 * A positive late lift is worth celebrating precisely because it is the trained
 * behaviour showing up in their data, not a volume score; a flat or negative one
 * gets the specific, actionable correction rather than a scold.
 */
function SerialInsight({ gain }: { gain: number }) {
  if (gain > 0) {
    return (
      <div className="rounded-xl border border-accent2/30 bg-accent2/10 px-4 py-3 text-sm text-accent2">
        Your second half beat your first by +{gain}. That is the serial-order effect in your own
        data: the obvious answers came first and you kept searching past them, which is where the
        original ones live.
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
      Your later ideas were not better than your early ones. Usually that means you stopped
      searching and started listing variations. Next time, ban your own category once you have used
      it twice.
    </div>
  )
}

function OffTaskPanel({ items }: { items: ScoredIdea[] }) {
  return (
    <Panel className="border-danger/30 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="bad">{items.length} off-task</Chip>
        <span className="text-xs text-muted">
          Scored zero because they do not engage the object or the problem.
        </span>
      </div>
      <ul className="mt-3 space-y-1">
        {items.map((c, i) => (
          <li key={i} className="text-sm text-muted">
            {c.text}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        An answer only counts as original if it is an answer. Something unrelated to the task is
        maximally distant from it, so a scorer that rewarded distance alone would rate nonsense
        above your best idea — this check exists to stop that. If you think one of these was
        genuinely on-task, trust yourself over the model and say so in your note.
      </p>
    </Panel>
  )
}

/**
 * The stock-answer reveal.
 *
 * Deliberately shown only now, never during the session: being primed with the
 * common answers before generating pulls everyone straight toward them, the
 * design-fixation effect (Jansson & Smith, 1991) this whole app is built to
 * fight. After the fact it inverts into something useful — a map of the ground
 * to step past next time. Spread-scored exercises have no such bank, so there
 * the same panel names the honest thing it can: a near-restatement of your own.
 */
function ClicheReveal({ items, mode }: { items: ScoredIdea[]; mode: ScoreMode }) {
  if (mode === 'spread') {
    return (
      <Panel className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="warn">
            {items.length} near-duplicate{items.length === 1 ? '' : 's'}
          </Chip>
          <span className="text-xs text-muted">Two of your answers came out almost the same.</span>
        </div>
        <ul className="mt-3 space-y-1">
          {items.map((c, i) => (
            <li key={i} className="text-sm text-muted line-through">
              {c.text}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          This exercise rewards spread between your own responses, so a near-restatement earns
          nothing extra. The fix is never to write more — it is to make the ones you have genuinely
          differ.
        </p>
      </Panel>
    )
  }
  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="warn">
          {items.length} stock answer{items.length === 1 ? '' : 's'}
        </Chip>
        <span className="text-xs text-muted">
          The responses almost everyone gives for this prompt.
        </span>
      </div>
      {/*
       * Each answer is shown against the specific bank entry it landed nearest,
       * rather than against the bank as a whole. "This was stock" is a verdict
       * you have to take on trust; "this was stock, and here is the worn phrase
       * it sat next to" is evidence you can check and disagree with — and the
       * disagreement is itself worth having, since the scorer is a moderate
       * correlate of human judgement rather than an authority.
       */}
      <ul className="mt-3 space-y-2.5">
        {items.map((c, i) => (
          <li key={i} className="rounded-xl border border-line bg-panel2/40 p-3">
            <p className="text-sm text-muted line-through">{c.text}</p>
            {c.nearestCliche && (
              <p className="mt-1.5 flex gap-2 text-xs leading-relaxed text-muted/80">
                <span aria-hidden className="text-warn/70">
                  ↳
                </span>
                <span>
                  sat closest to <span className="text-warn/90">“{c.nearestCliche}”</span>
                </span>
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        You did not see this bank while writing, on purpose — being shown the common answers first
        pulls everyone toward them (design fixation, Jansson & Smith, 1991). Revealed now, it is the
        ground to step past next time.
      </p>
    </Panel>
  )
}

function EntryList({
  ideas,
  kind,
  mode,
  unit,
  extremeIdx,
}: {
  ideas: ScoredIdea[]
  kind: ExerciseKind
  mode: ScoreMode
  unit: { one: string; many: string; list: string }
  extremeIdx: number
}) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? ideas : ideas.slice(0, 8)
  // Only the three kinds whose per-item number is a real distance get a bar. For
  // the binary outcomes — a part is clean or not, a puzzle solved or not — a
  // gradient bar would dress a yes/no up as a spectrum, so those carry a badge
  // alone.
  const showBar = kind === 'idea-list' || kind === 'dat' || kind === 'chain'
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-sm font-medium">{unit.list}</span>
        {ideas.length > 8 && (
          <button
            onClick={() => setShowAll((s) => !s)}
            className="-my-1.5 rounded-lg px-2 py-2 text-xs text-muted hover:text-fg"
          >
            {showAll ? 'show less' : `show all ${ideas.length}`}
          </button>
        )}
      </div>
      {/*
        A fully expanded list can run long. Bounding its height and letting it
        scroll inside the panel keeps the reflection field and the actions
        reachable without a marathon page scroll on a phone.
      */}
      <div className={`divide-y divide-line/60 ${showAll ? 'max-h-[58vh] overflow-y-auto' : ''}`}>
        {shown.map((idea, i) => (
          <EntryRow
            key={i}
            idea={idea}
            index={i}
            kind={kind}
            mode={mode}
            isExtreme={i === extremeIdx}
            showBar={showBar}
          />
        ))}
      </div>
    </Panel>
  )
}

function EntryRow({
  idea,
  index,
  kind,
  mode,
  isExtreme,
  showBar,
}: {
  idea: ScoredIdea
  index: number
  kind: ExerciseKind
  mode: ScoreMode
  isExtreme: boolean
  showBar: boolean
}) {
  const badge = rowBadge(kind, idea, isExtreme, mode)
  // The idea wraps rather than truncates: this app is about honouring the user's
  // own words, and clipping them to fit a metric would invert that priority.
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <span className="w-5 shrink-0 pt-0.5 text-right font-mono text-xs text-muted">
        {index + 1}
      </span>
      <span className="min-w-0 flex-1 text-sm leading-snug break-words">{idea.text}</span>
      {badge && (
        <span className="shrink-0 pt-0.5">
          <Chip tone={badge.tone}>{badge.label}</Chip>
        </span>
      )}
      {showBar && (
        <span className="shrink-0 pt-0.5">
          <ScoreBar value={idea.originality} delay={0.03 * index} />
        </span>
      )}
    </div>
  )
}

function Reflection({ note, onNote }: { note: string; onNote: (s: string) => void }) {
  return (
    <Panel className="p-5">
      <label
        htmlFor="session-reflection"
        className="text-[10px] uppercase tracking-[.14em] text-muted"
      >
        What produced your best idea?
      </label>
      <p className="mt-1 text-xs text-muted">
        One line. Naming the move is what makes it repeatable — this gets surfaced back to you
        before future sessions.
      </p>
      <textarea
        id="session-reflection"
        value={note}
        onChange={(e) => onNote(e.target.value)}
        rows={2}
        {...proseField}
        placeholder="e.g. I stopped thinking about the object and thought about its material instead"
        className="mt-3 w-full resize-none rounded-xl border border-line bg-panel2 px-3 py-2 text-sm outline-none focus:border-accent"
      />
    </Panel>
  )
}

function MethodDetails({ exercise }: { exercise: Exercise }) {
  return (
    <details className="rounded-2xl border border-line bg-panel/40 p-4">
      <summary className="cursor-pointer py-1 text-xs text-muted hover:text-fg">
        How this exercise is scored, and what it's based on
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-fg/80">{exercise.evidence.claim}</p>
      <ul className="mt-3 space-y-1">
        {exercise.evidence.citations.map((c) => (
          <li key={c} className="text-[11px] text-muted">
            {c}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Originality here is computed on-device from sentence embeddings (all-MiniLM-L6-v2).
        Embedding-based scoring correlates with human originality ratings only moderately — treat
        the number as a training signal and a trend line, not a verdict.
      </p>
    </details>
  )
}

/**
 * The skip affordance for the staged reveal.
 *
 * Present only while the sequence is still running, and gone the moment it
 * finishes, so it never lingers as chrome once it has no job to do.
 */
function RevealPill({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="press fixed bottom-4 left-1/2 z-30 min-h-[44px] -translate-x-1/2 rounded-full border border-line bg-panel/90 px-5 py-2.5 text-xs font-medium text-muted shadow-lg backdrop-blur hover:text-fg"
    >
      Reveal all
    </button>
  )
}

/**
 * Post-session review.
 *
 * Deliberately *informational* rather than evaluative — no grades, no ranks, no
 * comparison to other people. Amabile's work is consistent that competitive and
 * surveillance framing suppresses risk-taking, which is precisely the behaviour
 * this app needs to protect. Competence feedback and metacognitive reflection
 * are the two patterns that survive that critique, and both are built here to
 * teach *why* a number came out the way it did rather than merely to display it.
 */
export function SessionResult({
  exercise,
  ideas,
  metrics,
  headline,
  vectors,
  judgedIndex,
  judgeHistory,
  note,
  onNote,
  onDone,
  onAgain,
}: {
  exercise: Exercise
  ideas: ScoredIdea[]
  metrics: SessionMetrics
  headline?: { label: string; value: string; hint?: string }
  vectors?: Float32Array[]
  judgedIndex?: number | null
  judgeHistory?: boolean[]
  note: string
  onNote: (s: string) => void
  onDone: () => void
  onAgain: () => void
}) {
  const kind = exercise.kind
  const unit = UNIT[kind]
  const stats = statsFor(kind, metrics)
  // The serial-order effect only exists where responses are generated
  // sequentially against one open prompt. Reporting a "late lift" for the DAT
  // or a word chain would be measuring nothing.
  const serialOrder = kind === 'idea-list'

  // Pairwise exercises, and any open prompt whose objects carry no cliché bank,
  // are scored by the spread between the user's own answers rather than distance
  // from a stereotype set. Only two exercises (the Alternate-Uses family) ship a
  // bank, and mislabelling the others "far from the usual" would claim a
  // measurement that never happened.
  const hasClicheBank = exercise.prompts.some((p) => (p.cliches?.length ?? 0) > 0)
  const mode: ScoreMode = exercise.scoring !== 'pairwise' && hasClicheBank ? 'bank' : 'spread'

  const derived = useMemo(() => {
    const onTask = ideas.filter((i) => !i.offTask)
    const best = [...onTask].sort((a, b) => b.originality - a.originality)[0] ?? null
    const cliches = ideas.filter((i) => i.cliche && !i.offTask)
    const offTask = ideas.filter((i) => i.offTask)
    // For the DAT and the chain, dSelf is a real quantity — the nearest-word
    // distance and the step distance — so the smallest of them marks the pair or
    // the jump that held the score back, which is the single most useful thing
    // to point at on those two screens.
    let extremeIdx = -1
    if ((kind === 'dat' || kind === 'chain') && ideas.length > 0) {
      extremeIdx = ideas.reduce((m, it, i, arr) => (it.dSelf < arr[m].dSelf ? i : m), 0)
    }
    return { onTask, best, cliches, offTask, extremeIdx }
  }, [ideas, kind])

  const best = derived.best
  const allOffTask = ideas.length > 0 && derived.onTask.length === 0
  const bestIndex = best ? ideas.indexOf(best) : -1
  const heroFlare =
    !!best && best.originality >= 70 && (mode === 'spread' || best.dCliche > FAR_THRESHOLD)

  // A hero is only honest when the top idea genuinely broke away from the obvious.
  // In bank mode that means it must not itself be one of the stock answers: if the
  // single most-original response is a cliché then nothing in the session cleared
  // the bar, and heroing it — "your most distant idea", a big teal number — would
  // certify a distance the engine never actually found. That is precisely the
  // fixation this exercise trains against, so it earns the plain no-standout notice
  // instead. Spread mode carries no bank to fall into, so any positively scored top
  // answer is a legitimate "most separated" hero.
  const hasStandout = !!best && best.originality > 0 && (mode === 'spread' || !best.cliche)

  // The screen is assembled as an ordered list of blocks so the reveal can walk
  // it top to bottom. The conditionals here decide which blocks exist for this
  // exercise; the reveal only decides when each one arrives.
  const blocks: { key: string; node: ReactNode }[] = [
    { key: 'header', node: <SessionHeader exercise={exercise} /> },
  ]
  if (headline) {
    blocks.push({
      key: 'headline',
      node: (
        <Headline
          kind={kind}
          headline={headline}
          flare={headlineFlare(kind, metrics, headline.value)}
        />
      ),
    })
  }
  if (kind === 'idea-list') {
    if (hasStandout) {
      blocks.push({
        key: 'hero',
        node: (
          <HeroIdea
            idea={best}
            index={bestIndex}
            total={ideas.length}
            serialOrder={serialOrder}
            mode={mode}
            flare={heroFlare}
          />
        ),
      })
    } else if (ideas.length > 0) {
      blocks.push({ key: 'nostandout', node: <NoStandoutNotice allOffTask={allOffTask} /> })
    }
  }
  if (typeof judgedIndex === 'number' && ideas[judgedIndex]) {
    blocks.push({
      key: 'judge',
      node: (
        <JudgementVerdict ideas={ideas} pickedIndex={judgedIndex} history={judgeHistory ?? []} />
      ),
    })
  }
  blocks.push({ key: 'stats', node: <StatStrip stats={stats} /> })
  if (serialOrder && metrics.fluency >= 4) {
    blocks.push({ key: 'serial', node: <SerialInsight gain={metrics.serialGain} /> })
  }
  if (vectors && vectors.length >= 3) {
    blocks.push({
      key: 'map',
      node: <SemanticSection ideas={ideas} vectors={vectors} clusters={metrics.flexibility} />,
    })
  }
  if (derived.offTask.length > 0) {
    blocks.push({ key: 'offtask', node: <OffTaskPanel items={derived.offTask} /> })
  }
  // The cliché panel is only meaningful where `cliche` marks a stock answer
  // (idea-list) or a near-duplicate word (dat). For the other kinds the same
  // flag means something else entirely and is already surfaced inline in the
  // list, so a second, mislabelled panel would only confuse.
  if ((kind === 'idea-list' || kind === 'dat') && derived.cliches.length > 0) {
    blocks.push({ key: 'cliche', node: <ClicheReveal items={derived.cliches} mode={mode} /> })
  }
  blocks.push({
    key: 'list',
    node: (
      <EntryList ideas={ideas} kind={kind} mode={mode} unit={unit} extremeIdx={derived.extremeIdx} />
    ),
  })
  blocks.push({ key: 'reflect', node: <Reflection note={note} onNote={onNote} /> })
  blocks.push({
    key: 'actions',
    node: (
      <div className="flex gap-2">
        <Button onClick={onDone} className="min-h-[44px] flex-1">
          Save & finish
        </Button>
        <Button variant="soft" onClick={onAgain} className="min-h-[44px]">
          Another round
        </Button>
      </div>
    ),
  })
  blocks.push({ key: 'method', node: <MethodDetails exercise={exercise} /> })

  const { stage, revealAll, animating } = useStagedReveal(blocks.length)

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 pb-24 sm:p-6">
      {blocks.map((b, i) =>
        stage >= i ? (
          <div key={b.key} className="rise">
            {b.node}
          </div>
        ) : null,
      )}
      {animating && <RevealPill onClick={revealAll} />}
    </div>
  )
}
