declare const spindle: import('lumiverse-spindle-types').SpindleAPI

import {
  EMOTIONS,
  EMOTION_BY_KEY,
  EmotionDef,
  describeValue,
  neutralVector,
} from './affect'

/* ------------------------------------------------------------------ *
 * Psyche — run state (per chat)
 *
 * Each chat is one roguelike RUN. A run is seeded once (a hidden persona +
 * starting temperament is rolled from the sparse card and a numeric seed),
 * then every non-player character in it is tracked with a live affect vector
 * and a free-form, engine-authored character sheet. Two chats with the same
 * card are two different runs with different state — that is the roguelike.
 *
 * The player character is NOT tracked here; we only model the characters the
 * player is interacting with.
 * ------------------------------------------------------------------ */

export interface CharacterState {
  /** stable slug within the run */
  id: string
  name: string
  /** the card's own character is the primary target; NPCs are secondary */
  isPrimary: boolean
  /** physical facts + summary, grounded in the card (markdown) */
  identity: string
  /** the hidden driver: personality, interests, agenda, voice (markdown) */
  persona: string
  /** is this character currently in the scene with the player? */
  present: boolean
  /** the 40-dim affect vector: per-key current value + resting baseline */
  emotions: Record<string, { value: number; baseline: number }>
  /** free-form, fully engine-controlled sheet sections (name -> markdown) */
  sheet: Record<string, string>
  updatedAt: number
}

export interface RunState {
  chatId: string
  /** the card's character id (the primary character) */
  characterId: string | null
  /** roguelike seed; drives the rolled persona so each run differs */
  seed: number
  /** true once the persona/temperament roll has happened */
  seeded: boolean
  /** characters in this run, keyed by slug */
  characters: Record<string, CharacterState>
  createdAt: number
  updatedAt: number
}

export const runPath = (chatId: string) => `runs/${chatId}.json`

export function emptyRun(chatId: string): RunState {
  const now = Date.now()
  return {
    chatId,
    characterId: null,
    seed: Math.floor(Math.random() * 1e9),
    seeded: false,
    characters: {},
    createdAt: now,
    updatedAt: now,
  }
}

export function newCharacter(id: string, name: string, isPrimary: boolean): CharacterState {
  return {
    id,
    name,
    isPrimary,
    identity: '',
    persona: '',
    present: isPrimary,
    emotions: neutralVector(),
    sheet: {},
    updatedAt: Date.now(),
  }
}

/** Ensure every defined emotion exists on a character (schema migrations). */
export function backfillEmotions(c: CharacterState) {
  const nv = neutralVector()
  for (const k of Object.keys(nv)) if (!c.emotions[k]) c.emotions[k] = nv[k]
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return base || `npc_${Math.random().toString(36).slice(2, 7)}`
}

/* ----------------- live state -> injected directive ---------------- */
/*
 * The most important output of the whole engine: a compact block describing
 * how each present character feels RIGHT NOW, injected into the reply
 * generation so the visible character actually behaves the emotion. Numbers
 * are translated to behavioral language; we never ask the model to recite a
 * value.
 */

const SALIENT_UNI = 0.25 // unipolar feelings at/above this are worth mentioning
const SALIENT_BI = 0.2 // bipolar axes beyond this magnitude are worth mentioning
const MAX_SALIENT = 9

function salientEmotions(c: CharacterState): { def: EmotionDef; value: number }[] {
  const rows: { def: EmotionDef; value: number }[] = []
  for (const def of EMOTIONS) {
    if (def.kind === 'bipolar') continue // valence/mood are rendered separately
    const v = c.emotions[def.key]?.value ?? 0
    if (v >= SALIENT_UNI) rows.push({ def, value: v })
  }
  rows.sort((a, b) => b.value - a.value)
  return rows.slice(0, MAX_SALIENT)
}

function characterBlock(c: CharacterState): string {
  const lines: string[] = []
  lines.push(`## ${c.name}${c.isPrimary ? '' : ' (supporting character)'}`)

  const valence = c.emotions['valence']?.value ?? 0
  const mood = c.emotions['mood']?.value ?? 0
  const vDesc = describeValue(EMOTION_BY_KEY['valence'], valence)
  const mDesc = describeValue(EMOTION_BY_KEY['mood'], mood)
  lines.push(`- Energy (valence): ${vDesc.meaning}.`)
  lines.push(`- Agreeableness (mood): ${mDesc.meaning}.`)

  const sal = salientEmotions(c)
  if (sal.length) {
    const parts = sal.map(({ def, value }) => {
      const d = describeValue(def, value)
      return `${def.label.toLowerCase()} (${d.label})`
    })
    lines.push(`- Felt right now: ${parts.join(', ')}.`)
  } else {
    lines.push('- Felt right now: emotionally quiet, even-keeled.')
  }

  if (c.persona.trim()) {
    lines.push(`- Who they are (drives their choices): ${c.persona.trim()}`)
  }
  // Surface a couple of the most behaviorally-relevant sheet sections if present.
  for (const key of ['goal', 'goals', 'agenda', 'toward_player', 'attitude', 'state']) {
    const v = c.sheet[key]
    if (v && v.trim()) lines.push(`- ${key.replace(/_/g, ' ')}: ${v.trim()}`)
  }
  return lines.join('\n')
}

/**
 * Build the system block injected for the active reply. `activeCharacterId`
 * is the card character speaking this turn; we always include the primary and
 * any present supporting characters so multi-character scenes stay coherent.
 * Returns null when there is nothing seeded yet (so we inject nothing).
 */
export function buildDirective(run: RunState): string | null {
  const present = Object.values(run.characters).filter((c) => c.present)
  if (!present.length) return null
  // Primary first, then supporting characters.
  present.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))

  const blocks = present.map(characterBlock).join('\n\n')
  return [
    '[Psyche — current emotional state]',
    'Portray the following character(s) so their behavior, word choice, body',
    'language and choices honestly express how they feel right now. Stronger',
    'feelings should show more and be harder for them to hide; an all-consuming',
    'feeling overrides their composure and pushes them to extremes. Never state',
    'these values or mechanics out loud — just embody them in the prose.',
    '',
    blocks,
  ].join('\n')
}

/* ------------------- injection-entry provisioning ------------------ */
/*
 * Live state reaches the visible reply through ONE world-book entry per
 * character card, force-injected (and content-overridden) at generation time
 * by the world-info interceptor. The entry is disabled at rest, so when the
 * extension is turned off it injects nothing and the prompt is fully normal.
 *
 * We never touch the user's own books — we own a dedicated "<name> — Psyche"
 * book per card and remember it in per-character meta.
 */

export const PSYCHE_EXT = 'psyche'
export const injectMetaPath = (cid: string) => `inject/${cid}.json`

interface InjectMeta {
  bookId: string
  entryId: string
}

/** True when a world-info entry is our injection placeholder. */
export function isInjectionEntry(extensions: Record<string, unknown> | undefined): boolean {
  const wf = extensions?.[PSYCHE_EXT] as { inject?: boolean } | undefined
  return Boolean(wf?.inject)
}

/**
 * Ensure the card character has our dedicated book + placeholder entry, and
 * return the entry id. Idempotent and cheap on the warm path (one storage
 * read). Safe to call once per turn from the after-reply handler.
 */
export async function ensureInjectionEntry(
  characterId: string,
  characterName: string,
  userId?: string,
): Promise<string | null> {
  try {
    const meta = await spindle.storage.getJson<InjectMeta | null>(injectMetaPath(characterId), {
      fallback: null,
    })
    if (meta?.entryId) {
      const entry = await spindle.world_books.entries.get(meta.entryId, userId).catch(() => null)
      if (entry) return meta.entryId
    }

    // Provision a fresh book + entry and attach the book to the card.
    const book = await spindle.world_books.create(
      {
        name: `${characterName || 'Character'} — Psyche`,
        description: 'Live emotional state injected by the Psyche extension. Managed automatically.',
        metadata: { psyche: true },
      },
      userId,
    )
    const entry = await spindle.world_books.entries.create(
      book.id,
      {
        comment: '[Psyche] live emotional state',
        content: '(emotional state will appear here while Psyche is active)',
        key: ['__psyche_state__'],
        // Disabled at rest -> nothing injects when the extension is off. The
        // interceptor force-injects + content-overrides it while running.
        disabled: true,
        constant: false,
        extensions: { [PSYCHE_EXT]: { inject: true } },
      },
      userId,
    )

    const char = await spindle.characters.get(characterId, userId).catch(() => null)
    const current = char?.world_book_ids ?? []
    if (!current.includes(book.id)) {
      await spindle.characters.update(characterId, { world_book_ids: [...current, book.id] }, userId)
    }

    await spindle.storage.setJson(injectMetaPath(characterId), { bookId: book.id, entryId: entry.id })
    spindle.log.info(`[psyche] provisioned injection entry ${entry.id} for character ${characterId}`)
    return entry.id
  } catch (err) {
    spindle.log.error(`[psyche] ensureInjectionEntry failed: ${String(err)}`)
    return null
  }
}
