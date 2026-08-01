import type { SessionRecord } from '../engine/db'
import { EXERCISES } from '../exercises/catalog'
import type { Exercise } from '../exercises/types'

const DAY = 86_400_000

/**
 * Session recommender.
 *
 * Two rules, both taken from the training literature rather than from
 * engagement design:
 *   1. Interleave. Rotating technique types generalises better than drilling
 *      one, which is why the recommender actively avoids the categories you
 *      just used.
 *   2. Keep the benchmark clean. The DAT is surfaced roughly monthly and is
 *      excluded from ordinary rotation, so it stays usable as a control
 *      measure rather than becoming a practised skill.
 */
export function recommend(sessions: SessionRecord[]): {
  exercise: Exercise
  reason: string
} {
  const recent = [...sessions].sort((a, b) => b.startedAt - a.startedAt)
  const lastDat = recent.find((s) => s.exerciseId === 'dat')
  const now = Date.now()

  if (!sessions.length) {
    return {
      exercise: EXERCISES.find((e) => e.id === 'dat')!,
      reason: 'Start with the benchmark so there is something to measure against later.',
    }
  }

  if (!lastDat || now - lastDat.startedAt > 28 * DAY) {
    return {
      exercise: EXERCISES.find((e) => e.id === 'dat')!,
      reason: lastDat
        ? 'A month since your last benchmark. Time to re-measure.'
        : 'You have no benchmark yet — take it once so the trend line has a starting point.',
    }
  }

  const recentCats = recent.slice(0, 2).map((s) => EXERCISES.find((e) => e.id === s.exerciseId)?.category)
  const counts = new Map<string, number>()
  sessions.forEach((s) => counts.set(s.exerciseId, (counts.get(s.exerciseId) ?? 0) + 1))

  const pool = EXERCISES.filter((e) => e.id !== 'dat')
  const never = pool.filter((e) => !counts.has(e.id))
  if (never.length) {
    const pick = never[Math.floor(Math.random() * never.length)]
    return { exercise: pick, reason: 'A technique you have not tried. Breadth beats repetition here.' }
  }

  const fresh = pool.filter((e) => !recentCats.includes(e.category))
  const candidates = fresh.length ? fresh : pool
  const leastPractised = candidates.sort(
    (a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0),
  )
  const pick = leastPractised[0]
  return {
    exercise: pick,
    reason: fresh.length
      ? 'Different type of thinking from your last two sessions — interleaving, not blocking.'
      : 'Your least practised technique.',
  }
}

/**
 * Cognitive strategy instruction. Scott, Leritz & Mumford (2004) found that
 * teaching the underlying process outperformed pure idea-generation drills, so
 * each session opens with one explicit heuristic rather than "be creative".
 */
export const PRINCIPLES: { text: string; source: string }[] = [
  {
    text: 'Your first three ideas are retrieval, not creation. They are already in memory. The work starts at idea four.',
    source: 'Beaty & Silvia (2012), serial order effect',
  },
  {
    text: 'When you get stuck, stop generating and start redefining. Change the problem statement and the ideas change with it.',
    source: 'Mumford et al. (1994), problem construction',
  },
  {
    text: 'If a word in your description implies a use, it is doing your thinking for you. Rename it by shape and material.',
    source: 'McCaffrey (2012), obscure features hypothesis',
  },
  {
    text: 'Add a constraint rather than removing one. A narrower space searched deeply beats a wide space searched shallowly.',
    source: 'Haught-Tromp (2017), the Green Eggs and Ham hypothesis',
  },
  {
    text: 'Borrow the structure of an unrelated system, not its appearance. The relationship transfers; the surface does not.',
    source: 'Gentner; Fu et al. (2014), design by analogy',
  },
  {
    text: 'Once you have used a category twice, ban it. Running out of categories is when invention starts.',
    source: 'Nijstad et al. (2010), dual pathway to creativity',
  },
  {
    text: 'Seeing an example fixes you to it, even when you are explicitly told to be original. Generate before you look.',
    source: 'Jansson & Smith (1991), design fixation',
  },
  {
    text: 'Quantity gives you more attempts, but the average idea does not improve. Push for the outlier, not the pile.',
    source: "Simonton's equal-odds rule",
  },
  {
    text: 'When you stall, leave. A genuine break with an undemanding task beats grinding, particularly on divergent problems.',
    source: 'Sio & Ormerod (2009), incubation meta-analysis',
  },
  {
    text: 'Let a machine generate for you and your own generation gets quieter. Use it to interrogate your ideas, never to supply them.',
    source: 'Kosmyna et al. (2025); Doshi & Hauser (2024)',
  },
]

export function principleOfDay(seed = Date.now()) {
  const day = Math.floor(seed / DAY)
  return PRINCIPLES[day % PRINCIPLES.length]
}
