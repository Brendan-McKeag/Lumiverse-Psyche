declare const spindle: import('lumiverse-spindle-types').SpindleAPI
type LlmMessage = import('lumiverse-spindle-types').LlmMessageDTO

import { TOOL_SCHEMAS, executeTool } from './tools'
import { RunState, CharacterState, newCharacter, backfillEmotions, groundedReadout } from './run'
import {
  EMOTIONS,
  EMOTION_BY_KEY,
  describeValue,
  genericScaleText,
  clampSeed,
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
  canon?: string
  goals?: string[]
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
    'Commit to a real, specific person — invent concrete details (background, tastes,',
    'skills, quirks, relationships, body specifics) to fill the blanks the card leaves.',
    'Give them their OWN goals and desires so they are a player in the scene, not a',
    'mirror for whoever they meet.',
    '',
    'Return ONLY JSON of this shape:',
    '{',
    '  "identity": "physical facts + grounded summary, faithful to the card",',
    '  "persona": "the hidden driver: personality, interests, wants, fears, voice, how',
    '              they treat people — 2-5 sentences that will steer how they act",',
    '  "canon": "established STATIC facts you are inventing to make them specific:',
    '            history, upbringing, tastes, skills, relationships, quirks, speech.',
    '            Concrete bullet-like sentences. This becomes fixed truth for the run.",',
    '  "goals": ["1-5 concrete things THEY want — out of life, the scene, whoever they',
    '            meet — in their own self-interest, most pressing first"],',
    '  "baselines": { "<emotion>": <resting value>, ... },',
    '  "opening_state": { "<emotion>": <current value at scene start>, ... }',
    '}',
    '',
    'baselines = resting temperament this character relaxes toward. opening_state =',
    'how they feel as the scene opens (may differ from baseline). Unipolar emotions',
    'take 0..1, valence and mood take -1..1.',
    '',
    'CALIBRATION — this matters. High values are RARE and are meant to be earned',
    'through play, not handed out at the start:',
    '  • 0.5 already means a feeling clearly colors everything they do. 0.8+ means it',
    '    is breaking their composure. 0.9+ is overwhelming. A character meeting someone',
    '    for the first time is NOT overwhelmed.',
    '  • Keep MOST feelings at or near 0. Choose only 2-4 that genuinely define this',
    '    character and give them MODEST values (roughly 0.15-0.4). Do not light up half',
    '    the list.',
    '  • baselines should sit low (mostly 0.05-0.3); a defining trait might reach ~0.4.',
    '    Resting temperament is not an extreme. valence/mood usually start within ±0.4.',
    '  • opening_state should stay calm unless the scene literally opens mid-crisis.',
    '(Values are clamped to a calibrated ceiling, so do not try to start anyone pegged.)',
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
  opts: { signal?: AbortSignal; userId?: string; connectionId?: string },
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
    ...(opts.connectionId ? { connection_id: opts.connectionId } : {}),
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
  if (typeof parsed.canon === 'string' && parsed.canon.trim()) primary.canon = parsed.canon.trim()
  if (Array.isArray(parsed.goals)) {
    primary.goals = parsed.goals.filter((g) => typeof g === 'string').map((g) => g.trim()).filter(Boolean)
  }

  const setOne = (key: string, value: unknown, which: 'baseline' | 'value') => {
    const def = EMOTION_BY_KEY[key]
    if (!def || typeof value !== 'number' || !Number.isFinite(value)) return
    // Clamp into the calibrated seed range so a new run never opens pegged near
    // the extreme — high values must be earned through play.
    if (which === 'baseline') {
      const v = clampSeed(def, value, 'baseline')
      primary.emotions[key].baseline = v
      primary.emotions[key].value = v // start at the baseline unless opening_state overrides
    } else {
      primary.emotions[key].value = clampSeed(def, value, 'opening')
    }
  }
  for (const [k, v] of Object.entries(parsed.baselines ?? {})) setOne(k, v, 'baseline')
  for (const [k, v] of Object.entries(parsed.opening_state ?? {})) setOne(k, v, 'value')

  primary.updatedAt = Date.now()
  return `seed ${run.seed}: rolled persona, canon (${(primary.canon ?? '').length} chars), ${
    (primary.goals ?? []).length
  } goals + starting temperament.`
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
    'SATURATION — read this carefully. Feelings strongly resist their extremes.',
    'apply_stimulus pushes in a saturating space, so the same intensity moves a calm',
    'mind far more than an overwhelmed one, and the high end is genuinely hard to',
    'reach. From rest, a single +1 only reaches ~0.22, +3 ~0.53, +5 ~0.71; crossing',
    '0.9 needs ~+9 of ACCUMULATED pressure, i.e. the same strong beat hit again and',
    'again over many turns. So:',
    '  • Size intensity by the event: a passing pleasantry +0.5, a normal meaningful',
    '    moment +1 to +2, a strong emotional beat +3 to +5, a genuine shock +6 to +8.',
    '    Use negative intensity just as readily to relieve a feeling the moment eased.',
    '  • A first, friendly meeting should leave someone mildly curious or warm (landing',
    '    ~0.2-0.4), NOT amused/excited/tender all at 0.9. Most turns move only one to',
    '    three feelings; do not light up the whole vector.',
    '  • Values above ~0.7 should be uncommon and correspond to real, established,',
    '    repeatedly-fed emotional investment — never a single nice exchange.',
    'Reserve set_emotion for a true shock/reset that genuinely snaps a feeling to a',
    'value (e.g. sudden terror); it bypasses saturation, so use it rarely.',
    '',
    'WHAT TO DO EACH TURN:',
    '  • Update the affect of every character PRESENT in the scene, based on what was',
    '    said and done to and by them. Relieve feelings that the moment soothed',
    '    (negative intensity) as readily as you raise ones it provoked.',
    '  • Grow the CANON (update_canon): the card is intentionally thin — it is YOUR job',
    '    to make this character a fully realized, specific person. Each turn, when the',
    '    scene touches an undefined area, invent and record concrete static facts',
    '    (history, tastes, skills, relationships, body, speech habits). Keep doing this',
    '    until the character is richly defined, then mostly hold.',
    '  • Keep GOALS current (set_goals): what this character is pursuing, in their own',
    '    interest. They should always have an agenda that the next reply can act on.',
    '  • Rewrite dynamic sheet sections as state changes — toward_player, attitude,',
    '    state, plans (update_sheet / remove_sheet_section). Static lore goes in canon,',
    '    not the sheet.',
    '  • Introduce supporting characters the story brings in (create_character) and set',
    '    who is present (set_present). Give them canon + goals too.',
    '  • Occasionally nudge a baseline (set_baseline) when a lasting change of',
    '    temperament is earned — not every turn.',
    '',
    'CANON IS LAW. Once a fact is in a character\'s canon it is FIXED truth: never',
    'contradict or quietly retcon it — only extend it, or rarely refine wording without',
    'changing meaning. Read a character before rewriting it. You may freely INVENT to',
    'fill blanks, but you may NOT contradict (a) what the card explicitly states about',
    'the primary character (species, sex, age, name, appearance) or (b) anything already',
    'in canon or established in the story. A wrong "fact" that breaks continuity is the',
    'worst failure; an unfilled blank is just a future opportunity.',
    '',
    'ECONOMY. You see the whole story each run, but do not redo the whole mind every',
    'turn. Make the changes THIS turn warrants (affect + a little canon/goal growth),',
    'then stop. When done, reply with a one-line summary and no tool calls.',
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
  opts: { maxRounds: number; directive: string; signal?: AbortSignal; userId?: string; connectionId?: string },
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
      ...(opts.connectionId ? { connection_id: opts.connectionId } : {}),
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

/* ----------------------- demeanor synthesis ------------------------ */
/*
 * After the affect vector is updated, weave it into a short, present-tense read
 * of how each present character is ACTING — the part the writer model leans on
 * instead of a flat list of feelings. This is where emotion COMBINATIONS turn
 * into behavior (conflicts, suppression, what wins out).
 */

function demeanorSystemPrompt(): string {
  return [
    AGENT_SENTINEL,
    'You are Psyche\'s behavior synthesizer. For each character you are given their',
    'persona, goals/desires, current inner state (energy, agreeableness, what pulls',
    'them toward vs. away, power stance, inner tensions) and the recent scene. Produce',
    'two things per character:',
    '',
    '  demeanor — a tight 2-4 sentence, present-tense read of how they are carrying',
    '    themselves and behaving RIGHT NOW. BEHAVIOR (posture, eye contact, tone,',
    '    pacing, what they pursue/suppress), not a list of emotions. Weave the',
    '    combination: show how the strongest feeling is colored, fought, or amplified',
    '    by the rest; make any tension visible as contradiction or push-and-pull.',
    '',
    '  intent — 1-2 sentences: what this character WANTS this moment (tied to their',
    '    goals) and the concrete move they are likely to make to get it — initiating,',
    '    steering, testing, pushing back, withholding. This is what makes them drive',
    '    the scene rather than just react. It must be THEIR agenda, not the player\'s.',
    '',
    'Never name an emotion or a number; never narrate plot that has not happened; do',
    'not write dialogue. Return ONLY JSON mapping each character id to an object:',
    '{ "<id>": { "demeanor": "<...>", "intent": "<...>" }, ... }',
  ].join('\n')
}

/** Synthesize + store demeanor + intent for every present character. */
export async function synthesizeDemeanor(
  run: RunState,
  recentScene: string,
  opts: { signal?: AbortSignal; userId?: string; connectionId?: string },
): Promise<void> {
  const present = Object.values(run.characters).filter((c) => c.present)
  if (!present.length) return

  const blocks = present
    .map((c) =>
      [
        `### ${c.id} — ${c.name}`,
        c.persona ? `persona: ${c.persona}` : '',
        (c.goals ?? []).length ? `goals: ${(c.goals ?? []).join('; ')}` : '',
        groundedReadout(c),
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n')

  const messages: LlmMessage[] = [
    { role: 'system', content: demeanorSystemPrompt() },
    {
      role: 'user',
      content: [
        recentScene.trim() ? ['Recent scene (most recent last):', '"""', recentScene.trim(), '"""', ''].join('\n') : '',
        'Characters (persona, goals, current inner state):',
        blocks,
        '',
        'Write each one\'s demeanor + intent now. Return only the JSON.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ]

  const res = (await spindle.generate.quiet({
    type: 'quiet',
    messages,
    parameters: { temperature: 0.7 },
    reasoning: { source: 'off' },
    signal: opts.signal,
    userId: opts.userId,
    ...(opts.connectionId ? { connection_id: opts.connectionId } : {}),
  })) as { content?: string }

  const parsed = extractJson(res.content ?? '') as Record<string, unknown> | null
  if (!parsed) return
  for (const c of present) {
    const entry = parsed[c.id]
    if (!entry) continue
    // Tolerate either { demeanor, intent } objects or a bare demeanor string.
    if (typeof entry === 'string') {
      if (entry.trim()) c.demeanor = entry.trim()
      continue
    }
    const o = entry as { demeanor?: unknown; intent?: unknown }
    if (typeof o.demeanor === 'string' && o.demeanor.trim()) c.demeanor = o.demeanor.trim()
    if (typeof o.intent === 'string' && o.intent.trim()) c.intent = o.intent.trim()
  }
}

export { AGENT_SENTINEL, EmotionDef }
