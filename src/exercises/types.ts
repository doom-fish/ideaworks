export type ExerciseKind =
  | 'idea-list' // open generation, semantic-distance scored
  | 'dat' // divergent association task
  | 'rat' // compound remote associates (convergent)
  | 'decompose' // generic parts technique
  | 'chain' // semantic stretch

export type ScoringMode =
  | 'vs-prompt' // originality = distance from prompt + distance from cliché bank
  | 'pairwise' // originality = spread between your own responses (DAT-style)
  | 'exact' // right/wrong (CRA)
  | 'generic-parts' // vocabulary grader
  | 'chain' // step-to-step distance

export type Category =
  | 'divergent'
  | 'convergent'
  | 'de-fixation'
  | 'reframing'
  | 'combination'
  | 'analogy'
  | 'constraint'

export interface Nudge {
  /** fraction of session elapsed at which to surface this nudge (0-1) */
  at: number
  text: string
}

/**
 * A phase of a session.
 *
 * Exercises that ask you to change stance mid-session — sabotage then invert,
 * or answer as three different people — used to do it with a timed toast that
 * vanished after nine seconds. Nothing actually changed, so nothing actually
 * switched. A phase is an explicit, acknowledged transition: the task line, the
 * input, the button verb and the scoring all change together.
 */
export interface Phase {
  /** short name shown in the phase pill, e.g. "Sabotage" */
  label: string
  /** the task, stated plainly and imperatively — this is what you are doing now */
  task: string
  /** one line on how to do it well; shown under the task */
  hint?: string
  placeholder: string
  /** verb on the commit button, e.g. "Add failure" */
  verb: string
  /** shown when the list is empty */
  empty: string
  /**
   * generate  — free entry until you advance
   * transform — walks the previous phase's entries one at a time, asking for a
   *             response to each. This is what makes "now invert them" real.
   */
  kind: 'generate' | 'transform'
  /** for transform phases: how each source entry is introduced */
  sourceLabel?: string
  /** entries required before this phase can be left */
  min?: number
  /**
   * Whether this phase's entries are what gets scored. Scaffolding phases —
   * deliberately bad ideas, or an abstract restatement of a mechanism — are
   * kept in the record but must not be scored for originality against the task.
   */
  scored: boolean
  /**
   * This phase works from what the previous phase produced, so that output is
   * pinned in front of the input rather than left in the scrolling history.
   *
   * Four phases in this catalogue open with a demonstrative — "apply *that*
   * mechanism", "*that* structure", "one of *your* axes", "the direction that
   * interests you" — and every one of them referred to something the user had
   * written minutes earlier and could no longer see. The abstraction you wrote
   * in phase one is the entire instrument of phase two; asking someone to carry
   * it in their head while a clock runs is asking them to spend the exercise
   * remembering instead of thinking.
   */
  buildsOnPrevious?: boolean
  /**
   * A worked example of this phase, on a subject the user will never be given.
   *
   * Prose instructions describe the task; an example shows it, and for tasks
   * this abstract that is the difference between understanding and guessing.
   * The weak/strong pair matters more than the strong answer alone — nearly
   * every misunderstanding here is a specific, predictable wrong move (giving
   * a solution instead of a problem statement, copying an analogy's surface
   * instead of its structure), and naming that move is what corrects it.
   *
   * The subject is deliberately never one of the live prompts. Exposure to an
   * example makes people's own ideas resemble it — conformity to examples is
   * one of the most robust findings in the ideation literature (Smith, Ward &
   * Schumacher 1993), and this app's whole premise is that nothing should
   * think on the user's behalf. Demonstrating on a foreign subject teaches the
   * move without seeding the answer.
   */
  demo?: {
    /** the unrelated subject the example is worked on */
    subject: string
    /** a typical answer that misses the point, and why */
    weak?: string
    weakWhy?: string
    /** an answer that does the thing, and why it counts */
    good: string
    goodWhy: string
  }
}

/** How the prompt itself is laid out, so each exercise reads as its own task. */
export interface PromptLayout {
  /** label above the subject, e.g. "Object", "The complaint" */
  subjectLabel: string
  /**
   * Render two side-by-side cases above the subject, from data.caseA/caseB.
   * The comparison is the active ingredient in schema induction, so both must
   * be visible at once rather than shown in sequence.
   */
  twoCases?: boolean
  /** key in prompt.data to surface in its own block */
  extraKey?: string
  /** label for that block, e.g. "Constraint", "Source system" */
  extraLabel?: string
  /** styling of the extra block */
  extraTone?: 'constraint' | 'source'
}

export interface Prompt {
  key: string
  label: string
  /** stereotyped / high-frequency responses used as the fixation baseline */
  cliches?: string[]
  /**
   * Plain-language descriptions of the object's material, form and physical
   * behaviour. These are the relevance anchor: a genuine creative use exploits
   * some real property of the object, whereas off-task text relates to none of
   * them. Without this the scorer rewards pure semantic distance and therefore
   * rates nonsense higher than good ideas.
   */
  props?: string[]
  data?: Record<string, unknown>
}

export interface Exercise {
  id: string
  name: string
  kind: ExerciseKind
  category: Category
  scoring: ScoringMode
  blurb: string
  trains: string
  evidence: {
    claim: string
    citations: string[]
  }
  /** default session length in seconds */
  seconds: number
  /** minimum responses before the session "counts" */
  quota?: number
  /** timed nudges surfaced mid-session */
  nudges?: Nudge[]
  /** explicit phases; a single-phase exercise still uses this for its copy */
  phases: Phase[]
  /** how the prompt is presented */
  layout: PromptLayout
  /** ask the user to label a category per idea, and ban repeats */
  requiresCategory?: boolean
  prompts: Prompt[]
  /** used for scoring context, not for display */
  promptTemplate: (p: Prompt) => string
  howTo: string[]
}

/** Rotate prompts so the same item is not repeated until the pool is exhausted. */
export function pickPrompt(ex: Exercise, seenKeys: string[]): Prompt {
  const unseen = ex.prompts.filter((p) => !seenKeys.includes(p.key))
  const pool = unseen.length ? unseen : ex.prompts
  return pool[Math.floor(Math.random() * pool.length)]
}
