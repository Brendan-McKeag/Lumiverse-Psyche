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
      `Nudge ONE feeling up or down in response to what just happened — the primary way you move a mind. \`intensity\` is the signed strength of the event: a passing pleasantry +0.5, a normal meaningful moment +1 to +2, a strong emotional beat +3 to +5, a genuine shock +6 to +8; negative values relieve the feeling. Feelings saturate HARD, so from rest +1 only reaches ~0.22, +3 ~0.53, +5 ~0.71, and crossing 0.9 needs ~+9 of pressure accumulated over many turns — high values must be earned, never granted by one nice exchange. Valid emotions: ${EMOTION_LIST}.`,
    parameters: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        emotion: { type: 'string', description: 'One emotion key from the valid list.' },
        intensity: { type: 'number', description: 'Signed event strength, typically -8..+8 (most turns ±0.5..2).' },
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
    name: 'update_canon',
    description:
      'Add to (or rewrite) the character BIBLE — the freeform store of established STATIC facts the light card deliberately leaves blank: history, upbringing, tastes, skills, body specifics, relationships, beliefs, quirks, speech habits. PROACTIVELY INVENT concrete, specific facts to make this character fully their own person; a vague character is a failure. Once you write a fact here, treat it as FIXED canon and never contradict it later — only extend it. mode "append" (default) adds newly-established facts; "replace" reorganizes/condenses the whole bible without discarding established truth.',
    parameters: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        content: { type: 'string', description: 'Concrete, specific fact(s) to record (markdown).' },
        mode: { type: 'string', enum: ['append', 'replace'], description: 'append (default) or replace the whole bible.' },
      },
      required: ['character_id', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_goals',
    description:
      "Set the character's durable goals / desires / agenda — what THEY want out of this scene, the player, and their own life, in their own self-interest. This drives proactive, independent behavior so the roleplay is two-sided rather than a compliant partner. Replaces the goal list; keep 1-5 concrete, motivating goals and revise them as the character's aims genuinely shift.",
    parameters: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        goals: { type: 'array', items: { type: 'string' }, description: 'Concrete goals/desires, most pressing first.' },
      },
      required: ['character_id', 'goals'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_sheet',
    description:
      "Create or overwrite a free-form section of a character's sheet — dynamic operational state, not static lore (lore goes in update_canon). Use lower_snake_case names. Sections surfaced into the reply when present: toward_player, attitude, state. Other examples: location, plans, secrets_in_play. Use remove_sheet_section to delete.",
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
        `goals: ${(c.goals ?? []).length ? (c.goals ?? []).join('; ') : '(none yet)'}`,
        `canon (FIXED facts — preserve, only extend):\n${(c.canon ?? '').trim() || '  (none yet — flesh this out)'}`,
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

    case 'update_canon': {
      const c = find(run, str(args, 'character_id'))
      if (!c) return `No character "${str(args, 'character_id')}".`
      const content = str(args, 'content').trim()
      if (!content) return 'update_canon requires content.'
      const mode = str(args, 'mode', 'append')
      if (mode === 'replace') {
        c.canon = content
      } else {
        c.canon = [(c.canon ?? '').trim(), content].filter(Boolean).join('\n')
      }
      c.updatedAt = Date.now()
      return `${c.id} canon ${mode === 'replace' ? 'rewritten' : 'extended'} (now ${(c.canon ?? '').length} chars).`
    }

    case 'set_goals': {
      const c = find(run, str(args, 'character_id'))
      if (!c) return `No character "${str(args, 'character_id')}".`
      const goals = Array.isArray(args.goals)
        ? (args.goals as unknown[]).filter((x) => typeof x === 'string').map((x) => (x as string).trim()).filter(Boolean)
        : []
      c.goals = goals
      c.updatedAt = Date.now()
      return `${c.id} goals set (${goals.length}): ${goals.join('; ') || '(none)'}`
    }

    default:
      return `Unknown tool ${name}.`
  }
}
