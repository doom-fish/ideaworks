/// <reference lib="webworker" />
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'

// Sentence-embedding model. all-MiniLM-L6-v2 is the workhorse behind most
// open semantic-distance creativity scorers (cf. SemDis / Open Creativity Scoring).
const MODEL_ID = 'Xenova/all-MiniLM-L6-v2'

// The model is vendored into public/models rather than fetched from the
// Hugging Face CDN at runtime, so the app is fully self-contained: it works
// offline, loads at LAN speed, and makes no third-party request.
//
// localModelPath must stay a *root-relative* path. transformers.js skips its
// local-file branch entirely when this value parses as an http(s) URL
// (see get_file_metadata: `if (!isURL) { ...look for local file... }`), which
// silently yields a pipeline with no tokenizer.
env.allowRemoteModels = false
env.allowLocalModels = true
env.localModelPath = `${import.meta.env.BASE_URL}models/`.replace(/\/{2,}/g, '/')

let extractor: FeatureExtractionPipeline | null = null
let loading: Promise<FeatureExtractionPipeline> | null = null

type Req =
  | { id: number; type: 'warm' }
  | { id: number; type: 'embed'; texts: string[] }
  | { id: number; type: 'purge' }

const MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
]

/**
 * Re-fetch every model file bypassing the HTTP cache.
 *
 * A failed request for one of these can end up cached — historically the
 * long-lived cache headers were applied to error responses too, which pinned a
 * failure for a year and broke the app on every subsequent visit, surviving
 * ordinary reloads. `cache: 'reload'` replaces those entries with fresh ones,
 * so a retry can genuinely succeed without asking the user to hard-refresh.
 */
async function purgeModelCache() {
  const base = env.localModelPath as string
  await Promise.all(
    MODEL_FILES.map((f) =>
      fetch(`${base}${MODEL_ID}/${f}`, { cache: 'reload' }).catch(() => undefined),
    ),
  )
}

function getExtractor() {
  if (extractor) return Promise.resolve(extractor)
  if (!loading) {
    loading = pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8',
      progress_callback: (p: unknown) => {
        const prog = p as { status?: string; progress?: number; file?: string }
        if (prog.status === 'progress' || prog.status === 'done') {
          self.postMessage({
            type: 'progress',
            progress: prog.progress ?? 100,
            file: prog.file ?? '',
          })
        }
      },
    })
      .then((e) => {
        const pipe = e as FeatureExtractionPipeline
        // transformers.js resolves the pipeline even when the tokenizer failed
        // to load, and the failure only surfaces much later as an opaque
        // "this.tokenizer is not a function". Fail loudly here instead.
        if (typeof (pipe as unknown as { tokenizer?: unknown }).tokenizer !== 'function') {
          throw new Error(
            'The scoring model loaded without a tokenizer. Its files are probably missing or incomplete.',
          )
        }
        extractor = pipe
        self.postMessage({ type: 'ready' })
        return extractor
      })
      .catch((err) => {
        // Never leave a rejected promise memoised, or every later attempt
        // replays this same failure instead of genuinely retrying.
        loading = null
        throw err
      })
  }
  return loading
}

self.onmessage = async (ev: MessageEvent<Req>) => {
  const msg = ev.data
  try {
    if (msg.type === 'purge') {
      await purgeModelCache()
      self.postMessage({ id: msg.id, type: 'purge:done' })
      return
    }
    const ex = await getExtractor()
    if (msg.type === 'warm') {
      self.postMessage({ id: msg.id, type: 'warm:done' })
      return
    }
    const out = await ex(msg.texts, { pooling: 'mean', normalize: true })
    const dims = out.dims as number[]
    const width = dims[dims.length - 1]
    const flat = Float32Array.from(out.data as Iterable<number>)
    const vectors: Float32Array[] = []
    for (let i = 0; i < msg.texts.length; i++) {
      vectors.push(flat.slice(i * width, (i + 1) * width))
    }
    self.postMessage({ id: msg.id, type: 'embed:done', vectors })
  } catch (err) {
    const e = err as { message?: string }
    self.postMessage({ id: msg.id, type: 'error', error: e?.message ?? String(err) })
  }
}
