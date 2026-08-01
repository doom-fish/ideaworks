/**
 * Empirically derived calibration constants for the on-device scorer.
 *
 * These are NOT the published norms. The published norms for the DAT
 * (Olson et al., 2021, PNAS) were computed with GloVe-840B-300d, and SemDis
 * (Beaty & Johnson, 2021) uses a latent factor over five semantic spaces.
 * This app scores with all-MiniLM-L6-v2 on-device, which has its own distance
 * distribution, so published cut-offs cannot be transplanted onto it.
 *
 * The constants below come from running the actual scorer over reference sets
 * (see calibrate.mjs): deliberately clustered word sets, 120 random draws from
 * a common-noun pool, hand-picked maximally-distant sets, and AUT responses
 * pre-sorted into stock / middling / novel bands.
 */

/** Mean pairwise cosine distance ×100 over 7 words. */
export const DAT_REFERENCE = {
  /** Same-category sets (e.g. all farm animals). */
  clustered: [35.4, 49.2, 54.2, 55.6],
  /** 120 random draws from a common-noun pool — an unskilled but unbiased baseline. */
  randomPool: { p10: 69.9, p50: 72.9, p90: 75.9 },
  /** Hand-picked maximally distant sets. */
  strong: [68.5, 78.2, 78.9, 80.7, 84.0],
} as const

export interface DatBand {
  min: number
  label: string
  detail: string
}

/**
 * Interpretation bands for the raw DAT distance. Reported raw rather than
 * rescaled, because an invented 0-100 rescale would imply a precision and a
 * comparability to published norms that does not exist.
 */
export const DAT_BANDS: DatBand[] = [
  {
    min: 82,
    label: 'very wide',
    detail: 'Above every hand-picked reference set except the most extreme. Hard to beat honestly.',
  },
  {
    min: 76,
    label: 'wide',
    detail: 'Beyond what randomly drawing unrelated nouns produces. You are actively pushing apart.',
  },
  {
    min: 69,
    label: 'typical',
    detail: 'About what randomly chosen common nouns score. Deliberate effort should beat chance.',
  },
  {
    min: 60,
    label: 'narrow',
    detail: 'Below random. Some of your words are pulling toward a shared theme.',
  },
  {
    min: 0,
    label: 'clustered',
    detail: 'Several words share a domain. Try jumping between abstract and concrete, and across senses.',
  },
]

export function datBand(raw: number): DatBand {
  return DAT_BANDS.find((b) => raw >= b.min) ?? DAT_BANDS[DAT_BANDS.length - 1]
}

/**
 * AUT-style originality. Observed raw blend values across reference responses:
 *   stock answers   0.347 – 0.497  (median 0.389)
 *   middling        0.606 – 0.859  (median 0.676)
 *   genuinely novel 0.735 – 0.893  (median 0.768)
 *
 * Fitted on a 72-item labelled set across 5 objects in which the bands are
 * deliberately *length-matched* (mean 9.5 / 9.6 / 10.0 words). An earlier
 * version of that set was not, and correlated r = .87 between band and word
 * count — so a scorer could reach rho = .84 largely by counting words. On the
 * corrected set the honest figures are:
 *   stock     median 36
 *   plausible median 56
 *   novel     median 75
 *   Spearman against the intended ordering: 0.62
 *
 * For reference on the same corrected set, models 4.6x larger scored 0.64
 * (bge-base-en-v1.5) and 0.61 (all-mpnet-base-v2) at 106 MB against 23 MB —
 * within noise at this sample size, so the small model stays.
 */
export const ORIGINALITY_FLOOR = 0.401
export const ORIGINALITY_CEIL = 0.83

/**
 * Relevance gating.
 *
 * The scorer originally rewarded semantic distance from the prompt, which meant
 * an answer unrelated to the task scored *higher* than a good one — gibberish
 * beat real ideas. Creativity is novelty *and* appropriateness, so novelty is
 * now gated on the response actually being a response to the task.
 *
 * An answer counts as on-task if it either exploits a physical property of the
 * object, or is recognisably a known use of it.
 *
 * These values come from sweeping both thresholds over a labelled set of 71
 * responses across 5 objects (scripts/benchmark-models.mjs), selecting the
 * operating point that catches the most off-task text while wrongly flagging
 * *no* genuine answer. The previous pair (0.20 / 0.45) was fitted to a much
 * smaller set and zeroed real ideas, which is the worst thing this scorer can
 * do — a good idea marked "off-task" teaches exactly the wrong lesson.
 */
export const RELEVANCE_PROP = 0.14
export const RELEVANCE_USE = 0.35

/**
 * Fallback for problem-style prompts, which have no property bank and are
 * scored against the prompt text alone. Separation there is genuinely weaker
 * (good answers ran 0.06–0.53, off-task up to 0.22), so this sits low on
 * purpose: wrongly calling a real idea off-task is far more damaging than
 * letting a nonsense one through.
 */
export const RELEVANCE_PROMPT = 0.1

/**
 * Relevance bar for a transform entry measured against its own source.
 *
 * Inverting "make every error message say something went wrong" into "name the
 * exact file and line" is plainly on-task, yet it sits at 0.08 similarity to
 * the original problem statement and 0.60 to the failure it inverts. Judging
 * such an answer against the prompt marks good work as off-task, so transform
 * entries are anchored to what they transform.
 */
export const RELEVANCE_SOURCE = 0.2

/**
 * Elaboration control.
 *
 * Automatic originality scoring is confounded by how elaborated a response is:
 * the same idea written at length scores higher than the same idea written
 * tersely, because a longer string sits further from the short entries in the
 * cliché bank. Domanti, Mock, Agnoli & De Angeli (2026), "The Effect of Idea
 * Elaboration on the Automatic Assessment of Idea Originality" (arXiv:2604.20569,
 * doi:10.1145/3811427.3811453) found that the apparent self-preference bias of
 * automatic raters disappeared once idea elaboration was controlled.
 *
 * Measured on this scorer over 45 responses — the same ideas written at three
 * levels of elaboration across five objects — novelty correlated r = .20 with
 * ln(word count). Before the correction the stock answer "build a wall" scored
 * 0 while the same idea written out as "lay the bricks in a staggered bond with
 * mortar between the courses to build a garden wall" scored 44, so padding an
 * answer raised it by roughly 22 points on average.
 *
 * A first fit on 27 responses gave a slope of 0.10; at 45 it settles at 0.048,
 * so the smaller sample was over-fitting and the correction it produced
 * overshot. Refit with more data before trusting a change to this number.
 *
 * Novelty is therefore residualised against ln(words), which drives that
 * correlation to r = .00. Elaboration is not discarded — it is reported as its
 * own metric, which is where it belongs in Torrance-style scoring.
 *
 * Refit with `npm run calibrate` if the scoring blend changes.
 */
export const ELABORATION_SLOPE = 0.0476
export const ELABORATION_MEAN_LN_WORDS = 1.889

/** Remove the length component from a raw novelty value. */
export function controlForElaboration(novelty: number, words: number): number {
  if (words < 1) return novelty
  return novelty - ELABORATION_SLOPE * (Math.log(words) - ELABORATION_MEAN_LN_WORDS)
}

/**
 * Distance to the nearest cliché below which a response is treated as a stock
 * answer.
 *
 * Chosen by sweeping the threshold over a labelled set of 14 genuine
 * restatements of bank clichés ("use it to keep a door open" for "use it as a
 * doorstop") and 18 genuinely distinct ideas for the same objects:
 *
 *   thr    recall on paraphrases    false positives on distinct ideas
 *   0.28        2/14                        0/18
 *   0.40        8/14                        0/18
 *   0.47       11/14                        0/18   ← chosen
 *   0.49       12/14                        1/18
 *   0.52       13/14                        2/18
 *
 * Set just below the point where false positives appear. Wrongly branding a
 * genuinely good idea as a stock answer is far more damaging to a training
 * tool than quietly missing a cliché, so recall is traded away for precision.
 */
export const CLICHE_THRESHOLD = 0.47

/**
 * Distance above which a response is confidently outside the stereotyped set
 * and earns the "far" badge. At 0.66, 12 of 18 genuinely distinct reference
 * ideas qualify and none of the 14 paraphrased clichés do — so the badge never
 * lies, it just stays quiet on borderline cases.
 */
export const FAR_THRESHOLD = 0.66

/**
 * Single-link clustering threshold used for the flexibility count. Chosen so
 * that near-restatements collapse together while genuinely different
 * categories stay separate.
 */
export const FLEXIBILITY_THRESHOLD = 0.45

/** Chain-step distance bands for the semantic stretch exercise. */
export const CHAIN_GOOD = 0.8
export const CHAIN_WEAK = 0.6
