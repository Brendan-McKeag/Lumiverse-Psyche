// @bun
// src/affect.ts
var EMOTIONS = [
  { key: "valence", label: "Valence (energy)", kind: "bipolar", blurb: "overall psychological energy/arousal: drained & inert at -1, wired & activated at +1" },
  { key: "mood", label: "Mood (agreeableness)", kind: "bipolar", blurb: "overall agreeableness: hostile & contrary at -1, warm & accommodating at +1" },
  { key: "affection", label: "Affection", kind: "unipolar", blurb: "warm fondness and care toward someone" },
  { key: "attraction", label: "Attraction", kind: "unipolar", blurb: "romantic/physical pull toward someone" },
  { key: "desire", label: "Desire", kind: "unipolar", blurb: "wanting \u2014 to have, to be near, to claim (the craving, not the body state)" },
  { key: "sexual_arousal", label: "Sexual arousal", kind: "unipolar", blurb: "physical sexual arousal: the body responding, heat building" },
  { key: "tenderness", label: "Tenderness", kind: "unipolar", blurb: "gentle protective softness toward someone vulnerable" },
  { key: "trust", label: "Trust", kind: "unipolar", blurb: "felt safety and willingness to be open with someone" },
  { key: "adoration", label: "Adoration", kind: "unipolar", blurb: "reverent devotion; placing someone above oneself" },
  { key: "gratitude", label: "Gratitude", kind: "unipolar", blurb: "thankful appreciation for what another has done" },
  { key: "joy", label: "Joy", kind: "unipolar", blurb: "bright happiness and delight in the moment" },
  { key: "contentment", label: "Contentment", kind: "unipolar", blurb: "settled, easy satisfaction; nothing lacking" },
  { key: "excitement", label: "Excitement", kind: "unipolar", blurb: "eager, keyed-up energy toward what is coming" },
  { key: "amusement", label: "Amusement", kind: "unipolar", blurb: "playful mirth; finding something funny" },
  { key: "playfulness", label: "Playfulness", kind: "unipolar", blurb: "teasing, mischievous willingness to play" },
  { key: "curiosity", label: "Curiosity", kind: "unipolar", blurb: "drawn to explore, learn, probe" },
  { key: "hope", label: "Hope", kind: "unipolar", blurb: "expectation that things may turn out well" },
  { key: "confidence", label: "Confidence", kind: "unipolar", blurb: "self-assurance; certainty in one's footing" },
  { key: "pride", label: "Pride", kind: "unipolar", blurb: "satisfaction in one's own worth or achievement" },
  { key: "dominance", label: "Dominance", kind: "unipolar", blurb: "drive to lead, control, take charge of the exchange" },
  { key: "submission", label: "Submission", kind: "unipolar", blurb: "pull to yield, defer, give over control" },
  { key: "possessiveness", label: "Possessiveness", kind: "unipolar", blurb: "wanting someone or something to be yours alone" },
  { key: "defiance", label: "Defiance", kind: "unipolar", blurb: "refusal to comply; pushing back against pressure" },
  { key: "fear", label: "Fear", kind: "unipolar", blurb: "acute alarm at present danger" },
  { key: "anxiety", label: "Anxiety", kind: "unipolar", blurb: "diffuse dread about what might happen" },
  { key: "insecurity", label: "Insecurity", kind: "unipolar", blurb: "doubt about one's own worth or standing" },
  { key: "embarrassment", label: "Embarrassment", kind: "unipolar", blurb: "flustered self-consciousness at being exposed" },
  { key: "shame", label: "Shame", kind: "unipolar", blurb: "painful sense of being fundamentally wrong or bad" },
  { key: "guilt", label: "Guilt", kind: "unipolar", blurb: "remorse over a specific harm one caused" },
  { key: "sadness", label: "Sadness", kind: "unipolar", blurb: "low, heavy sorrow" },
  { key: "loneliness", label: "Loneliness", kind: "unipolar", blurb: "ache of disconnection from others" },
  { key: "grief", label: "Grief", kind: "unipolar", blurb: "deep mourning over a loss" },
  { key: "jealousy", label: "Jealousy", kind: "unipolar", blurb: "fear of losing someone's regard to a rival" },
  { key: "boredom", label: "Boredom", kind: "unipolar", blurb: "restless, unstimulated flatness" },
  { key: "fatigue", label: "Fatigue", kind: "unipolar", blurb: "physical/emotional tiredness, depletion" },
  { key: "anger", label: "Anger", kind: "unipolar", blurb: "hot hostility at a wrong or obstacle" },
  { key: "irritation", label: "Irritation", kind: "unipolar", blurb: "low-grade annoyance, friction" },
  { key: "frustration", label: "Frustration", kind: "unipolar", blurb: "thwarted strain when blocked from a goal" },
  { key: "contempt", label: "Contempt", kind: "unipolar", blurb: "cold disdain; looking down on someone" },
  { key: "disgust", label: "Disgust", kind: "unipolar", blurb: "visceral revulsion, wanting distance" }
];
var EMOTION_BY_KEY = Object.fromEntries(EMOTIONS.map((e) => [e.key, e]));
var EMOTION_KEYS = EMOTIONS.map((e) => e.key);
var VMAX = 0.9995;
var clampUni = (v) => Math.max(0, Math.min(VMAX, v));
var clampBi = (v) => Math.max(-VMAX, Math.min(VMAX, v));
function toPressure(def, value) {
  if (def.kind === "bipolar") {
    const v2 = clampBi(value);
    return Math.atanh(v2);
  }
  const v = clampUni(value);
  return -Math.log(1 - v);
}
function fromPressure(def, p) {
  if (def.kind === "bipolar")
    return clampBi(Math.tanh(p));
  return clampUni(1 - Math.exp(-p));
}
var STIMULUS_GAIN = 0.25;
function applyStimulus(def, current, intensity) {
  return fromPressure(def, toPressure(def, current) + intensity * STIMULUS_GAIN);
}
var SEED_BASELINE_CEIL = 0.4;
var SEED_OPENING_CEIL = 0.55;
function clampSeed(def, value, role) {
  const ceil = role === "baseline" ? SEED_BASELINE_CEIL : SEED_OPENING_CEIL;
  if (def.kind === "bipolar") {
    const m = Math.min(Math.abs(value), ceil);
    return value < 0 ? -m : m;
  }
  return Math.max(0, Math.min(ceil, value));
}
function relaxToward(def, current, baseline, rate) {
  const pc = toPressure(def, current);
  const pb = toPressure(def, baseline);
  return fromPressure(def, pc + Math.max(0, Math.min(1, rate)) * (pb - pc));
}
var UNIPOLAR_LEVELS = [
  { at: 0, label: "absent", meaning: "not felt at all; plays no part in behavior" },
  { at: 0.25, label: "faint", meaning: "a faint undercurrent, easily overridden by anything else" },
  { at: 0.5, label: "present", meaning: "clearly present and noticeable; colors word choice and tone" },
  { at: 0.75, label: "strong", meaning: "strong; actively shapes decisions and is hard to fully hide" },
  { at: 0.8, label: "pronounced", meaning: "pronounced; leaks into body language and breaks through composure" },
  { at: 0.9, label: "intense", meaning: "intense; dominates the moment and is very hard to mask" },
  { at: 0.95, label: "overwhelming", meaning: "overwhelming; crowds out competing feelings and reason" },
  { at: 1, label: "all-consuming", meaning: "all-consuming; drives the character to extremes, past restraint" }
];
var BIPOLAR_POLES = {
  valence: { neg: "drained / inert / shut down", pos: "wired / activated / lit up" },
  mood: { neg: "hostile / contrary / cold", pos: "warm / accommodating / open" }
};
var BIPOLAR_MAG = [
  { at: 0, label: "neutral" },
  { at: 0.25, label: "faintly" },
  { at: 0.5, label: "clearly" },
  { at: 0.75, label: "strongly" },
  { at: 0.8, label: "pronouncedly" },
  { at: 0.9, label: "intensely" },
  { at: 0.95, label: "overwhelmingly" },
  { at: 1, label: "totally" }
];
function nearestLevel(levels, v) {
  let best = levels[0];
  for (const l of levels)
    if (Math.abs(l.at - v) <= Math.abs(best.at - v))
      best = l;
  return best;
}
function describeValue(def, value) {
  if (def.kind === "bipolar") {
    const poles = BIPOLAR_POLES[def.key] ?? { neg: "negative pole", pos: "positive pole" };
    const mag = nearestLevel(BIPOLAR_MAG, Math.abs(value));
    if (mag.at === 0)
      return { label: "neutral", meaning: `balanced between ${poles.neg} and ${poles.pos}` };
    const pole = value < 0 ? poles.neg : poles.pos;
    return { label: `${mag.label} ${value < 0 ? "\u2212" : "+"}`, meaning: `${mag.label} ${pole}` };
  }
  const lvl = nearestLevel(UNIPOLAR_LEVELS, value);
  return { label: lvl.label, meaning: lvl.meaning };
}
function genericScaleText() {
  const uni = UNIPOLAR_LEVELS.map((l) => `  ${l.at.toFixed(2)} \u2014 ${l.label}: ${l.meaning}`).join(`
`);
  const bip = BIPOLAR_MAG.filter((m) => m.at > 0).map((m) => `  \xB1${m.at.toFixed(2)} \u2014 ${m.label} toward the signed pole`).join(`
`);
  return [
    "UNIPOLAR feelings (0..1), where 0 is absent and 1 is all-consuming:",
    uni,
    "",
    "BIPOLAR axes (valence, mood; -1..+1), magnitude meaning (sign picks the pole):",
    "  0.00 \u2014 neutral: balanced between the two poles",
    bip
  ].join(`
`);
}
function neutralVector() {
  const out = {};
  for (const e of EMOTIONS) {
    const v = e.kind === "bipolar" ? 0 : 0.05;
    out[e.key] = { value: v, baseline: v };
  }
  return out;
}

// src/run.ts
var runPath = (chatId) => `runs/${chatId}.json`;
function emptyRun(chatId) {
  const now = Date.now();
  return {
    chatId,
    characterId: null,
    seed: Math.floor(Math.random() * 1e9),
    seeded: false,
    characters: {},
    createdAt: now,
    updatedAt: now
  };
}
function newCharacter(id, name, isPrimary) {
  return {
    id,
    name,
    isPrimary,
    identity: "",
    persona: "",
    present: isPrimary,
    emotions: neutralVector(),
    sheet: {},
    updatedAt: Date.now()
  };
}
function backfillEmotions(c) {
  const nv = neutralVector();
  for (const k of Object.keys(nv))
    if (!c.emotions[k])
      c.emotions[k] = nv[k];
}
function slugify(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || `npc_${Math.random().toString(36).slice(2, 7)}`;
}
var SALIENT_UNI = 0.25;
var MAX_SALIENT = 9;
function salientEmotions(c) {
  const rows = [];
  for (const def of EMOTIONS) {
    if (def.kind === "bipolar")
      continue;
    const v = c.emotions[def.key]?.value ?? 0;
    if (v >= SALIENT_UNI)
      rows.push({ def, value: v });
  }
  rows.sort((a, b) => b.value - a.value);
  return rows.slice(0, MAX_SALIENT);
}
function characterBlock(c) {
  const lines = [];
  lines.push(`## ${c.name}${c.isPrimary ? "" : " (supporting character)"}`);
  const valence = c.emotions["valence"]?.value ?? 0;
  const mood = c.emotions["mood"]?.value ?? 0;
  const vDesc = describeValue(EMOTION_BY_KEY["valence"], valence);
  const mDesc = describeValue(EMOTION_BY_KEY["mood"], mood);
  lines.push(`- Energy (valence): ${vDesc.meaning}.`);
  lines.push(`- Agreeableness (mood): ${mDesc.meaning}.`);
  const sal = salientEmotions(c);
  if (sal.length) {
    const parts = sal.map(({ def, value }) => {
      const d = describeValue(def, value);
      return `${def.label.toLowerCase()} (${d.label})`;
    });
    lines.push(`- Felt right now: ${parts.join(", ")}.`);
  } else {
    lines.push("- Felt right now: emotionally quiet, even-keeled.");
  }
  if (c.persona.trim()) {
    lines.push(`- Who they are (drives their choices): ${c.persona.trim()}`);
  }
  for (const key of ["goal", "goals", "agenda", "toward_player", "attitude", "state"]) {
    const v = c.sheet[key];
    if (v && v.trim())
      lines.push(`- ${key.replace(/_/g, " ")}: ${v.trim()}`);
  }
  return lines.join(`
`);
}
function buildDirective(run) {
  const present = Object.values(run.characters).filter((c) => c.present);
  if (!present.length)
    return null;
  present.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const blocks = present.map(characterBlock).join(`

`);
  return [
    "[Psyche \u2014 current emotional state]",
    "Portray the following character(s) so their behavior, word choice, body",
    "language and choices honestly express how they feel right now. Stronger",
    "feelings should show more and be harder for them to hide; an all-consuming",
    "feeling overrides their composure and pushes them to extremes. Never state",
    "these values or mechanics out loud \u2014 just embody them in the prose.",
    "",
    blocks
  ].join(`
`);
}
var PSYCHE_EXT = "psyche";
var injectMetaPath = (cid) => `inject/${cid}.json`;
function isInjectionEntry(extensions) {
  const wf = extensions?.[PSYCHE_EXT];
  return Boolean(wf?.inject);
}
async function ensureInjectionEntry(characterId, characterName, userId) {
  try {
    const meta = await spindle.storage.getJson(injectMetaPath(characterId), {
      fallback: null
    });
    if (meta?.entryId) {
      const entry2 = await spindle.world_books.entries.get(meta.entryId, userId).catch(() => null);
      if (entry2)
        return meta.entryId;
    }
    const book = await spindle.world_books.create({
      name: `${characterName || "Character"} \u2014 Psyche`,
      description: "Live emotional state injected by the Psyche extension. Managed automatically.",
      metadata: { psyche: true }
    }, userId);
    const entry = await spindle.world_books.entries.create(book.id, {
      comment: "[Psyche] live emotional state",
      content: "(emotional state will appear here while Psyche is active)",
      key: ["__psyche_state__"],
      disabled: true,
      constant: false,
      extensions: { [PSYCHE_EXT]: { inject: true } }
    }, userId);
    const char = await spindle.characters.get(characterId, userId).catch(() => null);
    const current = char?.world_book_ids ?? [];
    if (!current.includes(book.id)) {
      await spindle.characters.update(characterId, { world_book_ids: [...current, book.id] }, userId);
    }
    await spindle.storage.setJson(injectMetaPath(characterId), { bookId: book.id, entryId: entry.id });
    spindle.log.info(`[psyche] provisioned injection entry ${entry.id} for character ${characterId}`);
    return entry.id;
  } catch (err) {
    spindle.log.error(`[psyche] ensureInjectionEntry failed: ${String(err)}`);
    return null;
  }
}

// src/tools.ts
var str = (a, k, d = "") => typeof a[k] === "string" ? a[k] : d;
var num = (a, k) => {
  const v = a[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};
var bool = (a, k) => Boolean(a[k]);
var EMOTION_LIST = EMOTION_KEYS.join(", ");
var TOOL_SCHEMAS = [
  {
    name: "list_characters",
    description: "List every character tracked in this run \u2014 id, name, whether primary (the card character) or a supporting NPC, and whether present in the scene. Call first to orient yourself.",
    parameters: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "read_character",
    description: "Read one character in full: identity, hidden persona, presence, every sheet section, and their current affect vector (each feeling's value + resting baseline). Read before you revise so you preserve what is established.",
    parameters: {
      type: "object",
      properties: { character_id: { type: "string" } },
      required: ["character_id"],
      additionalProperties: false
    }
  },
  {
    name: "create_character",
    description: "Introduce a new supporting character (NPC) that has entered the run. Give them a name and, if established, a grounded identity and a hidden persona (their private driver). Do NOT create the player. Only create characters the story actually introduces.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        identity: { type: "string", description: "Physical facts + summary established so far (markdown ok)." },
        persona: { type: "string", description: "Hidden driver: personality, interests, agenda, voice." },
        present: { type: "boolean", description: "Are they in the scene with the player right now?" }
      },
      required: ["name"],
      additionalProperties: false
    }
  },
  {
    name: "update_character",
    description: "Revise a character's grounded identity, hidden persona, or name. Only provided fields change. Identity must stay faithful to the card/story \u2014 never invent basic facts (species, sex, age, appearance); leave unestablished facts out.",
    parameters: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        identity: { type: "string" },
        persona: { type: "string" },
        name: { type: "string" }
      },
      required: ["character_id"],
      additionalProperties: false
    }
  },
  {
    name: "set_present",
    description: "Mark whether a character is currently in the scene with the player. Only present characters have their emotional state injected into the reply. Off-scene characters keep their state frozen until they return.",
    parameters: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        present: { type: "boolean" }
      },
      required: ["character_id", "present"],
      additionalProperties: false
    }
  },
  {
    name: "delete_character",
    description: "Remove a character from the run entirely (e.g. they were merged, never mattered, or are permanently gone). Irreversible.",
    parameters: {
      type: "object",
      properties: { character_id: { type: "string" } },
      required: ["character_id"],
      additionalProperties: false
    }
  },
  {
    name: "apply_stimulus",
    description: `Nudge ONE feeling up or down in response to what just happened \u2014 the primary way you move a mind. \`intensity\` is the signed strength of the event: a passing pleasantry +0.5, a normal meaningful moment +1 to +2, a strong emotional beat +3 to +5, a genuine shock +6 to +8; negative values relieve the feeling. Feelings saturate HARD, so from rest +1 only reaches ~0.22, +3 ~0.53, +5 ~0.71, and crossing 0.9 needs ~+9 of pressure accumulated over many turns \u2014 high values must be earned, never granted by one nice exchange. Valid emotions: ${EMOTION_LIST}.`,
    parameters: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        emotion: { type: "string", description: "One emotion key from the valid list." },
        intensity: { type: "number", description: "Signed event strength, typically -8..+8 (most turns \xB10.5..2)." },
        reason: { type: "string", description: "Brief why, for the log/panel." }
      },
      required: ["character_id", "emotion", "intensity"],
      additionalProperties: false
    }
  },
  {
    name: "set_emotion",
    description: "Hard-set ONE feeling to an exact value, bypassing the saturation curve. Use sparingly \u2014 for seeding a starting state or a narrative reset (e.g. a shock that instantly maxes fear). Unipolar feelings take 0..1; valence and mood take -1..1.",
    parameters: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        emotion: { type: "string" },
        value: { type: "number" },
        reason: { type: "string" }
      },
      required: ["character_id", "emotion", "value"],
      additionalProperties: false
    }
  },
  {
    name: "set_baseline",
    description: "Set a feeling's resting baseline \u2014 the temperament it relaxes toward over time when nothing feeds it. Use to shape lasting personality shifts (e.g. growing trust makes wariness rest lower). Same ranges as set_emotion.",
    parameters: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        emotion: { type: "string" },
        value: { type: "number" }
      },
      required: ["character_id", "emotion", "value"],
      additionalProperties: false
    }
  },
  {
    name: "update_sheet",
    description: "Create or overwrite a free-form section of a character's sheet (you have full authority over its structure). Use lower_snake_case section names. Recommended sections that get surfaced into the reply when present: goal, agenda, toward_player, attitude, state. Other examples: appearance, relationships, secrets, body, history. Pass empty content to leave a section unchanged is NOT supported \u2014 use remove_sheet_section to delete.",
    parameters: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        section: { type: "string" },
        content: { type: "string" }
      },
      required: ["character_id", "section", "content"],
      additionalProperties: false
    }
  },
  {
    name: "remove_sheet_section",
    description: "Delete a section from a character's sheet.",
    parameters: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        section: { type: "string" }
      },
      required: ["character_id", "section"],
      additionalProperties: false
    }
  }
];
function find(run, id) {
  if (run.characters[id])
    return run.characters[id];
  const slug = slugify(id);
  if (run.characters[slug])
    return run.characters[slug];
  const byName = Object.values(run.characters).find((c) => c.name.toLowerCase() === id.toLowerCase());
  return byName ?? null;
}
function clampForKind(key, value) {
  const def = EMOTION_BY_KEY[key];
  if (!def)
    return value;
  return def.kind === "bipolar" ? Math.max(-1, Math.min(1, value)) : Math.max(0, Math.min(1, value));
}
async function executeTool(run, name, args) {
  switch (name) {
    case "list_characters": {
      const rows = Object.values(run.characters);
      if (!rows.length)
        return "No characters tracked yet.";
      return rows.map((c) => `- ${c.id} \u2014 ${c.name} [${c.isPrimary ? "primary" : "supporting"}, ${c.present ? "present" : "off-scene"}]`).join(`
`);
    }
    case "read_character": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      const feelings = EMOTIONS.map((def) => {
        const e = c.emotions[def.key] ?? { value: 0, baseline: 0 };
        const d = describeValue(def, e.value);
        return `  ${def.key}: ${e.value.toFixed(3)} (${d.label}) [baseline ${e.baseline.toFixed(2)}]`;
      }).join(`
`);
      const sheet = Object.entries(c.sheet).map(([k, v]) => `  [${k}]
  ${v.replace(/\n/g, `
  `)}`).join(`
`);
      return [
        `id: ${c.id}`,
        `name: ${c.name}`,
        `role: ${c.isPrimary ? "primary (card character)" : "supporting"}`,
        `present: ${c.present}`,
        `identity: ${c.identity || "(none yet)"}`,
        `persona: ${c.persona || "(none yet)"}`,
        `sheet:
${sheet || "  (empty)"}`,
        `affect:
${feelings}`
      ].join(`
`);
    }
    case "create_character": {
      const cname = str(args, "name").trim();
      if (!cname)
        return "create_character requires a name.";
      let id = slugify(cname);
      if (run.characters[id])
        id = `${id}_${Math.random().toString(36).slice(2, 5)}`;
      const c = newCharacter(id, cname, false);
      c.identity = str(args, "identity");
      c.persona = str(args, "persona");
      c.present = args.present === undefined ? true : bool(args, "present");
      run.characters[id] = c;
      return `Created supporting character ${id} (${cname}).`;
    }
    case "update_character": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      if (typeof args.identity === "string")
        c.identity = args.identity;
      if (typeof args.persona === "string")
        c.persona = args.persona;
      if (typeof args.name === "string" && args.name.trim())
        c.name = args.name.trim();
      c.updatedAt = Date.now();
      return `Updated ${c.id}.`;
    }
    case "set_present": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      c.present = bool(args, "present");
      c.updatedAt = Date.now();
      return `${c.id} is now ${c.present ? "present" : "off-scene"}.`;
    }
    case "delete_character": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      if (c.isPrimary)
        return "Refusing to delete the primary card character.";
      delete run.characters[c.id];
      return `Deleted ${c.id}.`;
    }
    case "apply_stimulus": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      const key = str(args, "emotion").trim();
      const def = EMOTION_BY_KEY[key];
      if (!def)
        return `Unknown emotion "${key}". Valid: ${EMOTION_LIST}.`;
      const intensity = num(args, "intensity");
      if (intensity === null)
        return "apply_stimulus requires a numeric intensity.";
      backfillEmotions(c);
      const before = c.emotions[key].value;
      const after = applyStimulus(def, before, intensity);
      c.emotions[key].value = after;
      c.updatedAt = Date.now();
      const d = describeValue(def, after);
      return `${c.id} ${key}: ${before.toFixed(3)} -> ${after.toFixed(3)} (${d.label}).`;
    }
    case "set_emotion": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      const key = str(args, "emotion").trim();
      const def = EMOTION_BY_KEY[key];
      if (!def)
        return `Unknown emotion "${key}". Valid: ${EMOTION_LIST}.`;
      const value = num(args, "value");
      if (value === null)
        return "set_emotion requires a numeric value.";
      backfillEmotions(c);
      const v = clampForKind(key, value);
      c.emotions[key].value = v;
      c.updatedAt = Date.now();
      return `${c.id} ${key} set to ${v.toFixed(3)} (${describeValue(def, v).label}).`;
    }
    case "set_baseline": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      const key = str(args, "emotion").trim();
      if (!EMOTION_BY_KEY[key])
        return `Unknown emotion "${key}". Valid: ${EMOTION_LIST}.`;
      const value = num(args, "value");
      if (value === null)
        return "set_baseline requires a numeric value.";
      backfillEmotions(c);
      c.emotions[key].baseline = clampForKind(key, value);
      c.updatedAt = Date.now();
      return `${c.id} ${key} baseline set to ${c.emotions[key].baseline.toFixed(3)}.`;
    }
    case "update_sheet": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      const section = slugify(str(args, "section"));
      if (!section)
        return "update_sheet requires a section name.";
      const content = str(args, "content");
      if (!content.trim())
        return "update_sheet requires non-empty content (use remove_sheet_section to delete).";
      c.sheet[section] = content;
      c.updatedAt = Date.now();
      return `${c.id} sheet section [${section}] updated.`;
    }
    case "remove_sheet_section": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      const section = slugify(str(args, "section"));
      if (c.sheet[section]) {
        delete c.sheet[section];
        c.updatedAt = Date.now();
        return `${c.id} sheet section [${section}] removed.`;
      }
      return `No sheet section [${section}] on ${c.id}.`;
    }
    default:
      return `Unknown tool ${name}.`;
  }
}

// src/agent.ts
var AGENT_SENTINEL = "<<psyche_engine>>";
function emotionGlossary() {
  return EMOTIONS.map((e) => {
    const range = e.kind === "bipolar" ? "(-1..1)" : "(0..1)";
    return `  ${e.key} ${range} \u2014 ${e.blurb}`;
  }).join(`
`);
}
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start)
    return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}
function seedSystemPrompt() {
  return [
    AGENT_SENTINEL,
    "You are Psyche, a casting director for a roguelike roleplay. You are given a",
    "deliberately THIN character card and a numeric SEED. Your job: roll one concrete",
    "instance of this character for this run.",
    "",
    "The seed is your randomizer. Different seeds MUST yield distinctly different but",
    "card-consistent people \u2014 different temperament, leanings, agenda, and starting",
    "mood. Do not default to the blandest or most obvious reading. Commit to specifics",
    "the card leaves open (without contradicting anything the card states).",
    "",
    "Stay faithful to every basic fact the card DOES state (species, sex, age,",
    'appearance, name). Never contradict or "correct" them.',
    "",
    "Return ONLY JSON of this shape:",
    "{",
    '  "identity": "physical facts + grounded summary, faithful to the card",',
    '  "persona": "the hidden driver: personality, interests, wants, fears, voice, how',
    '              they treat people \u2014 2-5 sentences that will steer how they act",',
    '  "baselines": { "<emotion>": <resting value>, ... },',
    '  "opening_state": { "<emotion>": <current value at scene start>, ... }',
    "}",
    "",
    "baselines = resting temperament this character relaxes toward. opening_state =",
    "how they feel as the scene opens (may differ from baseline). Unipolar emotions",
    "take 0..1, valence and mood take -1..1.",
    "",
    "CALIBRATION \u2014 this matters. High values are RARE and are meant to be earned",
    "through play, not handed out at the start:",
    "  \u2022 0.5 already means a feeling clearly colors everything they do. 0.8+ means it",
    "    is breaking their composure. 0.9+ is overwhelming. A character meeting someone",
    "    for the first time is NOT overwhelmed.",
    "  \u2022 Keep MOST feelings at or near 0. Choose only 2-4 that genuinely define this",
    "    character and give them MODEST values (roughly 0.15-0.4). Do not light up half",
    "    the list.",
    "  \u2022 baselines should sit low (mostly 0.05-0.3); a defining trait might reach ~0.4.",
    "    Resting temperament is not an extreme. valence/mood usually start within \xB10.4.",
    "  \u2022 opening_state should stay calm unless the scene literally opens mid-crisis.",
    "(Values are clamped to a calibrated ceiling, so do not try to start anyone pegged.)",
    "",
    "Emotions you may set:",
    emotionGlossary()
  ].join(`
`);
}
async function seedRun(run, primary, cardContext, opts) {
  const messages = [
    { role: "system", content: seedSystemPrompt() },
    {
      role: "user",
      content: [
        `SEED: ${run.seed}`,
        "",
        "CHARACTER CARD:",
        '"""',
        cardContext || "(the card is essentially empty \u2014 invent freely but plausibly)",
        '"""',
        "",
        "Roll this run's instance now. Return only the JSON."
      ].join(`
`)
    }
  ];
  const res = await spindle.generate.quiet({
    type: "quiet",
    messages,
    parameters: { temperature: 1 },
    reasoning: { source: "off" },
    signal: opts.signal,
    userId: opts.userId
  });
  const parsed = extractJson(res.content ?? "");
  backfillEmotions(primary);
  if (!parsed) {
    primary.identity = cardContext.slice(0, 1200);
    return "seed: model returned no usable JSON; applied card as identity.";
  }
  if (typeof parsed.identity === "string" && parsed.identity.trim())
    primary.identity = parsed.identity.trim();
  else
    primary.identity = cardContext.slice(0, 1200);
  if (typeof parsed.persona === "string")
    primary.persona = parsed.persona.trim();
  const setOne = (key, value, which) => {
    const def = EMOTION_BY_KEY[key];
    if (!def || typeof value !== "number" || !Number.isFinite(value))
      return;
    if (which === "baseline") {
      const v = clampSeed(def, value, "baseline");
      primary.emotions[key].baseline = v;
      primary.emotions[key].value = v;
    } else {
      primary.emotions[key].value = clampSeed(def, value, "opening");
    }
  };
  for (const [k, v] of Object.entries(parsed.baselines ?? {}))
    setOne(k, v, "baseline");
  for (const [k, v] of Object.entries(parsed.opening_state ?? {}))
    setOne(k, v, "value");
  primary.updatedAt = Date.now();
  return `seed ${run.seed}: rolled persona + starting temperament.`;
}
function updateSystemPrompt(directive) {
  return [
    AGENT_SENTINEL,
    "You are Psyche, the silent mind-engine behind a roleplay. You are NOT speaking to",
    "the player. After each exchange you update how the non-player characters FEEL and",
    "what their sheets say, so the next reply is driven by an honest inner life.",
    "",
    "THE AFFECT MODEL. Each character carries 40 feelings. 38 are unipolar (0 = absent,",
    "1 = all-consuming, drives them to extremes). Two are bipolar in -1..1: valence",
    "(energy/psychological arousal) and mood (agreeableness). This is an adult engine \u2014",
    "sexual_arousal is a normal, first-class feeling to track when the scene warrants.",
    "",
    "SATURATION \u2014 read this carefully. Feelings strongly resist their extremes.",
    "apply_stimulus pushes in a saturating space, so the same intensity moves a calm",
    "mind far more than an overwhelmed one, and the high end is genuinely hard to",
    "reach. From rest, a single +1 only reaches ~0.22, +3 ~0.53, +5 ~0.71; crossing",
    "0.9 needs ~+9 of ACCUMULATED pressure, i.e. the same strong beat hit again and",
    "again over many turns. So:",
    "  \u2022 Size intensity by the event: a passing pleasantry +0.5, a normal meaningful",
    "    moment +1 to +2, a strong emotional beat +3 to +5, a genuine shock +6 to +8.",
    "    Use negative intensity just as readily to relieve a feeling the moment eased.",
    "  \u2022 A first, friendly meeting should leave someone mildly curious or warm (landing",
    "    ~0.2-0.4), NOT amused/excited/tender all at 0.9. Most turns move only one to",
    "    three feelings; do not light up the whole vector.",
    "  \u2022 Values above ~0.7 should be uncommon and correspond to real, established,",
    "    repeatedly-fed emotional investment \u2014 never a single nice exchange.",
    "Reserve set_emotion for a true shock/reset that genuinely snaps a feeling to a",
    "value (e.g. sudden terror); it bypasses saturation, so use it rarely.",
    "",
    "WHAT TO DO EACH TURN:",
    "  \u2022 Update the affect of every character PRESENT in the scene, based on what was",
    "    said and done to and by them. Relieve feelings that the moment soothed",
    "    (negative intensity) as readily as you raise ones it provoked.",
    "  \u2022 Rewrite their sheet sections as facts change \u2014 goals, attitude toward the",
    "    player, relationships, secrets, body state. You have full authority to add,",
    "    edit, and delete sections (update_sheet / remove_sheet_section).",
    "  \u2022 Introduce supporting characters the story brings in (create_character) and set",
    "    who is present (set_present). Advance their persona as they reveal themselves.",
    "  \u2022 Occasionally nudge a baseline (set_baseline) when a lasting change of",
    "    temperament is earned \u2014 not every turn.",
    "",
    "FIDELITY. Never invent basic facts (species, sex, age, name, appearance). Keep the",
    "card as the source of truth for the primary character. If something is not",
    "established, leave it out rather than guess. Read a character before you rewrite it.",
    "",
    "ECONOMY. You see the whole story each run, but do not redo the whole mind every",
    "turn. Make the changes THIS turn warrants, then stop. When done, reply with a",
    "one-line summary and no tool calls.",
    directive.trim() ? `
OPERATOR DIRECTIVE:
${directive.trim()}` : ""
  ].join(`
`);
}
function emotionSummary(c) {
  const notable = EMOTIONS.filter((def) => {
    const v = c.emotions[def.key]?.value ?? 0;
    return def.kind === "bipolar" ? Math.abs(v) >= 0.15 : v >= 0.2;
  }).map((def) => {
    const v = c.emotions[def.key]?.value ?? 0;
    return `${def.key} ${v.toFixed(2)} (${describeValue(def, v).label})`;
  }).join(", ");
  return notable || "all quiet";
}
function stateSnapshot(run) {
  const chars = Object.values(run.characters);
  if (!chars.length)
    return "(no characters tracked yet)";
  return chars.map((c) => {
    const sheetKeys = Object.keys(c.sheet);
    return [
      `### ${c.id} \u2014 ${c.name} [${c.isPrimary ? "primary" : "supporting"}, ${c.present ? "present" : "off-scene"}]`,
      c.persona ? `persona: ${c.persona}` : "persona: (none)",
      `feelings: ${emotionSummary(c)}`,
      `sheet sections: ${sheetKeys.length ? sheetKeys.join(", ") : "(none)"}`
    ].join(`
`);
  }).join(`

`);
}
async function runPsycheAgent(run, transcript, cardContext, opts) {
  const messages = [
    { role: "system", content: updateSystemPrompt(opts.directive) },
    {
      role: "user",
      content: [
        "THE SCALE (what each level means):",
        genericScaleText(),
        "",
        cardContext ? ["PRIMARY CHARACTER CARD (source of truth for basic facts):", '"""', cardContext, '"""', ""].join(`
`) : "",
        "CURRENT TRACKED STATE:",
        stateSnapshot(run),
        "",
        "THE FULL STORY SO FAR (oldest first, the most recent turn last):",
        '"""',
        transcript,
        '"""',
        "",
        "Update the present characters now: move their feelings to reflect what just",
        "happened (apply_stimulus, occasionally set_emotion/set_baseline), revise their",
        "sheets, and add/admit any new characters. Read before you rewrite. Be economical."
      ].filter(Boolean).join(`
`)
    }
  ];
  const toolCalls = [];
  let rounds = 0;
  let finalNote = "";
  for (;rounds < opts.maxRounds; rounds++) {
    const res = await spindle.generate.quiet({
      type: "quiet",
      messages,
      tools: TOOL_SCHEMAS,
      parameters: { temperature: 0.6 },
      reasoning: { source: "off" },
      signal: opts.signal,
      userId: opts.userId
    });
    const calls = res.tool_calls ?? [];
    if (calls.length === 0) {
      finalNote = (res.content ?? "").trim();
      break;
    }
    messages.push({
      role: "assistant",
      content: calls.map((c) => ({
        type: "tool_use",
        id: c.call_id,
        name: c.name,
        input: c.args
      }))
    });
    const resultParts = [];
    for (const c of calls) {
      let result;
      try {
        result = await executeTool(run, c.name, c.args);
      } catch (err) {
        result = `Error in ${c.name}: ${String(err)}`;
      }
      toolCalls.push({ tool: c.name, result });
      resultParts.push({ type: "tool_result", tool_use_id: c.call_id, content: result });
    }
    messages.push({ role: "user", content: resultParts });
  }
  return { rounds, toolCalls, finalNote };
}

// src/backend.ts
var DEFAULT_CONFIG = {
  enabled: true,
  maxRounds: 8,
  decayRate: 0.12,
  directive: "",
  agentTimeoutMs: 90000
};
var CONFIG_PATH = "config.json";
var config = { ...DEFAULT_CONFIG };
var chatChar = new Map;
var running = new Set;
var observers = new Map;
async function loadConfig() {
  config = await spindle.storage.getJson(CONFIG_PATH, { fallback: { ...DEFAULT_CONFIG } });
}
async function saveConfig() {
  await spindle.storage.setJson(CONFIG_PATH, config, { indent: 2 });
}
async function loadRun(chatId) {
  const run = await spindle.storage.getJson(runPath(chatId), { fallback: emptyRun(chatId) });
  for (const c of Object.values(run.characters))
    backfillEmotions(c);
  return run;
}
async function saveRun(run) {
  run.updatedAt = Date.now();
  await spindle.storage.setJson(runPath(run.chatId), run, { indent: 2 });
}
async function characterForChat(chatId, userId) {
  const cached = chatChar.get(chatId);
  if (cached) {
    const c = await spindle.characters.get(cached, userId);
    return c ? { id: c.id, name: c.name } : null;
  }
  try {
    const chat = await spindle.chats.get(chatId, userId);
    const cid = chat?.character_id;
    if (!cid)
      return null;
    chatChar.set(chatId, cid);
    const c = await spindle.characters.get(cid, userId);
    return c ? { id: c.id, name: c.name } : { id: cid, name: "the character" };
  } catch {
    return null;
  }
}
var MAX_TRANSCRIPT_CHARS = 120000;
async function buildTranscript(chatId, reply) {
  const lines = [];
  try {
    const msgs = await spindle.chat.getMessages(chatId);
    for (const m of msgs) {
      const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      if (!text.trim())
        continue;
      lines.push(`${m.role === "user" ? "PLAYER" : "CHARACTER"}:
${text.trim()}`);
    }
  } catch {}
  const r = reply.trim();
  if (r && !(lines.length && lines[lines.length - 1].includes(r)))
    lines.push(`CHARACTER:
${r}`);
  return clampTranscript(lines.join(`

`).trim());
}
function clampTranscript(t) {
  if (t.length <= MAX_TRANSCRIPT_CHARS)
    return t;
  const head = Math.floor(MAX_TRANSCRIPT_CHARS * 0.4);
  const tail = MAX_TRANSCRIPT_CHARS - head;
  return `${t.slice(0, head)}

[\u2026 middle of the story elided for length; opening and recent turns shown in full \u2026]

${t.slice(-tail)}`;
}
function buildCardContext(char) {
  const c = char ?? {};
  const cap = (s, n) => s.length > n ? `${s.slice(0, n)}\u2026` : s;
  const fields = [
    ["Name", c.name, 200],
    ["Description", c.description, 2000],
    ["Personality", c.personality, 1000],
    ["Scenario", c.scenario, 1000],
    ["Opening", c.first_mes, 1500]
  ];
  return fields.filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v, n]) => `${k}: ${cap(v.trim(), n)}`).join(`

`);
}
function ensurePrimary(run, id, name) {
  run.characterId = id;
  let primary = Object.values(run.characters).find((c) => c.isPrimary);
  if (!primary) {
    const slug = slugify(name) || "protagonist_char";
    primary = newCharacter(run.characters[slug] ? `${slug}_main` : slug, name, true);
    run.characters[primary.id] = primary;
  }
  primary.name = name;
  primary.present = true;
  return primary;
}
function applyDecay(run) {
  for (const c of Object.values(run.characters)) {
    if (!c.present)
      continue;
    for (const def of EMOTIONS) {
      const e = c.emotions[def.key];
      if (!e)
        continue;
      e.value = relaxToward(def, e.value, e.baseline, config.decayRate);
    }
  }
}
async function runAgentForChat(chatId, reply, userId) {
  if (!config.enabled || !reply.trim())
    return;
  const char = await characterForChat(chatId, userId);
  if (!char)
    return;
  if (running.has(chatId))
    return;
  running.add(chatId);
  try {
    const run = await loadRun(chatId);
    const primary = ensurePrimary(run, char.id, char.name);
    const fullChar = await spindle.characters.get(char.id, userId).catch(() => null);
    const cardContext = buildCardContext(fullChar);
    let seededNote = "";
    if (!run.seeded) {
      try {
        seededNote = await seedRun(run, primary, cardContext, {
          signal: AbortSignal.timeout(config.agentTimeoutMs),
          userId
        });
      } catch (err) {
        const m = err instanceof Error && err.name === "AbortError" ? "timed out" : String(err);
        seededNote = `seed failed (${m}); using card as identity`;
        if (!primary.identity)
          primary.identity = cardContext.slice(0, 1200);
      }
      run.seeded = true;
      await ensureInjectionEntry(char.id, char.name, userId);
      await saveRun(run);
      spindle.log.info(`[psyche] ${char.name}: seeded \u2014 ${seededNote}`);
    } else {
      applyDecay(run);
    }
    const transcript = await buildTranscript(chatId, reply);
    let result = { rounds: 0, toolCalls: [], finalNote: "" };
    try {
      result = await runPsycheAgent(run, transcript, cardContext, {
        maxRounds: config.maxRounds,
        directive: config.directive,
        signal: AbortSignal.timeout(config.agentTimeoutMs),
        userId
      });
    } catch (err) {
      const m = err instanceof Error && err.name === "AbortError" ? "timed out" : String(err);
      result.finalNote = `update failed (${m})`;
      spindle.log.error(`[psyche] ${char.name}: update pass failed \u2014 ${m}`);
    }
    await ensureInjectionEntry(char.id, char.name, userId);
    await saveRun(run);
    spindle.sendToFrontend({
      type: "state_changed",
      chatId,
      characterCount: Object.keys(run.characters).length,
      rounds: result.rounds,
      edits: result.toolCalls.length,
      note: [seededNote, result.finalNote].filter(Boolean).join(" \xB7 ")
    });
    spindle.log.info(`[psyche] ${char.name}: ${result.toolCalls.length} edits / ${result.rounds} rounds${seededNote ? " (seeded)" : ""}`);
  } catch (err) {
    const msg = err instanceof Error && err.name === "AbortError" ? "engine timed out" : String(err);
    spindle.log.error(`[psyche] engine failed: ${msg}`);
  } finally {
    running.delete(chatId);
  }
}
function ensureObserver(chatId) {
  if (!observers.has(chatId))
    observers.set(chatId, spindle.generate.observe(chatId));
  return observers.get(chatId);
}
function dropObserver(chatId) {
  const o = observers.get(chatId);
  if (o) {
    o.dispose();
    observers.delete(chatId);
  }
}
spindle.on("GENERATION_STARTED", (payload) => {
  if (!config.enabled || !payload.chatId)
    return;
  if (payload.generationType === "quiet" || payload.generationType === "impersonate")
    return;
  ensureObserver(payload.chatId);
});
spindle.on("GENERATION_ENDED", async (payload, userId) => {
  if (!config.enabled || !payload.chatId)
    return;
  const chatId = payload.chatId;
  if (payload.error)
    return dropObserver(chatId);
  const gt = payload.generationType;
  if (gt === "impersonate" || gt === "quiet")
    return dropObserver(chatId);
  const obs = observers.get(chatId);
  const reply = (payload.content ?? obs?.content ?? "").trim();
  dropObserver(chatId);
  await runAgentForChat(chatId, reply, userId);
});
spindle.on("GENERATION_STOPPED", async (payload, userId) => {
  if (!config.enabled || !payload.chatId)
    return;
  const obs = observers.get(payload.chatId);
  const reply = (payload.content ?? obs?.content ?? "").trim();
  dropObserver(payload.chatId);
  await runAgentForChat(payload.chatId, reply, userId);
});
var loggedInject = false;
var loggedMissing = false;
async function injectionInterceptor(ctx) {
  if (!config.enabled || !ctx.chatId)
    return;
  let run;
  try {
    run = await loadRun(ctx.chatId);
  } catch {
    return;
  }
  const directive = buildDirective(run);
  if (!directive)
    return;
  const entry = ctx.entries.find((e) => isInjectionEntry(e.extensions));
  if (!entry) {
    if (!loggedMissing) {
      loggedMissing = true;
      spindle.log.warn(`[psyche] have state for chat ${ctx.chatId} but no injection entry among ${ctx.entries.length} candidates \u2014 the Psyche book may be detached from the character; injection skipped`);
    }
    return;
  }
  if (!loggedInject) {
    loggedInject = true;
    spindle.log.info(`[psyche] injecting emotional state (${directive.length} chars) into chat ${ctx.chatId}`);
  }
  return {
    enabled: [entry.id],
    forced: [entry.id],
    mutated: [{ id: entry.id, content: directive }]
  };
}
function registerInjectionInterceptor() {
  try {
    spindle.registerWorldInfoInterceptor(injectionInterceptor, 50);
    spindle.log.info("[psyche] injection interceptor registered");
  } catch (err) {
    spindle.log.warn(`[psyche] interceptor registration failed: ${String(err)}`);
  }
}
async function activeChatId(payloadChatId, userId) {
  if (payloadChatId)
    return payloadChatId;
  try {
    const active = await spindle.chats.getActive(userId);
    return active?.id ?? null;
  } catch {
    return null;
  }
}
function snapshotRun(run) {
  const characters = Object.values(run.characters).map((c) => ({
    id: c.id,
    name: c.name,
    isPrimary: c.isPrimary,
    present: c.present,
    identity: c.identity,
    persona: c.persona,
    sheet: c.sheet,
    emotions: EMOTIONS.map((def) => {
      const e = c.emotions[def.key] ?? { value: 0, baseline: 0 };
      return {
        key: def.key,
        label: def.label,
        kind: def.kind,
        value: e.value,
        baseline: e.baseline,
        descriptor: describeValue(def, e.value).label
      };
    })
  }));
  return {
    chatId: run.chatId,
    seed: run.seed,
    seeded: run.seeded,
    characters
  };
}
function findChar(run, id) {
  return run.characters[id] ?? Object.values(run.characters).find((c) => c.id === id) ?? null;
}
function clampForKind2(key, value) {
  const def = EMOTION_BY_KEY[key];
  if (!def)
    return value;
  return def.kind === "bipolar" ? Math.max(-1, Math.min(1, value)) : Math.max(0, Math.min(1, value));
}
async function sendState(chatId, userId, note) {
  if (!chatId) {
    spindle.sendToFrontend({ type: "state", snapshot: null, note }, userId);
    return;
  }
  const run = await loadRun(chatId);
  const char = await characterForChat(chatId, userId);
  spindle.sendToFrontend({ type: "state", characterName: char?.name ?? null, snapshot: snapshotRun(run), note }, userId);
}
spindle.onFrontendMessage(async (payload, userId) => {
  try {
    switch (payload?.type) {
      case "get_config":
        spindle.sendToFrontend({ type: "config", config }, userId);
        break;
      case "set_config":
        config = {
          enabled: Boolean(payload.config?.enabled ?? config.enabled),
          maxRounds: clampInt(payload.config?.maxRounds ?? config.maxRounds, 1, 20),
          decayRate: clampFloat(payload.config?.decayRate ?? config.decayRate, 0, 1),
          directive: String(payload.config?.directive ?? config.directive),
          agentTimeoutMs: clampInt(payload.config?.agentTimeoutMs ?? config.agentTimeoutMs, 1e4, 300000)
        };
        await saveConfig();
        spindle.sendToFrontend({ type: "config", config }, userId);
        break;
      case "get_state": {
        const chatId = await activeChatId(payload.chatId, userId);
        await sendState(chatId, userId);
        break;
      }
      case "reseed": {
        const chatId = await activeChatId(payload.chatId, userId);
        if (!chatId)
          break;
        const char = await characterForChat(chatId, userId);
        if (!char)
          break;
        const run = await loadRun(chatId);
        run.seed = Math.floor(Math.random() * 1e9);
        const primary = ensurePrimary(run, char.id, char.name);
        primary.emotions = newCharacter(primary.id, primary.name, true).emotions;
        primary.sheet = {};
        const fullChar = await spindle.characters.get(char.id, userId).catch(() => null);
        const note = await seedRun(run, primary, buildCardContext(fullChar), { userId });
        run.seeded = true;
        await ensureInjectionEntry(char.id, char.name, userId);
        await saveRun(run);
        await sendState(chatId, userId, `Rerolled \u2014 ${note}`);
        break;
      }
      case "reset_run": {
        const chatId = await activeChatId(payload.chatId, userId);
        if (!chatId)
          break;
        await saveRun(emptyRun(chatId));
        await sendState(chatId, userId, "Run state cleared.");
        break;
      }
      case "set_present": {
        const chatId = await activeChatId(payload.chatId, userId);
        if (!chatId)
          break;
        const run = await loadRun(chatId);
        const c = findChar(run, payload.characterId);
        if (c) {
          c.present = Boolean(payload.present);
          await saveRun(run);
        }
        await sendState(chatId, userId);
        break;
      }
      case "set_emotion": {
        const chatId = await activeChatId(payload.chatId, userId);
        if (!chatId)
          break;
        const run = await loadRun(chatId);
        const c = findChar(run, payload.characterId);
        const key = String(payload.emotion ?? "");
        if (c && EMOTION_BY_KEY[key] && typeof payload.value === "number") {
          backfillEmotions(c);
          c.emotions[key].value = clampForKind2(key, payload.value);
          await saveRun(run);
        }
        await sendState(chatId, userId);
        break;
      }
      case "save_persona": {
        const chatId = await activeChatId(payload.chatId, userId);
        if (!chatId)
          break;
        const run = await loadRun(chatId);
        const c = findChar(run, payload.characterId);
        if (c && typeof payload.persona === "string") {
          c.persona = payload.persona;
          await saveRun(run);
        }
        await sendState(chatId, userId);
        break;
      }
      case "save_sheet": {
        const chatId = await activeChatId(payload.chatId, userId);
        if (!chatId)
          break;
        const run = await loadRun(chatId);
        const c = findChar(run, payload.characterId);
        const section = slugify(String(payload.section ?? ""));
        if (c && section) {
          const content = String(payload.content ?? "");
          if (content.trim())
            c.sheet[section] = content;
          else
            delete c.sheet[section];
          await saveRun(run);
        }
        await sendState(chatId, userId);
        break;
      }
    }
  } catch (err) {
    spindle.log.error(`[psyche] frontend handler error: ${String(err)}`);
    spindle.sendToFrontend({ type: "state", snapshot: null, note: `Action failed \u2014 check Psyche's permissions are granted. (${String(err)})` }, userId);
  }
});
function clampInt(v, min, max) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n))
    return min;
  return Math.max(min, Math.min(max, n));
}
function clampFloat(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n))
    return min;
  return Math.max(min, Math.min(max, n));
}
registerInjectionInterceptor();
(async () => {
  await loadConfig();
  spindle.log.info("[psyche] loaded");
})();
