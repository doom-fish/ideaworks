export type EmbedStatus = 'idle' | 'loading' | 'ready' | 'error'

type Pending = {
  resolve: (v: Float32Array[]) => void
  reject: (e: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

/** Loading the model means pulling ~19 MB, so the ceiling has to be generous. */
const REQUEST_TIMEOUT_MS = 180_000

class Embedder {
  private worker: Worker | null = null
  private pending = new Map<number, Pending>()
  private seq = 0
  private cache = new Map<string, Float32Array>()

  status: EmbedStatus = 'idle'
  progress = 0
  lastError: string | null = null

  private listeners = new Set<() => void>()

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    this.listeners.forEach((l) => l())
  }

  /**
   * Tear the worker down so the next call builds a fresh one.
   *
   * Without this a single failure is permanent: the worker memoises the
   * pipeline promise, so a rejected load would be replayed forever and every
   * retry would fail with the original error.
   */
  private teardown(reason: string) {
    this.worker?.terminate()
    this.worker = null
    this.status = 'error'
    this.lastError = reason
    this.progress = 0
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error(reason))
    }
    this.pending.clear()
    this.emit()
  }

  private ensure() {
    if (this.worker) return this.worker
    this.status = 'loading'
    this.lastError = null
    this.emit()

    const worker = new Worker(new URL('./embedder.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (ev: MessageEvent) => {
      const d = ev.data
      if (d.type === 'progress') {
        this.progress = Math.max(this.progress, d.progress ?? 0)
        if (this.status === 'loading') this.emit()
        return
      }
      if (d.type === 'ready') {
        this.status = 'ready'
        this.progress = 100
        this.emit()
        return
      }
      const p = this.pending.get(d.id)
      if (!p) return
      this.pending.delete(d.id)
      clearTimeout(p.timer)
      if (d.type === 'error') {
        // A failure inside the pipeline leaves the worker's memoised promise
        // poisoned, so rebuild rather than trusting it for the next request.
        this.teardown(d.error || 'The scoring model failed to load.')
        p.reject(new Error(d.error))
      } else if (d.type === 'embed:done') {
        this.status = 'ready'
        p.resolve(d.vectors as Float32Array[])
      } else {
        p.resolve([])
      }
    }

    worker.onerror = (ev) => {
      this.teardown(ev.message || 'The scoring worker crashed.')
    }

    this.worker = worker
    return worker
  }

  private request(payload: Record<string, unknown>): Promise<Float32Array[]> {
    const w = this.ensure()
    const id = ++this.seq
    return new Promise<Float32Array[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        const msg = 'Timed out waiting for the scoring model.'
        this.teardown(msg)
        reject(new Error(msg))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer })
      w.postMessage({ id, ...payload })
    })
  }

  /** Start downloading the model early. A failure here is not fatal. */
  warm() {
    return this.request({ type: 'warm' }).catch(() => [])
  }

  /**
   * Drop the error state so the next request builds a fresh worker, and
   * re-fetch the model files bypassing the HTTP cache. Without the purge a
   * cached failure is simply replayed and every retry looks broken.
   */
  async reset() {
    this.worker?.terminate()
    this.worker = null
    this.status = 'idle'
    this.lastError = null
    this.progress = 0
    this.emit()
    try {
      await this.request({ type: 'purge' })
    } catch {
      // A failed purge is not itself fatal — the reload attempt still follows.
    }
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const norm = texts.map((t) => t.trim().toLowerCase())
    const missing = [...new Set(norm.filter((t) => t && !this.cache.has(t)))]
    if (missing.length) {
      const vecs = await this.request({ type: 'embed', texts: missing })
      if (vecs.length !== missing.length) {
        throw new Error('The scoring model returned an incomplete result.')
      }
      missing.forEach((t, i) => this.cache.set(t, vecs[i]))
    }
    return norm.map((t) => this.cache.get(t) ?? new Float32Array(384))
  }
}

export const embedder = new Embedder()

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** Cosine distance in [0,2]; for normalised sentence embeddings practically [0,1.4]. */
export function cosDist(a: Float32Array, b: Float32Array): number {
  return 1 - cosine(a, b)
}
