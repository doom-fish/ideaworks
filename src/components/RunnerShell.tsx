import type { ReactNode } from 'react'

/**
 * The frame every timed exercise runs inside.
 *
 * It exists because the runners kept rediscovering the same layout bug. Each one
 * grew its own column of stacked panels — brief, list, input, footer — all
 * competing for height inside a viewport that does not grow. Measured on an
 * iPhone at the start of an Alternate Uses session, the brief had taken 563px of
 * 844 and the list of your own ideas had been squeezed to 26px, scrolling 118px
 * of content through a gap barely taller than one line of text. A panel that
 * expands should not be able to do that to the thing it sits above.
 *
 * Two rules fix it, and both are structural rather than a matter of tuning
 * numbers. First, exactly one region scrolls. Nested scrollers are miserable on
 * a touch screen — the wrong one takes the gesture, momentum stops at a boundary
 * you cannot see — and the runners had a scrolling list inside a page that could
 * also scroll. Everything that scrolls now lives in one place, and the header,
 * prompt and input are pinned outside it.
 *
 * Second, the prompt is never part of what scrolls. You are being asked to
 * invent uses for a specific object under a specific constraint, and losing
 * sight of either mid-session is losing the task itself. It was previously
 * inside the collapsible brief, which meant it was both the thing you most
 * needed and the thing most likely to be off screen.
 *
 * Height comes from dvh rather than a percentage chain. `height: 100%` resolves
 * against the layout viewport, which on a phone includes the space under the
 * browser's own toolbar, so a column sized that way runs off the bottom of what
 * you can actually see. Because nothing here scrolls the page itself, the
 * toolbar never collapses and the dvh value stays put instead of thrashing.
 */
export function RunnerShell({
  header,
  prompt,
  children,
  dock,
}: {
  header: ReactNode
  /** Pinned under the header: the subject, and any constraint or source. */
  prompt?: ReactNode
  /** The only scrolling region. */
  children: ReactNode
  /** Pinned to the bottom: the input and whatever advances the session. */
  dock: ReactNode
}) {
  return (
    <div className="mx-auto flex h-[100dvh] max-w-3xl flex-col gap-2 p-3 sm:gap-3 sm:p-6">
      <div className="shrink-0 space-y-2">{header}</div>
      {prompt ? <div className="shrink-0">{prompt}</div> : null}
      {/*
       * overscroll-contain stops a flick that reaches the end of this list from
       * continuing into the page behind it, which on iOS otherwise drags the
       * whole app and detaches the pinned input from the keyboard.
       */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      <div className="shrink-0 space-y-2">{dock}</div>
    </div>
  )
}

/**
 * The part of the task that must never leave the screen.
 *
 * Deliberately not collapsible. Everything explanatory — the hint, the worked
 * example, the reasoning — belongs in the expandable brief inside the scrolling
 * region, because you read it once and then stop needing it. What survives here
 * is only what you are still answering against thirty ideas later: the subject,
 * and the constraint or source system that changes what a valid answer even is.
 */
export function PromptBar({
  label,
  subject,
  extraLabel,
  extra,
  extraTone,
  accent,
}: {
  label: string
  subject: string
  extraLabel?: string
  extra?: string
  extraTone?: 'constraint' | 'source'
  /** category colour, so the exercise stays identifiable at a glance */
  accent: string
}) {
  const warn = extraTone === 'constraint'
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel/80 backdrop-blur-sm">
      <div className="flex items-stretch">
        <span className={`w-1 shrink-0 ${accent}`} aria-hidden />
        <div className="min-w-0 flex-1 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[.14em] text-muted">{label}</div>
          <p className="mt-0.5 text-[15px] font-medium leading-snug text-fg">{subject}</p>
        </div>
      </div>
      {extra ? (
        <div
          className={`border-t px-3 py-2 ${
            warn ? 'border-warn/25 bg-warn/10' : 'border-accent2/20 bg-accent2/10'
          }`}
        >
          <span
            className={`text-[10px] uppercase tracking-[.14em] ${
              warn ? 'text-warn' : 'text-accent2'
            }`}
          >
            {extraLabel}
          </span>
          <p className="mt-0.5 text-[13px] leading-snug text-fg/90">{extra}</p>
        </div>
      ) : null}
    </div>
  )
}
