/**
 * Calibration harness for the on-device scorer.
 *
 *   npm run calibrate
 *
 * Re-run this whenever the embedding model or the scoring blend changes, then
 * copy the resulting numbers into src/engine/calibration.ts. Every constant in
 * that file is derived from this script rather than guessed, because the
 * published norms for these tasks were computed with different semantic models
 * (GloVe-840B-300d for the DAT, a five-model latent factor for SemDis) and
 * cannot be transplanted onto all-MiniLM-L6-v2.
 *
 * Reports:
 *   1. DAT raw distance distribution for clustered / random / hand-picked sets
 *   2. AUT originality separation across stock / middling / novel responses
 *   3. A threshold sweep for the cliché detector, with recall and false positives
 *   4. The relevance gate, which is what stops off-task answers outscoring good
 *      ones. Watch this one: the failure it guards against is not subtle.
 */
import { pipeline } from '@huggingface/transformers'

const FLOOR = 0.3
const CEIL = 0.92

const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
  dtype: 'q8',
})

const cache = new Map()
async function embed(texts) {
  const missing = [...new Set(texts.filter((t) => !cache.has(t)))]
  for (let k = 0; k < missing.length; k += 64) {
    const batch = missing.slice(k, k + 64)
    const out = await extractor(batch, { pooling: 'mean', normalize: true })
    const width = out.dims[out.dims.length - 1]
    const flat = Float32Array.from(out.data)
    batch.forEach((t, i) => cache.set(t, flat.slice(i * width, (i + 1) * width)))
  }
  return texts.map((t) => cache.get(t))
}

const cos = (a, b) => {
  let d = 0
  for (let i = 0; i < a.length; i++) d += a[i] * b[i]
  return d
}
const dist = (a, b) => 1 - cos(a, b)
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const clamp01 = (x) => Math.max(0, Math.min(1, x))
const quantile = (xs, p) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))]
const originality = (raw) => Math.round(clamp01((raw - FLOOR) / (CEIL - FLOOR)) * 100)

/* ------------------------------------------------------ 1. DAT distances -- */

const NOUNS =
  `apple bottle carpet dolphin engine forest guitar harbour island jacket kettle ladder mountain
   needle orchard pencil quilt river saddle temple umbrella violin window yacht zebra anchor bridge
   camera desert eagle fabric glacier hammer insect jungle kitchen lantern marble nest ocean planet
   quarry rocket statue tunnel valley whistle canyon barrel cactus diamond feather granite helmet
   ivory jelly kite lemon magnet nutmeg onion parrot quartz ribbon sponge thunder velvet walnut
   yeast zipper alcohol ballet cathedral democracy economy famine gravity honesty inflation justice
   karma liberty memory nation opinion poverty quantum religion sorrow theory unity victory wisdom
   anxiety courage`.split(/\s+/)

const drawWords = (n) => {
  const pool = [...NOUNS]
  const out = []
  for (let i = 0; i < n; i++) out.push(...pool.splice(Math.floor(Math.random() * pool.length), 1))
  return out
}

async function datDistance(words) {
  const vecs = await embed(words.slice(0, 7))
  const pairs = []
  for (let i = 0; i < vecs.length; i++)
    for (let j = i + 1; j < vecs.length; j++) pairs.push(dist(vecs[i], vecs[j]))
  return mean(pairs) * 100
}

const CLUSTERED = [
  ['cat', 'dog', 'horse', 'cow', 'sheep', 'goat', 'pig'],
  ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink'],
  ['car', 'truck', 'bus', 'train', 'plane', 'bike', 'boat'],
  ['apple', 'banana', 'orange', 'grape', 'pear', 'peach', 'plum'],
]
const HAND_PICKED = [
  ['arm', 'eagle', 'mother', 'statue', 'egg', 'trumpet', 'cyclone'],
  ['tax', 'velvet', 'earthquake', 'pension', 'coral', 'opera', 'fungus'],
  ['justice', 'sandpaper', 'whale', 'inflation', 'origami', 'magma', 'lullaby'],
  ['bureaucracy', 'pollen', 'harpoon', 'nostalgia', 'asphalt', 'ferret', 'sonata'],
  ['gravity', 'marmalade', 'tundra', 'lawsuit', 'xylophone', 'plankton', 'vertigo'],
]

console.log('=== 1. DAT raw distance (mean pairwise x 100, 7 words) ===')
const clustered = []
for (const s of CLUSTERED) clustered.push(await datDistance(s))
const random = []
for (let i = 0; i < 120; i++) random.push(await datDistance(drawWords(7)))
const strong = []
for (const s of HAND_PICKED) strong.push(await datDistance(s))

console.log('clustered sets  :', clustered.map((x) => x.toFixed(1)).join(' '))
console.log(
  'random pool     : p10',
  quantile(random, 0.1).toFixed(1),
  'p50',
  quantile(random, 0.5).toFixed(1),
  'p90',
  quantile(random, 0.9).toFixed(1),
)
console.log('hand-picked far :', strong.map((x) => x.toFixed(1)).join(' '))

/* ------------------------------------------ 2. AUT originality separation -- */

const BRICK_CLICHES = [
  'build a wall', 'build a house', 'use it as a paperweight', 'break a window',
  'use it as a doorstop', 'throw it at someone', 'use it as a hammer',
  'prop something up', 'use it as a weapon', 'make a path',
]
const CLIP_CLICHES = [
  'hold papers together', 'pick a lock', 'clean under your fingernails',
  'use it as a bookmark', 'make a chain', 'reset a router with the pinhole',
  'use it as a hook', 'unclog a spray nozzle', 'make jewellery', 'poke something',
]

const SETS = [
  {
    prompt: 'List unusual uses for a brick.',
    cliches: BRICK_CLICHES,
    stock: [
      'build a wall', 'use it as a doorstop', 'break a window',
      'use it as a paperweight', 'use it as a hammer',
    ],
    mid: [
      'use it to weigh down a tarpaulin', 'stack them as a bookshelf support',
      'use it to sharpen a blade', 'use it as a barbecue base',
    ],
    novel: [
      'grind it to powder as a pigment for paint',
      'heat it and use the stored warmth to prove bread dough',
      'use its porosity as a slow-release water reservoir for a plant',
      'carve channels in it to make a mould for casting metal',
      'use it as a thermal mass to stabilise a beehive overnight',
    ],
  },
  {
    prompt: 'List unusual uses for a paperclip.',
    cliches: CLIP_CLICHES,
    stock: [
      'hold papers together', 'pick a lock', 'use it as a bookmark',
      'make a chain', 'use it as a hook',
    ],
    mid: [
      'use it to press a tiny reset button', 'bend it into a phone stand',
      'use it as a zip pull', 'hold a broken glasses arm together',
    ],
    novel: [
      'use it as a seed marker that rusts to show soil moisture',
      'straighten it as a probe for testing circuit continuity',
      'use it as a tiny armature for a clay sculpture',
      'bend it into a gauge for measuring wire thickness',
      'use it as an acupuncture-style pressure point marker',
    ],
  },
]

console.log('\n=== 2. AUT originality by band (calibrated 0-100) ===')
const bands = { stock: [], mid: [], novel: [] }
for (const set of SETS) {
  const [promptVec] = await embed([set.prompt])
  const clicheVecs = await embed(set.cliches)
  const all = [...set.stock, ...set.mid, ...set.novel]
  const vecs = await embed(all)
  all.forEach((_, i) => {
    const dPrompt = dist(promptVec, vecs[i])
    const dCliche = Math.min(...clicheVecs.map((c) => dist(c, vecs[i])))
    const others = vecs.filter((_, j) => j !== i)
    const dSelf = Math.min(...others.map((o) => dist(o, vecs[i])))
    const raw = 0.3 * dPrompt + 0.45 * clamp01(dCliche / 0.9) + 0.25 * clamp01(dSelf / 0.9)
    const band =
      i < set.stock.length ? 'stock' : i < set.stock.length + set.mid.length ? 'mid' : 'novel'
    bands[band].push(originality(raw))
  })
}
for (const b of ['stock', 'mid', 'novel']) {
  const v = bands[b]
  console.log(
    `${b.padEnd(6)} n=${v.length}  min ${Math.min(...v)}  median ${quantile(v, 0.5)}  max ${Math.max(...v)}`,
  )
}

/* --------------------------------------- 3. Cliché threshold sweep -------- */

// Genuine restatements of a bank cliché — these SHOULD be flagged.
const PARAPHRASES = [
  [BRICK_CLICHES, 'use it to keep a door open'],
  [BRICK_CLICHES, 'construct a garden wall with it'],
  [BRICK_CLICHES, 'smash a window with it'],
  [BRICK_CLICHES, 'put it on paper so it does not blow away'],
  [BRICK_CLICHES, 'lay them to form a garden path'],
  [BRICK_CLICHES, 'hit someone with it'],
  [BRICK_CLICHES, 'hold a door open'],
  [BRICK_CLICHES, 'bang a nail in with it'],
  [CLIP_CLICHES, 'clip sheets of paper together'],
  [CLIP_CLICHES, 'open a locked door without a key'],
  [CLIP_CLICHES, 'mark your page in a book'],
  [CLIP_CLICHES, 'link several together into a chain'],
  [CLIP_CLICHES, 'press the tiny reset hole on a router'],
  [CLIP_CLICHES, 'hang something off it'],
]

// Genuinely different ideas — these must NOT be flagged.
const DISTINCT = [
  [BRICK_CLICHES, 'grind it to powder as a pigment for paint'],
  [BRICK_CLICHES, 'heat it and use the stored warmth to prove bread dough'],
  [BRICK_CLICHES, 'use its porosity as a slow-release water reservoir for a plant'],
  [BRICK_CLICHES, 'carve channels in it to make a mould for casting metal'],
  [BRICK_CLICHES, 'use it as a thermal mass to stabilise a beehive overnight'],
  [BRICK_CLICHES, 'use it to sharpen a blade'],
  [BRICK_CLICHES, 'use it as a barbecue base'],
  [BRICK_CLICHES, 'use it to weigh down a tarpaulin'],
  [BRICK_CLICHES, 'stack them as a bookshelf support'],
  [BRICK_CLICHES, 'score it to make a rasp for shaping wood'],
  [CLIP_CLICHES, 'use it as a seed marker that rusts to show soil moisture'],
  [CLIP_CLICHES, 'straighten it as a probe for testing circuit continuity'],
  [CLIP_CLICHES, 'use it as a tiny armature for a clay sculpture'],
  [CLIP_CLICHES, 'bend it into a gauge for measuring wire thickness'],
  [CLIP_CLICHES, 'bend it into a phone stand'],
  [CLIP_CLICHES, 'use it as a zip pull'],
  [CLIP_CLICHES, 'hold a broken glasses arm together'],
  [CLIP_CLICHES, 'use it as a depth gauge for a drill'],
]

async function nearestCliche(cliches, text) {
  const cv = await embed(cliches)
  const [v] = await embed([text])
  return Math.min(...cv.map((c) => dist(c, v)))
}

const posD = []
for (const [cl, t] of PARAPHRASES) posD.push(await nearestCliche(cl, t))
const negD = []
for (const [cl, t] of DISTINCT) negD.push(await nearestCliche(cl, t))

console.log('\n=== 3. Cliche detector ===')
console.log(
  'paraphrase distance : min', Math.min(...posD).toFixed(3),
  'median', quantile(posD, 0.5).toFixed(3),
  'max', Math.max(...posD).toFixed(3),
)
console.log(
  'distinct   distance : min', Math.min(...negD).toFixed(3),
  'median', quantile(negD, 0.5).toFixed(3),
  'max', Math.max(...negD).toFixed(3),
)
console.log('\nthreshold  recall        false positives')
for (const thr of [0.28, 0.4, 0.44, 0.46, 0.47, 0.48, 0.49, 0.52]) {
  const r = posD.filter((x) => x < thr).length
  const f = negD.filter((x) => x < thr).length
  console.log(
    `  ${thr.toFixed(2)}     ${String(r).padStart(2)}/${posD.length}` +
      `        ${String(f).padStart(2)}/${negD.length}${f === 0 ? '' : '  <- contaminated'}`,
  )
}

console.log('\n"far" badge threshold:')
for (const thr of [0.62, 0.66, 0.7, 0.74]) {
  console.log(
    `  ${thr}  awards ${negD.filter((x) => x > thr).length}/${negD.length} distinct ideas, ` +
      `${posD.filter((x) => x > thr).length}/${posD.length} paraphrases`,
  )
}


/* ------------------------------------------- 4. Relevance gate ------------- */

/*
 * The original scorer rewarded distance from the prompt, which meant an
 * irrelevant answer scored higher than a good one — nothing is further from a
 * task than something unrelated to it. Novelty is now gated on the response
 * actually engaging the task, via two routes: it exploits a physical property
 * of the object, or it is a recognisable use of it.
 */
const BRICK_PROPS = [
  'heavy dense block of fired clay',
  'rough porous rectangular solid with sharp edges',
  'stores heat, absorbs water, abrasive gritty surface',
  'hard brittle mineral that can be crushed to powder',
  'modular unit that stacks, spaces and supports weight',
]

const RELEVANCE_BANDS = {
  stock: SETS[0].stock,
  mid: SETS[0].mid,
  novel: SETS[0].novel,
  'off-task': [
    'idea alpha',
    'idea beta',
    'asdf asdf',
    'first idea here',
    'I really enjoy eating pizza on Sundays',
    'my sister lives in Copenhagen',
    'the meeting has been moved to Thursday',
  ],
}

const PROP_GATE = 0.2
const USE_GATE = 0.45

console.log('\n=== 4. Relevance gate (prop >= 0.20 OR use >= 0.45) ===')
{
  const propVecs = await embed(BRICK_PROPS)
  const clicheVecs = await embed(BRICK_CLICHES)
  const everything = Object.values(RELEVANCE_BANDS).flat()
  const allVecs = await embed(everything)
  const vecOf = new Map(everything.map((t, i) => [t, allVecs[i]]))

  console.log('band       n   novelty p50   score min/med/max   flagged off-task')
  for (const [name, items] of Object.entries(RELEVANCE_BANDS)) {
    const scores = []
    const novelties = []
    let flagged = 0
    for (const t of items) {
      const v = vecOf.get(t)
      const dCliche = Math.min(...clicheVecs.map((c) => dist(c, v)))
      const others = everything.filter((o) => o !== t).map((o) => vecOf.get(o))
      const dSelf = Math.min(...others.map((o) => dist(o, v)))
      const simProp = Math.max(...propVecs.map((p) => cos(p, v)))
      const simUse = Math.max(...clicheVecs.map((c) => cos(c, v)))
      const onTask = simProp >= PROP_GATE || simUse >= USE_GATE
      const novelty = 0.62 * clamp01(dCliche / 0.9) + 0.38 * clamp01(dSelf / 0.9)
      novelties.push(novelty)
      scores.push(onTask ? originality(novelty) : 0)
      if (!onTask) flagged++
    }
    console.log(
      `${name.padEnd(10)} ${String(items.length).padStart(2)}   ` +
        `${quantile(novelties, 0.5).toFixed(2)}          ` +
        `${Math.min(...scores)}/${quantile(scores, 0.5)}/${Math.max(...scores)}` +
        `            ${flagged}/${items.length}`,
    )
  }
  console.log(
    '\nExpect off-task flagged 100% and scoring 0, with no on-task band flagged.\n' +
      'Note the off-task novelty is *high* — that is precisely the bug the gate prevents.',
  )
}
