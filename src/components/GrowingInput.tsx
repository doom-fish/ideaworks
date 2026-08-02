import { useLayoutEffect, useRef, type ChangeEvent, type KeyboardEvent, type Ref } from 'react'

/**
 * The entry field for exercises whose answers are sentences rather than words.
 *
 * A single-line input was hiding the thing being written. "Shave the graphite
 * into a bowl to make a dry lubricant for a stiff lock" is a perfectly ordinary
 * answer here and it scrolls out of a one-line box while you are still typing
 * it, so you lose the ability to reread and edit what you just wrote — at
 * exactly the moment the exercise is asking you to push an idea further.
 *
 * It grows with the content and stops at a few lines, since past that point it
 * would start eating the answers above it. Enter still commits, because the
 * rhythm of this exercise is idea-Enter-idea and requiring a button press for
 * every one would be far worse than the occasional need for Shift+Enter.
 */
export function GrowingInput({
  value,
  onChange,
  onCommit,
  inputRef,
  maxRows = 4,
  className = '',
  ...rest
}: {
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  inputRef?: Ref<HTMLTextAreaElement>
  maxRows?: number
  className?: string
} & Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange' | 'ref' | 'rows'
>) {
  const own = useRef<HTMLTextAreaElement | null>(null)

  /*
   * Measured after layout rather than on change, so the height is set in the
   * same frame the text lands and the field never visibly jumps a line late.
   * Resetting to auto first is what allows it to shrink again on delete.
   *
   * The border has to be added back: scrollHeight covers content and padding
   * only, while box-sizing is border-box here, so assigning scrollHeight
   * directly leaves the field short by exactly the border and the last line
   * clips by a couple of pixels.
   */
  useLayoutEffect(() => {
    const el = own.current
    if (!el) return
    el.style.height = 'auto'
    const cs = getComputedStyle(el)
    const line = parseFloat(cs.lineHeight) || 20
    const border = el.offsetHeight - el.clientHeight
    const padding = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
    el.style.height = `${Math.min(el.scrollHeight, line * maxRows + padding) + border}px`
  }, [value, maxRows])

  return (
    <textarea
      ref={(node) => {
        own.current = node
        if (typeof inputRef === 'function') inputRef(node)
        else if (inputRef) (inputRef as { current: HTMLTextAreaElement | null }).current = node
      }}
      rows={1}
      value={value}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
      onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          onCommit()
        }
      }}
      className={`w-full resize-none rounded-xl border bg-panel2 px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-muted/60 focus:border-accent ${className}`}
      {...rest}
    />
  )
}
