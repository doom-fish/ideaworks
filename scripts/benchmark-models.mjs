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

const CANDIDATES = process.env.MODELS ? process.env.MODELS.split(',') : [
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
      ['lay them with mortar to build a garden wall', 1],
      ['wedge one against the door to hold it open', 1],
      ['throw it through the window to break the glass', 1],
      ['rest it on the papers so they cannot blow away', 1],
      ['set it down as a stand for a hot tray', 2],
      ['stack a few to raise a shelf off the floor', 2],
      ['balance a plank across two of them as a bench', 2],
      ['drag a blade along its face to sharpen the edge', 2],
      ['crush it to red dust and mix that into paint', 3],
      ['warm it in the fire to prove dough overnight', 3],
      ['soak it and bury it to water a plant slowly', 3],
      ['cut a channel in it to cast molten metal', 3],
      ['sink it in the hive to hold heat till morning', 3],
      ['score its face into a rasp for shaping green wood', 3],
      ['idea alpha', 0],
      ['asdf asdf', 0],
      ['I really enjoy eating pizza on Sundays with my family', 0],
      ['my sister moved to Copenhagen to study marine biology', 0],
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
      ['slide it over the corner to hold the sheets together', 1],
      ['straighten it and rake the pins to pick a lock', 1],
      ['slip it onto the page to mark where you stopped', 1],
      ['link a row of them together to make a chain', 1],
      ['poke the straightened end into the router reset hole', 2],
      ['bend it into a cradle that props the phone up', 2],
      ['hook it through the tab as a replacement zip pull', 2],
      ['clamp it over the broken arm of the glasses', 2],
      ['push it into soil as a marker that rusts when damp', 3],
      ['straighten it into a probe for testing circuit continuity', 3],
      ['bend it into an armature for a small clay figure', 3],
      ['shape it into a gauge for measuring wire thickness', 3],
      ['clip it to the bit as a depth stop when drilling', 3],
      ['the weather is nice today', 0],
      ['quantum chromodynamics describes the strong nuclear force between quarks', 0],
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
      ['pour a drink into it and put the cap back', 1],
      ['fill it with water and stand cut flowers in it', 1],
      ['rinse it out and put it in the recycling bin', 1],
      ['roll it over the dough as an improvised rolling pin', 2],
      ['fill it with sand so it holds the books upright', 2],
      ['score and snap it to make a drinking glass', 2],
      ['fill it with water so it focuses sun on a seedling', 3],
      ['tune a row of them with water to build a scale', 3],
      ['bury it neck down so it waters the bed slowly', 3],
      ['use the punt as a mould for casting small pucks', 3],
      ['my sister lives in Copenhagen', 0],
      ['idea beta', 0],
      ['the meeting has been moved to Thursday afternoon instead', 0],
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
      ['rub yourself down with it after getting out the shower', 1],
      ['spread it on the grass and sit on it', 1],
      ['throw it over the spill and press it down', 1],
      ['roll it up tightly and rest your head on it', 2],
      ['jam it along the gap to stop the draught', 2],
      ['wrap the hot dish in it to keep the heat', 2],
      ['freeze it damp so it sets into a rigid splint', 3],
      ['soak it and hang it to cool the room by evaporation', 3],
      ['unravel the loops for cotton wicking in an oil lamp', 3],
      ['stretch it taut as a coarse sieve for straining plaster', 3],
      ['idea gamma', 0],
      ['the train leaves at nine', 0],
      ['photosynthesis converts sunlight into sugar inside the leaves of plants', 0],
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
      ['bolt it back onto the forks of the bicycle', 1],
      ['hang it flat on the wall as a decoration', 1],
      ['lean it against the fence for beans to climb', 1],
      ['fix hands to the hub and make it a clock', 2],
      ['hang pans from the rim above the kitchen bench', 2],
      ['wind cable around the rim to keep it tidy', 2],
      ['spin it slowly to dry parts you have just painted', 3],
      ['pluck the spokes at tension to sound a rough scale', 3],
      ['spin it fast to fling honey out of the comb', 3],
      ['bend steamed wood around the rim to set a curve', 3],
      ['asdf qwerty', 0],
      ['I have a dentist appointment on Tuesday morning at ten', 0],
    ],
  },
]

/* ------------------------------------------------------------ helpers --- */

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const clamp01 = (x) => Math.max(0, Math.min(1, x))

// Elaboration control, mirroring src/engine/calibration.ts. Automatic
// originality scoring is confounded by response length (Domanti et al. 2026,
// arXiv:2604.20569), so novelty is residualised against ln(word count).
const ELAB_SLOPE = 0.0476
const ELAB_MEAN_LN = 1.889
const controlForElaboration = (nov, words) =>
  words < 1 ? nov : nov - ELAB_SLOPE * (Math.log(words) - ELAB_MEAN_LN)
const DUP_D = 0.45
const DUP_P = 0.4
// Novelty is distance from the cliche bank, penalised only for genuine
// restatement. Blending self-distance in continuously punished two different
// good ideas for being topically related.
const novelty = (dCliche, dSelf) =>
  clamp01(
    clamp01(dCliche / 0.9) - (dSelf < DUP_D ? (1 - dSelf / DUP_D) * DUP_P : 0),
  )
const wordsIn = (t) => t.trim().split(/\s+/).filter(Boolean).length
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
        novelty: controlForElaboration(novelty(dCliche, dSelf), wordsIn(text)),
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
