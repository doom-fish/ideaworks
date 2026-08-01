/**
 * End-to-end sanity check of every scored exercise.
 *
 *   npm run assess
 *
 * Feeds each exercise realistic strong / middling / weak input and prints what
 * the shipped scorer returns, so the numbers can be judged as a person would
 * judge them. Unit tests confirm the maths; this confirms the maths means
 * something.
 */
import { pipeline } from '@huggingface/transformers'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const fs = require('fs')

const cal = fs.readFileSync('src/engine/calibration.ts', 'utf8')
const num = (k) => parseFloat(cal.match(new RegExp(`export const ${k} = ([\\d.]+)`))[1])
const FLOOR = num('ORIGINALITY_FLOOR'), CEIL = num('ORIGINALITY_CEIL')
const PROP = num('RELEVANCE_PROP'), USE = num('RELEVANCE_USE'), PROMPT = num('RELEVANCE_PROMPT')
const ELAB_B = num('ELABORATION_SLOPE'), ELAB_MU = num('ELABORATION_MEAN_LN_WORDS')
const CHAIN_GOOD = num('CHAIN_GOOD'), CHAIN_WEAK = num('CHAIN_WEAK')
const CLICHE_T = num('CLICHE_THRESHOLD')

const src = fs.readFileSync('src/data/prompts.ts', 'utf8')
const parse = (b) => b.split('\n').map((x) => x.trim().replace(/^'|',?$/g, '')).filter(Boolean)
const OBJ = {}
const re = /key: '([a-z0-9-]+)',\n\s+label: '([^']+)',\n\s+cliches: \[([\s\S]*?)\],\n\s+props: \[([\s\S]*?)\],/g
let m
while ((m = re.exec(src))) OBJ[m[1]] = { label: m[2], cliches: parse(m[3]), props: parse(m[4]) }

const ex = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' })
const cache = new Map()
async function embed(ts) {
  const miss = [...new Set(ts.filter((t) => !cache.has(t)))]
  for (let k = 0; k < miss.length; k += 32) {
    const b = miss.slice(k, k + 32)
    const o = await ex(b, { pooling: 'mean', normalize: true })
    const w = o.dims[o.dims.length - 1]
    const f = Float32Array.from(o.data)
    b.forEach((t, i) => cache.set(t, f.slice(i * w, (i + 1) * w)))
  }
  return ts.map((t) => cache.get(t))
}
const cos = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d }
const dist = (a, b) => 1 - cos(a, b)
const c01 = (x) => Math.max(0, Math.min(1, x))
const words = (t) => t.trim().split(/\s+/).filter(Boolean).length
const ctrl = (n, w) => (w < 1 ? n : n - ELAB_B * (Math.log(w) - ELAB_MU))
const to100 = (n) => Math.round(c01((n - FLOOR) / (CEIL - FLOOR)) * 100)
const bar = (n) => '█'.repeat(Math.round(n / 5)).padEnd(20, '·')

async function scoreVsPrompt(promptText, answers, cl = [], pr = []) {
  const V = await embed(answers)
  const clV = cl.length ? await embed(cl) : []
  const prV = pr.length ? await embed(pr) : []
  const [pv] = await embed([promptText])
  return answers.map((t, i) => {
    const v = V[i]
    const dC = clV.length ? Math.min(...clV.map((c) => dist(c, v))) : 0.9
    const others = V.filter((_, j) => j !== i)
    const dS = others.length ? Math.min(...others.map((o) => dist(o, v))) : 0.9
    const sp = prV.length ? Math.max(...prV.map((p) => cos(p, v))) : 0
    const su = clV.length ? Math.max(...clV.map((c) => cos(c, v))) : 0
    const grounded = prV.length > 0 || clV.length > 0
    const on = grounded ? sp >= PROP || su >= USE : cos(pv, v) >= PROMPT
    const raw = clV.length ? 0.62 * c01(dC / 0.9) + 0.38 * c01(dS / 0.9) : c01(dS / 0.9)
    return { t, score: on ? to100(ctrl(raw, words(t))) : 0, off: !on, cliche: clV.length > 0 && dC < CLICHE_T }
  })
}
async function scorePairwise(answers) {
  const V = await embed(answers)
  return answers.map((t, i) => {
    const others = V.filter((_, j) => j !== i)
    const dS = Math.min(...others.map((o) => dist(o, V[i])))
    const dM = others.reduce((a, o) => a + dist(o, V[i]), 0) / others.length
    return { t, score: to100(ctrl(0.65 * dS + 0.35 * dM, words(t))), off: false, cliche: dS < 0.25 }
  })
}
const show = (rows) => rows.forEach((r) =>
  console.log(`  ${String(r.score).padStart(3)} ${bar(r.score)} ${r.off ? 'OFF ' : r.cliche ? 'STOCK' : '    '} ${r.t.slice(0, 58)}`))

/* ------------------------------------------------------------------ AUT -- */
console.log('\n=== ALTERNATE USES (a brick) — expect stock low, novel high ===')
show(await scoreVsPrompt('List unusual uses for a brick.', [
  'build a wall', 'use it as a doorstop', 'use it as a paperweight',
  'stack a few to raise a shelf off the floor',
  'grind it to powder and use it as a pigment',
  'soak it and bury it to water a plant slowly',
  'idea alpha',
], OBJ.brick.cliches, OBJ.brick.props))

/* ------------------------------------------------------------------ DAT -- */
console.log('\n=== DIVERGENT ASSOCIATION — mean pairwise distance x100 ===')
for (const [label, ws] of [
  ['clustered  ', ['cat','dog','horse','cow','sheep','goat','pig']],
  ['random     ', ['apple','bridge','helmet','opinion','quarry','ribbon','thunder']],
  ['deliberate ', ['justice','sandpaper','whale','inflation','origami','magma','lullaby']],
]) {
  const V = await embed(ws)
  const ps = []
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) ps.push(dist(V[i], V[j]))
  const mu = ps.reduce((a, b) => a + b, 0) / ps.length
  console.log(`  ${label} ${(mu * 100).toFixed(1)}   ${bar(mu * 100)}`)
}

/* ---------------------------------------------------------------- CHAIN -- */
console.log(`\n=== SEMANTIC STRETCH — per-step distance (good >= ${CHAIN_GOOD}, weak <= ${CHAIN_WEAK}) ===`)
for (const [label, chain] of [
  ['drifting ', ['moon','star','sun','planet','space','rocket']],
  ['jumping  ', ['moon','tax','velvet','earthquake','pension','coral']],
]) {
  const V = await embed(chain)
  const steps = chain.slice(1).map((w, i) => ({ w, d: dist(V[i], V[i + 1]) }))
  console.log(`  ${label} ${steps.map((s) => s.d.toFixed(2)).join('  ')}`)
  console.log(`            ${steps.map((s) => (s.d >= CHAIN_GOOD ? 'good' : s.d > CHAIN_WEAK ? 'warn' : 'CLOSE')).join('  ')}`)
}

/* -------------------------------------------------------------- REFRAME -- */
console.log('\n=== PROBLEM REFRAMING — pairwise spread of definitions ===')
console.log(' -- near-duplicates (should score low):')
show(await scorePairwise([
  'people are not coming back after the first day',
  'users do not return after day one',
  'the second visit never happens',
]))
console.log(' -- genuinely different framings (should score high):')
show(await scorePairwise([
  'we optimise for signup rather than the second session',
  'the value arrives too slowly to be felt on day one',
  'we are acquiring people who never had this problem',
  'onboarding teaches the interface instead of an outcome',
]))

/* ----------------------------------------------------------- UNGROUNDED -- */
console.log('\n=== COMPARE TWO CASES — ungrounded prompt, relevance is weak here ===')
show(await scoreVsPrompt('A hospital clinic is overwhelmed on Monday mornings and half empty on Thursdays.', [
  'charge a premium for Monday slots so demand shifts',
  'discount Thursday appointments to pull people across',
  'cap Monday slots so the overflow has to choose',
  'I really enjoy eating pizza on Sundays',
]))
