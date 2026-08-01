import { useMemo } from 'react'
import {
  classicalMDS,
  convexHull,
  distanceMatrix,
  meanPairwise,
  normalise,
  smoothPath,
  type Point,
} from '../lib/projection'
import { SPRING, useSpring, useSprings } from '../lib/spring'

export interface MapItem {
  label: string
  /** 0-100; drives size and colour */
  score: number
  offTask?: boolean
}

/**
 * The session as a map.
 *
 * Every number this app reports comes from distances between embeddings, which
 * is impossible to feel as a column of figures. Here the same distances place
 * the ideas on a plane, so clustering is visible as clustering, and the hull
 * drawn around them is the conceptual ground the session actually covered.
 *
 * The area is not decoration — it is the flexibility measure, drawn.
 */
export function SemanticMap({
  items,
  vectors,
  height = 260,
  onSpread,
}: {
  items: MapItem[]
  vectors: Float32Array[]
  height?: number
  onSpread?: (spread: number) => void
}) {
  const layout = useMemo(() => {
    if (vectors.length < 2) return null
    const dist = distanceMatrix(vectors)
    const raw = classicalMDS(dist)
    const keep = items.map((it, i) => (it?.offTask ? -1 : i)).filter((i) => i >= 0)
    const frame = keep.map((i) => raw[i])
    const pts = normalise(raw, 0.12, frame)
    const onTask = keep.map((i) => pts[i])
    const hull = convexHull(onTask.length >= 3 ? onTask : pts)
    // The headline number is the *actual* mean semantic distance between your
    // on-task ideas, not the area of the drawn polygon. Normalising always
    // fills the frame, so a polygon area would look impressive for a session
    // that went nowhere. This number is comparable between sessions.
    const spread = meanPairwise(dist, keep)
    return { pts, hull, spread }
  }, [vectors, items])

  // Stagger by distance from the centroid so the map blooms outward.
  const delays = useMemo(() => {
    if (!layout) return []
    const cx = layout.pts.reduce((a, p) => a + p.x, 0) / layout.pts.length
    const cy = layout.pts.reduce((a, p) => a + p.y, 0) / layout.pts.length
    const d = layout.pts.map((p) => Math.hypot(p.x - cx, p.y - cy))
    const max = Math.max(...d, 0.0001)
    return d.map((x) => 0.06 + (x / max) * 0.28)
  }, [layout])

  const grow = useSprings(
    layout ? layout.pts.map(() => 1) : [],
    SPRING.bouncy,
    delays,
  )
  const hullGrow = useSpring(layout ? 1 : 0, SPRING.soft, 0.42)

  if (!layout) return null
  onSpread?.(layout.spread)

  const { pts, hull } = layout
  const S = 100
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length

  // Scale the hull about the centroid so it expands into place with the points.
  const hullScaled: Point[] = hull.map((p) => ({
    x: (cx + (p.x - cx) * hullGrow) * S,
    y: (cy + (p.y - cy) * hullGrow) * S,
  }))

  return (
    <div className="relative mx-auto" style={{ maxWidth: height }}>
      <svg
        viewBox={`0 0 ${S} ${S}`}
        style={{ height }}
        className="w-full overflow-visible"
        role="img"
        aria-label={`Map of ${items.length} ideas with a mean semantic spread of ${Math.round(
          layout.spread * 100,
        )}.`}
      >
        <defs>
          <linearGradient id="hullFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-accent2)" stopOpacity="0.10" />
          </linearGradient>
          <radialGradient id="dotGlow">
            <stop offset="0%" stopColor="var(--color-accent2)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--color-accent2)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g opacity="0.16" stroke="var(--color-line)" strokeWidth="0.3">
          {[25, 50, 75].map((v) => (
            <g key={v}>
              <line x1={v} y1="0" x2={v} y2={S} />
              <line x1="0" y1={v} x2={S} y2={v} />
            </g>
          ))}
        </g>

        {hullScaled.length >= 3 && (
          <path
            d={smoothPath(hullScaled)}
            fill="url(#hullFill)"
            stroke="var(--color-accent)"
            strokeWidth="0.6"
            strokeOpacity={0.5 * hullGrow}
            strokeLinejoin="round"
          />
        )}

        {/* Spokes from the centre make the spread legible even when the hull is
            small, and give the bloom something to travel along. */}
        {pts.map((p, i) => (
          <line
            key={`s${i}`}
            x1={cx * S}
            y1={cy * S}
            x2={(cx + (p.x - cx) * (grow[i] ?? 0)) * S}
            y2={(cy + (p.y - cy) * (grow[i] ?? 0)) * S}
            stroke="var(--color-line)"
            strokeWidth="0.25"
            opacity={0.5 * (grow[i] ?? 0)}
          />
        ))}

        {/* Label the hull vertices only: they are the ideas that defined the
            outer edge of your thinking, and labelling every point on a small
            map produces an unreadable pile. */}
        {pts.map((p, i) => {
          const g = grow[i] ?? 0
          const item = items[i]
          if (item?.offTask || !hull.some((h) => h.x === p.x && h.y === p.y)) return null
          const x = (cx + (p.x - cx) * g) * S
          const y = (cy + (p.y - cy) * g) * S
          const right = p.x <= cx
          const words = item.label.split(/\s+/).slice(0, 3).join(' ')
          return (
            <text
              key={`l${i}`}
              x={right ? x + 4 : x - 4}
              y={y + 1}
              textAnchor={right ? 'start' : 'end'}
              fontSize="2.6"
              fill="var(--color-muted)"
              opacity={Math.max(0, g * 0.9 - 0.25)}
              style={{ pointerEvents: 'none' }}
            >
              {words}
              {item.label.split(/\s+/).length > 3 ? '…' : ''}
            </text>
          )
        })}

        {pts.map((p, i) => {
          const g = grow[i] ?? 0
          const item = items[i]
          const x = (cx + (p.x - cx) * g) * S
          const y = (cy + (p.y - cy) * g) * S
          const r = 1.4 + ((item?.score ?? 0) / 100) * 2.2
          const off = item?.offTask
          return (
            <g key={i} opacity={Math.min(1, g * 1.4)}>
              {!off && item.score >= 70 && (
                <circle cx={x} cy={y} r={r * 3.2 * g} fill="url(#dotGlow)" />
              )}
              <circle
                cx={x}
                cy={y}
                r={r * g}
                fill={
                  off
                    ? 'var(--color-line)'
                    : item.score >= 70
                      ? 'var(--color-accent2)'
                      : item.score >= 35
                        ? 'var(--color-accent)'
                        : 'var(--color-muted)'
                }
                stroke="var(--color-ink)"
                strokeWidth="0.35"
              >
                <title>
                  {item.label} — {off ? 'off-task' : `${item.score}`}
                </title>
              </circle>
            </g>
          )
        })}
      </svg>


    </div>
  )
}
