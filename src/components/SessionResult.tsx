import { useState } from 'react'
import { Button, Chip, Panel, Stat, proseField } from './ui'
import { JudgementVerdict } from './JudgeGate'
import { SemanticMap } from './SemanticMap'
import { SPRING, useSpring } from '../lib/spring'
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
 * Post-session review.
 *
 * Deliberately *informational* rather than evaluative — no grades, no ranks, no
 * comparison to other people. Amabile's work is consistent that competitive and
 * surveillance framing suppresses risk-taking, which is precisely the behaviour
 * this app needs to protect. Competence feedback and metacognitive reflection
 * are the two patterns that survive that critique.
 */
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
    <>
      <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-panel2">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent2"
          style={{ width: `${Math.max(0, Math.min(100, v))}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-muted">
        {Math.round(v)}
      </span>
    </>
  )
}

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
  const [showAll, setShowAll] = useState(false)
  const sorted = [...ideas].sort((a, b) => b.originality - a.originality)
  const best = sorted[0]
  const cliches = ideas.filter((i) => i.cliche && !i.offTask)
  const offTask = ideas.filter((i) => i.offTask)
  const shown = showAll ? ideas : ideas.slice(0, 8)
  // The serial-order effect only exists where responses are generated
  // sequentially against one open-ended prompt. Reporting a "late lift" for the
  // DAT or a word chain would be measuring nothing.
  const serialOrder = exercise.kind === 'idea-list'
  const bestIndex = ideas.indexOf(best)
  const unit = UNIT[exercise.kind]
  const stats = statsFor(exercise.kind, metrics)

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[.14em] text-muted">Session complete</div>
          <h2 className="text-2xl font-semibold">{exercise.name}</h2>
        </div>
        <Chip tone="accent">{exercise.category}</Chip>
      </div>

      {headline && (
        <Panel className="p-6 text-center">
          <div className="text-[10px] uppercase tracking-[.14em] text-muted">{headline.label}</div>
          <div className="mt-1 text-6xl font-semibold tabular-nums text-accent2">
            <SpringNumber text={headline.value} />
          </div>
          {headline.hint && <p className="mt-2 text-xs text-muted">{headline.hint}</p>}
        </Panel>
      )}

      <div
        className={`grid grid-cols-2 gap-2 ${stats.length >= 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}
      >
        {stats.map((s) => (
          <Stat key={s.label} label={s.label} value={s.value} hint={s.hint} tone={s.tone} />
        ))}
      </div>

      {serialOrder && metrics.serialGain <= 0 && metrics.fluency >= 4 && (
        <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
          Your later ideas were not better than your early ones. Usually that means you stopped
          searching and started listing variations. Next time, ban your own category once you have
          used it twice.
        </div>
      )}

      {vectors && vectors.length >= 3 && (
        <Panel className="p-5">
          <div className="grid items-center gap-5 sm:grid-cols-[1fr_auto]">
            <SemanticMap
              vectors={vectors}
              height={250}
              items={ideas.map((i) => ({
                label: i.text,
                score: i.originality,
                offTask: i.offTask,
              }))}
            />
            <div className="sm:max-w-[15rem]">
              <div className="text-[10px] uppercase tracking-[.14em] text-muted">
                Where your ideas landed
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                The same distances that produced your score, drawn as a map. Ideas sitting on top
                of each other really are near-duplicates. The labelled points are the ones that
                defined the outer edge of your thinking.
              </p>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums text-accent2">
                  {metrics.flexibility}
                </span>
                <span className="text-xs text-muted">
                  distinct clusters
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted/80">
                Points that never separate are one idea wearing different words.
              </p>
            </div>
          </div>
        </Panel>
      )}

      {typeof judgedIndex === 'number' && ideas[judgedIndex] && (
        <JudgementVerdict
          ideas={ideas}
          pickedIndex={judgedIndex}
          history={judgeHistory ?? []}
        />
      )}

      {best && (
        <Panel className="p-5">
          <div className="text-[10px] uppercase tracking-[.14em] text-muted">
            {serialOrder ? 'Your most distant idea' : 'Your strongest entry'}
          </div>
          <p className="mt-2 text-lg leading-relaxed">{best.text}</p>
          {serialOrder && (
            <p className="mt-2 text-xs text-muted">
              Idea #{bestIndex + 1} of {ideas.length}
              {bestIndex + 1 > ideas.length / 2 && ' — from the second half, as usual.'}
            </p>
          )}
        </Panel>
      )}

      {offTask.length > 0 && (
        <Panel className="border-danger/30 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="bad">
              {offTask.length} off-task
            </Chip>
            <span className="text-xs text-muted">
              Scored zero because they do not engage the object or the problem.
            </span>
          </div>
          <ul className="mt-3 space-y-1">
            {offTask.map((c, i) => (
              <li key={i} className="text-sm text-muted">
                {c.text}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            An answer only counts as original if it is an answer. Something unrelated to the task
            is maximally distant from it, so a scorer that rewarded distance alone would rate
            nonsense above your best idea — this check exists to stop that. If you think one of
            these was genuinely on-task, trust yourself over the model and say so in your note.
          </p>
        </Panel>
      )}

      {cliches.length > 0 && (
        <Panel className="p-5">
          <div className="flex items-center gap-2">
            <Chip tone="warn">
              {cliches.length} stock answer{cliches.length === 1 ? '' : 's'}
            </Chip>
            <span className="text-xs text-muted">
              These are the responses almost everyone gives for this prompt.
            </span>
          </div>
          <ul className="mt-3 space-y-1">
            {cliches.map((c, i) => (
              <li key={i} className="text-sm text-muted line-through">
                {c.text}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-sm font-medium">{unit.list}</span>
          {ideas.length > 8 && (
            <button
              onClick={() => setShowAll((s) => !s)}
              className="text-xs text-muted hover:text-fg"
            >
              {showAll ? 'show less' : `show all ${ideas.length}`}
            </button>
          )}
        </div>
        <div className="divide-y divide-line/60">
          {shown.map((idea, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-5 text-right font-mono text-xs text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{idea.text}</span>
              <ScoreBar value={idea.originality} delay={0.04 * i} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="p-5">
        <label className="text-[10px] uppercase tracking-[.14em] text-muted">
          What produced your best idea?
        </label>
        <p className="mt-1 text-xs text-muted">
          One line. Naming the move is what makes it repeatable — this gets surfaced back to you
          before future sessions.
        </p>
        <textarea
          value={note}
          onChange={(e) => onNote(e.target.value)}
          rows={2}
          {...proseField}
          placeholder="e.g. I stopped thinking about the object and thought about its material instead"
          className="mt-3 w-full resize-none rounded-xl border border-line bg-panel2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </Panel>

      <div className="flex gap-2">
        <Button onClick={onDone} className="flex-1">
          Save & finish
        </Button>
        <Button variant="soft" onClick={onAgain}>
          Another round
        </Button>
      </div>

      <details className="rounded-2xl border border-line bg-panel/40 p-4">
        <summary className="cursor-pointer text-xs text-muted hover:text-fg">
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
        <p className="mt-3 text-[11px] text-muted">
          Originality here is computed on-device from sentence embeddings
          (all-MiniLM-L6-v2). Embedding-based scoring correlates with human originality ratings
          only moderately — treat the number as a training signal and a trend line, not a verdict.
        </p>
      </details>
    </div>
  )
}
