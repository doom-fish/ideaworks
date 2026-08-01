import Dexie, { type Table } from 'dexie'

export interface IdeaRecord {
  text: string
  /** ms since session start — needed for the serial-order effect analysis */
  atMs: number
  /** per-idea semantic distance from the prompt (SemDis-style) */
  distance?: number
}

export interface SessionMetrics {
  fluency: number
  originality: number
  peakOriginality: number
  flexibility: number
  elaboration: number
  /** originality(late half) − originality(early half). Beaty & Silvia serial-order effect. */
  serialGain: number
}

export interface SessionRecord {
  id: string
  exerciseId: string
  promptKey: string
  promptLabel: string
  startedAt: number
  durationMs: number
  ideas: IdeaRecord[]
  metrics: SessionMetrics
  /** free-text reflection captured after scoring */
  note?: string
  /** index of the idea the user predicted was their best, before seeing scores */
  judgedBestIndex?: number
  /** whether that prediction matched the top-scored idea */
  judgedCorrect?: boolean
  /** did the user see any AI suggestion during generation? */
  aiAssisted: boolean
}

export interface SettingsRecord {
  key: string
  value: unknown
}

class IdeaworksDB extends Dexie {
  sessions!: Table<SessionRecord, string>
  settings!: Table<SettingsRecord, string>

  constructor() {
    super('ideaworks')
    this.version(1).stores({
      sessions: 'id, exerciseId, startedAt',
      settings: 'key',
    })
  }
}

export const db = new IdeaworksDB()

/** Database name used before the app was renamed to Ideaworks. */
const LEGACY_DB = 'ideagym'

/**
 * Carry sessions over from the pre-rename database.
 *
 * The whole point of this app is a trend line measured over months, so a rename
 * must not quietly orphan someone's history. Runs once, is best-effort, and
 * never blocks startup: a failure here costs old sessions, not the app.
 */
export async function migrateLegacyDatabase(): Promise<number> {
  if (await getSetting('legacyMigrated', false)) return 0
  let moved = 0
  try {
    const existing = (await indexedDB.databases?.()) ?? []
    // If databases() is unsupported the list is empty; probing directly would
    // otherwise create an empty database as a side effect.
    if (existing.some((d) => d.name === LEGACY_DB)) {
      // Opened without a declared schema so Dexie adopts whatever version is
      // already on disk rather than triggering an upgrade.
      const legacy = new Dexie(LEGACY_DB)
      await legacy.open()
      if (legacy.tables.some((t) => t.name === 'sessions')) {
        const rows = (await legacy.table('sessions').toArray()) as SessionRecord[]
        const mine = new Set((await db.sessions.toCollection().primaryKeys()) as string[])
        const incoming = rows.filter((r) => r?.id && !mine.has(r.id))
        if (incoming.length) {
          await db.sessions.bulkPut(incoming)
          moved = incoming.length
        }
      }
      legacy.close()
      await Dexie.delete(LEGACY_DB)
    }
  } catch {
    // Best effort only — a broken legacy database must not break the new one.
  }
  await setSetting('legacyMigrated', true)
  return moved
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row ? (row.value as T) : fallback
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value })
}

export async function allSessions(): Promise<SessionRecord[]> {
  return db.sessions.orderBy('startedAt').toArray()
}
