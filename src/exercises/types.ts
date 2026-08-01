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

export interface Stage {
  label: string
  instruction: string
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
  /** rotating sub-instructions that split the session */
  stages?: Stage[]
  /** ask the user to label a category per idea, and ban repeats */
  requiresCategory?: boolean
  prompts: Prompt[]
  promptTemplate: (p: Prompt) => string
  howTo: string[]
}

/** Rotate prompts so the same item is not repeated until the pool is exhausted. */
export function pickPrompt(ex: Exercise, seenKeys: string[]): Prompt {
  const unseen = ex.prompts.filter((p) => !seenKeys.includes(p.key))
  const pool = unseen.length ? unseen : ex.prompts
  return pool[Math.floor(Math.random() * pool.length)]
}
