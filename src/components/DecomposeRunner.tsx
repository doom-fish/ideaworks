import { useEffect, useRef, useState, type RefObject } from 'react'
import { Button, Chip, Panel, proseField } from './ui'
import { WorkedExample } from './WorkedExample'
import { PromptBar, RunnerShell } from './RunnerShell'
import { fmtClock, useTimer } from '../lib/useTimer'
import { gradePart, type PartGrade } from '../data/genericParts'
import type { Phase, Prompt } from '../exercises/types'

/* -------------------------------------------------------- Generic Parts --- */

/**
 * Runner for the Generic Parts Technique.
 *
 * This is the one exercise in the app with immediate, deterministic feedback on
 * every keystroke: gradePart() names any word that implies a use ("wick",
 * "handle", "holder") the instant you type it, and reaching zero flags is not a
 * bonus, it is the whole exercise. The design goal follows from that. Feedback
 * that reads as a rejection teaches you to stop typing; feedback that reads as a
 * spellchecker teaches you to reword. So the offending word is underlined in
 * place inside the field and inside each committed part, coloured amber while it
 * is still live advice and red once you have committed it anyway, and the part
 * settles to teal the moment the last use-word is gone. The word is always
 * named, because "this is wrong" teaches nothing.
 *
 * Decomposition is literally recursive — a pencil is a rod, and the rod is wood
 * plus paint — so parts can be broken into sub-parts and the list is a tree, not
 * a flat log. The tree is only a thinking aid: onFinish still hands back a flat
 * PartGrade[] (depth-first) because that is what the scorer counts, and its
 * signature must not change.
 *
 * Note the placeholder deliberately reuses phase.placeholder rather than a
 * concrete "e.g. …" example. A concrete example here once read "thin flexible
 * string of twisted fibre" while a candle sat in the object bank, which handed
 * over that object's hidden wick. The demo guard only inspects the catalog
 * copy, so it could not see a leak smuggled into this component — the fix is to
 * never let the component invent its own example.
 */
export function DecomposeRunner({
  phase,
  prompt,
  seconds,
  quota,
  onFinish,
  onQuit,
}: {
  phase: Phase
  prompt: Prompt
  seconds: number
  quota: number
  onFinish: (parts: PartGrade[], durationMs: number) => void
  onQuit: () => void
}) {
  const [parts, setParts] = useState<Part[]>([])
  const [text, setText] = useState('')
  const [composingFor, setComposingFor] = useState<string | null>(null)
  const [subText, setSubText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [briefOpen, setBriefOpen] = useState(true)
  const [hintOpen, setHintOpen] = useState(false)
  const [showHint, setShowHint] = useState(false)

  const start = useRef(Date.now())
  const composeRef = useRef<HTMLTextAreaElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const idRef = useRef(0)
  const makeId = () => `p${idRef.current++}`

  // The clock-expiry callback must see the latest tree, and useTimer keeps the
  // most recent callback, so a fresh closure each render is enough to avoid a
  // stale snapshot without threading parts through a ref.
  const finish = () => onFinish(flatten(parts), Date.now() - start.current)
  const finishRef = useRef(finish)
  finishRef.current = finish
  const { remaining, progress } = useTimer(seconds, true, () => finishRef.current())

  const byParent = groupByParent(parts)
  const roots = byParent.get(null) ?? []
  const total = parts.length
  const cleanCount = parts.filter((p) => p.grade.flags.length === 0).length
  const flaggedCount = total - cleanCount
  const allClean = total > 0 && flaggedCount === 0
  const quotaMet = cleanCount >= quota

  const addRoot = () => {
    const t = text.trim()
    if (!t) return
    const wasEmpty = parts.length === 0
    setParts((s) => [...s, { id: makeId(), parentId: null, grade: gradePart(t) }])
    setText('')
    // The brief is tall on a phone; once the first part exists the task is
    // understood, so it folds away to give the growing tree room.
    if (wasEmpty) setBriefOpen(false)
  }

  const addChild = (parentId: string) => {
    const t = subText.trim()
    if (!t) return
    setParts((s) => [...s, { id: makeId(), parentId, grade: gradePart(t) }])
    setSubText('')
  }

  const removePart = (id: string) => {
    setParts((s) => {
      const doomed = new Set<string>([id])
      // A parent cannot outlive its pieces, so sweep the subtree. The list is
      // tiny, so repeated passes until nothing new is marked is simplest.
      for (let grew = true; grew; ) {
        grew = false
        for (const p of s)
          if (p.parentId && doomed.has(p.parentId) && !doomed.has(p.id)) {
            doomed.add(p.id)
            grew = true
          }
      }
      return s.filter((p) => !doomed.has(p.id))
    })
    if (editingId === id) setEditingId(null)
    if (composingFor === id) setComposingFor(null)
  }

  const startEdit = (p: Part) => {
    setComposingFor(null)
    setEditingId(p.id)
    setEditText(p.grade.text)
  }

  const commitEdit = () => {
    const id = editingId
    const t = editText.trim()
    setEditingId(null)
    setEditText('')
    // A blank line is a cancel, not a silent delete; removal is the explicit ✕.
    if (!id || !t) return
    setParts((s) => s.map((p) => (p.id === id ? { ...p, grade: gradePart(t) } : p)))
    composeRef.current?.focus()
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditText('')
    composeRef.current?.focus()
  }

  const openSub = (id: string) => {
    setEditingId(null)
    setComposingFor(id)
    setSubText('')
  }

  const closeSub = () => {
    setComposingFor(null)
    setSubText('')
    composeRef.current?.focus()
  }

  // Only follow the tail when a top-level part lands; a sub-part is inserted
  // mid-list under its parent, and yanking the scroll to the bottom would throw
  // the user away from exactly where they are working.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [roots.length])

  const renderRow = (p: Part, depth: number) => {
    const editing = editingId === p.id
    const kids = byParent.get(p.id) ?? []
    // While a row is being edited the dot tracks the live text, so it flips to
    // teal the instant the last use-word is deleted — the core beat of the whole
    // exercise, felt before you even commit.
    const flagged = editing
      ? editText.trim()
        ? gradePart(editText).flags.length > 0
        : false
      : p.grade.flags.length > 0

    return (
      <div key={p.id}>
        <div
          className={`pop-in group flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors duration-200 ${
            flagged ? 'border-danger/40 bg-danger/5' : 'border-accent2/30 bg-accent2/5'
          }`}
        >
          <span
            key={flagged ? 'flagged' : 'clean'}
            className={`tick mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
              flagged ? 'bg-danger' : 'bg-accent2'
            }`}
          />
          <div className="min-w-0 flex-1">
            {editing ? (
              <HighlightField
                value={editText}
                onChange={setEditText}
                onSubmit={commitEdit}
                onCancel={cancelEdit}
                onBlur={commitEdit}
                placeholder={phase.placeholder}
                autoFocus
              />
            ) : (
              <>
                <button
                  onClick={() => startEdit(p)}
                  className="block w-full rounded-lg text-left"
                  title="Edit this part"
                >
                  <span className="block text-sm leading-snug text-fg">
                    <Marked
                      text={p.grade.text}
                      flags={p.grade.flags}
                      className="rounded-sm bg-transparent text-danger underline decoration-danger/60 decoration-wavy underline-offset-2"
                    />
                  </span>
                  {p.grade.flags.length > 0 && (
                    <span className="mt-1 block text-[11px] leading-snug text-danger/90">
                      {quoteList(p.grade.flags)} {p.grade.flags.length > 1 ? 'imply' : 'implies'} a
                      use — tap to reword.
                    </span>
                  )}
                </button>
                {depth === 0 && composingFor !== p.id && (
                  <button
                    onClick={() => openSub(p.id)}
                    className="mt-1 inline-flex items-center gap-1 rounded-md py-1 pr-2 text-[11px] text-muted transition-colors hover:text-accent2"
                  >
                    <span aria-hidden>↳</span> break it into parts
                  </button>
                )}
              </>
            )}
          </div>
          {!editing && (
            <button
              onClick={() => removePart(p.id)}
              aria-label="Remove part"
              className="press -mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted/50 transition-colors hover:bg-danger/10 hover:text-danger"
            >
              ✕
            </button>
          )}
        </div>

        {(kids.length > 0 || composingFor === p.id) && (
          <div className="mt-1.5 ml-3.5 space-y-1.5 border-l border-line/60 pl-3">
            {kids.map((k) => renderRow(k, depth + 1))}
            {composingFor === p.id && (
              <div className="rise rounded-xl border border-line bg-panel2/40 p-2">
                <HighlightField
                  value={subText}
                  onChange={setSubText}
                  onSubmit={() => addChild(p.id)}
                  onCancel={closeSub}
                  placeholder={phase.placeholder}
                  autoFocus
                />
                <div className="mt-1 flex items-center justify-between px-1">
                  <span className="text-[11px] text-muted/80">Enter adds · Esc closes</span>
                  <button
                    onClick={closeSub}
                    className="rounded px-1 py-0.5 text-[11px] text-muted hover:text-fg"
                  >
                    done
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const dock = (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <HighlightField
            value={text}
            onChange={setText}
            onSubmit={addRoot}
            placeholder={phase.placeholder}
            stem={phase.stem}
            inputRef={composeRef}
            autoFocus
          />
        </div>
        <Button onClick={addRoot} disabled={!text.trim()} className="min-h-[44px] w-full sm:w-auto">
          {phase.verb}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted">
          {allClean && quotaMet
            ? 'Every part reads as pure form — that is the whole exercise.'
            : flaggedCount > 0
              ? `${flaggedCount} part${flaggedCount > 1 ? 's' : ''} still name${
                  flaggedCount > 1 ? '' : 's'
                } a use.`
              : total < quota
                ? `${quota - total} more before this decomposition is full.`
                : 'Keep subdividing — every object has more parts than you think.'}
        </p>
        <Button
          variant={allClean && quotaMet ? 'primary' : 'soft'}
          onClick={finish}
          disabled={total < 2}
          className={`min-h-[44px] ${allClean && quotaMet ? 'flare' : ''}`}
        >
          Finish &amp; score
        </Button>
      </div>
    </>
  )

  return (
    <RunnerShell
      header={
        <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="accent">Generic Parts</Chip>
          {/* Remounting on the count flips the tick animation, so reaching a
              new function-free part registers as a small physical event. */}
          <span key={cleanCount} className="tick inline-flex">
            <Chip tone={quotaMet ? 'good' : 'neutral'}>
              {cleanCount}/{quota} function-free
            </Chip>
          </span>
          {flaggedCount > 0 && <Chip tone="bad">{flaggedCount} to reword</Chip>}
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`font-mono text-lg tabular-nums ${
              remaining <= 10 ? 'text-danger' : remaining < 30 ? 'text-warn' : 'text-muted'
            }`}
          >
            {fmtClock(remaining)}
          </span>
          <Button variant="ghost" onClick={onQuit}>
            Abandon
          </Button>
        </div>
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-panel2">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent2 transition-[width] duration-200"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
        </>
      }
      prompt={<PromptBar label="Object" subject={prompt.label} accent="bg-warn" />}
      dock={dock}
    >
      <div className="flex min-h-full flex-col gap-3">
      {briefOpen ? (
        <Panel className="p-4 sm:p-5">
          <button
            onClick={() => setBriefOpen(false)}
            className="flex w-full items-start gap-3 text-left"
          >
            <p className="flex-1 text-[15px] font-medium leading-snug text-fg">{phase.task}</p>
            <span className="mt-0.5 shrink-0 text-xs text-muted">hide</span>
          </button>
          {phase.hint &&
            (hintOpen ? (
              <p className="mt-2 text-sm leading-relaxed text-muted">{phase.hint}</p>
            ) : (
              <button
                onClick={() => setHintOpen(true)}
                className="press mt-1.5 text-[12px] text-muted/80 underline decoration-dotted underline-offset-2 hover:text-fg"
              >
                What counts here?
              </button>
            ))}
          {/* A starting aid: once a part exists you have the shape of the task
              and the example is only taking up room. */}
          {parts.length === 0 && <WorkedExample phase={phase} defaultOpen />}
          {prompt.data?.hint ? (
            showHint ? (
              <p className="mt-3 rounded-lg border border-line bg-panel2/60 p-2 text-xs text-muted">
                {prompt.data.hint as string}
              </p>
            ) : (
              <button
                onClick={() => setShowHint(true)}
                className="mt-3 text-xs text-muted underline hover:text-fg"
              >
                show hint
              </button>
            )
          ) : null}
        </Panel>
      ) : (
        <button
          onClick={() => setBriefOpen(true)}
          className="press flex w-full items-start gap-2 rounded-xl border border-line bg-panel/60 px-3 py-2 text-left"
        >
          <span className="min-w-0 flex-1 text-sm leading-snug text-muted line-clamp-2">
            {phase.task}
          </span>
          <span className="mt-0.5 shrink-0 text-[11px] text-muted/70">show</span>
        </button>
      )}

      <div
        ref={listRef}
        className="flex-1 space-y-1.5 rounded-2xl border border-line bg-panel/40 p-3"
      >
        {total === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="float-y text-2xl text-muted/50" aria-hidden>
              ⌗
            </span>
            <p className="max-w-xs text-sm leading-relaxed text-muted">{phase.empty}</p>
          </div>
        ) : (
          roots.map((p) => renderRow(p, 0))
        )}
      </div>
      </div>
    </RunnerShell>
  )
}

/** A part in the decomposition tree. Flattened away before scoring. */
interface Part {
  id: string
  parentId: string | null
  grade: PartGrade
}

function groupByParent(parts: Part[]): Map<string | null, Part[]> {
  const m = new Map<string | null, Part[]>()
  for (const p of parts) {
    const arr = m.get(p.parentId)
    if (arr) arr.push(p)
    else m.set(p.parentId, [p])
  }
  return m
}

/** Pre-order flatten: a parent immediately followed by its own pieces. */
function flatten(parts: Part[]): PartGrade[] {
  const out: PartGrade[] = []
  const walk = (parentId: string | null) => {
    for (const p of parts)
      if (p.parentId === parentId) {
        out.push(p.grade)
        walk(p.id)
      }
  }
  walk(null)
  return out
}

function quoteList(words: string[]): string {
  return words.map((w) => `\u201c${w}\u201d`).join(', ')
}

/**
 * The text with each grader-flagged word wrapped for highlighting.
 *
 * The words are re-found on the exact boundaries gradePart uses — runs of
 * letters — so what gets underlined is precisely what the grader flagged and
 * never a lookalike substring. The grade stays the single source of truth; this
 * is only ever a view of it, which is also why the flagged word is always shown
 * by name rather than gestured at.
 */
function Marked({ text, flags, className }: { text: string; flags: string[]; className: string }) {
  if (flags.length === 0) return <>{text}</>
  const set = new Set(flags.map((f) => f.toLowerCase()))
  // The caller owns the background colour: a bare <mark> keeps the browser's
  // default yellow fill, so each call site passes its own bg utility (a subtle
  // amber wash while the advice is live, nothing once it is a committed red).
  return (
    <>
      {text.split(/([a-zA-Z]+)/).map((seg, i) =>
        /[a-zA-Z]/.test(seg) && set.has(seg.toLowerCase()) ? (
          <mark key={i} className={className}>
            {seg}
          </mark>
        ) : (
          <span key={i}>{seg}</span>
        ),
      )}
    </>
  )
}

/**
 * A text field that highlights the offending word in place, like a spellchecker.
 *
 * An <input> cannot style one word inside it, and a separate error line below
 * the box reads as a verdict rather than a correction. So the real text is made
 * transparent (the caret stays visible) and an identical backdrop layer behind
 * it renders the same characters with the function-words marked — the squiggle
 * lands exactly under the word the user typed. The two layers only stay aligned
 * if they wrap identically, which is why this is a textarea that grows
 * downwards instead of scrolling sideways, and why neither layer sets a
 * font-size: the coarse-pointer rule that forces controls to 16px would
 * otherwise desync the backdrop on phones, whereas leaving both to inherit
 * keeps them equal everywhere.
 *
 * Native spellcheck is turned off here on purpose: its own red squiggle would
 * be drawn under glyphs that are transparent, so it would float free of the
 * words and fight the highlight that actually matters.
 */
function HighlightField({
  value,
  onChange,
  onSubmit,
  onCancel,
  onBlur,
  placeholder,
  stem,
  inputRef,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onCancel?: () => void
  onBlur?: () => void
  placeholder: string
  stem?: string
  inputRef?: RefObject<HTMLTextAreaElement | null>
  autoFocus?: boolean
}) {
  const internal = useRef<HTMLTextAreaElement | null>(null)
  const ref = inputRef ?? internal
  const grade = value.trim() ? gradePart(value) : null
  const flagged = grade ? grade.flags.length > 0 : false

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [value, ref])

  // Drop the caret at the end when this field opens. It matters most for
  // editing: correcting a flagged word should resume where the text ends, not
  // reset to the start of the line.
  useEffect(() => {
    if (!autoFocus) return
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [autoFocus, ref])

  const border = flagged
    ? 'border-warn/50 focus-within:border-warn'
    : 'border-line focus-within:border-accent'

  return (
    <div>
      <div className={`rounded-xl border bg-panel2 transition-colors ${border}`}>
        {stem && (
          <p className="select-none px-4 pt-2.5 text-[13px] leading-snug text-muted">{stem}</p>
        )}
        <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words px-4 py-3 leading-relaxed text-fg"
        >
          {value ? (
            <Marked
              text={value}
              flags={grade?.flags ?? []}
              className="rounded-sm bg-warn/15 text-warn underline decoration-warn/70 decoration-wavy underline-offset-2"
            />
          ) : (
            <span className="text-muted/60">{placeholder}</span>
          )}
        </div>
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onSubmit()
            } else if (e.key === 'Escape' && onCancel) {
              e.preventDefault()
              onCancel()
            }
          }}
          onBlur={onBlur}
          {...proseField}
          spellCheck={false}
          enterKeyHint="done"
          className="relative block w-full resize-none appearance-none overflow-hidden border-0 bg-transparent px-4 py-3 leading-relaxed text-transparent caret-accent outline-none"
        />
        </div>
      </div>
      {flagged && grade && (
        <p className="mt-1.5 px-1 text-[12px] leading-snug text-warn">
          {quoteList(grade.flags)} {grade.flags.length > 1 ? 'name' : 'names'} a use — describe its
          shape and material instead.
        </p>
      )}
    </div>
  )
}
