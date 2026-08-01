# Ideaworks

**[Try it → doom-fish.github.io/ideaworks](https://doom-fish.github.io/ideaworks/)**

Training for divergent thinking and original idea generation. Every exercise
traces to published research, all scoring runs on-device, and no AI ever
generates an idea for you.

```bash
npm install
npm run dev
```

First run downloads a ~23 MB embedding model into the browser cache. After that
the app works entirely offline. Nothing you write leaves your machine — sessions
live in IndexedDB.

---

## Why it is built this way

The design is shaped as much by what the evidence says to **avoid** as by what
it says to do.

### No AI generates ideas for you

This is the central constraint. Kosmyna et al. (2025, MIT Media Lab,
arXiv:2506.08872) ran EEG on 54 participants across four essay-writing sessions.
The LLM-assisted group showed the weakest neural connectivity in alpha and beta
bands, could not quote back sentences they had just "written", and stayed
disengaged even after the assistant was removed — the authors call it *cognitive
debt*. Separately, Doshi & Hauser (2024, *Science Advances*) found AI-assisted
writers produced individually better but collectively far more homogeneous
stories.

So the app uses semantic models only as an **evaluator and mirror**, never as a
generator. It will tell you that your idea is a stock answer. It will never tell
you what to write instead.

### No leaderboards, points-for-volume, or streak pressure

Amabile's work on intrinsic motivation is consistent that competitive,
surveillance-shaped and reward-contingent framing raises evaluation apprehension
and pushes people toward safe, conventional answers — the exact opposite of what
this trains. Rewarding raw quantity produces idea-dumping. Obligation-shaped
streaks convert an intrinsically motivated activity into a chore.

What is used instead: informational competence feedback, mastery framing,
private personal bests, and metacognitive reflection.

### No example answers before you generate

Jansson & Smith (1991, *Design Studies*) showed designers fixate on examples even
when explicitly instructed to be original. The cliché bank is therefore only
revealed *after* you finish, never as a hint.

### Honest numbers

On-device embedding scoring correlates with human originality ratings at roughly
r = .3–.4. Fine-tuned LLM scorers (Organisciak et al. 2023) reach r ≈ .8. A
single score here is noisy and the app says so. What is meaningful is your own
slope across many sessions, plus the within-session *late lift*, which is a
construct-valid signal.

Expectations are set modestly on purpose. The largest meta-analysis of creativity
training (Sio & Lortie-Forgues, 2024, *Psychological Bulletin* — 169 studies, 844
effect sizes) reports d ≈ 0.53 unadjusted, falling to d ≈ 0.29–0.32 after
correcting for publication bias. Real, but slow.

---

## The exercises

| Exercise | Trains | Primary source |
|---|---|---|
| **Alternate Uses** | Getting past obvious associations | Guilford (1967); Beaty & Silvia (2012) |
| **Divergent Association** | Associative range; the benchmark measure | Olson et al. (2021), *PNAS* |
| **Remote Associates** | Reaching remote links under pressure | Mednick (1962); Bowden & Jung-Beeman (2003) |
| **Problem Reframing** | Problem construction | Mumford et al. (1994); Scott et al. (2004) |
| **Category Burn** | Deliberate category switching | Beaty & Silvia (2012); Nijstad et al. (2010) |
| **Constrained Invention** | Depth-first search under constraint | Haught-Tromp (2017) |
| **Far-Domain Analogy** | Structure mapping across domains | Fu et al. (2014); Gick & Holyoak (1980) |
| **Generic Parts** | Noticing obscure features | McCaffrey (2012), *Psychological Science* |
| **Semantic Stretch** | Jumping associative gaps | Mednick (1962); Beaty & Johnson (2021) |
| **Perspective Shift** | Breaking fixation | Jansson & Smith (1991); Dane et al. (2011) |
| **Reverse Brainstorm** | Reframing via failure space | ⚠ thin direct evidence — variety |
| **Counterfactual World** | Multi-step consequence chains | ⚠ thin direct evidence — variety |

The last two are labelled in-app as weakly supported. A lot of popular
"creativity technique" content is folklore, and the app says which parts of
itself are on firm ground.

### The judgement gate

Open-generation sessions make you commit to which of your own ideas was best
*before* revealing any scores. Idea evaluation is a distinct trainable component
that carried substantial weight in the training meta-analyses, and seeing a
number first would simply overwrite your own assessment. Agreement rate is
tracked over time as information, not as a score to beat.

### Session design

Sessions are deliberately hostile to stopping early. Beaty & Silvia (2012) found
originality rises across a session through active category inhibition, not
passive association — so exercises carry a quota, timed nudges that fire at
fixed fractions of elapsed time, and a *late lift* metric that shows whether you
actually kept searching. The recommender interleaves technique categories rather
than letting you drill a favourite, and holds the DAT back to roughly monthly so
it stays usable as a control measure.

---

## Scoring

Sentence embeddings via `all-MiniLM-L6-v2` (`@huggingface/transformers`, q8,
running in a Web Worker).

### Relevance before novelty

The scorer originally rewarded semantic distance from the prompt. That is
backwards: nothing is further from a task than something unrelated to it, so
gibberish outscored real ideas. Creativity is novelty **and** appropriateness,
so the two are now measured separately and novelty is gated on relevance.

A response counts as on-task if it either

- exploits a real physical property of the object (each object ships a bank of
  material/form/behaviour descriptions), or
- is a recognisable known use of it (the cliché bank)

Off-task responses score zero and are labelled, live during the session and
again in the results. Problem-style prompts have no property bank and fall back
to the prompt text with a deliberately lenient threshold, because wrongly
calling a real idea off-task is far worse than letting a weak one through.

Novelty, once on-task, is distance from the cliché bank plus distance from your
own other answers this session. Distance from the prompt is not rewarded at all.

Measured over labelled responses for one object:

```
band       n   novelty p50   score min/med/max   flagged off-task
stock      5   0.25          0/0/2                     0/5
mid        4   0.63          41/52/86                  0/4
novel      5   0.79          65/80/97                  0/5
off-task   7   0.86          0/0/0                     7/7
```

The off-task band has the **highest** novelty of all — which is exactly the bug
the gate prevents. `npm run calibrate` re-runs this as a regression check.

Cliché banks avoid pronoun-only entries such as `"wear it"`: they carry too
little meaning for the embedder to match the fuller phrasing a real user types,
which let the single most obvious answer score 41 instead of 3.

### Text entry

All seven text fields have spellcheck on. Autocorrect is split deliberately:

- **prose fields** (ideas, part descriptions, reflections) get autocorrect and
  sentence capitalisation — they are ordinary sentences
- **single-word fields** (DAT nouns, chain words, categories, remote-associate
  answers) get spellcheck only. This app is specifically about reaching for
  unusual words, and silently rewriting one into a commoner neighbour would
  corrupt the thing being measured.

Controls also render at 16px on touch devices, because Safari on iOS zooms the
viewport for anything smaller and never zooms back out.

### Calibration

Published norms for these tasks were computed with different semantic models
(GloVe-840B-300d for the DAT, a five-model latent factor for SemDis) and cannot
be transplanted onto MiniLM. So every constant in `src/engine/calibration.ts` is
derived empirically:

```bash
npm run calibrate
```

This runs the real scorer over labelled reference sets and reports the
distributions. Current results:

```
AUT originality by band (calibrated 0-100)
  stock    n=10   min  8   median 14   max 32
  mid      n=8    min 49   median 61   max 90
  novel    n=10   min 70   median 75   max 96

Cliche detector threshold sweep
  0.28      2/14 recall    0/18 false positives
  0.47     11/14 recall    0/18 false positives   <- chosen
  0.48     12/14 recall    1/18 false positives
```

The threshold sits just below where false positives appear. Wrongly branding a
good idea as a cliché is more damaging to a training tool than quietly missing
one, so recall is traded for precision.

DAT scores are reported as **raw mean pairwise distance**, not rescaled to a
fake 0–100, and are interpreted against reference distributions measured with
this same model (clustered sets ~35–56, random common nouns ~70–76, hand-picked
distant sets ~68–84). They are explicitly *not* comparable to the ~78 average in
the published paper.

Re-run `npm run calibrate` and update the constants whenever the model or the
scoring blend changes.

---

## Deploying

### GitHub Pages

Pushing to `main` builds and publishes via `.github/workflows/pages.yml`.

A project site is served from `/<repo>/` rather than the domain root, so the
build sets `BASE_PATH`. Everything that constructs a URL at runtime reads
`import.meta.env.BASE_URL` — including the path the embedding model loads from
— so that single value is all that changes between Pages and the self-hosted
vhost. The workflow also copies `index.html` to `404.html`, because Pages has
no SPA rewrite and would otherwise 404 on a deep link.

Two things Pages cannot do that the Caddy setup does: serve the precompressed
`.zst` sidecars, and set cache headers. It gzips on the fly instead, which is
enough.

### Self-hosted (Caddy)

The site is static — no server-side component, no database, no API. It is
published to a Caddy vhost at `https://ideaworks.doom.fish/`:

```bash
./scripts/deploy.sh
```

That builds, precompresses, rsyncs to `/srv/ideaworks`, and reloads Caddy.

The Caddy block lives in `/etc/caddy/Caddyfile` and does four things worth
noting:

- **`precompressed zstd gzip`** — the ONNX weights and the ORT WebAssembly
  runtime are ~46 MB raw and ~19 MB as zstd. `deploy.sh` writes `.zst`/`.gz`
  sidecars so Caddy serves the compressed variant at zero CPU per request.
  Caddy's `encode` alone would not help here: it only compresses text-ish
  content types by default, and compressing 23 MB per request is wasteful.
- **Explicit MIME types** for `.wasm` (needed for streaming compilation) and
  `.onnx` (Caddy has no entry for it).
- **Immutable caching** on `/assets/*` and `/models/*`, which are
  content-addressed or pinned, and `no-cache` on the entry HTML so a redeploy
  never leaves stale asset references.
- **`handle_errors` forces `Cache-Control: no-store`.** This matters more than
  it looks. Error responses would otherwise inherit the immutable header above,
  so a single failed request for a model file gets pinned in the browser cache
  for a year — the app then appears permanently stuck at "scoring" for that
  visitor, and an ordinary reload does not clear it.
- **Assets and models are served from their own `handle` blocks**, outside the
  SPA fallback. Routing them through `try_files … /index.html` would answer a
  missing model file with the HTML shell and a `200`, which the loader then
  tries to parse as JSON and fails on in a way that is very hard to diagnose.
- **`try_files … /index.html`** for everything else, so the SPA survives a
  deep-link refresh.

### The model is vendored

`public/models/` holds `Xenova/all-MiniLM-L6-v2` (config, tokenizer, and the q8
ONNX weights). The worker sets `allowRemoteModels = false`, so the deployed site
never contacts huggingface.co and works offline after first load.

One sharp edge worth remembering: `env.localModelPath` **must be a root-relative
path**, not an absolute URL. transformers.js skips its local-file lookup
entirely when that value parses as an http(s) URL:

```js
// get_file_metadata.js
if (env.allowLocalModels) {
  const isURL = isValidUrl(localPath, ['http:', 'https:'])
  if (!isURL) { /* only here does it look for the local file */ }
}
```

With an absolute URL and remote models disabled, metadata resolves to
`{ exists: false }`, `loadTokenizer` returns `[]`, and you get a pipeline whose
tokenizer is `null` — surfacing much later as
`TypeError: this.tokenizer is not a function`. It can appear to work in
development purely because the model is still in the Cache API from an earlier
run that was allowed to hit the CDN.

### Scoring must never hang

Scoring depends on a ~19 MB model that can fail to load, so every scoring path
runs through a single wrapper that catches failures. On error the app shows the
real message, lists the session's ideas with a copy button, and offers a retry —
it never strands you on a spinner with unrecoverable work.

Retry does real work rather than repeating the same failure:

- the worker is terminated and rebuilt, because the pipeline promise is
  memoised and a rejected one would otherwise be replayed forever
- the model files are re-fetched with `cache: 'reload'`, which repairs a browser
  cache already poisoned by a previously cached error response

The worker also asserts that the loaded pipeline actually has a tokenizer.
transformers.js resolves the pipeline even when tokenizer loading failed, and
without that check the problem only surfaces much later as an opaque
`this.tokenizer is not a function`.

### Prerequisites for a new host

- A DNS record pointing `ideaworks.doom.fish` at the server. There is no
  wildcard for `doom.fish`, so records are added per host.
- The vhost uses `tls internal`, so browsers need Caddy's local root CA
  (`/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt`) trusted,
  or they will warn. Plain HTTP is also served and works fine.

---

## Stack

React 19 · TypeScript · Vite · Tailwind v4 · Dexie (IndexedDB) ·
`@huggingface/transformers`

```
src/
  engine/       embedder (worker + cache), scoring, calibration, db
  exercises/    catalog, types, recommender + cognitive-strategy principles
  data/         CRA item bank, prompts & cliche banks, generic-parts vocabulary
  components/   runners, results, judgement gate, progress
scripts/
  calibrate.mjs empirical calibration harness
  deploy.sh     build, precompress, publish to the Caddy vhost
```

---

## Caveats the app refuses to paper over

- "Right-brain thinking" is not a mechanism. Creative cognition is a
  default-mode / executive-control network interaction.
- TRIZ and Synectics as popularly taught lack rigorous support. SCAMPER has
  modest support and is used only as an anti-fixation scaffold.
- Believing you can become more creative does not, alone, make you so.
- The Torrance Tests are not used as a benchmark — coachable, and weak predictors
  of real-world creative achievement.
- The cliché banks are hand-assembled from high-frequency responses reported
  across the AUT literature, not sampled from a normed corpus. They are good
  enough to catch stock answers; they are not published norms.
- The CRA item bank follows the standard compound-remote-associate format with
  coarse difficulty tiers, rather than reproducing the exact per-item solve
  rates from the published normative tables.


---

## Licence and attribution

The app is MIT licensed — see [LICENSE](LICENSE).

`public/models/Xenova/all-MiniLM-L6-v2/` contains redistributed model weights,
not original work:

- **all-MiniLM-L6-v2** by the Sentence-Transformers authors, Apache-2.0.
  ONNX conversion by [Xenova](https://huggingface.co/Xenova/all-MiniLM-L6-v2).
  Vendored so the app makes no third-party requests and works offline.

The exercises implement methods from published research, cited throughout the
app and in this README. The prompts, cliché banks, property banks and the
compound-remote-associate items are written for this project; the CRA format
follows Bowden & Jung-Beeman (2003) but the published normative solve rates are
not reproduced here.
