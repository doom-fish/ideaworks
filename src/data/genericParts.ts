/**
 * Vocabulary for the Generic Parts Technique grader.
 *
 * McCaffrey (2012), Psychological Science: a part description is "fixed" when
 * the label implies a use ("wick", "handle", "blade"). Replacing it with a
 * label that names only shape and material ("string", "rod", "flat metal
 * strip") is what unlocks the obscure feature. Trained participants solved 67%
 * more insight problems than controls.
 */

/** Labels that name a function rather than a physical form. */
export const FUNCTION_WORDS = new Set<string>([
  'wick', 'handle', 'blade', 'knob', 'button', 'switch', 'lever', 'trigger',
  'lid', 'cap', 'plug', 'socket', 'hinge', 'latch', 'lock', 'key', 'fastener',
  'clasp', 'buckle', 'zip', 'zipper', 'clip', 'peg', 'hook', 'anchor', 'nail',
  'screw', 'bolt', 'nut', 'washer', 'rivet', 'staple', 'pin', 'tack', 'clamp',
  'grip', 'holder', 'stand', 'base', 'support', 'brace', 'strut', 'leg',
  'foot', 'arm', 'shaft', 'axle', 'bearing', 'gear', 'cog', 'sprocket',
  'pulley', 'belt', 'chain', 'spring', 'damper', 'valve', 'nozzle', 'spout',
  'filter', 'seal', 'gasket', 'insulator', 'conductor', 'wire', 'cable',
  'battery', 'motor', 'engine', 'pump', 'fan', 'blower', 'heater', 'cooler',
  'sensor', 'detector', 'display', 'screen', 'speaker', 'microphone', 'lens',
  'mirror', 'reflector', 'filament', 'bulb', 'electrode', 'terminal',
  'connector', 'adapter', 'coupler', 'joint', 'seam', 'stitch', 'thread',
  'cutter', 'opener', 'scraper', 'brush', 'bristle', 'nib', 'tip', 'point',
  'edge', 'tooth', 'teeth', 'jaw', 'prong', 'tine', 'fork', 'spoon', 'straw',
  'pipe', 'hose', 'duct', 'vent', 'grille', 'mesh', 'sieve', 'strainer',
  'container', 'vessel', 'reservoir', 'tank', 'cartridge', 'magazine',
  'trigger', 'safety', 'guard', 'shield', 'cover', 'casing', 'housing',
  'frame', 'chassis', 'mount', 'bracket', 'rail', 'track', 'guide', 'slide',
  'roller', 'wheel', 'tyre', 'tire', 'tread', 'brake', 'pedal', 'crank',
  'handlebar', 'saddle', 'seat', 'backrest', 'armrest', 'headrest', 'strap',
  'harness', 'buckle', 'lace', 'eyelet', 'grommet', 'label', 'tag', 'marker',
  'pointer', 'dial', 'gauge', 'meter', 'timer', 'alarm', 'buzzer', 'bell',
  'whistle', 'siren', 'antenna', 'aerial', 'receiver', 'transmitter',
  'charger', 'plunger', 'piston', 'cylinder-head', 'stopper', 'cork',
  'wrapper', 'padding', 'cushion', 'liner', 'sleeve', 'shell', 'skin',
  'membrane', 'diaphragm', 'spacer', 'shim', 'stabiliser', 'stabilizer',
  'fastening', 'closure', 'divider', 'partition', 'hanger', 'rack', 'shelf',
  'drawer', 'compartment', 'pocket', 'flap', 'hatch', 'door', 'window',
  'ferrule', 'eraser', 'aglet', 'spring-clip', 'grip-tape', 'nozzle-head',
])

/**
 * Labels that name only shape, material, or quantity. These are the target
 * vocabulary — a decomposition made entirely of these is "fully generic".
 */
export const GENERIC_WORDS = new Set<string>([
  // shapes / forms
  'rod', 'bar', 'strip', 'sheet', 'plate', 'disc', 'disk', 'ring', 'tube',
  'cylinder', 'cone', 'sphere', 'ball', 'cube', 'block', 'slab', 'wedge',
  'coil', 'helix', 'spiral', 'strand', 'fibre', 'fiber', 'string', 'cord',
  'band', 'loop', 'hoop', 'curve', 'bend', 'arc', 'notch', 'groove', 'slot',
  'hole', 'opening', 'gap', 'cavity', 'channel', 'ridge', 'bump', 'flat',
  'thin', 'thick', 'long', 'short', 'narrow', 'wide', 'round', 'square',
  'rectangular', 'triangular', 'hollow', 'solid', 'flexible', 'rigid',
  'stiff', 'soft', 'hard', 'smooth', 'rough', 'porous', 'dense', 'light',
  'heavy', 'twisted', 'braided', 'woven', 'folded', 'layered', 'tapered',
  'pointed', 'blunt', 'serrated', 'threaded', 'grooved', 'perforated',
  'piece', 'pieces', 'part', 'parts', 'section', 'segment', 'length', 'mass',
  'lump', 'grain', 'powder', 'granule', 'film', 'layer', 'coating', 'column',
  // materials
  'metal', 'steel', 'iron', 'aluminium', 'aluminum', 'copper', 'brass',
  'bronze', 'zinc', 'tin', 'lead', 'silver', 'gold', 'wood', 'timber',
  'bamboo', 'paper', 'card', 'cardboard', 'plastic', 'polymer', 'nylon',
  'rubber', 'latex', 'silicone', 'glass', 'ceramic', 'porcelain', 'stone',
  'concrete', 'clay', 'wax', 'oil', 'grease', 'resin', 'fabric', 'cloth',
  'cotton', 'wool', 'silk', 'leather', 'foam', 'gel', 'liquid', 'water',
  'gas', 'air', 'argon', 'graphite', 'carbon', 'silicon', 'lithium',
  'adhesive', 'glue', 'ink', 'pigment', 'dye', 'salt', 'sugar', 'sand',
])

const AGENTIVE = /(?:er|or|ing)$/

/** Words that end in -er/-or but describe form, not function. */
const AGENTIVE_EXCEPTIONS = new Set([
  'silver', 'copper', 'rubber', 'polymer', 'cylinder', 'powder', 'paper',
  'fibre', 'fiber', 'layer', 'water', 'leather', 'timber', 'lower', 'upper',
  'inner', 'outer', 'quarter', 'centre', 'center', 'corner', 'over', 'under',
  'other', 'another', 'longer', 'shorter', 'thinner', 'thicker', 'wider',
  'narrower', 'smaller', 'larger', 'string', 'ring', 'spring', 'coating',
  'opening', 'casing', 'padding', 'wrapping',
])

export interface PartGrade {
  text: string
  /** function-implying tokens found */
  flags: string[]
  /** generic shape/material tokens found */
  generics: string[]
  ok: boolean
}

export function gradePart(text: string): PartGrade {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)

  const flags: string[] = []
  const generics: string[] = []

  for (const t of tokens) {
    const singular = t.endsWith('s') && t.length > 3 ? t.slice(0, -1) : t
    if (FUNCTION_WORDS.has(t) || FUNCTION_WORDS.has(singular)) {
      flags.push(t)
      continue
    }
    if (GENERIC_WORDS.has(t) || GENERIC_WORDS.has(singular)) {
      generics.push(t)
      continue
    }
    // Agentive nouns ("holder", "cutter", "fastening") almost always encode a use.
    if (AGENTIVE.test(t) && t.length > 4 && !AGENTIVE_EXCEPTIONS.has(t)) {
      flags.push(t)
    }
  }

  return {
    text,
    flags: [...new Set(flags)],
    generics: [...new Set(generics)],
    ok: flags.length === 0 && generics.length > 0,
  }
}
