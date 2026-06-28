declare const spindle: import('lumiverse-spindle-types').SpindleAPI

import {
  RunState,
  CharacterState,
  emptyRun,
  runPath,
  newCharacter,
  backfillEmotions,
  buildDirective,
  ensureInjectionEntry,
  isInjectionEntry,
  slugify,
} from './run'
import { seedRun, runPsycheAgent, ruminate, StageTrace } from './agent'
import {
  EMOTIONS,
  EMOTION_BY_KEY,
  relaxToward,
  describeValue,
} from './affect'

/* ------------------------------------------------------------------ *
 * Psyche — backend
 *
 * Per chat (one roguelike run): seed a hidden persona once, then after every
 * reply relax + update the characters' affect vectors and sheets. The live
 * emotional state is injected into the next reply through a force-injected,
 * content-overridden world-info entry, so the visible character behaves the
 * way they actually feel. Disabled-at-rest: turn the extension off and nothing
 * is injected.
 * ------------------------------------------------------------------ */

interface Config {
  enabled: boolean
  maxRounds: number
  /** fraction of the pressure gap a present feeling relaxes toward baseline each turn */
  decayRate: number
  directive: string
  agentTimeoutMs: number
  /** connection id the out-of-band engine calls use; '' = same as the prose model */
  agentConnectionId: string
}

const DEFAULT_CONFIG: Config = {
  enabled: true,
  maxRounds: 8,
  decayRate: 0.12,
  directive: '',
  agentTimeoutMs: 90000,
  agentConnectionId: '',
}
const CONFIG_PATH = 'config.json'

let config: Config = { ...DEFAULT_CONFIG }

const chatChar = new Map<string, string>()
const running = new Set<string>()
const observers = new Map<string, ReturnType<typeof spindle.generate.observe>>()

/* ----------------------------- storage ----------------------------- */

async function loadConfig() {
  config = await spindle.storage.getJson<Config>(CONFIG_PATH, { fallback: { ...DEFAULT_CONFIG } })
}
async function saveConfig() {
  await spindle.storage.setJson(CONFIG_PATH, config, { indent: 2 })
}
async function loadRun(chatId: string): Promise<RunState> {
  const run = await spindle.storage.getJson<RunState>(runPath(chatId), { fallback: emptyRun(chatId) })
  for (const c of Object.values(run.characters)) backfillEmotions(c)
  return run
}
async function saveRun(run: RunState) {
  run.updatedAt = Date.now()
  await spindle.storage.setJson(runPath(run.chatId), run, { indent: 2 })
}

/* ----------------------------- debug ------------------------------- *
 * Per-chat capture of exactly what each engine step sent + got back, so the
 * panel can show "what's being sent at each step" behind buttons.
 * ------------------------------------------------------------------ */
interface DebugBundle {
  seed?: StageTrace
  update?: StageTrace
  rumination?: StageTrace
  injection?: { at: number; directive: string }
}
const debugPath = (chatId: string) => `debug/${chatId}.json`
const DBG_REQ_CAP = 24000
const DBG_RES_CAP = 10000

function capText(s: string, n: number): string {
  if (s.length <= n) return s
  const head = Math.floor(n * 0.7)
  return `${s.slice(0, head)}\n\n…[${s.length - n} chars elided]…\n\n${s.slice(-(n - head))}`
}
function capTrace(t: StageTrace): StageTrace {
  return { ...t, request: capText(t.request, DBG_REQ_CAP), response: capText(t.response, DBG_RES_CAP) }
}
async function loadDebug(chatId: string): Promise<DebugBundle> {
  return spindle.storage.getJson<DebugBundle>(debugPath(chatId), { fallback: {} })
}

async function characterForChat(
  chatId: string,
  userId?: string,
): Promise<{ id: string; name: string } | null> {
  const cached = chatChar.get(chatId)
  if (cached) {
    const c = await spindle.characters.get(cached, userId)
    return c ? { id: c.id, name: c.name } : null
  }
  try {
    const chat = await spindle.chats.get(chatId, userId)
    const cid = (chat as { character_id?: string } | null)?.character_id
    if (!cid) return null
    chatChar.set(chatId, cid)
    const c = await spindle.characters.get(cid, userId)
    return c ? { id: c.id, name: c.name } : { id: cid, name: 'the character' }
  } catch {
    return null
  }
}

/* ------------------------ transcript + card ------------------------ */

const MAX_TRANSCRIPT_CHARS = 120_000

async function buildTranscript(chatId: string, reply: string): Promise<string> {
  const lines: string[] = []
  try {
    const msgs = await spindle.chat.getMessages(chatId)
    for (const m of msgs) {
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      if (!text.trim()) continue
      lines.push(`${m.role === 'user' ? 'PLAYER' : 'CHARACTER'}:\n${text.trim()}`)
    }
  } catch {
    /* ignore */
  }
  const r = reply.trim()
  if (r && !(lines.length && lines[lines.length - 1].includes(r))) lines.push(`CHARACTER:\n${r}`)
  return clampTranscript(lines.join('\n\n').trim())
}

function clampTranscript(t: string): string {
  if (t.length <= MAX_TRANSCRIPT_CHARS) return t
  const head = Math.floor(MAX_TRANSCRIPT_CHARS * 0.4)
  const tail = MAX_TRANSCRIPT_CHARS - head
  return `${t.slice(0, head)}\n\n[… middle of the story elided for length; opening and recent turns shown in full …]\n\n${t.slice(-tail)}`
}

function buildCardContext(char: unknown): string {
  const c = (char ?? {}) as Record<string, unknown>
  const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)
  const fields: [string, unknown, number][] = [
    ['Name', c.name, 200],
    ['Description', c.description, 2000],
    ['Personality', c.personality, 1000],
    ['Scenario', c.scenario, 1000],
    ['Opening', c.first_mes, 1500],
  ]
  return fields
    .filter(([, v]) => typeof v === 'string' && (v as string).trim())
    .map(([k, v, n]) => `${k}: ${cap((v as string).trim(), n)}`)
    .join('\n\n')
}

/* ----------------------- per-turn processing ----------------------- */

function ensurePrimary(run: RunState, id: string, name: string): CharacterState {
  run.characterId = id
  let primary = Object.values(run.characters).find((c) => c.isPrimary)
  if (!primary) {
    const slug = slugify(name) || 'protagonist_char'
    primary = newCharacter(run.characters[slug] ? `${slug}_main` : slug, name, true)
    run.characters[primary.id] = primary
  }
  primary.name = name
  primary.present = true
  return primary
}

/** Relax present characters toward their baselines (time passing between turns). */
function applyDecay(run: RunState) {
  for (const c of Object.values(run.characters)) {
    if (!c.present) continue // off-scene minds are frozen until they return
    for (const def of EMOTIONS) {
      const e = c.emotions[def.key]
      if (!e) continue
      e.value = relaxToward(def, e.value, e.baseline, config.decayRate)
    }
  }
}

async function runAgentForChat(chatId: string, reply: string, userId?: string) {
  if (!config.enabled || !reply.trim()) return
  const char = await characterForChat(chatId, userId)
  if (!char) return
  if (running.has(chatId)) return

  running.add(chatId)
  const dbg: DebugBundle = {}
  try {
    const run = await loadRun(chatId)
    const primary = ensurePrimary(run, char.id, char.name)

    const fullChar = await spindle.characters.get(char.id, userId).catch(() => null)
    const cardContext = buildCardContext(fullChar)

    // ── seed (once per run) ──────────────────────────────────────────
    // Persist the rolled persona IMMEDIATELY, before the heavier update pass.
    // Otherwise a slow/failed update would discard the seed and the run would
    // reseed forever ("generated a seed, but no activity").
    let seededNote = ''
    if (!run.seeded) {
      try {
        seededNote = await seedRun(run, primary, cardContext, {
          signal: AbortSignal.timeout(config.agentTimeoutMs),
          userId,
          connectionId: config.agentConnectionId || undefined,
          onTrace: (t) => (dbg.seed = capTrace(t)),
        })
      } catch (err) {
        const m = err instanceof Error && err.name === 'AbortError' ? 'timed out' : String(err)
        seededNote = `seed failed (${m}); using card as identity`
        if (!primary.identity) primary.identity = cardContext.slice(0, 1200)
      }
      run.seeded = true
      await saveRun(run) // <- seed is now durable no matter what happens next
      spindle.log.info(`[psyche] ${char.name}: seeded — ${seededNote}`)
    } else {
      applyDecay(run)
    }

    // ── per-turn affect + sheet update ───────────────────────────────
    const transcript = await buildTranscript(chatId, reply)
    let result = { rounds: 0, toolCalls: [] as { tool: string; result: string }[], finalNote: '' }
    try {
      result = await runPsycheAgent(run, transcript, cardContext, {
        maxRounds: config.maxRounds,
        directive: config.directive,
        signal: AbortSignal.timeout(config.agentTimeoutMs),
        userId,
        connectionId: config.agentConnectionId || undefined,
        onTrace: (t) => (dbg.update = capTrace(t)),
      })
    } catch (err) {
      const m = err instanceof Error && err.name === 'AbortError' ? 'timed out' : String(err)
      result.finalNote = `update failed (${m})`
      spindle.log.error(`[psyche] ${char.name}: update pass failed — ${m}`)
    }

    // Stage 2 — ruminate on how the updated emotional state reshapes behavior,
    // and produce the directive the prose writer will follow next.
    try {
      await ruminate(run, transcript.slice(-6000), {
        signal: AbortSignal.timeout(config.agentTimeoutMs),
        userId,
        connectionId: config.agentConnectionId || undefined,
        onTrace: (t) => (dbg.rumination = capTrace(t)),
      })
    } catch (err) {
      spindle.log.error(`[psyche] rumination failed: ${String(err)}`)
    }

    await saveRun(run)
    await refreshInjection(chatId, userId) // push the new state into the prompt

    // Capture the assembled directive the prose engine receives, then persist all
    // traces (merging so steps that did not run this turn keep their last capture).
    dbg.injection = {
      at: Date.now(),
      directive: capText(buildDirective(run) ?? '(nothing injected — not seeded or no one present)', DBG_REQ_CAP),
    }
    try {
      const prev = await loadDebug(chatId)
      await spindle.storage.setJson(debugPath(chatId), { ...prev, ...dbg })
    } catch (err) {
      spindle.log.warn(`[psyche] could not save debug traces: ${String(err)}`)
    }

    spindle.sendToFrontend({
      type: 'state_changed',
      chatId,
      characterCount: Object.keys(run.characters).length,
      rounds: result.rounds,
      edits: result.toolCalls.length,
      note: [seededNote, result.finalNote].filter(Boolean).join(' · '),
    })
    spindle.log.info(
      `[psyche] ${char.name}: ${result.toolCalls.length} edits / ${result.rounds} rounds${
        seededNote ? ' (seeded)' : ''
      }`,
    )
  } catch (err) {
    const msg = err instanceof Error && err.name === 'AbortError' ? 'engine timed out' : String(err)
    spindle.log.error(`[psyche] engine failed: ${msg}`)
  } finally {
    running.delete(chatId)
  }
}

/* --------------------------- generation hooks ---------------------- */

function ensureObserver(chatId: string) {
  if (!observers.has(chatId)) observers.set(chatId, spindle.generate.observe(chatId))
  return observers.get(chatId)!
}
function dropObserver(chatId: string) {
  const o = observers.get(chatId)
  if (o) {
    o.dispose()
    observers.delete(chatId)
  }
}

spindle.on('GENERATION_STARTED', (payload) => {
  if (!config.enabled || !payload.chatId) return
  if (payload.generationType === 'quiet' || payload.generationType === 'impersonate') return
  ensureObserver(payload.chatId)
})

spindle.on('GENERATION_ENDED', async (payload, userId) => {
  if (!config.enabled || !payload.chatId) return
  const chatId = payload.chatId
  if (payload.error) return dropObserver(chatId)
  const gt = payload.generationType
  // Only advance the mind on a genuinely NEW assistant turn. Swipes, regens,
  // continues and impersonations re-roll an existing turn — re-running the
  // engine on those would double-count emotional impact and clobber any manual
  // edits the operator made to test a regeneration. (Absent type == normal.)
  if (gt && gt !== 'normal') return dropObserver(chatId)
  const obs = observers.get(chatId)
  const reply = (payload.content ?? obs?.content ?? '').trim()
  dropObserver(chatId)
  await runAgentForChat(chatId, reply, userId)
})

spindle.on('GENERATION_STOPPED', async (payload, userId) => {
  if (!config.enabled || !payload.chatId) return
  const obs = observers.get(payload.chatId)
  const reply = (payload.content ?? obs?.content ?? '').trim()
  dropObserver(payload.chatId)
  await runAgentForChat(payload.chatId, reply, userId)
})

/* ----------------------- live state injection ---------------------- *
 * The live emotional state reaches the visible reply through a CONSTANT
 * ("always-on") world-info entry attached to the character. A constant entry is
 * injected into every prompt regardless of keywords — the most reliable
 * world-info mechanism — so we simply OVERWRITE its content with the current
 * directive after each turn and after any manual edit. No forced/mutated/
 * disabled-resurrection to depend on: what we write is what the model sees.
 *
 * The panel toggle is honored by a world-info interceptor that disables our
 * entry while config.enabled is false, so turning Psyche off live stops
 * injection without needing a write.
 * ------------------------------------------------------------------ */

let loggedInject = false

/** Overwrite the character's constant injection entry with the current state. */
async function refreshInjection(chatId: string, userId?: string) {
  try {
    const char = await characterForChat(chatId, userId)
    if (!char) return
    const entryId = await ensureInjectionEntry(char.id, char.name, userId)
    if (!entryId) return
    const run = await loadRun(chatId).catch(() => null)
    const directive = (run && buildDirective(run)) || '(no active emotional state)'
    await spindle.world_books.entries.update(entryId, { content: directive }, userId)
    if (!loggedInject) {
      loggedInject = true
      spindle.log.info(`[psyche] wrote emotional state (${directive.length} chars) to injection entry for chat ${chatId}`)
    }
  } catch (err) {
    spindle.log.error(`[psyche] refreshInjection failed: ${String(err)}`)
  }
}

// While the panel toggle is OFF, disable our constant entry so nothing injects;
// while ON, leave it alone (a constant entry injects its current content itself).
async function injectionInterceptor(ctx: import('lumiverse-spindle-types').WorldInfoInterceptorCtxDTO) {
  if (config.enabled) return
  const ids = ctx.entries.filter((e) => isInjectionEntry(e.extensions)).map((e) => e.id)
  return ids.length ? { disabled: ids } : undefined
}

function registerInjectionInterceptor() {
  try {
    spindle.registerWorldInfoInterceptor(injectionInterceptor, 50)
    spindle.log.info('[psyche] injection interceptor registered')
  } catch (err) {
    spindle.log.warn(`[psyche] interceptor registration failed: ${String(err)}`)
  }
}

/* --------------------------- frontend bridge ----------------------- */

async function activeChatId(payloadChatId?: string, userId?: string): Promise<string | null> {
  if (payloadChatId) return payloadChatId
  try {
    const active = await spindle.chats.getActive(userId)
    return active?.id ?? null
  } catch {
    // `chats` permission may not be granted yet — never let this crash the worker.
    return null
  }
}

function snapshotRun(run: RunState) {
  const characters = Object.values(run.characters).map((c) => ({
    id: c.id,
    name: c.name,
    isPrimary: c.isPrimary,
    present: c.present,
    identity: c.identity,
    persona: c.persona,
    demeanor: c.demeanor ?? '',
    intent: c.intent ?? '',
    canon: c.canon ?? '',
    goals: c.goals ?? [],
    sheet: c.sheet,
    emotions: EMOTIONS.map((def) => {
      const e = c.emotions[def.key] ?? { value: 0, baseline: 0 }
      return {
        key: def.key,
        label: def.label,
        kind: def.kind,
        value: e.value,
        baseline: e.baseline,
        descriptor: describeValue(def, e.value).label,
      }
    }),
  }))
  return {
    chatId: run.chatId,
    seed: run.seed,
    seeded: run.seeded,
    characters,
  }
}

function findChar(run: RunState, id: string): CharacterState | null {
  return run.characters[id] ?? Object.values(run.characters).find((c) => c.id === id) ?? null
}

function clampForKind(key: string, value: number): number {
  const def = EMOTION_BY_KEY[key]
  if (!def) return value
  return def.kind === 'bipolar' ? Math.max(-1, Math.min(1, value)) : Math.max(0, Math.min(1, value))
}

async function sendState(chatId: string | null, userId?: string, note?: string) {
  if (!chatId) {
    spindle.sendToFrontend({ type: 'state', snapshot: null, note }, userId)
    return
  }
  // Keep the injected state current whenever the panel syncs — this is how a
  // manual value edit reaches the next reply.
  await refreshInjection(chatId, userId)
  const run = await loadRun(chatId)
  const char = await characterForChat(chatId, userId)
  spindle.sendToFrontend(
    { type: 'state', characterName: char?.name ?? null, snapshot: snapshotRun(run), note },
    userId,
  )
}

spindle.onFrontendMessage(async (payload: any, userId) => {
 try {
  switch (payload?.type) {
    case 'get_config':
      spindle.sendToFrontend({ type: 'config', config }, userId)
      break

    case 'set_config':
      config = {
        enabled: Boolean(payload.config?.enabled ?? config.enabled),
        maxRounds: clampInt(payload.config?.maxRounds ?? config.maxRounds, 1, 20),
        decayRate: clampFloat(payload.config?.decayRate ?? config.decayRate, 0, 1),
        directive: String(payload.config?.directive ?? config.directive),
        agentTimeoutMs: clampInt(payload.config?.agentTimeoutMs ?? config.agentTimeoutMs, 10000, 300000),
        agentConnectionId:
          payload.config?.agentConnectionId === undefined
            ? config.agentConnectionId
            : String(payload.config.agentConnectionId ?? ''),
      }
      await saveConfig()
      spindle.sendToFrontend({ type: 'config', config }, userId)
      break

    case 'get_connections': {
      // The available connection profiles, so the panel can route the engine to
      // a different model than the one writing the prose.
      let connections: { id: string; name: string; provider: string; model: string }[] = []
      try {
        const list = await spindle.connections.list(userId)
        connections = list.map((c) => ({ id: c.id, name: c.name, provider: c.provider, model: c.model }))
      } catch (err) {
        spindle.log.warn(`[psyche] could not list connections: ${String(err)}`)
      }
      spindle.sendToFrontend({ type: 'connections', connections }, userId)
      break
    }

    case 'get_state': {
      const chatId = await activeChatId(payload.chatId, userId)
      await sendState(chatId, userId)
      break
    }

    case 'get_debug': {
      const chatId = await activeChatId(payload.chatId, userId)
      const debug = chatId ? await loadDebug(chatId) : {}
      spindle.sendToFrontend({ type: 'debug', debug }, userId)
      break
    }

    case 'reseed': {
      // Reroll this run's hidden persona + starting temperament with a fresh seed.
      const chatId = await activeChatId(payload.chatId, userId)
      if (!chatId) break
      const char = await characterForChat(chatId, userId)
      if (!char) break
      const run = await loadRun(chatId)
      run.seed = Math.floor(Math.random() * 1e9)
      const primary = ensurePrimary(run, char.id, char.name)
      // reset the primary to a clean slate before rerolling
      primary.emotions = newCharacter(primary.id, primary.name, true).emotions
      primary.sheet = {}
      const fullChar = await spindle.characters.get(char.id, userId).catch(() => null)
      const note = await seedRun(run, primary, buildCardContext(fullChar), {
        userId,
        connectionId: config.agentConnectionId || undefined,
      })
      run.seeded = true
      await saveRun(run)
      await sendState(chatId, userId, `Rerolled — ${note}`)
      break
    }

    case 'reset_run': {
      const chatId = await activeChatId(payload.chatId, userId)
      if (!chatId) break
      await saveRun(emptyRun(chatId))
      await sendState(chatId, userId, 'Run state cleared.')
      break
    }

    case 'set_present': {
      const chatId = await activeChatId(payload.chatId, userId)
      if (!chatId) break
      const run = await loadRun(chatId)
      const c = findChar(run, payload.characterId)
      if (c) {
        c.present = Boolean(payload.present)
        await saveRun(run)
      }
      await sendState(chatId, userId)
      break
    }

    case 'set_emotion': {
      const chatId = await activeChatId(payload.chatId, userId)
      if (!chatId) break
      const run = await loadRun(chatId)
      const c = findChar(run, payload.characterId)
      const key = String(payload.emotion ?? '')
      if (c && EMOTION_BY_KEY[key] && typeof payload.value === 'number') {
        backfillEmotions(c)
        c.emotions[key].value = clampForKind(key, payload.value)
        await saveRun(run)
      }
      await sendState(chatId, userId)
      break
    }

    case 'save_persona': {
      const chatId = await activeChatId(payload.chatId, userId)
      if (!chatId) break
      const run = await loadRun(chatId)
      const c = findChar(run, payload.characterId)
      if (c && typeof payload.persona === 'string') {
        c.persona = payload.persona
        await saveRun(run)
      }
      await sendState(chatId, userId)
      break
    }

    case 'save_canon': {
      const chatId = await activeChatId(payload.chatId, userId)
      if (!chatId) break
      const run = await loadRun(chatId)
      const c = findChar(run, payload.characterId)
      if (c && typeof payload.canon === 'string') {
        c.canon = payload.canon
        await saveRun(run)
      }
      await sendState(chatId, userId)
      break
    }

    case 'save_goals': {
      const chatId = await activeChatId(payload.chatId, userId)
      if (!chatId) break
      const run = await loadRun(chatId)
      const c = findChar(run, payload.characterId)
      if (c && typeof payload.goals === 'string') {
        // newline-separated in the panel -> string[]
        c.goals = String(payload.goals)
          .split('\n')
          .map((g) => g.trim())
          .filter(Boolean)
        await saveRun(run)
      }
      await sendState(chatId, userId)
      break
    }

    case 'save_sheet': {
      const chatId = await activeChatId(payload.chatId, userId)
      if (!chatId) break
      const run = await loadRun(chatId)
      const c = findChar(run, payload.characterId)
      const section = slugify(String(payload.section ?? ''))
      if (c && section) {
        const content = String(payload.content ?? '')
        if (content.trim()) c.sheet[section] = content
        else delete c.sheet[section]
        await saveRun(run)
      }
      await sendState(chatId, userId)
      break
    }
  }
 } catch (err) {
  // A missing permission (chats/characters/world_books) must never crash the
  // worker — surface it to the panel instead.
  spindle.log.error(`[psyche] frontend handler error: ${String(err)}`)
  spindle.sendToFrontend(
    { type: 'state', snapshot: null, note: `Action failed — check Psyche's permissions are granted. (${String(err)})` },
    userId,
  )
 }
})

function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}
function clampFloat(v: unknown, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

/* ------------------------------- boot ------------------------------ */
// Register the injection interceptor unconditionally (the proven WI-extension
// pattern). If `generation` isn't granted yet, the host ignores it and it takes
// effect when the worker reloads on grant.
registerInjectionInterceptor()

;(async () => {
  await loadConfig()
  spindle.log.info('[psyche] loaded')
})()
