import { useState } from 'react'
import { Button, Chip, Panel } from './ui'
import type { ScoredIdea } from '../engine/scoring'

/**
 * Judgement gate.
 *
 * Before any score is revealed, the user commits to which of their own ideas
 * they think was the most original. Two reasons this is here rather than
 * jumping straight to results:
 *
 *   1. Idea evaluation is a distinct trainable component, and it carried
 *      substantial weight in the creativity-training meta-analyses — generating
 *      is only half the skill; recognising which of your own outputs is worth
 *      pursuing is the other half.
 *   2. It forces one pass of active recall over your own session before a
 *      number anchors your judgement. Seeing the score first would simply
 *      overwrite your own assessment.
 *
 * The agreement rate is reported back as information about your judgement, not
 * as a score to beat.
 */
export function JudgeGate({
  ideas,
  onCommit,
}: {
  ideas: ScoredIdea[]
  onCommit: (pickedIndex: number) => void
}) {
  const [picked, setPicked] = useState<number | null>(null)

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div>
        <div className="text-[10px] uppercase tracking-[.14em] text-muted">Before the score</div>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">
          Which of these was your most original?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Commit before you see any numbers. Knowing which of your own ideas is the good one is a
          separate skill from producing it, and it is the one that decides what you actually go and
          build.
        </p>
      </div>

      <Panel className="overflow-hidden">
        <div className="divide-y divide-line/60">
          {ideas.map((idea, i) => (
            <button
              key={i}
              onClick={() => setPicked(i)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                picked === i ? 'bg-accent/15' : 'hover:bg-panel2/60'
              }`}
            >
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] ${
                  picked === i
                    ? 'border-accent bg-accent text-white'
                    : 'border-line text-muted'
                }`}
              >
                {picked === i ? '✓' : i + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm">{idea.text}</span>
            </button>
          ))}
        </div>
      </Panel>

      <Button
        className="w-full"
        disabled={picked === null}
        onClick={() => picked !== null && onCommit(picked)}
      >
        {picked === null ? 'Pick one' : 'Lock it in and show the scores'}
      </Button>
    </div>
  )
}

/** Verdict shown on the results page once the user has committed a pick. */
export function JudgementVerdict({
  ideas,
  pickedIndex,
  history,
}: {
  ideas: ScoredIdea[]
  pickedIndex: number
  /** past agreement outcomes, most recent last */
  history: boolean[]
}) {
  const ranked = [...ideas].sort((a, b) => b.originality - a.originality)
  const picked = ideas[pickedIndex]
  const rank = ranked.indexOf(picked) + 1
  const agreed = rank === 1
  const close = rank <= Math.max(2, Math.ceil(ideas.length * 0.25))
  const hits = history.filter(Boolean).length

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[10px] uppercase tracking-[.14em] text-muted">Your judgement</div>
        <Chip tone={agreed ? 'good' : close ? 'accent' : 'warn'}>
          you ranked it #{rank} of {ideas.length}
        </Chip>
        {history.length >= 3 && (
          <Chip tone="neutral" title="How often your pick matched the top-scored idea.">
            {hits}/{history.length} agreement
          </Chip>
        )}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-fg/85">"{picked.text}"</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {agreed
          ? 'You picked the same idea the scorer did. Your taste and the measure are pointing the same way here.'
          : close
            ? 'Close, but not the top one. Worth asking what the scorer saw in the idea you passed over.'
            : 'The scorer disagreed with you sharply. That is worth sitting with — either you undersold a good idea, or you are attached to one that is more conventional than it feels from the inside.'}
      </p>
      {!agreed && (
        <p className="mt-2 text-[11px] text-muted">
          The scorer is not an authority. It measures semantic distance, which is a decent but
          noisy proxy for originality. When you disagree with it, you may well be right — but say
          why.
        </p>
      )}
    </Panel>
  )
}
