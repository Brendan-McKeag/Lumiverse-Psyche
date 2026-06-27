declare const spindle: import('lumiverse-spindle-types').SpindleAPI

import {
  EMOTION_BY_KEY,
  EMOTION_KEYS,
  EMOTIONS,
  applyStimulus,
  describeValue,
} from './affect'
import { CharacterState, RunState, newCharacter, slugify, backfillEmotions } from './run'

/* ------------------------------------------------------------------ *
 * Psyche — agent tools
 *
 * The post-turn engine drives a character's mind through these tools,
 * Claude Code-style: it reads the current sheet + feelings, then applies
 * stimulus to emotions, edits free-form sheet sections, and creates /
 * updates / deletes the supporting characters in the scene. All executors
 * mutate the in-memory RunState; the backend persists it afterward.
 * ------------------------------------------------------------------ */

export interface ToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
}

type Args = Record<string, unknown>
const str = (a: Args, k: string, d = '') => (typeof a[k] === 'string' ? (a[k] as string) : d)
const num = (a: Args, k: string): number | null => {
  const v = a[k]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
const bool = (a: Args, k: string) => Boolean(a[k])

const EMOTION_LIST = EMOTION_KEYS.join(', ')

/* ----------------------------- schemas ----------------------------- */

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'list_characters',
    description:
      'List every character tracked in this run — id, name, whether primary (the card character) or a supporting NPC, and whether present in the scene. Call first to orient yourself.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'read_character',
    description:
      "Read one character in full: identity, hidden persona, presence, every sheet section, and their current affect vector (each feeling's value + resting baseline). Read before you revise so you preserve what is established.",
    parameters: {
      type: 'object',
      properties: { character_id: { type: 'string' } },
      required: ['character_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_character',
    description:
      'Introduce a new supporting character (NPC) that has entered the run. Give them a name and, if established, a grounded identity and a hidden persona (their private driver). Do NOT create the player. Only create characters the story actually introduces.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        identity: { type: 'string', description: 'Physical facts + summary established so far (markdown ok).' },
        persona: { type: 'string', description: 'Hidden driver: personality, interests, agenda, voice.' },
        present: { type: 'boolean', description: 'Are they in the scene with the player right now?' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_character',
    description:
      "Revise a character's grounded identity, hidden persona, or name. Only provided fields change. Identity must stay faithful to the card/story — never invent basic facts (species, sex, age, appearance); leave unestablished facts out.",
    parameters: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        identity: { type: 'string' },
        persona: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['character_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_present',
    description:
      'Mark whether a character is currently in the scene with the player. Only present characters have their emotional state injected into the reply. Off-scene characters keep their state frozen until they return.',
    parameters: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        present: { type: 'boolean' },
      },
      required: ['character_id', 'present'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_character',
    description:
      'Remove a character from the run entirely (e.g. they were merged, never mattered, or are permanently gone). Irreversible.',
    parameters: {
      type: 'object',
      properties: { character_id: { type: 'string' } },
      required: ['character_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'apply_stimulus',
    description:
      `Nudge ONE feeling up or down in response to what just happened — the primary way you move a mind. \`intensity\` is a signed push: roughly +0.5 a faint touch, +1 an ordinary jolt, +2 a strong blow, +3 life-altering; negative values relieve the feeling. Because feelings saturate, the same intensity moves a calm character far more than an already-overwhelmed one, so pushing a feeling toward its extreme gets exponentially harder — apply repeated/large stimulus across turns to approach 1.0. Valid emotions: ${EMOTION_LIST}.`,
    parameters: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        emotion: { type: 'string', description: 'One emotion key from the valid list.' },
        intensity: { type: 'number', description: 'Signed push, typically -3..+3.' },
        reason: { type: 'string', description: 'Brief why, for the log/panel.' },
      },
      required: ['character_id', 'emotion', 'intensity'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_emotion',
    description:
      'Hard-set ONE feeling to an exact value, bypassing the saturation curve. Use sparingly — for seeding a starting state or a narrative reset (e.g. a shock that instantly maxes fear). Unipolar feelings take 0..1; valence and mood take -1..1.',
    parameters: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        emotion: { type: 'string' },
        value: { type: 'number' },
        reason: { type: 'string' },
      },
      required: ['character_id', 'emotion', 'value'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_baseline',
    description:
      "Set a feeling's resting baseline — the temperament it relaxes toward over time when nothing feeds it. Use to shape lasting personality shifts (e.g. growing trust makes wariness rest lower). Same ranges as set_emotion.",
    parameters: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        emotion: { type: 'string' },
        value: { type: 'number' },
      },
      required: ['character_id', 'emotion', 'value'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_sheet',
    description:
      "Create or overwrite a free-form section of a character's sheet (you have full authority over its structure). Use lower_snake_case section names. Recommended sections that get surfaced into the reply when present: goal, agenda, toward_player, attitude, state. Other examples: appearance, relationships, secrets, body, history. Pass empty content to leave a section unchanged is NOT supported — use remove_sheet_section to delete.",
    parameters: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        section: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['character_id', 'section', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'remove_sheet_section',
    description: "Delete a section from a character's sheet.",
    parameters: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        section: { type: 'string' },
      },
      required: ['character_id', 'section'],
      additionalProperties: false,
    },
  },
]

/* ---------------------------- executors ---------------------------- */

function find(run: RunState, id: string): CharacterState | null {
  if (run.characters[id]) return run.characters[id]
  // tolerate the model passing a name instead of a slug
  const slug = slugify(id)
  if (run.characters[slug]) return run.characters[slug]
  const byName = Object.values(run.characters).find(
    (c) => c.name.toLowerCase() === id.toLowerCase(),
  )
  return byName ?? null
}

function clampForKind(key: string, value: number): number {
  const def = EMOTION_BY_KEY[key]
  if (!def) return value
  return def.kind === 'bipolar'
    ? Math.max(-1, Math.min(1, value))
    : Math.max(0, Math.min(1, value))
}

export async function executeTool(
  run: RunState,
  name: string,
  args: Args,
): Promise<string> {
  switch (name) {
    case 'list_characters': {
      const rows = Object.values(run.characters)
      if (!rows.length) return 'No characters tracked yet.'
      return rows
        .map(
          (c) =>
            `- ${c.id} — ${c.name} [${c.isPrimary ? 'primary' : 'supporting'}, ${
              c.present ? 'present' : 'off-scene'
            }]`,
        )
        .join('\n')
    }

    case 'read_character': {
      const c = find(run, str(args, 'character_id'))
      if (!c) return `No character "${str(args, 'character_id')}".`
      const feelings = EMOTIONS.map((def) => {
        const e = c.emotions[def.key] ?? { value: 0, baseline: 0 }
        const d = describeValue(def, e.value)
        return `  ${def.key}: ${e.value.toFixed(3)} (${d.label}) [baseline ${e.baseline.toFixed(2)}]`
      }).join('\n')
      const sheet = Object.entries(c.sheet)
        .map(([k, v]) => `  [${k}]\n  ${v.replace(/\n/g, '\n  ')}`)
        .join('\n')
      return [
        `id: ${c.id}`,
        `name: ${c.name}`,
        `role: ${c.isPrimary ? 'primary (card character)' : 'supporting'}`,
        `present: ${c.present}`,
        `identity: ${c.identity || '(none yet)'}`,
        `persona: ${c.persona || '(none yet)'}`,
        `sheet:\n${sheet || '  (empty)'}`,
        `affect:\n${feelings}`,
      ].join('\n')
    }

    case 'create_character': {
      const cname = str(args, 'name').trim()
      if (!cname) return 'create_character requires a name.'
      let id = slugify(cname)
      if (run.characters[id]) id = `${id}_${Math.random().toString(36).slice(2, 5)}`
      const c = newCharacter(id, cname, false)
      c.identity = str(args, 'identity')
      c.persona = str(args, 'persona')
      c.present = args.present === undefined ? true : bool(args, 'present')
      run.characters[id] = c
      return `Created supporting character ${id} (${cname}).`
    }

    case 'update_character': {
      const c = find(run, str(args, 'character_id'))
      if (!c) return `No character "${str(args, 'character_id')}".`
      if (typeof args.identity === 'string') c.identity = args.identity
      if (typeof args.persona === 'string') c.persona = args.persona
      if (typeof args.name === 'string' && args.name.trim()) c.name = args.name.trim()
      c.updatedAt = Date.now()
      return `Updated ${c.id}.`
    }

    case 'set_present': {
      const c = find(run, str(args, 'character_id'))
      if (!c) return `No character "${str(args, 'character_id')}".`
      c.present = bool(args, 'present')
      c.updatedAt = Date.now()
      return `${c.id} is now ${c.present ? 'present' : 'off-scene'}.`
    }

    case 'delete_character': {
      const c = find(run, str(args, 'character_id'))
      if (!c) return `No character "${str(args, 'character_id')}".`
      if (c.isPrimary) return 'Refusing to delete the primary card character.'
      delete run.characters[c.id]
      return `Deleted ${c.id}.`
    }

    case 'apply_stimulus': {
      const c = find(run, str(args, 'character_id'))
      if (!c) return `No character "${str(args, 'character_id')}".`
      const key = str(args, 'emotion').trim()
      const def = EMOTION_BY_KEY[key]
      if (!def) return `Unknown emotion "${key}". Valid: ${EMOTION_LIST}.`
      const intensity = num(args, 'intensity')
      if (intensity === null) return 'apply_stimulus requires a numeric intensity.'
      backfillEmotions(c)
      const before = c.emotions[key].value
      const after = applyStimulus(def, before, intensity)
      c.emotions[key].value = after
      c.updatedAt = Date.now()
      const d = describeValue(def, after)
      return `${c.id} ${key}: ${before.toFixed(3)} -> ${after.toFixed(3)} (${d.label}).`
    }

    case 'set_emotion': {
      const c = find(run, str(args, 'character_id'))
      if (!c) return `No character "${str(args, 'character_id')}".`
      const key = str(args, 'emotion').trim()
      const def = EMOTION_BY_KEY[key]
      if (!def) return `Unknown emotion "${key}". Valid: ${EMOTION_LIST}.`
      const value = num(args, 'value')
      if (value === null) return 'set_emotion requires a numeric value.'
      backfillEmotions(c)
      const v = clampForKind(key, value)
      c.emotions[key].value = v
      c.updatedAt = Date.now()
      return `${c.id} ${key} set to ${v.toFixed(3)} (${describeValue(def, v).label}).`
    }

    case 'set_baseline': {
      const c = find(run, str(args, 'character_id'))
      if (!c) return `No character "${str(args, 'character_id')}".`
      const key = str(args, 'emotion').trim()
      if (!EMOTION_BY_KEY[key]) return `Unknown emotion "${key}". Valid: ${EMOTION_LIST}.`
      const value = num(args, 'value')
      if (value === null) return 'set_baseline requires a numeric value.'
      backfillEmotions(c)
      c.emotions[key].baseline = clampForKind(key, value)
      c.updatedAt = Date.now()
      return `${c.id} ${key} baseline set to ${c.emotions[key].baseline.toFixed(3)}.`
    }

    case 'update_sheet': {
      const c = find(run, str(args, 'character_id'))
      if (!c) return `No character "${str(args, 'character_id')}".`
      const section = slugify(str(args, 'section'))
      if (!section) return 'update_sheet requires a section name.'
      const content = str(args, 'content')
      if (!content.trim()) return 'update_sheet requires non-empty content (use remove_sheet_section to delete).'
      c.sheet[section] = content
      c.updatedAt = Date.now()
      return `${c.id} sheet section [${section}] updated.`
    }

    case 'remove_sheet_section': {
      const c = find(run, str(args, 'character_id'))
      if (!c) return `No character "${str(args, 'character_id')}".`
      const section = slugify(str(args, 'section'))
      if (c.sheet[section]) {
        delete c.sheet[section]
        c.updatedAt = Date.now()
        return `${c.id} sheet section [${section}] removed.`
      }
      return `No sheet section [${section}] on ${c.id}.`
    }

    default:
      return `Unknown tool ${name}.`
  }
}
