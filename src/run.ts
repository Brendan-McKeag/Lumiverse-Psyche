declare const spindle: import('lumiverse-spindle-types').SpindleAPI

import {
  EMOTIONS,
  EMOTION_BY_KEY,
  EmotionDef,
  BehaviorClass,
  behaviorClass,
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
  /**
   * The character BIBLE: freeform, engine-authored STATIC canon. The light card
   * leaves blanks on purpose; the engine fills them with concrete invented facts
   * (history, tastes, skills, body specifics, relationships, quirks) and then
   * treats them as FIXED — never contradicting, only extending/refining. This is
   * what makes the character consistent and their own person across the run.
   */
  canon?: string
  /**
   * The character's own durable goals / desires / agenda — what THEY are trying
   * to get out of the scene and the relationship. Drives proactive behavior so
   * the roleplay is two-sided, not a compliant improv partner.
   */
  goals?: string[]
  /**
   * Present-tense "demeanor brief": an LLM-woven 2-4 sentence read of how this
   * character is ACTING right now, synthesized from the whole affect vector
   * (including conflicts). Refreshed each turn; the grounded readout below it is
   * always recomputed live so manual value edits still bite immediately.
   */
  demeanor?: string
  /** Dynamic: what they want right now and the move they are likely to make. */
  intent?: string
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
    canon: '',
    goals: [],
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

const v = (c: CharacterState, k: string) => c.emotions[k]?.value ?? 0

/** Salient unipolar feelings grouped by how they push behavior, strongest first. */
function groupedSalient(c: CharacterState): Record<BehaviorClass, { def: EmotionDef; value: number }[]> {
  const groups = {} as Record<BehaviorClass, { def: EmotionDef; value: number }[]>
  for (const def of EMOTIONS) {
    if (def.kind === 'bipolar') continue
    const val = v(c, def.key)
    if (val < SALIENT_UNI) continue
    const cls = behaviorClass(def.key)
    ;(groups[cls] ??= []).push({ def, value: val })
  }
  for (const k of Object.keys(groups) as BehaviorClass[]) groups[k].sort((a, b) => b.value - a.value)
  return groups
}

const fmtList = (rows: { def: EmotionDef; value: number }[]) =>
  rows
    .slice(0, 3)
    .map(({ def, value }) => `${def.label.toLowerCase().split(' (')[0]} (${describeValue(def, value).label})`)
    .join(', ')

/** Opposing strong feelings that should read as visible inner conflict. */
function detectTensions(c: CharacterState): string[] {
  const out: string[] = []
  const approach = Math.max(v(c, 'affection'), v(c, 'attraction'), v(c, 'desire'), v(c, 'tenderness'), v(c, 'trust'))
  const guard = Math.max(v(c, 'fear'), v(c, 'anxiety'), v(c, 'insecurity'), v(c, 'shame'), v(c, 'embarrassment'))
  if (v(c, 'desire') >= 0.45 && v(c, 'shame') >= 0.4) out.push('wants what they feel they should not — desire fighting shame')
  else if (approach >= 0.45 && guard >= 0.4) out.push('drawn closer but braced to be hurt — approach, then retreat')
  if (v(c, 'anger') >= 0.45 && Math.max(v(c, 'affection'), v(c, 'tenderness')) >= 0.4)
    out.push('angry at someone they still care for — heat over a tender spot')
  if (v(c, 'dominance') >= 0.45 && v(c, 'submission') >= 0.4) out.push('torn between taking control and giving in')
  if (v(c, 'sexual_arousal') >= 0.5 && v(c, 'trust') < 0.3 && Math.max(v(c, 'fear'), v(c, 'anxiety')) >= 0.3)
    out.push('aroused but not safe — wary of their own wanting')
  return out.slice(0, 2)
}

/**
 * The deterministic, always-current grounding: energy + agreeableness, feelings
 * grouped by behavioral pull, the power stance, and any inner tensions. Recomputed
 * from live values on every injection, so manual edits take effect immediately.
 */
export function groundedReadout(c: CharacterState): string {
  const lines: string[] = []
  lines.push(`  energy: ${describeValue(EMOTION_BY_KEY['valence'], v(c, 'valence')).meaning}`)
  lines.push(`  agreeableness: ${describeValue(EMOTION_BY_KEY['mood'], v(c, 'mood')).meaning}`)

  const g = groupedSalient(c)
  if (g.approach?.length) lines.push(`  pulling them toward you: ${fmtList(g.approach)}`)
  if (g.guard?.length) lines.push(`  holding back / wary: ${fmtList(g.guard)}`)
  if (g.down?.length) lines.push(`  weighing them down: ${fmtList(g.down)}`)
  if (g.aggression?.length) lines.push(`  sharp edge / friction: ${fmtList(g.aggression)}`)

  const power: string[] = []
  if (v(c, 'dominance') >= SALIENT_UNI) power.push('wants to take charge')
  if (v(c, 'submission') >= SALIENT_UNI) power.push('inclined to yield, defer')
  if (power.length) lines.push(`  power: ${power.join('; ')}`)

  for (const t of detectTensions(c)) lines.push(`  tension: ${t}`)

  if (lines.length === 2) lines.push('  (emotionally quiet, even-keeled)')
  return lines.join('\n')
}

const CANON_INJECT_CAP = 2200 // keep the bible from ballooning the prompt
const indent = (s: string, pad = '    ') => s.split('\n').map((l) => pad + l).join('\n')

function characterBlock(c: CharacterState): string {
  const lines: string[] = []
  lines.push(`## ${c.name}${c.isPrimary ? '' : ' (supporting character)'}`)

  if (c.demeanor && c.demeanor.trim()) lines.push(c.demeanor.trim())
  if (c.intent && c.intent.trim()) lines.push(`Wants right now / likely to: ${c.intent.trim()}`)

  lines.push('')
  lines.push('Underneath (embody — do not narrate or name any of this):')
  lines.push(groundedReadout(c))

  const goals = (c.goals ?? []).map((g) => g.trim()).filter(Boolean)
  if (goals.length) lines.push(`  goals & desires they are pursuing: ${goals.join('; ')}`)
  if (c.persona.trim()) lines.push(`  core personality & drives: ${c.persona.trim()}`)

  // Operational state sections (dynamic).
  for (const key of ['toward_player', 'attitude', 'state']) {
    const s = c.sheet[key]
    if (s && s.trim()) lines.push(`  ${key.replace(/_/g, ' ')}: ${s.trim()}`)
  }

  // The locked bible last — fixed facts the writer must honor.
  const canon = (c.canon ?? '').trim()
  if (canon) {
    lines.push('  established canon (FIXED — honor exactly, never contradict):')
    lines.push(indent(canon.slice(0, CANON_INJECT_CAP)))
  }
  return lines.join('\n')
}

/**
 * Build the system block injected for the active reply. We always include the
 * primary and any present supporting characters so multi-character scenes stay
 * coherent. Returns null when there is nothing seeded yet (so we inject nothing).
 */
export function buildDirective(run: RunState): string | null {
  const present = Object.values(run.characters).filter((c) => c.present)
  if (!present.length) return null
  present.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)) // primary first

  const blocks = present.map(characterBlock).join('\n\n')
  return [
    '[Psyche — character, agency & state]',
    'Each character below is an INDEPENDENT person with their own goals — not a',
    'compliant narrator, not a yes-man. Play them pursuing what THEY want: let them',
    'take initiative, start things, change the subject, make demands, set conditions,',
    'and push back, stall, or refuse when the player\'s lead cuts against their aims.',
    'They move the scene as much as the player does, toward their own desires.',
    '',
    'Act their state through behavior — posture, tone, word choice, what they reach',
    'for and hold back; let stronger feelings break composure and conflicting pulls',
    'show as push-and-pull. Treat their established canon as fixed truth. Never',
    'recite, name, or mention any of these notes — just live them.',
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
      if (entry) {
        // Migrate entries from the old disabled/non-constant scheme so they
        // actually inject (always-on, content-overwritten each turn).
        if (entry.disabled || !entry.constant) {
          await spindle.world_books.entries
            .update(meta.entryId, { disabled: false, constant: true }, userId)
            .catch(() => {})
        }
        return meta.entryId
      }
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
        // CONSTANT + enabled: a constant ("always-on") entry is injected into
        // every prompt regardless of keywords — the most reliable world-info
        // mechanism there is. We keep its CONTENT current by overwriting it each
        // turn, so there is no dependence on forced/mutated. The panel toggle is
        // honored by a world-info interceptor that disables it when off.
        disabled: false,
        constant: true,
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
