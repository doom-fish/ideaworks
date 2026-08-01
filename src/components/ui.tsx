import type { ReactNode } from 'react'

export function Panel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-panel/70 backdrop-blur-sm shadow-[0_1px_0_rgba(255,255,255,.03)_inset] ${className}`}
    >
      {children}
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = '',
  type = 'button',
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'soft' | 'danger'
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
  title?: string
}) {
  const base =
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed select-none'
  const styles = {
    primary:
      'bg-accent text-white hover:brightness-110 active:scale-[.98] shadow-lg shadow-accent/20',
    soft: 'bg-panel2 text-fg border border-line hover:border-accent/60 hover:bg-panel2/80 active:scale-[.98]',
    ghost: 'text-muted hover:text-fg hover:bg-panel2/60',
    danger: 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25',
  }[variant]
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles} ${className}`}
    >
      {children}
    </button>
  )
}

export function Chip({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent'
  title?: string
}) {
  const tones = {
    neutral: 'bg-panel2 text-muted border-line',
    good: 'bg-accent2/10 text-accent2 border-accent2/30',
    warn: 'bg-warn/10 text-warn border-warn/30',
    bad: 'bg-danger/10 text-danger border-danger/30',
    accent: 'bg-accent/15 text-accent border-accent/30',
  }[tone]
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide ${tones}`}
    >
      {children}
    </span>
  )
}

export function Stat({
  label,
  value,
  hint,
  tone = 'fg',
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: 'fg' | 'accent' | 'accent2' | 'warn'
}) {
  const color = {
    fg: 'text-fg',
    accent: 'text-accent',
    accent2: 'text-accent2',
    warn: 'text-warn',
  }[tone]
  return (
    <div className="rounded-xl border border-line bg-panel2/50 px-3 py-2.5" title={hint}>
      <div className="text-[10px] uppercase tracking-[.12em] text-muted">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  )
}

export function Cite({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] text-muted/70 italic">{children}</span>
  )
}

/**
 * Attributes for free-text entry — ideas, part descriptions, reflections.
 *
 * Spellcheck is on so typos get flagged while you write. Autocorrect is safe
 * here because these are ordinary sentences.
 */
export const proseField = {
  spellCheck: true,
  autoCorrect: 'on',
  autoCapitalize: 'sentences',
  autoComplete: 'off',
} as const

/**
 * Attributes for single-word entry — DAT nouns, chain words, categories,
 * remote-associate answers.
 *
 * Spellcheck is still on, because it only advises. Autocorrect and
 * autocapitalisation are off: this app is specifically about reaching for
 * unusual words, and silently rewriting one into a commoner neighbour would
 * corrupt the very thing being measured.
 */
export const wordField = {
  spellCheck: true,
  autoCorrect: 'off',
  autoCapitalize: 'none',
  autoComplete: 'off',
} as const
