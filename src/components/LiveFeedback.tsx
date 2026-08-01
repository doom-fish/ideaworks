import { useMemo } from 'react'
import { cosDist } from '../engine/embedder'
import { SPRING, useSpring, useSprings } from '../lib/spring'

/**
 * Live feedback during a session.
 *
 * Deliberately aggregate rather than per-idea. Showing a number beside each
 * idea as you write would turn the session into metric-chasing and would defeat
 * the judgement gate, which depends on you forming your own opinion before
 * seeing any score. Coverage is safe to show live: it rewards going somewhere
 * new, which is the behaviour being trained, and it cannot be gamed by
 * polishing a single answer.
 */

/** Ring that fills toward the quota and keeps counting past it. */
export function QuotaRing({
  count,
  quota,
  size = 34,
}: {
  count: number
  quota: number
  size?: number
}) {
  const pct = useSpring(Math.min(1, quota ? count / quota : 0), SPRING.snappy)
  const met = quota > 0 && count >= quota
  const r = size / 2 - 3
  const circ = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={
      met ? 'Quota met — keep going, your best idea is usually still ahead.' : `${count} of ${quota}`
    }>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth="2.5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={met ? 'var(--color-accent2)' : 'var(--color-accent)'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
        />
      </svg>
      <span
        className={`absolute inset-0 grid place-items-center text-[11px] font-semibold tabular-nums ${
          met ? 'text-accent2' : 'text-fg'
        }`}
      >
        {count}
      </span>
    </div>
  )
}

/**
 * Coverage meter.
 *
 * Shows how much semantic ground the session has covered so far, as the mean
 * pairwise distance between everything banked. It rises when you go somewhere
 * new and flattens when you circle the same idea, which is exactly the signal
 * worth having in the moment.
 */
export function CoverageMeter({ vectors }: { vectors: Float32Array[] }) {
  const coverage = useMemo(() => {
    if (vectors.length < 2) return 0
    let sum = 0
    let n = 0
    for (let i = 0; i < vectors.length; i++) {
      for (let j = i + 1; j < vectors.length; j++) {
        sum += cosDist(vectors[i], vectors[j])
        n++
      }
    }
    return n ? sum / n : 0
  }, [vectors])

  // Unrelated common nouns sit around 0.75, so that is a fair "wide" mark.
  const pct = Math.min(1, coverage / 0.85)
  const w = useSpring(pct, SPRING.soft)
  const shown = Math.round(w * 100)

  if (vectors.length < 2) return null

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-panel2 sm:w-28">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent via-sky-400 to-accent2"
          style={{ width: `${Math.max(2, shown)}%` }}
        />
      </div>
      <span className="text-[10px] uppercase tracking-[.1em] text-muted">spread</span>
    </div>
  )
}

/**
 * Constellation strip.
 *
 * A tiny live map of the session: each idea a dot, placed by how far it sits
 * from the ideas already banked. Watching a new point land far from the others
 * is immediate, wordless confirmation that you went somewhere new.
 */
export function Constellation({
  vectors,
  flags,
}: {
  vectors: Float32Array[]
  flags: { offTask?: boolean; cliche?: boolean }[]
}) {
  const positions = useMemo(
    () =>
      vectors.map((v, i) => {
        if (i === 0) return 0.5
        const prev = vectors.slice(0, i)
        // Distance to the nearest already-banked idea: near the left edge means
        // "you have said this already", right means genuinely new ground.
        const d = Math.min(...prev.map((p) => cosDist(p, v)))
        return Math.max(0.04, Math.min(0.96, d / 1.0))
      }),
    [vectors],
  )
  const xs = useSprings(positions, SPRING.bouncy, positions.map((_, i) => i * 0.01))

  if (vectors.length < 2) return null

  return (
    <div className="relative h-8 overflow-hidden rounded-lg border border-line/60 bg-panel/40">
      <div className="absolute inset-x-2 top-1/2 h-px bg-line/70" />
      <span className="absolute left-2 top-1 text-[9px] text-muted/60">said before</span>
      <span className="absolute right-2 top-1 text-[9px] text-accent2/70">new ground</span>
      {xs.map((x, i) => {
        const f = flags[i] ?? {}
        return (
          <span
            key={i}
            className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors"
            style={{
              left: `${(x || 0) * 100}%`,
              background: f.offTask
                ? 'var(--color-line)'
                : f.cliche
                  ? 'var(--color-warn)'
                  : 'var(--color-accent2)',
              boxShadow: f.offTask || f.cliche ? 'none' : '0 0 8px var(--color-accent2)',
            }}
          />
        )
      })}
    </div>
  )
}
