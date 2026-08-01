/**
 * Model benchmark for the originality scorer.
 *
 *   node scripts/benchmark-models.mjs
 *
 * The on-device model is the ceiling on scoring quality, so choosing it should
 * be an empirical decision rather than a default. This scores a labelled set of
 * responses with each candidate and reports how well the resulting numbers
 * reproduce the intended ordering.
 *
 * Labels:
 *   0  off-task     — must score zero
 *   1  stock        — the answer almost everyone gives
 *   2  plausible    — a real but unremarkable use
 *   3  novel        — genuinely original
 *
 * Reported per model:
 *   rho        Spearman correlation between score and label over on-task items.
 *              This is the headline: does the model rank ideas the way a person
 *              would?
 *   gap        median(novel) − median(stock), in final 0-100 points. A model can
 *              rank correctly and still bunch everything together, which makes
 *              the number useless as feedback.
 *   off-task   detection rate, and false positives on genuine answers.
 */
import { pipeline } from '@huggingface/transformers'

const CANDIDATES = [
  'Xenova/all-MiniLM-L6-v2',
  'Xenova/bge-small-en-v1.5',
  'Xenova/gte-small',
  'Xenova/all-mpnet-base-v2',
  'Xenova/bge-base-en-v1.5',
]

/* ------------------------------------------------------------- dataset --- */

const OBJECTS = [
  {
    name: 'a brick',
    props: [
      'heavy dense block of fired clay',
      'rough porous rectangular solid with sharp edges',
      'stores heat, absorbs water, abrasive gritty surface',
      'hard brittle mineral that can be crushed to powder',
      'modular unit that stacks, spaces and supports weight',
    ],
    cliches: [
      'build a wall', 'build a house', 'use it as a paperweight', 'break a window',
      'use it as a doorstop', 'throw it at someone', 'use it as a hammer',
      'prop something up', 'use it as a weapon', 'make a path',
    ],
    items: [
      ['build a wall', 1],
      ['use it as a doorstop', 1],
      ['break a window with it', 1],
      ['use it as a paperweight', 1],
      ['weigh down a tarpaulin', 2],
      ['stack them as a bookshelf support', 2],
      ['use it as a barbecue base', 2],
      ['sharpen a blade on it', 2],
      ['grind it to powder as a pigment for paint', 3],
      ['heat it and use the stored warmth to prove bread dough', 3],
      ['use its porosity as a slow-release water reservoir for a plant', 3],
      ['carve channels in it to make a mould for casting metal', 3],
      ['use it as a thermal mass to stabilise a beehive overnight', 3],
      ['score it into a rasp for shaping green wood', 3],
      ['idea alpha', 0],
      ['asdf asdf', 0],
      ['I really enjoy eating pizza on Sundays', 0],
      ['my sister lives in Copenhagen', 0],
    ],
  },
  {
    name: 'a paperclip',
    props: [
      'thin springy bent steel wire',
      'small light flexible metal loop',
      'conducts electricity, resists bending, holds a shape once bent',
      'narrow pointed end that fits into tiny holes',
      'tiny fastener-sized part that clips, hangs and holds tension',
    ],
    cliches: [
      'hold papers together', 'pick a lock', 'clean under your fingernails',
      'use it as a bookmark', 'make a chain', 'reset a router with the pinhole',
      'use it as a hook', 'unclog a spray nozzle', 'make jewellery',
      'poke into a small opening',
    ],
    items: [
      ['hold papers together', 1],
      ['pick a lock with it', 1],
      ['use it as a bookmark', 1],
      ['make a chain of them', 1],
      ['press the reset hole on a router', 2],
      ['bend it into a phone stand', 2],
      ['use it as a zip pull', 2],
      ['hold a broken glasses arm together', 2],
      ['use it as a seed marker that rusts to show soil moisture', 3],
      ['straighten it as a probe for testing circuit continuity', 3],
      ['use it as a tiny armature for a clay sculpture', 3],
      ['bend it into a gauge for measuring wire thickness', 3],
      ['use it as a depth stop when drilling', 3],
      ['the weather is nice today', 0],
      ['quantum chromodynamics describes the strong force', 0],
      ['test test test', 0],
    ],
  },
  {
    name: 'a glass bottle',
    props: [
      'hollow transparent vessel of rigid glass',
      'smooth heavy cylinder with a narrow neck',
      'airtight, waterproof, refracts light, resonates when blown',
      'brittle silica that shatters into sharp fragments',
      'upright vessel that stands, stores, pours and stacks',
    ],
    cliches: [
      'hold water or a drink inside it', 'use it as a vase',
      'send a message in it', 'make a candle holder', 'use it as a rolling pin',
      'put it out for recycling', 'blow across the top to make a note',
      'break it for glass', 'use it as a piggy bank', 'use it as a weapon',
    ],
    items: [
      ['hold a drink in it', 1],
      ['use it as a vase for flowers', 1],
      ['put it out for recycling', 1],
      ['use it as a rolling pin', 2],
      ['fill it with water as a bookend', 2],
      ['cut it down into a drinking glass', 2],
      ['use it as a lens to focus sunlight onto a seedling', 3],
      ['tune a row of them with water to build a scale', 3],
      ['bury it neck-down as a slow irrigation spike', 3],
      ['use the punt as a mould for casting small pucks', 3],
      ['my sister lives in Copenhagen', 0],
      ['idea beta', 0],
    ],
  },
  {
    name: 'a bath towel',
    props: [
      'large sheet of thick absorbent looped cotton',
      'soft porous fabric that holds water and heat',
      'insulates, cushions, filters, can be torn into strips',
      'flexible textile that folds and wraps',
      'large soft sheet that wraps, pads, covers and separates',
    ],
    cliches: [
      'dry your body after a bath', 'use it as a blanket', 'use it as a picnic mat',
      'clean up a spill', 'use it as a pillow', 'wave it as a flag',
      'use it as a bag by tying corners', 'block a draught under a door',
      'use it as a rope', 'wear it as clothing',
    ],
    items: [
      ['dry yourself after a shower', 1],
      ['use it as a picnic blanket', 1],
      ['mop up a spill', 1],
      ['roll it up as a pillow', 2],
      ['block a draught under the door', 2],
      ['wrap a hot dish to keep it warm', 2],
      ['freeze it damp as a moulded splint for a sprain', 3],
      ['soak it in water as an evaporative cooler for a room', 3],
      ['unravel the loops for cotton wicking in an oil lamp', 3],
      ['stretch it as a coarse filter for straining plaster', 3],
      ['idea gamma', 0],
      ['the train leaves at nine', 0],
      ['photosynthesis converts light into sugar', 0],
    ],
  },
  {
    name: 'a bicycle wheel',
    props: [
      'large light circle of rim, spokes and hub',
      'spins freely on a low-friction bearing',
      'radial tensioned wires forming a rigid disc',
      'strong metal ring with regular gaps',
      'large rigid ring that spins, mounts and holds items around its rim',
    ],
    cliches: [
      'put it on a bike', 'make a clock face', 'make a garden trellis',
      'hang it as art', 'use it as a spinning wheel', 'make a chandelier',
      'use it as a plant support', 'roll it along the ground',
      'make a wind spinner', 'use it as a pot rack',
    ],
    items: [
      ['fit it to a bicycle', 1],
      ['hang it on the wall as decoration', 1],
      ['use it as a garden trellis', 1],
      ['make a clock out of it', 2],
      ['hang pots from the rim in a kitchen', 2],
      ['use it as a cable spool', 2],
      ['drive it as a slow turntable for drying painted parts', 3],
      ['use the spoke tension as a coarse musical instrument', 3],
      ['mount it as a centrifuge for separating honey from wax', 3],
      ['use the rim as a bending form for steam-bent wood', 3],
      ['asdf qwerty', 0],
      ['I have a dentist appointment', 0],
    ],
  },
]

/* ------------------------------------------------------------ helpers --- */

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const clamp01 = (x) => Math.max(0, Math.min(1, x))
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

function spearman(a, b) {
  const rank = (xs) => {
    const idx = xs.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0])
    const r = new Array(xs.length)
    let i = 0
    while (i < idx.length) {
      let j = i
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
      const avg = (i + j) / 2 + 1
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg
      i = j + 1
    }
    return r
  }
  const ra = rank(a)
  const rb = rank(b)
  const ma = mean(ra)
  const mb = mean(rb)
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb)
    da += (ra[i] - ma) ** 2
    db += (rb[i] - mb) ** 2
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

const cos = (a, b) => {
  let d = 0
  for (let i = 0; i < a.length; i++) d += a[i] * b[i]
  return d
}
const dist = (a, b) => 1 - cos(a, b)

/* ----------------------------------------------------------- benchmark --- */

/**
 * The relevance thresholds were fitted to one model's similarity distribution
 * and do not transfer: every model puts cosine similarity on its own scale, so
 * reusing one model's cut-offs makes every other model look broken. Each
 * candidate therefore gets its own sweep, and is judged at its own best
 * operating point.
 */
function bestGate(rows) {
  let best = null
  for (let P = 0.05; P <= 0.60; P += 0.01) {
    for (const U of [0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7]) {
      let detected = 0
      let falsePos = 0
      for (const r of rows) {
        const onTask = r.simProp >= P || r.simUse >= U
        if (r.label === 0 && !onTask) detected++
        if (r.label > 0 && !onTask) falsePos++
      }
      // Wrongly zeroing a real idea is far more damaging to a training tool
      // than quietly letting a nonsense one through, so precision comes first.
      const score = falsePos > 0 ? -1000 * falsePos + detected : detected
      if (!best || score > best.score) best = { P, U, detected, falsePos, score }
    }
  }
  return best
}

async function evaluate(modelId) {
  const extract = await pipeline('feature-extraction', modelId, { dtype: 'q8' })
  const cache = new Map()
  const embed = async (texts) => {
    const missing = [...new Set(texts.filter((t) => !cache.has(t)))]
    for (let k = 0; k < missing.length; k += 32) {
      const batch = missing.slice(k, k + 32)
      const out = await extract(batch, { pooling: 'mean', normalize: true })
      const width = out.dims[out.dims.length - 1]
      const flat = Float32Array.from(out.data)
      batch.forEach((t, i) => cache.set(t, flat.slice(i * width, (i + 1) * width)))
    }
    return texts.map((t) => cache.get(t))
  }

  const rows = []
  let dims = 0

  for (const obj of OBJECTS) {
    const propV = await embed(obj.props)
    const clV = await embed(obj.cliches)
    const texts = obj.items.map(([t]) => t)
    const V = await embed(texts)
    dims = V[0].length

    obj.items.forEach(([text, label], i) => {
      const v = V[i]
      const dCliche = Math.min(...clV.map((c) => dist(c, v)))
      const others = V.filter((_, j) => j !== i)
      const dSelf = Math.min(...others.map((o) => dist(o, v)))
      rows.push({
        text,
        label,
        object: obj.name,
        simProp: Math.max(...propV.map((p) => cos(p, v))),
        simUse: Math.max(...clV.map((c) => cos(c, v))),
        novelty: 0.62 * clamp01(dCliche / 0.9) + 0.38 * clamp01(dSelf / 0.9),
      })
    })
  }

  const gate = bestGate(rows)
  const onTask = rows.filter((r) => r.label > 0)
  const rawByLabel = { 1: [], 2: [], 3: [] }
  onTask.forEach((r) => rawByLabel[r.label].push(r.novelty))
  const onTaskRaw = onTask.map((r) => r.novelty)
  const onTaskLabel = onTask.map((r) => r.label)
  const misfired = rows.filter(
    (r) => r.label > 0 && !(r.simProp >= gate.P || r.simUse >= gate.U),
  )

  // Rescale so the reported gap is in the same 0-100 units the app shows,
  // fitted to this model's own spread rather than MiniLM's.
  const lo = Math.min(...onTaskRaw)
  const hi = Math.max(...onTaskRaw)
  const to100 = (x) => Math.round(clamp01((x - lo) / (hi - lo || 1)) * 100)

  return {
    model: modelId,
    dims,
    gate,
    misfired,
    rho: spearman(onTaskRaw, onTaskLabel),
    stock: median(rawByLabel[1].map(to100)),
    plausible: median(rawByLabel[2].map(to100)),
    novel: median(rawByLabel[3].map(to100)),
    gap: median(rawByLabel[3].map(to100)) - median(rawByLabel[1].map(to100)),
    offTask: `${gate.detected}/${rows.filter((r) => r.label === 0).length}`,
    falsePos: gate.falsePos,
    floor: lo.toFixed(3),
    ceil: hi.toFixed(3),
  }
}

const results = []
for (const m of CANDIDATES) {
  process.stderr.write(`\n→ ${m}\n`)
  try {
    results.push(await evaluate(m))
  } catch (e) {
    results.push({ model: m, error: String(e).slice(0, 90) })
  }
}

console.log('\n=== originality scoring by model ===\n')
console.log(
  'model                          dims   rho    stock  plaus  novel   gap  off-task  falsePos',
)
for (const r of results) {
  if (r.error) {
    console.log(`${r.model.padEnd(30)} FAILED ${r.error}`)
    continue
  }
  console.log(
    `${r.model.padEnd(30)} ${String(r.dims).padStart(4)}  ` +
      `${r.rho.toFixed(3)}  ${String(r.stock).padStart(5)}  ${String(r.plausible).padStart(5)}  ` +
      `${String(r.novel).padStart(5)}  ${String(r.gap).padStart(4)}  ${r.offTask.padStart(8)}  ` +
      `${String(r.falsePos).padStart(8)}`,
  )
}
console.log(
  '\nrho = Spearman vs intended ordering (higher is better).\n' +
    'gap = median(novel) − median(stock) in displayed points; a small gap makes\n' +
    '      the score useless as feedback even when the ranking is correct.\n' +
    'falsePos = genuine answers wrongly flagged off-task (must be 0).',
)
console.log('\nper-model operating point (swept, precision-first):')
for (const r of results) {
  if (r.error) continue
  console.log(
    `  ${r.model.padEnd(30)} PROP=${r.gate.P.toFixed(2)} USE=${r.gate.U.toFixed(2)} ` +
      `FLOOR=${r.floor} CEIL=${r.ceil}`,
  )
  for (const m of r.misfired) {
    console.log(`      wrongly off-task: "${m.text}" (${m.object})`)
  }
}
