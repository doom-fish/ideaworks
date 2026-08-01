import { cosDist, cosine, embedder } from './embedder'
import type { IdeaRecord, SessionMetrics } from './db'
import {
  CLICHE_THRESHOLD,
  FLEXIBILITY_THRESHOLD,
  ORIGINALITY_CEIL,
  ORIGINALITY_FLOOR,
  RELEVANCE_PROMPT,
  RELEVANCE_PROP,
  RELEVANCE_USE,
  datBand,
  type DatBand,
} from './calibration'

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/** Map a raw blended distance onto the calibrated 0-100 originality scale. */
function toOriginality(raw: number) {
  return Math.round(
    clamp01((raw - ORIGINALITY_FLOOR) / (ORIGINALITY_CEIL - ORIGINALITY_FLOOR)) * 100,
  )
}

export interface ScoredIdea extends IdeaRecord {
  /** how strongly this response engages the actual task (0-1) */
  relevance: number
  /** distance to the nearest known cliché for this prompt (low = stereotyped) */
  dCliche: number
  /** distance to the nearest *other* idea in this session (low = self-repetition) */
  dSelf: number
  /** calibrated 0-100 originality; zero when the response is off-task */
  originality: number
  cliche: boolean
  /** the response does not engage the task at all */
  offTask: boolean
}

export interface ScoreResult {
  ideas: ScoredIdea[]
  metrics: SessionMetrics
}

/**
 * Semantic-distance scoring in the spirit of SemDis / Open Creativity Scoring
 * (Beaty & Johnson, 2021, Behavior Research Methods).
 *
 * Crucially this does *not* reward distance from the prompt. Doing so scores an
 * irrelevant answer higher than a good one, because nothing is further from the
 * task than something unrelated to it. Creativity is novelty *and*
 * appropriateness, so the two are measured separately:
 *
 *   relevance — does the response exploit a real property of the object, or is
 *               it at least a recognisable use of it? Off-task responses score
 *               zero rather than winning.
 *   novelty   — given that it is on-task, how far is it from the stereotyped
 *               responses, and from your own other ideas this session?
 */
export async function scoreDivergent(
  prompt: string,
  ideas: IdeaRecord[],
  cliches: string[] = [],
  props: string[] = [],
): Promise<ScoreResult> {
  const texts = ideas.map((i) => i.text)
  const ideaVecs = await embedder.embed(texts)
  const [promptVec] = await embedder.embed([prompt])
  const clicheVecs = cliches.length ? await embedder.embed(cliches) : []
  const propVecs = props.length ? await embedder.embed(props) : []

  const scored: ScoredIdea[] = ideas.map((idea, i) => {
    const v = ideaVecs[i]
    const dCliche = clicheVecs.length ? Math.min(...clicheVecs.map((c) => cosDist(c, v))) : 0.9
    const others = ideaVecs.filter((_, j) => j !== i)
    const dSelf = others.length ? Math.min(...others.map((o) => cosDist(o, v))) : 0.9

    const simProp = propVecs.length ? Math.max(...propVecs.map((p) => cosine(p, v))) : 0
    const simUse = clicheVecs.length ? Math.max(...clicheVecs.map((c) => cosine(c, v))) : 0
    const simPrompt = cosine(promptVec, v)

    // Objects carry a property bank and a known-use bank, which separate
    // on-task from off-task cleanly. Problem-style prompts have neither, so
    // they fall back to the prompt text with a deliberately lenient bar.
    const grounded = propVecs.length > 0 || clicheVecs.length > 0
    const onTask = grounded
      ? simProp >= RELEVANCE_PROP || simUse >= RELEVANCE_USE
      : simPrompt >= RELEVANCE_PROMPT

    const relevance = clamp01(Math.max(simProp, simUse, grounded ? 0 : simPrompt))

    // Novelty is only meaningful once the response is actually on-task.
    const novelty = clicheVecs.length
      ? 0.62 * clamp01(dCliche / 0.9) + 0.38 * clamp01(dSelf / 0.9)
      : clamp01(dSelf / 0.9)

    return {
      ...idea,
      relevance,
      dCliche,
      dSelf,
      originality: onTask ? toOriginality(novelty) : 0,
      cliche: clicheVecs.length > 0 && dCliche < CLICHE_THRESHOLD,
      offTask: !onTask,
    }
  })

  return { ideas: scored, metrics: buildMetrics(scored, ideaVecs, texts) }
}

/**
 * Pairwise scoring, for exercises where the trained skill is the *spread
 * between your own responses* rather than distance from a stimulus — problem
 * reframing (are your five definitions actually different?) and perspective
 * shifting.
 */
export async function scorePairwise(
  ideas: IdeaRecord[],
  prompt?: string,
): Promise<ScoreResult> {
  const texts = ideas.map((i) => i.text)
  const vecs = await embedder.embed(texts)
  const promptVec = prompt ? (await embedder.embed([prompt]))[0] : null

  const scored: ScoredIdea[] = ideas.map((idea, i) => {
    const others = vecs.filter((_, j) => j !== i)
    const dSelf = others.length ? Math.min(...others.map((o) => cosDist(o, vecs[i]))) : 0.9
    const dMean = others.length ? mean(others.map((o) => cosDist(o, vecs[i]))) : 0.9
    const simPrompt = promptVec ? cosine(promptVec, vecs[i]) : 1
    const onTask = !promptVec || simPrompt >= RELEVANCE_PROMPT

    // Nearest-neighbour distance dominates: one near-duplicate should cost you
    // even when the rest of the set is well spread.
    const raw = 0.65 * dSelf + 0.35 * dMean
    return {
      ...idea,
      relevance: clamp01(simPrompt),
      dCliche: 0.9,
      dSelf,
      originality: onTask ? toOriginality(raw) : 0,
      cliche: dSelf < 0.25,
      offTask: !onTask,
    }
  })

  return { ideas: scored, metrics: buildMetrics(scored, vecs, texts) }
}

function buildMetrics(
  scored: ScoredIdea[],
  vecs: Float32Array[],
  texts: string[],
): SessionMetrics {
  const origs = scored.map((s) => s.originality)
  const half = Math.floor(scored.length / 2)
  const early = mean(origs.slice(0, half))
  const late = mean(origs.slice(half))
  return {
    fluency: scored.length,
    originality: Math.round(mean(origs)),
    peakOriginality: origs.length ? Math.max(...origs) : 0,
    flexibility: countClusters(vecs, FLEXIBILITY_THRESHOLD),
    elaboration:
      Math.round(mean(texts.map((t) => t.trim().split(/\s+/).length)) * 10) / 10,
    serialGain: half > 0 ? Math.round(late - early) : 0,
  }
}

/**
 * Divergent Association Task (Olson, Nahas, Chmoulevitch, Cropper & Webb, 2021,
 * PNAS): mean pairwise semantic distance across the first N valid words, ×100.
 *
 * Reported raw rather than rescaled. The published norms use GloVe-840B-300d,
 * so this number is *not* comparable to the ~78 average reported in the paper —
 * it is interpreted instead against reference distributions measured with this
 * exact model (see calibration.ts).
 */
export async function scoreDAT(
  words: string[],
  take = 7,
): Promise<{
  score: number
  band: DatBand
  used: string[]
  rejected: string[]
  pairs: { a: string; b: string; d: number }[]
  closest: { a: string; b: string; d: number } | null
}> {
  const seen = new Set<string>()
  const used: string[] = []
  const rejected: string[] = []

  for (const w of words) {
    const t = w.trim().toLowerCase()
    if (!t) continue
    // Olson et al. exclude proper nouns, multi-word entries and repeats.
    if (!/^[a-z][a-z-]*$/.test(t) || seen.has(t)) {
      rejected.push(w.trim())
      continue
    }
    seen.add(t)
    if (used.length < take) used.push(t)
  }

  if (used.length < 2) {
    return { score: 0, band: datBand(0), used, rejected, pairs: [], closest: null }
  }

  const vecs = await embedder.embed(used)
  const pairs: { a: string; b: string; d: number }[] = []
  for (let i = 0; i < used.length; i++) {
    for (let j = i + 1; j < used.length; j++) {
      pairs.push({ a: used[i], b: used[j], d: cosDist(vecs[i], vecs[j]) })
    }
  }
  const score = Math.round(mean(pairs.map((p) => p.d)) * 1000) / 10
  const closest = pairs.reduce((a, b) => (b.d < a.d ? b : a), pairs[0])
  return { score, band: datBand(score), used, rejected, pairs, closest }
}

/**
 * Semantic-stretch chain: each step scored by its distance from the previous
 * word. A direct operationalisation of reaching across a flat associative
 * hierarchy (Mednick, 1962) rather than drifting down the nearest link.
 */
export async function scoreChain(words: string[]): Promise<{
  steps: { from: string; to: string; d: number }[]
  mean: number
  weakest: number
  score: number
}> {
  if (words.length < 2) return { steps: [], mean: 0, weakest: 0, score: 0 }
  const vecs = await embedder.embed(words)
  const steps = words.slice(1).map((w, i) => ({
    from: words[i],
    to: w,
    d: cosDist(vecs[i], vecs[i + 1]),
  }))
  const ds = steps.map((s) => s.d)
  const weakest = Math.min(...ds)
  // A chain is only as good as the step where you fell back into association,
  // so the weakest jump carries real weight rather than being averaged away.
  const score = Math.round(clamp01((0.6 * mean(ds) + 0.4 * weakest) / 0.95) * 100)
  return { steps, mean: mean(ds), weakest, score }
}

/**
 * Flexibility proxy: greedy single-link clustering over cosine distance. The
 * cluster count approximates the number of distinct conceptual categories used,
 * which is the classic hand-coded "flexibility" score in Guilford/Torrance
 * scoring.
 */
export function countClusters(vecs: Float32Array[], threshold: number): number {
  if (!vecs.length) return 0
  const centroids: Float32Array[] = []
  for (const v of vecs) {
    if (!centroids.some((c) => cosDist(c, v) < threshold)) centroids.push(v)
  }
  return centroids.length
}
