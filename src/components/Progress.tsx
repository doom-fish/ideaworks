import { useMemo } from 'react'
import type { SessionRecord } from '../engine/db'
import { EXERCISES } from '../exercises/catalog'
import { datBand } from '../engine/calibration'
import { Chip, Panel, Stat } from './ui'

function Spark({
  values,
  height = 44,
  color = 'var(--color-accent2)',
}: {
  values: number[]
  height?: number
  color?: string
}) {
  if (values.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-[11px] text-muted"
        style={{ height }}
      >
        need at least 2 sessions
      </div>
    )
  }
  const w = 240
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = height - ((v - min) / span) * (height - 8) - 4
    return [x, y] as const
  })
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${d} L${w},${height} L0,${height} Z`
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`g${color.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#g${color.replace(/\W/g, '')})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill={color} />
    </svg>
  )
}

/** Least-squares slope, expressed as change per 10 sessions. */
function slopePer10(values: number[]) {
  const n = values.length
  if (n < 3) return null
  const mx = (n - 1) / 2
  const my = values.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (values[i] - my)
    den += (i - mx) ** 2
  }
  if (!den) return null
  return (num / den) * 10
}

export function Progress({ sessions }: { sessions: SessionRecord[] }) {
  const stats = useMemo(() => {
    const byDate = [...sessions].sort((a, b) => a.startedAt - b.startedAt)
    const kindOf = (id: string) => EXERCISES.find((e) => e.id === id)?.kind
    // Only open-generation exercises share the same 0-100 originality scale, so
    // only those go on the trend line. Mixing in DAT distances or clean-rate
    // percentages would produce a chart that moves for no real reason.
    const gen = byDate.filter((s) => kindOf(s.exerciseId) === 'idea-list')
    const dat = byDate.filter((s) => s.exerciseId === 'dat')
    const peaks = gen.map((s) => s.metrics.peakOriginality)
    const lateLifts = gen.map((s) => s.metrics.serialGain)
    const days = new Set(byDate.map((s) => new Date(s.startedAt).toDateString()))
    const mix = new Map<string, number>()
    byDate.forEach((s) => mix.set(s.exerciseId, (mix.get(s.exerciseId) ?? 0) + 1))
    const judged = byDate.filter((s) => typeof s.judgedCorrect === 'boolean')
    return {
      byDate,
      dat,
      gen,
      peaks,
      lateLifts,
      days: days.size,
      mix,
      judged,
      judgeHits: judged.filter((s) => s.judgedCorrect).length,
      peakSlope: slopePer10(peaks),
      notes: byDate.filter((s) => s.note?.trim()).reverse().slice(0, 8),
    }
  }, [sessions])

  if (!sessions.length) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Panel className="p-8 text-center">
          <p className="text-muted">
            No sessions yet. Progress here is measured against your own past, never against other
            people — that comparison is what makes people play it safe.
          </p>
        </Panel>
      </div>
    )
  }

  const untouched = EXERCISES.filter((e) => !stats.mix.has(e.id))

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Sessions" value={sessions.length} />
        <Stat label="Days trained" value={stats.days} />
        <Stat
          label="Peak trend"
          value={
            stats.peakSlope === null
              ? '—'
              : `${stats.peakSlope > 0 ? '+' : ''}${stats.peakSlope.toFixed(1)}`
          }
          tone={stats.peakSlope && stats.peakSlope > 0 ? 'accent2' : 'warn'}
          hint="Change in peak originality per 10 sessions, least-squares fit. The slope is the thing to watch — single scores are noisy."
        />
        <Stat
          label="Techniques"
          value={`${stats.mix.size}/${EXERCISES.length}`}
          tone="accent"
          hint="Interleaved practice across techniques generalises better than drilling one."
        />
      </div>

      <Panel className="p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[.14em] text-muted">
              Peak originality per session
            </div>
            <p className="mt-1 text-xs text-muted">
              Your best idea in each open-generation session. Tracked on peak rather than average
              so piling up filler cannot inflate it.
            </p>
          </div>
          <Chip tone="good">
            {stats.peaks.length} session{stats.peaks.length === 1 ? '' : 's'}
          </Chip>
        </div>
        <div className="mt-4">
          <Spark values={stats.peaks} height={70} />
        </div>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel className="p-5">
          <div className="text-[10px] uppercase tracking-[.14em] text-muted">
            DAT benchmark
          </div>
          <p className="mt-1 text-xs text-muted">
            Your monthly control measure. Resistant to practice effects.
          </p>
          <div className="mt-4">
            <Spark values={stats.dat.map((s) => s.metrics.originality)} color="var(--color-accent)" />
          </div>
          {stats.dat.length > 0 && (
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {stats.dat[stats.dat.length - 1].metrics.originality.toFixed(1)}
              </span>
              <span className="text-xs text-muted">
                latest · {datBand(stats.dat[stats.dat.length - 1].metrics.originality).label}
              </span>
            </div>
          )}
        </Panel>

        <Panel className="p-5">
          <div className="text-[10px] uppercase tracking-[.14em] text-muted">
            Late lift
          </div>
          <p className="mt-1 text-xs text-muted">
            Second-half minus first-half originality. Rising here means you are learning to keep
            searching after the obvious answers run out.
          </p>
          <div className="mt-4">
            <Spark values={stats.lateLifts} color="var(--color-warn)" />
          </div>
        </Panel>
      </div>

      {stats.judged.length >= 3 && (
        <Panel className="p-5">
          <div className="text-[10px] uppercase tracking-[.14em] text-muted">
            Judgement accuracy
          </div>
          <p className="mt-1 text-xs text-muted">
            How often the idea you picked as your best was also the highest-scored one, across{' '}
            {stats.judged.length} sessions. Producing the idea and recognising it are separate
            skills — this one decides what you actually go and build.
          </p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums text-accent2">
              {Math.round((stats.judgeHits / stats.judged.length) * 100)}%
            </span>
            <span className="text-xs text-muted">
              {stats.judgeHits} of {stats.judged.length} agreed
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {stats.judged.slice(-24).map((s) => (
              <span
                key={s.id}
                title={new Date(s.startedAt).toLocaleDateString()}
                className={`h-2.5 w-2.5 rounded-sm ${
                  s.judgedCorrect ? 'bg-accent2' : 'bg-line'
                }`}
              />
            ))}
          </div>
        </Panel>
      )}

      <Panel className="p-5">
        <div className="text-[10px] uppercase tracking-[.14em] text-muted">Practice mix</div>        <div className="mt-3 space-y-2">
          {[...stats.mix.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([id, n]) => {
              const ex = EXERCISES.find((e) => e.id === id)
              const pct = (n / sessions.length) * 100
              return (
                <div key={id} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-xs">{ex?.name ?? id}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel2">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 text-right font-mono text-xs text-muted">{n}</span>
                </div>
              )
            })}
        </div>
        {untouched.length > 0 && (
          <p className="mt-4 text-xs text-muted">
            Never tried:{' '}
            <span className="text-fg/80">{untouched.map((e) => e.name).join(', ')}</span>. Variety
            across technique types transfers better than repeating a favourite.
          </p>
        )}
      </Panel>

      {stats.notes.length > 0 && (
        <Panel className="p-5">
          <div className="text-[10px] uppercase tracking-[.14em] text-muted">
            What has worked for you
          </div>
          <div className="mt-3 space-y-3">
            {stats.notes.map((s) => (
              <div key={s.id} className="border-l-2 border-accent/40 pl-3">
                <p className="text-sm text-fg/90">{s.note}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {EXERCISES.find((e) => e.id === s.exerciseId)?.name} ·{' '}
                  {new Date(s.startedAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <p className="px-1 text-[11px] leading-relaxed text-muted">
        Note on interpretation: on-device embedding scores correlate with human originality
        ratings moderately at best (roughly r = .3–.4; fine-tuned LLM scorers reach r ≈ .8). The
        absolute numbers are not a creativity IQ. The slope of your own line over months is the
        only claim this app makes.
      </p>
    </div>
  )
}
