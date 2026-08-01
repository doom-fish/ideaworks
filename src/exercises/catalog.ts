import type { Exercise } from './types'
import {
  ANALOGY_PROMPTS,
  AUT_OBJECTS,
  CONSTRAINT_PROMPTS,
  GPT_OBJECTS,
  REFRAME_PROBLEMS,
  STRETCH_SEEDS,
  WHATIF_PROMPTS,
} from '../data/prompts'

export const EXERCISES: Exercise[] = [
  {
    id: 'aut',
    name: 'Alternate Uses',
    kind: 'idea-list',
    category: 'divergent',
    scoring: 'vs-prompt',
    blurb: 'Unusual uses for an ordinary object, with the obvious answers priced in.',
    trains: 'Getting past your first, most obvious associations to the long tail where real novelty lives.',
    evidence: {
      claim:
        'The canonical divergent-thinking task. Ideas produced later in a session are reliably more original than early ones, driven by executive control rather than passive association — so the exercise forces you past your first four ideas.',
      citations: [
        'Guilford (1967); Torrance (1966)',
        'Beaty & Silvia (2012), Psych. Aesthetics Creativity & the Arts 6(4), 309–319 — serial order effect',
        'Organisciak et al. (2023), Thinking Skills & Creativity 49, 101356 — automated scoring',
      ],
    },
    seconds: 300,
    quota: 8,
    nudges: [
      { at: 0.25, text: 'Those first ones were the obvious ones. Everyone gives those. Now go somewhere else.' },
      { at: 0.5, text: 'Name the category your last idea belongs to. Now ban that category.' },
      { at: 0.72, text: 'Your best idea statistically has not happened yet. Push. Weird is allowed.' },
      { at: 0.9, text: 'Last stretch — one idea nobody else on earth would write down.' },
    ],
    layout: { subjectLabel: 'Object' },
    phases: [
      {
        label: 'Uses',
        task: 'Name a use for this object that is not what it is for.',
        hint: 'Anything goes as long as it uses something real about the object — its material, weight, shape, texture, how it fails.',
        placeholder: 'One use, then Enter…',
        verb: 'Add use',
        empty: 'Your first few will be the obvious ones. Get them out of the way — everyone starts there.',
        kind: 'generate',
        scored: true,
      },
    ],
    prompts: AUT_OBJECTS,
    promptTemplate: (p) => `List unusual uses for ${p.label}.`,
    howTo: [
      'Never repeats an object within 30 days, so you cannot coast on a rehearsed answer.',
      'The scorer knows the stock answers for each object and flags them as you write.',
      'Do not stop at the quota. Your best idea is statistically still ahead of you.',
    ],
  },

  {
    id: 'dat',
    name: 'Divergent Association',
    kind: 'dat',
    category: 'divergent',
    scoring: 'pairwise',
    blurb: 'Ten nouns, as unrelated to each other as you can make them.',
    trains: 'The raw width of your associative reach — the single best-validated quick measure of divergent thinking.',
    evidence: {
      claim:
        'Naming unrelated words predicts creativity. Correlates r = .32–.50 with AUT originality, test–retest r = .73, and demographics explain ~1% of variance. Scored as mean pairwise semantic distance over the first 7 valid words.',
      citations: [
        'Olson, Nahas, Chmoulevitch, Cropper & Webb (2021), PNAS 118(25), e2022340118',
        'Open data: osf.io/kbeq6',
      ],
    },
    seconds: 240,
    quota: 10,
    layout: { subjectLabel: 'Task' },
    phases: [
      {
        label: 'Ten nouns',
        task: 'Enter ten nouns that are as unrelated to each other as possible.',
        hint: 'Meaning is what counts, not spelling. Only the first seven valid words are scored.',
        placeholder: 'a noun',
        verb: 'Score it',
        empty: '',
        kind: 'generate',
        scored: true,
      },
    ],
    prompts: [{ key: 'dat', label: 'Ten unrelated nouns' }],
    promptTemplate: () => 'Enter 10 nouns that are as different from each other as possible.',
    howTo: [
      'Take it roughly monthly as a benchmark and watch the trend, not any single number.',
      'Scored on your own device, so it is not comparable to the published norms.',
    ],
  },

  {
    id: 'cra',
    name: 'Remote Associates',
    kind: 'rat',
    category: 'convergent',
    scoring: 'exact',
    blurb: 'Three words, one hidden link. Thirty seconds.',
    trains: 'Reaching weak, distant associations under pressure — the convergent half of creativity.',
    evidence: {
      claim:
        "Mednick's associative theory holds that creative people have flatter associative hierarchies and can reach remote links. The bundled items follow the standard normed compound-remote-associate set.",
      citations: [
        'Mednick (1962), Psychological Review 69(3), 220–232',
        'Bowden & Jung-Beeman (2003), Behav. Res. Methods Instrum. Comput. 35(4), 634–639',
      ],
    },
    seconds: 30,
    layout: { subjectLabel: 'Three words' },
    phases: [
      {
        label: 'Find the link',
        task: 'Find the single word that joins all three.',
        hint: 'It forms a compound word or a common phrase with each one.',
        placeholder: 'the connecting word',
        verb: 'Answer',
        empty: '',
        kind: 'generate',
        scored: true,
      },
    ],
    prompts: [{ key: 'cra', label: 'Compound remote associates' }],
    promptTemplate: () => 'Find the word that connects all three.',
    howTo: [
      'Difficulty adapts: solve a tier consistently and you move up.',
      'Let it come rather than grinding. Insight solutions tend to arrive whole.',
    ],
  },

  {
    id: 'reframe',
    name: 'Problem Reframing',
    kind: 'idea-list',
    category: 'reframing',
    scoring: 'pairwise',
    blurb: 'Before solving anything, redefine what the problem actually is — five different ways.',
    trains: 'Problem construction: the single highest-leverage creativity skill in the training literature.',
    evidence: {
      claim:
        'Problem construction training produced the largest effect sizes in the foundational meta-analysis of 70 creativity training studies, and — unusually — its effects transfer to novel problems.',
      citations: [
        'Mumford, Reiter-Palmon & Redmond (1994), J. Educational Psychology',
        'Scott, Leritz & Mumford (2004), Creativity Research Journal 16(4), 361–388',
        'Reiter-Palmon (2018), Journal of Creative Behavior',
      ],
    },
    seconds: 300,
    quota: 5,
    nudges: [
      { at: 0.3, text: 'Is your second definition genuinely different, or the first one reworded?' },
      { at: 0.55, text: 'Try one where the stated problem is actually a symptom of something else entirely.' },
      { at: 0.8, text: 'Try one where the problem is that someone benefits from it not being solved.' },
    ],
    layout: { subjectLabel: 'What you were told' },
    phases: [
      {
        label: 'Definitions',
        task: 'Write a different definition of what the real problem is.',
        hint: 'Not a solution. A problem statement. Each one should send you somewhere the last would not.',
        placeholder: 'The real problem is…',
        verb: 'Add definition',
        empty: 'Resist solving it. Every definition you write opens a different set of solutions later.',
        kind: 'generate',
        scored: true,
      },
    ],
    prompts: REFRAME_PROBLEMS,
    promptTemplate: (p) => `Someone tells you: "${p.label}"\n\nWrite 5 different definitions of what the real problem is.`,
    howTo: [
      'You are scored on how far apart your definitions are, not on how clever any one is.',
      'Problem construction had the largest effect of any component in the training meta-analyses.',
    ],
  },

  {
    id: 'category-exhaustion',
    name: 'Category Burn',
    kind: 'idea-list',
    category: 'de-fixation',
    scoring: 'vs-prompt',
    blurb: 'Every idea must come from a category you have not used yet.',
    trains: 'Deliberate category switching — the executive move that produces the serial-order effect on purpose.',
    evidence: {
      claim:
        'The rise in originality across a session comes from strategic inhibition of the current category and active search for a new one. This exercise makes that move explicit and mandatory rather than hoping it happens.',
      citations: [
        'Beaty & Silvia (2012), Psych. Aesthetics Creativity & the Arts 6(4), 309–319',
        'Nijstad et al. (2010), European Review of Social Psychology — dual pathway',
      ],
    },
    seconds: 300,
    quota: 7,
    requiresCategory: true,
    nudges: [
      { at: 0.4, text: 'Categories used up. What domain have you not touched at all — biology? ritual? crime?' },
      { at: 0.75, text: 'Try a category that sounds absurd for this object. Absurd is where the distance is.' },
    ],
    layout: { subjectLabel: 'Object' },
    phases: [
      {
        label: 'Burn categories',
        task: 'Name a use, and the category it belongs to. Each category can be used once.',
        hint: 'Label the category honestly. Once you name it, it is gone — that is what forces you somewhere new.',
        placeholder: 'One use, then Enter…',
        verb: 'Burn it',
        empty: 'Start anywhere. The exercise begins properly once the easy categories are gone.',
        kind: 'generate',
        scored: true,
      },
    ],
    prompts: AUT_OBJECTS,
    promptTemplate: (p) => `Uses for ${p.label} — but every idea must be in a new category.`,
    howTo: [
      'A category can be used once. Naming it honestly is what makes the constraint bite.',
      'Running out of categories is the point — that is where invention starts.',
    ],
  },

  {
    id: 'constraint',
    name: 'Constrained Invention',
    kind: 'idea-list',
    category: 'constraint',
    scoring: 'vs-prompt',
    blurb: 'A design problem with one rule that removes the obvious solution.',
    trains: 'Depth-first search of a narrowed space instead of shallow breadth — and the effect carries over afterwards.',
    evidence: {
      claim:
        'Across two experiments, both externally-imposed and self-imposed constraints produced more creative output than unconstrained work — and creativity stayed elevated after the constraints were lifted.',
      citations: [
        'Haught-Tromp (2017), Psych. Aesthetics Creativity & the Arts 11(1), 10–17 — the "Green Eggs and Ham" hypothesis',
      ],
    },
    seconds: 360,
    quota: 5,
    nudges: [
      { at: 0.35, text: 'Check your ideas actually obey the constraint. Most people quietly cheat by now.' },
      { at: 0.7, text: 'Add a constraint of your own on top. Narrower is usually better here.' },
    ],
    layout: {
      subjectLabel: 'Design problem',
      extraKey: 'constraint',
      extraLabel: 'You must obey',
      extraTone: 'constraint',
    },
    phases: [
      {
        label: 'Invent',
        task: 'Design something that solves this while obeying the constraint.',
        hint: 'If your idea would work just as well without the constraint, you are not using it yet.',
        placeholder: 'One design, then Enter…',
        verb: 'Add design',
        empty: 'Read the constraint again first. It is the instrument, not the obstacle.',
        kind: 'generate',
        scored: true,
      },
    ],
    prompts: CONSTRAINT_PROMPTS,
    promptTemplate: (p) =>
      `${p.label}\n\nCONSTRAINT: ${(p.data?.constraint as string) ?? ''}`,
    howTo: [
      'Rotate through material, sensory, social and temporal constraints across sessions.',
      'After a run of these, try an unconstrained session and see whether your score stayed high.',
    ],
  },

  {
    id: 'analogy',
    name: 'Far-Domain Analogy',
    kind: 'idea-list',
    category: 'analogy',
    scoring: 'vs-prompt',
    blurb: 'A design challenge, plus a mechanism from a completely unrelated field. Map the structure.',
    trains: 'Structure mapping — transferring relational form across domains rather than surface features.',
    evidence: {
      claim:
        'In a controlled study, engineers given functionally far-domain analogies produced significantly more novel concepts than controls. People only spontaneously transfer far analogies about 20% of the time, but jump to ~80% when explicitly told to look for the structural parallel — so the instruction to map structure is doing the work.',
      citations: [
        'Fu et al. (2014), Research in Engineering Design — design-by-analogy RCT',
        'Gick & Holyoak (1980, 1983), Cognitive Psychology — analogical transfer',
        'Keshwani & Casakin (2024) — near vs far domain effects',
      ],
    },
    seconds: 360,
    quota: 4,
    nudges: [
      { at: 0.3, text: 'Are you copying the surface, or the relationship? Write the relationship out.' },
      { at: 0.65, text: 'What is the equivalent of the source system\'s failure mode in your problem?' },
    ],
    layout: {
      subjectLabel: 'Challenge',
      extraKey: 'source',
      extraLabel: 'Borrow from this',
      extraTone: 'source',
    },
    phases: [
      {
        label: '1 · Abstract it',
        task: 'In one line, say how the source system works — as a relationship, not a description.',
        hint: 'Strip the nouns. Not "forests have firebreaks" but "deliberate gaps stop a cascade spreading".',
        placeholder: 'The underlying mechanism is…',
        verb: 'Set mechanism',
        empty: 'Do this before you look at the challenge again. The whole exercise depends on this line.',
        kind: 'generate',
        min: 1,
        scored: false,
      },
      {
        label: '2 · Carry it across',
        task: 'Now apply that mechanism to the challenge.',
        hint: 'Map the relationship, not the surface. Nothing from the source domain should appear literally.',
        placeholder: 'One solution, then Enter…',
        verb: 'Add solution',
        empty: 'What plays the role of the gap, the cascade, the fuel — in this challenge?',
        kind: 'generate',
        scored: true,
      },
    ],
    prompts: ANALOGY_PROMPTS,
    promptTemplate: (p) => `CHALLENGE: ${p.label}\n\nSOURCE: ${(p.data?.source as string) ?? ''}`,
    howTo: [
      'The first phase is not scored. It exists so the second phase has something to map.',
      'Surface resemblance is the trap: a green solution is not a forest mechanism.',
    ],
  },

  {
    id: 'generic-parts',
    name: 'Generic Parts',
    kind: 'decompose',
    category: 'de-fixation',
    scoring: 'generic-parts',
    blurb: 'Describe an object\'s parts using no word that implies a use.',
    trains: 'Noticing obscure features — the mechanism behind functional fixedness and most real inventions.',
    evidence: {
      claim:
        'Participants trained in this technique solved 67% more insight problems than untrained controls. An analysis of 1,001 historical inventions found obscure-feature discovery was central to most of them.',
      citations: [
        'McCaffrey (2012), Psychological Science 23(3), 215–218',
        'Jansson & Smith (1991), Design Studies 12(1), 3–11 — design fixation',
      ],
    },
    seconds: 240,
    quota: 6,
    layout: { subjectLabel: 'Object' },
    phases: [
      {
        label: 'Decompose',
        task: 'Name one part, described only by shape and material.',
        hint: 'If your word implies a use, it is doing your thinking for you. "Wick" is a use; "twisted fibre string" is a form.',
        placeholder: 'e.g. thin flexible string of twisted fibre',
        verb: 'Add part',
        empty: 'Start with the most obvious part, then ask whether it breaks down further.',
        kind: 'generate',
        scored: true,
      },
    ],
    prompts: GPT_OBJECTS,
    promptTemplate: (p) => `Break ${p.label} into parts. Describe each part with no word that implies a use.`,
    howTo: [
      'Function-implying words are flagged live, with the offending word named.',
      'Getting to zero flags is the exercise, not a bonus.',
    ],
  },

  {
    id: 'stretch',
    name: 'Semantic Stretch',
    kind: 'chain',
    category: 'combination',
    scoring: 'chain',
    blurb: 'Chain eight words, each as far as possible from the one before.',
    trains: 'Deliberately jumping associative gaps instead of drifting down the nearest link.',
    evidence: {
      claim:
        "Mednick's associative account holds that creative individuals access flatter associative hierarchies — weaker, more remote links. Semantic distance between successive responses is the operationalisation used in modern automated scoring.",
      citations: [
        'Mednick (1962), Psychological Review 69(3), 220–232',
        'Beaty & Johnson (2021), Behavior Research Methods 53, 757–780 — SemDis',
      ],
    },
    seconds: 180,
    quota: 8,
    layout: { subjectLabel: 'Starting word' },
    phases: [
      {
        label: 'Jump',
        task: 'Enter a word as unrelated as possible to the one before it.',
        hint: 'Aim to keep every step above 0.80. Most people sag in the middle and start free associating.',
        placeholder: 'somewhere else entirely',
        verb: 'Jump',
        empty: '',
        kind: 'generate',
        scored: true,
      },
    ],
    prompts: [{ key: 'stretch', label: 'Semantic stretch' }],
    promptTemplate: () => 'Each new word must be as unrelated as possible to the previous one.',
    howTo: [
      'You get live distance feedback on every jump.',
      'Random-feeling words are not automatically distant — the model knows the difference.',
    ],
  },

  {
    id: 'perspective',
    name: 'Perspective Shift',
    kind: 'idea-list',
    category: 'de-fixation',
    scoring: 'pairwise',
    blurb: 'The same problem, answered from three deliberately foreign points of view.',
    trains: 'Breaking fixation by forcing a different knowledge base to do the searching.',
    evidence: {
      claim:
        'Fixation on an initial framing is persistent and resistant to instruction alone. Adopting a specified alternate role changes which knowledge is retrieved, which is a reliable de-fixation lever. Evidence is moderate rather than strong.',
      citations: [
        'Jansson & Smith (1991), Design Studies 12(1), 3–11',
        'Dane et al. (2011), Journal of Applied Psychology',
        'Smith, Ward & Schumacher (1993), Memory & Cognition — conformity to examples',
      ],
    },
    seconds: 330,
    quota: 6,
    layout: { subjectLabel: 'Problem' },
    phases: [
      {
        label: 'As a marine biologist',
        task: 'Answer as a marine biologist would.',
        hint: 'Borrow their vocabulary and what they would notice first, not just their opinion.',
        placeholder: 'As a marine biologist…',
        verb: 'Add',
        empty: 'What would someone who thinks about tides, pressure and organisms see here?',
        kind: 'generate',
        min: 2,
        scored: true,
      },
      {
        label: 'As a six-year-old',
        task: 'Now answer as a six-year-old would.',
        hint: 'No jargon, no politeness, no knowledge of why things are done this way.',
        placeholder: 'As a six-year-old…',
        verb: 'Add',
        empty: 'Ask the obvious question an adult has learned not to ask.',
        kind: 'generate',
        min: 2,
        scored: true,
      },
      {
        label: 'As a thief',
        task: 'Now answer as a thief would.',
        hint: 'Look for what is unguarded, mislabelled, or easier to take than to make.',
        placeholder: 'As a thief…',
        verb: 'Add',
        empty: 'Where is the weak point nobody is watching?',
        kind: 'generate',
        min: 2,
        scored: true,
      },
    ],
    // Only problems: "answer as a marine biologist" needs a situation to answer
    // about, and reads as nonsense when the subject is a household object.
    prompts: REFRAME_PROBLEMS,
    promptTemplate: (p) => `Problem: ${p.label}`,
    howTo: [
      'Three roles, two answers each. You advance when you are ready.',
      'You are scored on how far apart the three role-sets are from each other.',
    ],
  },

  {
    id: 'reverse',
    name: 'Reverse Brainstorm',
    kind: 'idea-list',
    category: 'reframing',
    scoring: 'vs-prompt',
    blurb: 'Work out how to make the problem catastrophically worse. Then invert every answer.',
    trains: 'Escaping a solution-shaped rut by searching the failure space, which is usually much richer.',
    evidence: {
      claim:
        'Honest labelling: this is a well-established practitioner technique with good face validity as a reframing device, but it lacks a strong randomised evidence base of its own. Included for variety and because its reframing step is the mechanism that does have support.',
      citations: [
        'Related mechanism: Mumford et al. (1994) problem construction',
        '⚠ No strong standalone RCT evidence — treat as variety, not core training',
      ],
    },
    seconds: 300,
    quota: 8,
    nudges: [
      { at: 0.5, text: 'Now stop. Take your worst three and invert each into something you would actually build.' },
    ],
    layout: { subjectLabel: 'The situation' },
    phases: [
      {
        label: '1 · Sabotage',
        task: 'How could you make this dramatically worse?',
        hint: 'Be specific and be nasty about it. Vague sabotage inverts into vague advice.',
        placeholder: 'One way to ruin it, then Enter…',
        verb: 'Add failure',
        empty: 'Go on. It is much easier to see how something breaks than how it works.',
        kind: 'generate',
        min: 4,
        scored: false,
      },
      {
        label: '2 · Invert',
        task: 'Now flip each failure into something you would actually build.',
        hint: 'Not simply "do the opposite" — ask what would specifically prevent this failure.',
        placeholder: 'The fix for this one…',
        verb: 'Invert it',
        empty: '',
        kind: 'transform',
        sourceLabel: 'Failure',
        scored: true,
      },
    ],
    prompts: REFRAME_PROBLEMS,
    promptTemplate: (p) => `${p.label}\n\nHow could you make this dramatically WORSE?`,
    howTo: [
      'The sabotage phase is not scored — it exists to give you something to invert.',
      'Specific sabotage inverts into specific design. Vague sabotage inverts into nothing.',
    ],
  },

  {
    id: 'whatif',
    name: 'Counterfactual World',
    kind: 'idea-list',
    category: 'divergent',
    scoring: 'vs-prompt',
    blurb: 'One rule of reality is changed. Work out what exists now that did not before.',
    trains: 'Running consequences several steps out instead of stopping at the first-order effect.',
    evidence: {
      claim:
        'Honest labelling: counterfactual simulation is theoretically well grounded in causal reasoning research, but direct evidence that training it improves creativity is thinner than for the other exercises here. Good for domain exploration.',
      citations: [
        'Roese (1997), Psychological Bulletin — counterfactual thinking',
        '⚠ Weak direct training evidence — variety exercise, not core',
      ],
    },
    seconds: 300,
    quota: 6,
    nudges: [
      { at: 0.4, text: 'That is the first-order effect. What is the second-order effect of that?' },
      { at: 0.75, text: 'What industry dies? What ritual appears? What crime becomes possible?' },
    ],
    layout: { subjectLabel: 'The changed rule' },
    phases: [
      {
        label: 'Consequences',
        task: 'Name something that exists in this world that does not exist in ours.',
        hint: 'Push past the first-order effect. Institutions, rituals, crimes and jobs are richer than gadgets.',
        placeholder: 'One consequence, then Enter…',
        verb: 'Add consequence',
        empty: 'Start with the obvious change, then ask what that change causes.',
        kind: 'generate',
        scored: true,
      },
    ],
    prompts: WHATIF_PROMPTS,
    promptTemplate: (p) => p.label,
    howTo: [
      'Included for variety: the direct evidence for training this is thinner than the rest.',
      'Second- and third-order consequences are where this stops being a party game.',
    ],
  },
]

export const STRETCH_SEED_LIST = STRETCH_SEEDS

export function getExercise(id: string) {
  return EXERCISES.find((e) => e.id === id)
}
