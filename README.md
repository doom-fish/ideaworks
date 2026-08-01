# Ideaworks

**[Try it → ideaworks.doom.fish](https://ideaworks.doom.fish/)**

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

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/pages.yml`, served at
[ideaworks.doom.fish](https://ideaworks.doom.fish/).

### Base path

This is the one thing that is easy to get wrong and hard to diagnose. A GitHub
Pages *project* site is served from `/<repo>/`, but a site with a **custom
domain** is served from the root of that domain. Everything that builds a URL
at runtime reads `import.meta.env.BASE_URL` — including the path the embedding
model loads from — so a wrong base produces a site that loads fine and then can
never score anything.

The workflow therefore derives it rather than hardcoding it:

```yaml
if [ -f public/CNAME ]; then
  echo "path=/"                                    # custom domain → root
else
  echo "path=/${{ github.event.repository.name }}/" # project site → /<repo>/
fi
```

Delete `public/CNAME` and it reverts to `doom-fish.github.io/ideaworks/`
correctly, with no other change.

### DNS

`public/CNAME` pins the custom domain. The matching record is:

```
ideaworks   CNAME   doom-fish.github.io.
```

A subdomain uses `CNAME`; only an apex would need the four `A` records. The
apex `doom.fish` already serves a different Pages site and is left alone.

Enable **Enforce HTTPS** in the repository's Pages settings once the certificate
has been issued — that usually takes a few minutes after DNS propagates.

### Notes

- `public/.nojekyll` stops Pages running the output through Jekyll, which would
  otherwise drop files and directories beginning with an underscore.
- The workflow copies `index.html` to `404.html`, because Pages has no SPA
  rewrite and a deep link would otherwise 404 instead of loading the app.
- Pages cannot serve precompressed `.zst` sidecars or set cache headers, so it
  gzips on the fly. First load fetches ~5.8 MB of WebAssembly rather than the
  3.7 MB a zstd-capable server would send. `scripts/deploy.sh` remains for
  self-hosting behind Caddy, where those optimisations do apply.

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
