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
  /**
   * APPROVAL — the BG3-style ledger of this character's accumulated opinion of
   * the player, -10000..+10000, starting neutral at 0. Unlike the affect vector
   * it never decays and accumulates linearly, in small increments (±1..10 per
   * adjustment). It gates trust and willingness: high approval buys latitude —
   * going along even against their own preferences; low approval means
   * guardedness, pushback, refusal.
   */
  approval?: number
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
  /**
   * Dynamic: their story-driving contribution this turn — a plan, proposal,
   * complication, revelation, or callback that is THEIRS, not a reaction to the
   * player. Refreshed each rumination, same lifecycle as demeanor/intent.
   */
  move?: string
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
    approval: 0,
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
  c.approval ??= 0 // de-facto per-character migration hook; older runs predate approval
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

/* ---------------------------- approval ------------------------------ */
/*
 * The approval LEDGER (BG3-style). Bands are spaced EVENLY across the space
 * (every 1000 points) so growth reads as steady progress rather than a curve
 * that front-loads all the meaning near zero — except the very first band,
 * which sits at 10 so a handful of turns is enough to register *some* opinion
 * at all. The top label is reserved for the pegged extreme: "unshakeable" /
 * "implacable" only apply at exactly ±10000, never before.
 */

export const APPROVAL_MIN = -10000
export const APPROVAL_MAX = 10000

interface ApprovalBand {
  at: number // band applies when |approval| >= at (bands checked high to low)
  pos: { label: string; meaning: string }
  neg: { label: string; meaning: string }
}

const APPROVAL_BANDS: ApprovalBand[] = [
  {
    at: 10000,
    pos: { label: 'unshakeable bond', meaning: 'absolute; nothing the player could do would break it — their lives are entwined' },
    neg: { label: 'implacable enemy', meaning: 'absolute; nothing could mend it — destroying the player is a purpose in itself' },
  },
  {
    at: 9000,
    pos: { label: 'transcendent', meaning: "beyond ordinary loyalty; the player's wellbeing IS their own — hard to imagine a line that would break this" },
    neg: { label: 'irredeemable', meaning: 'beyond ordinary enmity; harming the player has become how they measure a good day' },
  },
  {
    at: 8000,
    pos: { label: 'inseparable', meaning: 'near-absolute; only a fundamental betrayal could shake it, and they would not believe it at first' },
    neg: { label: 'irreconcilable', meaning: 'near-absolute enmity; only an extraordinary act could crack it, and they would distrust it as a trick' },
  },
  {
    at: 7000,
    pos: { label: 'lifelong', meaning: 'identity-level attachment; they would uproot their life for the player without being asked' },
    neg: { label: 'sworn against', meaning: 'a dedicated enemy; opposes the player at real personal cost, and plans ahead to do it' },
  },
  {
    at: 6000,
    pos: { label: 'bound', meaning: 'the player is family, inner circle; loyalty survives serious tests and public cost' },
    neg: { label: 'embittered', meaning: 'hatred woven into who they are; sabotages on sight, poisons others against the player' },
  },
  {
    at: 5000,
    pos: { label: 'profoundly loyal', meaning: 'stakes their own safety and standing on the player as a matter of course' },
    neg: { label: 'vengeful', meaning: 'actively seeks to harm or thwart the player, not just refuse them' },
  },
  {
    at: 4000,
    pos: { label: 'devoted', meaning: 'their default is yes, even at real cost to themselves — a betrayal here would be shattering' },
    neg: { label: 'hostile', meaning: 'their default is no; only self-interest or coercion moves them to cooperate' },
  },
  {
    at: 3000,
    pos: { label: 'deeply trusted', meaning: 'extends serious latitude — takes risks on the player\'s word alone' },
    neg: { label: 'resented', meaning: 'actively resists, tests, or undermines; any cooperation is strictly transactional' },
  },
  {
    at: 2000,
    pos: { label: 'trusted', meaning: 'will go along with requests that cut against their own preferences, within reason' },
    neg: { label: 'disliked', meaning: 'needs convincing even for reasonable asks; pushes back readily' },
  },
  {
    at: 1000,
    pos: { label: 'warm', meaning: 'openly at ease; shares more, volunteers help, extends real trust' },
    neg: { label: 'distrustful', meaning: 'guarded; verifies claims, keeps things back' },
  },
  {
    at: 10,
    pos: { label: 'mildly favorable', meaning: 'a small benefit of the doubt, granted' },
    neg: { label: 'mildly wary', meaning: 'a small benefit of the doubt, withheld' },
  },
]

export function describeApproval(a: number): { label: string; meaning: string } {
  const v = Math.max(APPROVAL_MIN, Math.min(APPROVAL_MAX, a))
  for (const band of APPROVAL_BANDS) {
    if (Math.abs(v) >= band.at) return v > 0 ? band.pos : band.neg
  }
  return { label: 'neutral', meaning: 'no formed opinion; trust and patience are at their defaults' }
}

/** The injected approval line — label carries the behavior, value gives continuity. */
export function approvalLine(c: CharacterState): string {
  const a = c.approval ?? 0
  const d = describeApproval(a)
  return `approval of the player: ${d.label} (${Math.round(a)}) — ${d.meaning}`
}

/* ------------------------ investment register ---------------------- */
/*
 * The invested-partner loop, deterministic half: read the live vector and say
 * out loud how much this character is enjoying the scene — and what that does
 * to their initiative. Enjoyment is EARNED through play (the update agent
 * raises joy/excitement/etc. when the player serves the character's goals), so
 * this register is the visible payoff: lit-up characters give more and drive
 * harder; disinvested ones stop performing. Recomputed live like
 * groundedReadout, so manual edits bite immediately.
 */

export function investmentRegister(c: CharacterState): string {
  const spark = Math.max(v(c, 'joy'), v(c, 'excitement'), v(c, 'curiosity'), v(c, 'attraction'))
  const litUp = spark >= 0.45 && v(c, 'boredom') < 0.3 && v(c, 'mood') > 0
  if (litUp)
    return (
      'genuinely enjoying this — and it shows: they give more, build on what the' +
      ' player offers AND add their own, take risks, initiate. Their pleasure in' +
      ' the scene is visible in how they play it.'
    )
  const disinvested = v(c, 'boredom') >= 0.45 || (v(c, 'valence') <= -0.35 && v(c, 'mood') <= 0)
  if (disinvested)
    return (
      "not feeling it — and they don't fake it. They give less, redirect toward" +
      ' what THEY care about, or start winding the scene down. No service enthusiasm.'
    )
  return (
    'engaged but not yet won over — they participate and pursue their goals, but' +
    ' their warmth and initiative must be earned.'
  )
}

/* ------------------------ delivery register ------------------------ */
/*
 * Energy-matched delivery, deterministic half (the LLM half lives in the
 * rumination contract). The single biggest tell that you are RPing with a
 * machine is uniform, polished, enthusiastic output regardless of state. These
 * lines give the prose writer explicit, state-derived direction on how much the
 * character says and how much effort it carries — so a drained or sulking
 * character actually reads drained or sulking. Recomputed live per injection.
 */

export function deliveryRegister(c: CharacterState): string[] {
  const lines: string[] = []
  if (v(c, 'valence') <= -0.35 || v(c, 'fatigue') >= 0.5 || v(c, 'sadness') >= 0.55)
    lines.push(
      'running on empty — short, flat dialogue, minimal effort; they answer what' +
        ' they must and volunteer little. Narration may stay rich, but THEIR engagement shrinks.',
    )
  if (v(c, 'anger') >= 0.45 || v(c, 'irritation') >= 0.55)
    lines.push('clipped, interruptive speech; refuses to elaborate; ends lines early.')
  if (v(c, 'anxiety') >= 0.45 || v(c, 'insecurity') >= 0.5)
    lines.push('hedges, qualifies, trails off mid-thought; circles back to reassure or retract.')
  if (v(c, 'valence') <= -0.5 && v(c, 'mood') <= -0.2)
    lines.push(
      'disengaging — one-line answers are in character; they may try to wind the scene down or leave.',
    )
  if (v(c, 'valence') >= 0.5 && v(c, 'mood') >= 0.3)
    lines.push('lit up — quick, expansive, talkative; carries the scene.')
  return lines
}

const CANON_INJECT_CAP = 2200 // keep the bible from ballooning the prompt
const indent = (s: string, pad = '    ') => s.split('\n').map((l) => pad + l).join('\n')

type OverrideTier = 'intense' | 'overwhelming' | 'all-consuming'

/** The dominance tier of a feeling that should OVERRIDE normal characterization. */
function overrideTier(value: number, kind: EmotionDef['kind']): OverrideTier | null {
  const m = kind === 'bipolar' ? Math.abs(value) : value
  if (m >= 0.985) return 'all-consuming'
  if (m >= 0.93) return 'overwhelming'
  if (m >= 0.88) return 'intense'
  return null
}

/**
 * When a feeling reaches the top tiers it is not just "another item in the list"
 * — it seizes priority over persona, manner, goals, and composure. At
 * all-consuming it overrides the character's very self: they break from who they
 * usually are. Returns '' when nothing is that high.
 */
/** The strongest override tier in play, or null. */
export function topOverrideTier(c: CharacterState): OverrideTier | null {
  let best: OverrideTier | null = null
  const rank = { intense: 1, overwhelming: 2, 'all-consuming': 3 } as const
  for (const def of EMOTIONS) {
    const t = overrideTier(v(c, def.key), def.kind)
    if (t && (!best || rank[t] > rank[best])) best = t
  }
  return best
}

export function overrideDirective(c: CharacterState): string {
  const rows = EMOTIONS.map((def) => ({ def, val: v(c, def.key), tier: overrideTier(v(c, def.key), def.kind) }))
    .filter((r) => r.tier)
    .sort((a, b) => Math.abs(b.val) - Math.abs(a.val))
  if (!rows.length) return ''

  const lines: string[] = [
    '‼ OVERRIDING STATE — this OUTRANKS their persona, canon manner, goals, and',
    '   composure. Play it at full force; do not soften, balance, or "stay in',
    '   character" against it:',
  ]
  for (const { def, val, tier } of rows) {
    const name = def.label.toLowerCase().split(' (')[0]
    const desc = describeValue(def, val).meaning
    if (tier === 'all-consuming') {
      lines.push(
        `  • ${name} is ALL-CONSUMING. It has wholly taken ${c.name} over. Drop their usual` +
          ` composure, manners, restraint, and even their normal personality — right now they` +
          ` ARE this feeling and act on it past every limit, however out of character that is` +
          ` for who they usually are (${desc}).`,
      )
    } else if (tier === 'overwhelming') {
      lines.push(
        `  • ${name} is OVERWHELMING — it crowds out their other feelings and their judgment;` +
          ` composure is failing and it dictates what they do and say (${desc}).`,
      )
    } else {
      lines.push(
        `  • ${name} is INTENSE and dominating them — it breaks through composure and runs the` +
          ` moment (${desc}).`,
      )
    }
  }
  lines.push('  Established canon FACTS stay true, but their measured persona does NOT govern them while this holds.')
  return lines.join('\n')
}

function characterBlock(c: CharacterState, humanTexture = true): string {
  const lines: string[] = []
  lines.push(`## ${c.name}${c.isPrimary ? '' : ' (supporting character)'}`)

  const override = overrideDirective(c)
  if (override) lines.push(override) // highest priority — placed first, before anything moderating

  // A stored demeanor/intent describes a calmer past moment; when a strong override
  // is active (e.g. a hand-set extreme) that brief would only moderate it, so drop it.
  const strongOverride = topOverrideTier(c) === 'overwhelming' || topOverrideTier(c) === 'all-consuming'
  if (!strongOverride) {
    if (c.demeanor && c.demeanor.trim()) lines.push(c.demeanor.trim())
    if (c.intent && c.intent.trim()) lines.push(`Wants right now / likely to: ${c.intent.trim()}`)
    if (c.move && c.move.trim()) lines.push(`Their move this scene: ${c.move.trim()}`)
  }

  lines.push('')
  lines.push('Underneath (embody — do not narrate or name any of this):')
  lines.push(groundedReadout(c))
  lines.push(`  ${approvalLine(c)}`)
  lines.push(`  investment in the scene: ${investmentRegister(c)}`)
  if (humanTexture) for (const d of deliveryRegister(c)) lines.push(`  delivery: ${d}`)

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

/** Options for building the injected directive. All optional; defaults preserve prior behavior. */
export interface DirectiveOpts {
  /** the per-character player profile (what the human is here for); Step 2 of the invested-partner work */
  playerProfile?: string
  /** energy-matched delivery lines + ENERGY preamble; defaults on */
  humanTexture?: boolean
}

/**
 * Build the system block injected for the active reply. We always include the
 * primary and any present supporting characters so multi-character scenes stay
 * coherent. Returns null when there is nothing seeded yet (so we inject nothing).
 */
export function buildDirective(run: RunState, opts: DirectiveOpts = {}): string | null {
  const present = Object.values(run.characters).filter((c) => c.present)
  if (!present.length) return null
  present.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)) // primary first

  const humanTexture = opts.humanTexture !== false
  const blocks = present.map((c) => characterBlock(c, humanTexture)).join('\n\n')
  return [
    '[Psyche — character, agency & state]',
    'AGENCY: each character below is an INDEPENDENT person with their own goals — not',
    'a compliant narrator, not a yes-man. Play them pursuing what THEY want: let them',
    'take initiative, start things, change the subject, make demands, set conditions,',
    'and push back, stall, or refuse when the player\'s lead cuts against their aims.',
    'They move the scene as much as the player does, toward their own desires.',
    '',
    'INVESTMENT: these characters are partners in the story, not service providers.',
    '  • When the player\'s actions serve a character\'s goals and desires, it LANDS:',
    '    real satisfaction, warmth, momentum — and they show it by giving more,',
    '    escalating, initiating, building on the player\'s ideas. Mutual enjoyment is',
    '    visible, not narrated.',
    '  • Enjoyment is earned, never faked. A character whose goals are ignored or',
    '    thwarted doesn\'t perform enthusiasm — they push their own agenda harder,',
    '    negotiate, or disengage.',
    '  • DRIVE THE STORY: each character regularly contributes new material of their',
    '    own — a plan, an invitation, a complication, a confession, a callback to',
    '    earlier events — drawn from their goals and canon. They don\'t wait to be',
    '    prompted; the scene is theirs to move as much as the player\'s.',
    '  • APPROVAL is each character\'s accumulated opinion of the player. High',
    '    approval buys trust and willingness — they\'ll go along even when it cuts',
    '    against their own wishes. Low approval means guardedness, pushback,',
    '    refusal. It moves slowly; act the current level, don\'t leap ahead of it.',
    '',
    'EMBODIMENT: act their state through behavior — posture, tone, word choice, what',
    'they reach for and hold back; let stronger feelings break composure and',
    'conflicting pulls show as push-and-pull. Treat their established canon as fixed',
    'truth. Never recite, name, or mention any of these notes — just live them.',
    '',
    ...(humanTexture
      ? [
          'MATCH THEIR ENERGY: the length and effort of each character\'s dialogue must',
          'track their state, not a service standard. A drained, bored, or withdrawn',
          'character gives less — short lines, low effort, no eager follow-up questions —',
          'even while the surrounding narration stays vivid. An energized character gives',
          'more. Never pad a flat mood into an enthusiastic, multi-paragraph performance.',
          '',
        ]
      : []),
    'PRIORITY: if a character has an "OVERRIDING STATE", it dominates EVERYTHING else',
    'about them for this reply — over persona, manner, goals, and composure. Do not',
    'moderate it to keep them "in character"; at all-consuming intensity they break',
    'from their usual self and are wholly run by that feeling. Their canon facts stay',
    'true, but how they behave is dictated by the overriding feeling.',
    '',
    ...playerProfileSection(opts.playerProfile),
    blocks,
  ].join('\n')
}

/* --------------------- player profile injection --------------------- */
/*
 * The player's half of "both sides' goals being met". A freeform profile of the
 * HUMAN behind the player-character — interests, goals, kinks, personality —
 * stored per character card (see playerProfilePath). It steers the scene softly:
 * characters bend toward these interests through their own in-fiction choices,
 * never breaking who they are to service it. It is context only — the player is
 * never given emotion stats.
 */

const PLAYER_PROFILE_CAP = 1500 // like CANON_INJECT_CAP: steering, not a payload

function playerProfileSection(profile?: string): string[] {
  const p = (profile ?? '').trim()
  if (!p) return []
  return [
    '[The player behind the player-character — private scene direction, NEVER',
    ' revealed, referenced, or acknowledged in-fiction:]',
    p.slice(0, PLAYER_PROFILE_CAP),
    '',
    'Steer the story so it can meet these interests WHEN it fits the fiction and the',
    'characters\' own goals — through what the characters choose, propose, and',
    'initiate. Characters never break who they are to service this; the best scenes',
    'are the ones where their goals and the player\'s interests converge. When that',
    'convergence happens, that is precisely when the characters\' enjoyment shows most.',
    '',
  ]
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

/**
 * The player profile is keyed per CHARACTER CARD (not per chat): what the human
 * is hoping for with this character is stable across runs, the way the injection
 * meta is. See playerProfileSection() for how it reaches the prompt.
 */
export const playerProfilePath = (cid: string) => `player/${cid}.json`

export interface PlayerProfile {
  profile: string
  updatedAt: number
}

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
