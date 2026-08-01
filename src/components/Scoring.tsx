import { useSyncExternalStore } from 'react'
import { embedder } from '../engine/embedder'
import { Button, Panel } from './ui'

function useEmbedder() {
  const key = useSyncExternalStore(
    embedder.subscribe,
    () => `${embedder.status}:${Math.round(embedder.progress)}:${embedder.lastError ?? ''}`,
  )
  const [status, progress] = key.split(':')
  return { status, progress: Number(progress), error: embedder.lastError }
}

/**
 * Scoring screen.
 *
 * The model is ~19 MB, so on a first visit "scoring" genuinely means
 * "downloading a neural network". Showing a bare spinner for that long reads as
 * a hang, so the download is reported explicitly.
 */
export function Scoring({ onCancel }: { onCancel: () => void }) {
  const { status, progress } = useEmbedder()
  const downloading = status === 'loading' && progress < 100

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center p-6">
      <div className="w-full text-center">
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-line border-t-accent" />
        <p className="mt-5 text-sm text-fg">
          {downloading ? 'Fetching the scoring model' : 'Scoring your session'}
        </p>

        {downloading && (
          <>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-panel2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-accent2 transition-[width] duration-300"
                style={{ width: `${Math.max(3, progress)}%` }}
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              About 19 MB, once. It is cached after this, and everything is then scored on your
              own machine — nothing you write is ever uploaded.
            </p>
          </>
        )}

        <button
          onClick={onCancel}
          className="mt-6 text-xs text-muted underline hover:text-fg"
        >
          Cancel and keep my ideas
        </button>
      </div>
    </div>
  )
}

/**
 * Failure screen.
 *
 * The one thing that must never happen is losing a session's ideas because a
 * model failed to load, so they are shown in full and can be copied out
 * whether or not scoring ever succeeds.
 */
export function ScoringError({
  message,
  ideas,
  onRetry,
  onSkip,
}: {
  message: string
  ideas: string[]
  onRetry: () => void
  onSkip: () => void
}) {
  const copy = () => void navigator.clipboard?.writeText(ideas.join('\n'))

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
      <div>
        <div className="text-[10px] uppercase tracking-[.14em] text-danger">Scoring failed</div>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">
          Your ideas are safe. The scorer is not.
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The on-device model could not be loaded, so nothing could be measured this time. That
          has no bearing on the quality of what you wrote.
        </p>
      </div>

      <Panel className="border-danger/30 p-4">
        <code className="block break-words font-mono text-xs text-danger">{message}</code>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Most often this is a network interruption partway through the download. Retrying starts
          the model from scratch. A hard refresh also clears a half-cached copy.
        </p>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="text-sm font-medium">
            {ideas.length} idea{ideas.length === 1 ? '' : 's'} from this session
          </span>
          <button onClick={copy} className="text-xs text-muted hover:text-fg">
            copy all
          </button>
        </div>
        <div className="divide-y divide-line/60">
          {ideas.map((t, i) => (
            <div key={i} className="flex gap-3 px-4 py-2.5">
              <span className="w-5 shrink-0 text-right font-mono text-xs text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 break-words text-sm">{t}</span>
            </div>
          ))}
        </div>
      </Panel>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={onRetry}>
          Try scoring again
        </Button>
        <Button variant="soft" onClick={onSkip}>
          Discard and continue
        </Button>
      </div>
    </div>
  )
}
