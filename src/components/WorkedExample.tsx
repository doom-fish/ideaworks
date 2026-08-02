import { useState } from 'react'
import type { Phase } from '../exercises/types'

/**
 * A worked example of the current phase, shown on a subject the user will
 * never be given.
 *
 * These tasks are abstract enough that prose alone leaves people guessing —
 * "write a different definition of the problem" is understood only once you
 * have seen one definition that works and one that quietly fails. The weak
 * answer carries most of the teaching: nearly every misunderstanding is a
 * specific predictable move (answering with a solution, copying an analogy's
 * surface, sitting in the middle of an axis), and showing that move next to
 * the right one corrects it faster than any amount of explanation.
 *
 * It stays collapsed by default. Seeing an example makes your own ideas
 * resemble it — conformity to examples is one of the most robust findings in
 * the ideation literature — so this is opt-in, worked on a foreign subject,
 * and says so plainly. Someone who already understands the task never sees it.
 */
export function WorkedExample({
  phase,
  defaultOpen = false,
}: {
  phase: Phase
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const demo = phase.demo
  if (!demo) return null

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel2/50 px-2.5 py-1.5 text-[12px] text-muted transition-colors hover:border-accent/50 hover:text-fg"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
        </svg>
        Show me an example
      </button>
    )
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-line bg-panel2/40">
      <div className="flex items-baseline gap-2 border-b border-line/70 px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-[.14em] text-muted">Example</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted/70">{demo.subject}</span>
        <button
          onClick={() => setOpen(false)}
          className="shrink-0 text-[11px] text-muted hover:text-fg"
        >
          hide
        </button>
      </div>

      {/*
       * The contrast is the lesson and reads in two lines; the reasoning behind
       * it is worth a paragraph each but only once, and only if you want it. It
       * used to be four paragraphs on screen before you had written anything.
       */}
      <div className="divide-y divide-line/50">
        {demo.weak && <Row tone="bad" mark="✕" answer={demo.weak} why={demo.weakWhy ?? ''} />}
        <Row tone="good" mark="✓" answer={demo.good} why={demo.goodWhy} />
      </div>
    </div>
  )
}

function Row({
  tone,
  mark,
  answer,
  why,
}: {
  tone: 'good' | 'bad'
  mark: string
  answer: string
  why: string
}) {
  const [why_, setWhy] = useState(false)
  const c = tone === 'good' ? 'text-accent2' : 'text-danger'
  return (
    <button
      onClick={() => setWhy((v) => !v)}
      className="flex w-full items-baseline gap-2 px-3 py-2 text-left"
      aria-expanded={why_}
    >
      <span className={`text-[13px] font-semibold ${c}`}>{mark}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] leading-snug text-fg">{answer}</span>
        {why_ ? (
          <span className="mt-1 block text-[12px] leading-relaxed text-muted">{why}</span>
        ) : (
          <span className="mt-0.5 block text-[11px] text-muted/60">why?</span>
        )}
      </span>
    </button>
  )
}
