/**
 * Guards the one invariant the worked examples depend on.
 *
 *   npm run check-demos
 *
 * Every phase carries a `demo`: a worked example showing a weak answer beside
 * a good one. Examples teach these tasks far faster than prose, but exposure
 * to an example also drags people's own ideas towards it — conformity to
 * examples is one of the most robust findings in the ideation literature
 * (Smith, Ward & Schumacher 1993; Jansson & Smith 1991), and this app's whole
 * premise is that nothing thinks on the user's behalf.
 *
 * So each demo is worked on a subject the user can never be given. That is
 * only true as long as nobody adds a prompt that happens to match one, and
 * the first draft of these demos got it wrong seven times out of twenty-two —
 * the Remote Associates example was literally item one of the puzzle bank, and
 * the Compare Two Cases example was one of its own prompts. Hand-checking does
 * not survive contact with a growing prompt bank, so it is checked here.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const out = mkdtempSync(join(tmpdir(), 'ideaworks-demos-'))
try {
  execFileSync(
    'npx',
    [
      'tsc',
      'src/exercises/catalog.ts',
      'src/data/cra.ts',
      '--outDir',
      out,
      '--module',
      'esnext',
      '--target',
      'es2022',
      '--moduleResolution',
      'bundler',
      '--skipLibCheck',
      '--ignoreConfig',
    ],
    { stdio: 'inherit' },
  )

  // tsc emits the extensionless specifiers it was given; Node's ESM loader
  // requires real paths, so they are rewritten before importing.
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    )
  for (const file of walk(out).filter((f) => f.endsWith('.js')))
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(
        /(from\s+['"])(\.[^'"]*?)(['"])/g,
        (m, a, spec, b) => (spec.endsWith('.js') ? m : `${a}${spec}.js${b}`),
      ),
    )

  const { EXERCISES, STRETCH_SEED_LIST } = await import(
    pathToFileURL(join(out, 'exercises/catalog.js')).href
  )
  const { CRA_ITEMS } = await import(pathToFileURL(join(out, 'data/cra.js')).href)

  const norm = (s) =>
    String(s)
      .toLowerCase()
      .replace(/[^a-z ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const STOP = new Set(
    `a an the of to in on for and or is are it its that this with you your as at be by not but so
     if one two more than what which who when where how do does have has can could would will they
     them their there then also only every each any all own into out up down off over about after
     before very just still even much many few same other another new old first last no nor too
     from together`.split(
      /\s+/,
    ),
  )

  /**
   * Shape and material words are the correct vocabulary for several of these
   * exercises — every valid Generic Parts answer describes something as flat,
   * thin or wooden — so overlap on them says nothing about whether the answer
   * has been given away.
   */
  const GENERIC = new Set(
    `flat metal wooden wood thin long thick hard soft small large round strip piece side edge
     single structure whose part parts made person people thing things way ways
     weight shape size colour texture object material something anything nothing
     idea ideas answer answers word words problem start begin
     point pick whole arrive solution time give take make come work turn keep
     look feel find know need want use used using
     stock cliche answer score scored scoring`.split(/\s+/),
  )

  // Crude but sufficient stemming: without it "forests have firebreaks" in the
  // Far-Domain Analogy hint reads as unrelated to the "How a forest limits the
  // spread of wildfire through firebreaks" source sitting in its own bank.
  const stem = (w) => w.replace(/(ies)$/, 'y').replace(/(ing|es|ed|s)$/, '')
  const keywords = (s) =>
    new Set(
      norm(s)
        .split(' ')
        .map(stem)
        .filter((w) => w.length > 3 && !STOP.has(w) && !GENERIC.has(w)),
    )

  const problems = []

  for (const ex of EXERCISES) {
    for (const phase of ex.phases) {
      const demo = phase.demo
      if (!demo) {
        problems.push(`${ex.id}/${phase.label} has no worked example`)
        continue
      }
      const shown = keywords([demo.subject, demo.weak, demo.good].filter(Boolean).join(' '))

      // Against this exercise's own prompt bank: two content words in common
      // with a prompt means the example is close enough to seed the answer.
      for (const p of ex.prompts) {
        const promptWords = keywords(
          [p.label, ...Object.values(p.data ?? {})].filter((v) => typeof v === 'string').join(' '),
        )
        const shared = [...shown].filter((w) => promptWords.has(w))
        if (shared.length >= 2) {
          problems.push(
            `${ex.id}/${phase.label} example overlaps prompt "${p.key}" on: ${shared.join(', ')}`,
          )
        }
      }

      // Object-style prompts are short noun phrases; reusing one anywhere means
      // the example lands on a subject someone will be handed.
      for (const other of EXERCISES) {
        for (const p of other.prompts) {
          const label = norm(p.label).replace(/^(a|an|the) /, '')
          if (label.split(' ').length <= 3 && label.length > 3 && norm(demo.subject).includes(label))
            problems.push(
              `${ex.id}/${phase.label} example is worked on "${p.label}", a live ${other.id} prompt`,
            )
        }
      }

      if (ex.id === 'stretch') {
        for (const seed of STRETCH_SEED_LIST)
          if (norm(demo.subject).split(' ').includes(seed))
            problems.push(`stretch example uses "${seed}", which is a live starting word`)
      }

      // The same rule applies to the instructional copy. The Generic Parts
      // hint used to illustrate itself with "wick" versus "twisted fibre
      // string", which handed over the answer for the candle prompt sitting in
      // its own bank.
      const copy = norm(
        [phase.task, phase.hint, phase.empty, phase.placeholder].filter(Boolean).join(' '),
      )
      for (const p of ex.prompts) {
        const bank = [...Object.values(p.data ?? {}), ...(p.props ?? []), ...(p.cliches ?? [])]
          .filter((v) => typeof v === 'string')
          .join(' ')
        const copyWords = new Set(copy.split(' ').map(stem))
        const leaked = [...keywords(bank)].filter((w) => copyWords.has(w))
        if (leaked.length >= 2)
          problems.push(
            `${ex.id}/${phase.label} instructions leak prompt "${p.key}" answers: ${leaked.join(', ')}`,
          )
      }

      if (ex.id === 'cra') {
        const words = new Set(norm(`${demo.subject} ${demo.good} ${demo.weak ?? ''}`).split(' '))
        for (const item of CRA_ITEMS)
          if (words.has(item.answer) || item.cues.every((c) => words.has(c)))
            problems.push(
              `cra example gives away item ${item.cues.join('/')} → ${item.answer}`,
            )
      }
    }
  }

  /*
   * The catalog is not the only place a prompt's answer can leak. The Generic
   * Parts runner hardcoded the placeholder "e.g. thin flexible string of
   * twisted fibre" — a candle's wick, while a candle sits in its own object
   * bank — and because that string lived in a component rather than in a
   * phase, checking the catalog alone could never have seen it.
   */
  const componentDir = 'src/components'
  const literal = /(?:'([^'\n]{18,})'|"([^"\n]{18,})"|`([^`$\n]{18,})`)/g
  for (const file of readdirSync(componentDir).filter((f) => f.endsWith('.tsx'))) {
    const source = readFileSync(join(componentDir, file), 'utf8')
    for (const m of source.matchAll(literal)) {
      const text = m[1] ?? m[2] ?? m[3]
      /*
       * Only prose can leak an answer. Class lists dominate these files and
       * share words like "line" and "panel" with the prompt banks purely
       * because those are colour tokens, so they are filtered out by the one
       * reliable difference: written English contains function words and
       * Tailwind never does.
       */
      if (/[/:[\]]/.test(text)) continue
      const tokens = text.toLowerCase().split(/\s+/)
      if (!tokens.some((t) => STOP.has(t.replace(/[^a-z]/g, '')))) continue
      const words = keywords(text)
      if (words.size < 3) continue
      for (const ex of EXERCISES) {
        for (const p of ex.prompts) {
          const bank = [...Object.values(p.data ?? {}), ...(p.props ?? []), ...(p.cliches ?? [])]
            .filter((v) => typeof v === 'string')
            .join(' ')
          const shared = [...keywords(bank)].filter((w) => words.has(w))
          if (shared.length >= 2)
            problems.push(
              `${file} contains "${text.slice(0, 60)}" which gives away ${ex.id} prompt "${p.key}": ${shared.join(', ')}`,
            )
        }
      }
    }
  }

  const phases = EXERCISES.flatMap((e) => e.phases).length
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`)
    console.error(`\n${problems.length} problem(s) across ${phases} phases`)
    process.exit(1)
  }
  console.log(`✓ ${phases} worked examples, none overlapping a live prompt`)
} finally {
  rmSync(out, { recursive: true, force: true })
}
