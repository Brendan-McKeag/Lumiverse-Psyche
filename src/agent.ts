declare const spindle: import('lumiverse-spindle-types').SpindleAPI
type LlmMessage = import('lumiverse-spindle-types').LlmMessageDTO

import { TOOL_SCHEMAS, executeTool } from './tools'
import { RunState, CharacterState, newCharacter, backfillEmotions } from './run'
import {
  EMOTIONS,
  EMOTION_BY_KEY,
  describeValue,
  genericScaleText,
  EmotionDef,
} from './affect'

/* ------------------------------------------------------------------ *
 * Psyche — the mind engine
 *
 * Two LLM jobs, both run quietly out-of-band on the user's own model:
 *
 *  1. seedRun()  — once per run, roll a hidden persona + starting
 *     temperament from the deliberately sparse card and the run's seed.
 *     This is the roguelike differentiator: same card, different seed,
 *     different character.
 *
 *  2. runPsycheAgent() — after every reply, update each character's affect
 *     vector (via stimulus) and rewrite their sheet, Claude Code-style, in
 *     a tool loop against the whole story so far.
 * ------------------------------------------------------------------ */

const AGENT_SENTINEL = '<<psyche_engine>>'

/* one-line anchors for every feeling, so the engine calibrates consistently */
function emotionGlossary(): string {
  return EMOTIONS.map((e) => {
    const range = e.kind === 'bipolar' ? '(-1..1)' : '(0..1)'
    return `  ${e.key} ${range} — ${e.blurb}`
  }).join('\n')
}

/* --------------------------- seeding ------------------------------- */

interface SeedResult {
  identity?: string
  persona?: string
  baselines?: Record<string, number>
  opening_state?: Record<string, number>
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

function seedSystemPrompt(): string {
  return [
    AGENT_SENTINEL,
    'You are Psyche, a casting director for a roguelike roleplay. You are given a',
    'deliberately THIN character card and a numeric SEED. Your job: roll one concrete',
    'instance of this character for this run.',
    '',
    'The seed is your randomizer. Different seeds MUST yield distinctly different but',
    'card-consistent people — different temperament, leanings, agenda, and starting',
    'mood. Do not default to the blandest or most obvious reading. Commit to specifics',
    'the card leaves open (without contradicting anything the card states).',
    '',
    'Stay faithful to every basic fact the card DOES state (species, sex, age,',
    'appearance, name). Never contradict or "correct" them.',
    '',
    'Return ONLY JSON of this shape:',
    '{',
    '  "identity": "physical facts + grounded summary, faithful to the card",',
    '  "persona": "the hidden driver: personality, interests, wants, fears, voice, how',
    '              they treat people — 2-5 sentences that will steer how they act",',
    '  "baselines": { "<emotion>": <resting value>, ... },',
    '  "opening_state": { "<emotion>": <current value at scene start>, ... }',
    '}',
    '',
    'baselines = resting temperament this character relaxes toward. opening_state =',
    'how they feel as the scene opens (may differ from baseline). Only include the',
    'emotions that matter for this character; the rest default to quiet. Unipolar',
    'emotions take 0..1, valence and mood take -1..1.',
    '',
    'Emotions you may set:',
    emotionGlossary(),
  ].join('\n')
}

/** Roll and apply the primary character's persona + starting affect for a run. */
export async function seedRun(
  run: RunState,
  primary: CharacterState,
  cardContext: string,
  opts: { signal?: AbortSignal; userId?: string },
): Promise<string> {
  const messages: LlmMessage[] = [
    { role: 'system', content: seedSystemPrompt() },
    {
      role: 'user',
      content: [
        `SEED: ${run.seed}`,
        '',
        'CHARACTER CARD:',
        '"""',
        cardContext || '(the card is essentially empty — invent freely but plausibly)',
        '"""',
        '',
        'Roll this run\'s instance now. Return only the JSON.',
      ].join('\n'),
    },
  ]

  const res = (await spindle.generate.quiet({
    type: 'quiet',
    messages,
    parameters: { temperature: 1.0 },
    reasoning: { source: 'off' },
    signal: opts.signal,
    userId: opts.userId,
  })) as { content?: string }

  const parsed = extractJson(res.content ?? '') as SeedResult | null
  backfillEmotions(primary)
  if (!parsed) {
    primary.identity = cardContext.slice(0, 1200)
    return 'seed: model returned no usable JSON; applied card as identity.'
  }

  if (typeof parsed.identity === 'string' && parsed.identity.trim()) primary.identity = parsed.identity.trim()
  else primary.identity = cardContext.slice(0, 1200)
  if (typeof parsed.persona === 'string') primary.persona = parsed.persona.trim()

  const setOne = (key: string, value: unknown, which: 'baseline' | 'value') => {
    const def = EMOTION_BY_KEY[key]
    if (!def || typeof value !== 'number' || !Number.isFinite(value)) return
    const v = def.kind === 'bipolar' ? Math.max(-1, Math.min(1, value)) : Math.max(0, Math.min(1, value))
    if (which === 'baseline') {
      primary.emotions[key].baseline = v
      primary.emotions[key].value = v // start at the baseline unless opening_state overrides
    } else {
      primary.emotions[key].value = v
    }
  }
  for (const [k, v] of Object.entries(parsed.baselines ?? {})) setOne(k, v, 'baseline')
  for (const [k, v] of Object.entries(parsed.opening_state ?? {})) setOne(k, v, 'value')

  primary.updatedAt = Date.now()
  return `seed ${run.seed}: rolled persona + starting temperament.`
}

/* ----------------------- post-turn update -------------------------- */

export interface AgentResult {
  rounds: number
  toolCalls: { tool: string; result: string }[]
  finalNote: string
}

function updateSystemPrompt(directive: string): string {
  return [
    AGENT_SENTINEL,
    'You are Psyche, the silent mind-engine behind a roleplay. You are NOT speaking to',
    'the player. After each exchange you update how the non-player characters FEEL and',
    'what their sheets say, so the next reply is driven by an honest inner life.',
    '',
    'THE AFFECT MODEL. Each character carries 40 feelings. 38 are unipolar (0 = absent,',
    '1 = all-consuming, drives them to extremes). Two are bipolar in -1..1: valence',
    '(energy/psychological arousal) and mood (agreeableness). This is an adult engine —',
    'sexual_arousal is a normal, first-class feeling to track when the scene warrants.',
    '',
    'SATURATION. Feelings resist their extremes. apply_stimulus pushes in a saturating',
    'space, so the same intensity moves a calm mind far more than an overwhelmed one;',
    'reaching 0.9+ takes sustained, strong, repeated pressure over turns. Move feelings',
    'with apply_stimulus in proportion to what actually happened this turn — a glance is',
    '+0.3, a confession +1.5, a betrayal +3 to the wronged feeling and negative to trust.',
    'Reserve set_emotion for shocks/resets that genuinely snap a feeling to a value.',
    '',
    'WHAT TO DO EACH TURN:',
    '  • Update the affect of every character PRESENT in the scene, based on what was',
    '    said and done to and by them. Relieve feelings that the moment soothed',
    '    (negative intensity) as readily as you raise ones it provoked.',
    '  • Rewrite their sheet sections as facts change — goals, attitude toward the',
    '    player, relationships, secrets, body state. You have full authority to add,',
    '    edit, and delete sections (update_sheet / remove_sheet_section).',
    '  • Introduce supporting characters the story brings in (create_character) and set',
    '    who is present (set_present). Advance their persona as they reveal themselves.',
    '  • Occasionally nudge a baseline (set_baseline) when a lasting change of',
    '    temperament is earned — not every turn.',
    '',
    'FIDELITY. Never invent basic facts (species, sex, age, name, appearance). Keep the',
    'card as the source of truth for the primary character. If something is not',
    'established, leave it out rather than guess. Read a character before you rewrite it.',
    '',
    'ECONOMY. You see the whole story each run, but do not redo the whole mind every',
    'turn. Make the changes THIS turn warrants, then stop. When done, reply with a',
    'one-line summary and no tool calls.',
    directive.trim() ? `\nOPERATOR DIRECTIVE:\n${directive.trim()}` : '',
  ].join('\n')
}

function emotionSummary(c: CharacterState): string {
  const notable = EMOTIONS.filter((def) => {
    const v = c.emotions[def.key]?.value ?? 0
    return def.kind === 'bipolar' ? Math.abs(v) >= 0.15 : v >= 0.2
  })
    .map((def) => {
      const v = c.emotions[def.key]?.value ?? 0
      return `${def.key} ${v.toFixed(2)} (${describeValue(def, v).label})`
    })
    .join(', ')
  return notable || 'all quiet'
}

function stateSnapshot(run: RunState): string {
  const chars = Object.values(run.characters)
  if (!chars.length) return '(no characters tracked yet)'
  return chars
    .map((c) => {
      const sheetKeys = Object.keys(c.sheet)
      return [
        `### ${c.id} — ${c.name} [${c.isPrimary ? 'primary' : 'supporting'}, ${c.present ? 'present' : 'off-scene'}]`,
        c.persona ? `persona: ${c.persona}` : 'persona: (none)',
        `feelings: ${emotionSummary(c)}`,
        `sheet sections: ${sheetKeys.length ? sheetKeys.join(', ') : '(none)'}`,
      ].join('\n')
    })
    .join('\n\n')
}

export async function runPsycheAgent(
  run: RunState,
  transcript: string,
  cardContext: string,
  opts: { maxRounds: number; directive: string; signal?: AbortSignal; userId?: string },
): Promise<AgentResult> {
  const messages: LlmMessage[] = [
    { role: 'system', content: updateSystemPrompt(opts.directive) },
    {
      role: 'user',
      content: [
        'THE SCALE (what each level means):',
        genericScaleText(),
        '',
        cardContext
          ? ['PRIMARY CHARACTER CARD (source of truth for basic facts):', '"""', cardContext, '"""', ''].join('\n')
          : '',
        'CURRENT TRACKED STATE:',
        stateSnapshot(run),
        '',
        'THE FULL STORY SO FAR (oldest first, the most recent turn last):',
        '"""',
        transcript,
        '"""',
        '',
        'Update the present characters now: move their feelings to reflect what just',
        'happened (apply_stimulus, occasionally set_emotion/set_baseline), revise their',
        'sheets, and add/admit any new characters. Read before you rewrite. Be economical.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ]

  const toolCalls: { tool: string; result: string }[] = []
  let rounds = 0
  let finalNote = ''

  for (; rounds < opts.maxRounds; rounds++) {
    const res = (await spindle.generate.quiet({
      type: 'quiet',
      messages,
      tools: TOOL_SCHEMAS,
      parameters: { temperature: 0.6 },
      reasoning: { source: 'off' },
      signal: opts.signal,
      userId: opts.userId,
    })) as {
      content?: string
      tool_calls?: { name: string; args: Record<string, unknown>; call_id: string }[]
    }

    const calls = res.tool_calls ?? []
    if (calls.length === 0) {
      finalNote = (res.content ?? '').trim()
      break
    }

    messages.push({
      role: 'assistant',
      content: calls.map((c) => ({
        type: 'tool_use' as const,
        id: c.call_id,
        name: c.name,
        input: c.args,
      })),
    })

    const resultParts = []
    for (const c of calls) {
      let result: string
      try {
        result = await executeTool(run, c.name, c.args)
      } catch (err) {
        result = `Error in ${c.name}: ${String(err)}`
      }
      toolCalls.push({ tool: c.name, result })
      resultParts.push({ type: 'tool_result' as const, tool_use_id: c.call_id, content: result })
    }
    messages.push({ role: 'user', content: resultParts })
  }

  return { rounds, toolCalls, finalNote }
}

export { AGENT_SENTINEL, EmotionDef }
