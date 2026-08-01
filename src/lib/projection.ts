/**
 * Turning semantic distance into a picture.
 *
 * Every score in this app comes from distances in a 384-dimensional embedding
 * space, which is impossible to reason about as a list of numbers. Projecting
 * those same distances to a plane makes the thing being measured visible: ideas
 * that cluster really are near-duplicates, and the area your ideas enclose is
 * literally how much conceptual ground you covered.
 *
 * Classical multidimensional scaling is used rather than PCA because it works
 * directly on the pairwise distance matrix — the exact quantity being scored —
 * and so the picture cannot disagree with the number beside it.
 */

export interface Point {
  x: number
  y: number
}

/**
 * Classical MDS (Torgerson scaling).
 *
 * Double-centres the squared distance matrix to a Gram matrix, then takes its
 * two leading eigenvectors by power iteration with deflation. Sessions hold at
 * most a few dozen ideas, so an O(n²) iteration per component is trivial and
 * avoids pulling in a linear-algebra dependency.
 */
export function classicalMDS(dist: number[][], iterations = 128): Point[] {
  const n = dist.length
  if (n === 0) return []
  if (n === 1) return [{ x: 0, y: 0 }]

  // B = -1/2 * J * D² * J, where J is the centring matrix.
  const sq = dist.map((row) => row.map((d) => d * d))
  const rowMean = sq.map((row) => row.reduce((a, b) => a + b, 0) / n)
  const grandMean = rowMean.reduce((a, b) => a + b, 0) / n
  const b: number[][] = []
  for (let i = 0; i < n; i++) {
    b[i] = []
    for (let j = 0; j < n; j++) {
      b[i][j] = -0.5 * (sq[i][j] - rowMean[i] - rowMean[j] + grandMean)
    }
  }

  const comps: { vec: number[]; value: number }[] = []
  for (let c = 0; c < 2; c++) {
    // Deterministic start: a random seed would make the same session render
    // differently on each visit, which reads as instability rather than data.
    let v = Array.from({ length: n }, (_, i) => Math.cos((i + 1) * (c + 1) * 1.7) + 0.1)
    let value = 0
    for (let it = 0; it < iterations; it++) {
      const next = new Array<number>(n).fill(0)
      for (let i = 0; i < n; i++) {
        let s = 0
        for (let j = 0; j < n; j++) s += b[i][j] * v[j]
        next[i] = s
      }
      const norm = Math.hypot(...next)
      if (norm < 1e-12) break
      for (let i = 0; i < n; i++) next[i] /= norm
      value = norm
      v = next
    }
    comps.push({ vec: v, value })
    // Deflate so the next component is orthogonal to this one.
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) b[i][j] -= value * v[i] * v[j]
    }
  }

  const [c1, c2] = comps
  const s1 = Math.sqrt(Math.max(c1.value, 0))
  const s2 = Math.sqrt(Math.max(c2.value, 0))
  return Array.from({ length: n }, (_, i) => ({
    x: c1.vec[i] * s1,
    y: c2.vec[i] * s2,
  }))
}

/**
 * Scale points into a unit box with padding, preserving aspect ratio.
 *
 * `frame` selects which points define the bounding box. Off-task answers are
 * often wild outliers, and letting them set the scale squeezes every real idea
 * into a corner — so the frame is the on-task set, and outliers are simply
 * allowed to sit near the edge.
 */
export function normalise(points: Point[], pad = 0.12, frame?: Point[]): Point[] {
  if (!points.length) return []
  const box = frame && frame.length >= 2 ? frame : points
  const xs = box.map((p) => p.x)
  const ys = box.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  // One scale for both axes: stretching them independently would exaggerate
  // spread along whichever axis happens to be narrower.
  const span = Math.max(maxX - minX, maxY - minY) || 1
  const inner = 1 - pad * 2
  const offX = (span - (maxX - minX)) / 2
  const offY = (span - (maxY - minY)) / 2
  const clamp = (v: number) => Math.max(0.02, Math.min(0.98, v))
  return points.map((p) => ({
    x: clamp(pad + ((p.x - minX + offX) / span) * inner),
    y: clamp(pad + ((p.y - minY + offY) / span) * inner),
  }))
}

/** Mean pairwise distance over the given indices — the real spread measure. */
export function meanPairwise(dist: number[][], indices: number[]): number {
  if (indices.length < 2) return 0
  let sum = 0
  let n = 0
  for (let a = 0; a < indices.length; a++) {
    for (let b = a + 1; b < indices.length; b++) {
      sum += dist[indices[a]][indices[b]]
      n++
    }
  }
  return n ? sum / n : 0
}

/** Andrew's monotone chain. Returns hull vertices counter-clockwise. */
export function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return [...points]
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

  const build = (src: Point[]) => {
    const out: Point[] = []
    for (const p of src) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) {
        out.pop()
      }
      out.push(p)
    }
    out.pop()
    return out
  }
  return [...build(pts), ...build([...pts].reverse())]
}

/** Shoelace area of a simple polygon. */
export function polygonArea(poly: Point[]): number {
  if (poly.length < 3) return 0
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

/** Catmull-Rom through the hull vertices, as an SVG path. */
export function smoothPath(poly: Point[], tension = 0.5): string {
  if (poly.length === 0) return ''
  if (poly.length === 1) return `M${poly[0].x},${poly[0].y}`
  if (poly.length === 2) {
    return `M${poly[0].x},${poly[0].y} L${poly[1].x},${poly[1].y}`
  }
  const n = poly.length
  const at = (i: number) => poly[((i % n) + n) % n]
  let d = `M${at(0).x},${at(0).y}`
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension * 2
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension * 2
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension * 2
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension * 2
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`
  }
  return `${d} Z`
}

/** Pairwise distance matrix from vectors already L2-normalised. */
export function distanceMatrix(vectors: Float32Array[]): number[][] {
  const n = vectors.length
  const m: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let dot = 0
      for (let k = 0; k < vectors[i].length; k++) dot += vectors[i][k] * vectors[j][k]
      const d = 1 - dot
      m[i][j] = d
      m[j][i] = d
    }
  }
  return m
}
