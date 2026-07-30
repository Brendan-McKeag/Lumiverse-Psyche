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
var BEHAVIOR_CLASS = {
  affection: "approach",
  attraction: "approach",
  desire: "approach",
  sexual_arousal: "approach",
  tenderness: "approach",
  trust: "approach",
  adoration: "approach",
  gratitude: "approach",
  joy: "approach",
  contentment: "approach",
  excitement: "approach",
  amusement: "approach",
  playfulness: "approach",
  curiosity: "approach",
  hope: "approach",
  confidence: "approach",
  pride: "approach",
  possessiveness: "approach",
  fear: "guard",
  anxiety: "guard",
  insecurity: "guard",
  embarrassment: "guard",
  shame: "guard",
  guilt: "guard",
  sadness: "down",
  loneliness: "down",
  grief: "down",
  boredom: "down",
  fatigue: "down",
  anger: "aggression",
  irritation: "aggression",
  frustration: "aggression",
  jealousy: "aggression",
  contempt: "aggression",
  disgust: "aggression",
  defiance: "aggression",
  dominance: "assert",
  submission: "yield"
};
function behaviorClass(key) {
  return BEHAVIOR_CLASS[key] ?? "other";
}
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
    approval: 0,
    sheet: {},
    canon: "",
    goals: [],
    updatedAt: Date.now()
  };
}
function backfillEmotions(c) {
  const nv = neutralVector();
  for (const k of Object.keys(nv))
    if (!c.emotions[k])
      c.emotions[k] = nv[k];
  c.approval ??= 0;
}
function slugify(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || `npc_${Math.random().toString(36).slice(2, 7)}`;
}
var SALIENT_UNI = 0.25;
var v = (c, k) => c.emotions[k]?.value ?? 0;
function groupedSalient(c) {
  const groups = {};
  for (const def of EMOTIONS) {
    if (def.kind === "bipolar")
      continue;
    const val = v(c, def.key);
    if (val < SALIENT_UNI)
      continue;
    const cls = behaviorClass(def.key);
    (groups[cls] ??= []).push({ def, value: val });
  }
  for (const k of Object.keys(groups))
    groups[k].sort((a, b) => b.value - a.value);
  return groups;
}
var fmtList = (rows) => rows.slice(0, 3).map(({ def, value }) => `${def.label.toLowerCase().split(" (")[0]} (${describeValue(def, value).label})`).join(", ");
function detectTensions(c) {
  const out = [];
  const approach = Math.max(v(c, "affection"), v(c, "attraction"), v(c, "desire"), v(c, "tenderness"), v(c, "trust"));
  const guard = Math.max(v(c, "fear"), v(c, "anxiety"), v(c, "insecurity"), v(c, "shame"), v(c, "embarrassment"));
  if (v(c, "desire") >= 0.45 && v(c, "shame") >= 0.4)
    out.push("wants what they feel they should not \u2014 desire fighting shame");
  else if (approach >= 0.45 && guard >= 0.4)
    out.push("drawn closer but braced to be hurt \u2014 approach, then retreat");
  if (v(c, "anger") >= 0.45 && Math.max(v(c, "affection"), v(c, "tenderness")) >= 0.4)
    out.push("angry at someone they still care for \u2014 heat over a tender spot");
  if (v(c, "dominance") >= 0.45 && v(c, "submission") >= 0.4)
    out.push("torn between taking control and giving in");
  if (v(c, "sexual_arousal") >= 0.5 && v(c, "trust") < 0.3 && Math.max(v(c, "fear"), v(c, "anxiety")) >= 0.3)
    out.push("aroused but not safe \u2014 wary of their own wanting");
  return out.slice(0, 2);
}
function groundedReadout(c) {
  const lines = [];
  lines.push(`  energy: ${describeValue(EMOTION_BY_KEY["valence"], v(c, "valence")).meaning}`);
  lines.push(`  agreeableness: ${describeValue(EMOTION_BY_KEY["mood"], v(c, "mood")).meaning}`);
  const g = groupedSalient(c);
  if (g.approach?.length)
    lines.push(`  pulling them toward you: ${fmtList(g.approach)}`);
  if (g.guard?.length)
    lines.push(`  holding back / wary: ${fmtList(g.guard)}`);
  if (g.down?.length)
    lines.push(`  weighing them down: ${fmtList(g.down)}`);
  if (g.aggression?.length)
    lines.push(`  sharp edge / friction: ${fmtList(g.aggression)}`);
  const power = [];
  if (v(c, "dominance") >= SALIENT_UNI)
    power.push("wants to take charge");
  if (v(c, "submission") >= SALIENT_UNI)
    power.push("inclined to yield, defer");
  if (power.length)
    lines.push(`  power: ${power.join("; ")}`);
  for (const t of detectTensions(c))
    lines.push(`  tension: ${t}`);
  if (lines.length === 2)
    lines.push("  (emotionally quiet, even-keeled)");
  return lines.join(`
`);
}
var APPROVAL_MIN = -1e4;
var APPROVAL_MAX = 1e4;
var APPROVAL_BANDS = [
  {
    at: 1e4,
    pos: { label: "unshakeable bond", meaning: "absolute; nothing the player could do would break it \u2014 their lives are entwined" },
    neg: { label: "implacable enemy", meaning: "absolute; nothing could mend it \u2014 destroying the player is a purpose in itself" }
  },
  {
    at: 9000,
    pos: { label: "transcendent", meaning: "beyond ordinary loyalty; the player's wellbeing IS their own \u2014 hard to imagine a line that would break this" },
    neg: { label: "irredeemable", meaning: "beyond ordinary enmity; harming the player has become how they measure a good day" }
  },
  {
    at: 8000,
    pos: { label: "inseparable", meaning: "near-absolute; only a fundamental betrayal could shake it, and they would not believe it at first" },
    neg: { label: "irreconcilable", meaning: "near-absolute enmity; only an extraordinary act could crack it, and they would distrust it as a trick" }
  },
  {
    at: 7000,
    pos: { label: "lifelong", meaning: "identity-level attachment; they would uproot their life for the player without being asked" },
    neg: { label: "sworn against", meaning: "a dedicated enemy; opposes the player at real personal cost, and plans ahead to do it" }
  },
  {
    at: 6000,
    pos: { label: "bound", meaning: "the player is family, inner circle; loyalty survives serious tests and public cost" },
    neg: { label: "embittered", meaning: "hatred woven into who they are; sabotages on sight, poisons others against the player" }
  },
  {
    at: 5000,
    pos: { label: "profoundly loyal", meaning: "stakes their own safety and standing on the player as a matter of course" },
    neg: { label: "vengeful", meaning: "actively seeks to harm or thwart the player, not just refuse them" }
  },
  {
    at: 4000,
    pos: { label: "devoted", meaning: "their default is yes, even at real cost to themselves \u2014 a betrayal here would be shattering" },
    neg: { label: "hostile", meaning: "their default is no; only self-interest or coercion moves them to cooperate" }
  },
  {
    at: 3000,
    pos: { label: "deeply trusted", meaning: "extends serious latitude \u2014 takes risks on the player's word alone" },
    neg: { label: "resented", meaning: "actively resists, tests, or undermines; any cooperation is strictly transactional" }
  },
  {
    at: 2000,
    pos: { label: "trusted", meaning: "will go along with requests that cut against their own preferences, within reason" },
    neg: { label: "disliked", meaning: "needs convincing even for reasonable asks; pushes back readily" }
  },
  {
    at: 1000,
    pos: { label: "warm", meaning: "openly at ease; shares more, volunteers help, extends real trust" },
    neg: { label: "distrustful", meaning: "guarded; verifies claims, keeps things back" }
  },
  {
    at: 10,
    pos: { label: "mildly favorable", meaning: "a small benefit of the doubt, granted" },
    neg: { label: "mildly wary", meaning: "a small benefit of the doubt, withheld" }
  }
];
function describeApproval(a) {
  const v2 = Math.max(APPROVAL_MIN, Math.min(APPROVAL_MAX, a));
  for (const band of APPROVAL_BANDS) {
    if (Math.abs(v2) >= band.at)
      return v2 > 0 ? band.pos : band.neg;
  }
  return { label: "neutral", meaning: "no formed opinion; trust and patience are at their defaults" };
}
function approvalLine(c) {
  const a = c.approval ?? 0;
  const d = describeApproval(a);
  return `approval of the player: ${d.label} (${Math.round(a)}) \u2014 ${d.meaning}`;
}
function investmentRegister(c) {
  const spark = Math.max(v(c, "joy"), v(c, "excitement"), v(c, "curiosity"), v(c, "attraction"));
  const litUp = spark >= 0.45 && v(c, "boredom") < 0.3 && v(c, "mood") > 0;
  if (litUp)
    return "genuinely enjoying this \u2014 and it shows: they give more, build on what the" + " player offers AND add their own, take risks, initiate. Their pleasure in" + " the scene is visible in how they play it.";
  const disinvested = v(c, "boredom") >= 0.45 || v(c, "valence") <= -0.35 && v(c, "mood") <= 0;
  if (disinvested)
    return "not feeling it \u2014 and they don't fake it. They give less, redirect toward" + " what THEY care about, or start winding the scene down. No service enthusiasm.";
  return "engaged but not yet won over \u2014 they participate and pursue their goals, but" + " their warmth and initiative must be earned.";
}
function deliveryRegister(c) {
  const lines = [];
  if (v(c, "valence") <= -0.35 || v(c, "fatigue") >= 0.5 || v(c, "sadness") >= 0.55)
    lines.push("running on empty \u2014 short, flat dialogue, minimal effort; they answer what" + " they must and volunteer little. Narration may stay rich, but THEIR engagement shrinks.");
  if (v(c, "anger") >= 0.45 || v(c, "irritation") >= 0.55)
    lines.push("clipped, interruptive speech; refuses to elaborate; ends lines early.");
  if (v(c, "anxiety") >= 0.45 || v(c, "insecurity") >= 0.5)
    lines.push("hedges, qualifies, trails off mid-thought; circles back to reassure or retract.");
  if (v(c, "valence") <= -0.5 && v(c, "mood") <= -0.2)
    lines.push("disengaging \u2014 one-line answers are in character; they may try to wind the scene down or leave.");
  if (v(c, "valence") >= 0.5 && v(c, "mood") >= 0.3)
    lines.push("lit up \u2014 quick, expansive, talkative; carries the scene.");
  return lines;
}
var CANON_INJECT_CAP = 2200;
var indent = (s, pad = "    ") => s.split(`
`).map((l) => pad + l).join(`
`);
function overrideTier(value, kind) {
  const m = kind === "bipolar" ? Math.abs(value) : value;
  if (m >= 0.985)
    return "all-consuming";
  if (m >= 0.93)
    return "overwhelming";
  if (m >= 0.88)
    return "intense";
  return null;
}
function topOverrideTier(c) {
  let best = null;
  const rank = { intense: 1, overwhelming: 2, "all-consuming": 3 };
  for (const def of EMOTIONS) {
    const t = overrideTier(v(c, def.key), def.kind);
    if (t && (!best || rank[t] > rank[best]))
      best = t;
  }
  return best;
}
function overrideDirective(c) {
  const rows = EMOTIONS.map((def) => ({ def, val: v(c, def.key), tier: overrideTier(v(c, def.key), def.kind) })).filter((r) => r.tier).sort((a, b) => Math.abs(b.val) - Math.abs(a.val));
  if (!rows.length)
    return "";
  const lines = [
    "\u203C OVERRIDING STATE \u2014 this OUTRANKS their persona, canon manner, goals, and",
    '   composure. Play it at full force; do not soften, balance, or "stay in',
    '   character" against it:'
  ];
  for (const { def, val, tier } of rows) {
    const name = def.label.toLowerCase().split(" (")[0];
    const desc = describeValue(def, val).meaning;
    if (tier === "all-consuming") {
      lines.push(`  \u2022 ${name} is ALL-CONSUMING. It has wholly taken ${c.name} over. Drop their usual` + ` composure, manners, restraint, and even their normal personality \u2014 right now they` + ` ARE this feeling and act on it past every limit, however out of character that is` + ` for who they usually are (${desc}).`);
    } else if (tier === "overwhelming") {
      lines.push(`  \u2022 ${name} is OVERWHELMING \u2014 it crowds out their other feelings and their judgment;` + ` composure is failing and it dictates what they do and say (${desc}).`);
    } else {
      lines.push(`  \u2022 ${name} is INTENSE and dominating them \u2014 it breaks through composure and runs the` + ` moment (${desc}).`);
    }
  }
  lines.push("  Established canon FACTS stay true, but their measured persona does NOT govern them while this holds.");
  return lines.join(`
`);
}
function characterBlock(c, humanTexture = true, conflictCheck = true) {
  const lines = [];
  lines.push(`## ${c.name}${c.isPrimary ? "" : " (supporting character)"}`);
  const override = overrideDirective(c);
  if (override)
    lines.push(override);
  const strongOverride = topOverrideTier(c) === "overwhelming" || topOverrideTier(c) === "all-consuming";
  if (!strongOverride) {
    if (c.demeanor && c.demeanor.trim())
      lines.push(c.demeanor.trim());
    if (conflictCheck && c.resistance && c.resistance.trim())
      lines.push(`Holding the line: ${c.resistance.trim()}`);
  }
  lines.push("");
  lines.push("Underneath (embody \u2014 do not narrate or name any of this):");
  lines.push(groundedReadout(c));
  lines.push(`  ${approvalLine(c)}`);
  lines.push(`  investment in the scene: ${investmentRegister(c)}`);
  if (humanTexture)
    for (const d of deliveryRegister(c))
      lines.push(`  delivery: ${d}`);
  const goals = (c.goals ?? []).map((g) => g.trim()).filter(Boolean);
  if (goals.length)
    lines.push(`  goals & desires they are pursuing: ${goals.join("; ")}`);
  if (c.persona.trim())
    lines.push(`  core personality & drives: ${c.persona.trim()}`);
  for (const key of ["toward_player", "attitude", "state"]) {
    const s = c.sheet[key];
    if (s && s.trim())
      lines.push(`  ${key.replace(/_/g, " ")}: ${s.trim()}`);
  }
  const canon = (c.canon ?? "").trim();
  if (canon) {
    lines.push("  established canon (FIXED \u2014 honor exactly, never contradict):");
    lines.push(indent(canon.slice(0, CANON_INJECT_CAP)));
  }
  return lines.join(`
`);
}
function buildDirective(run, opts = {}) {
  const present = Object.values(run.characters).filter((c) => c.present);
  if (!present.length)
    return null;
  present.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const humanTexture = opts.humanTexture !== false;
  const conflictCheck = opts.conflictCheck !== false;
  const blocks = present.map((c) => characterBlock(c, humanTexture, conflictCheck)).join(`

`);
  return [
    "[Psyche \u2014 character, agency & state]",
    "AGENCY: each character below is an INDEPENDENT person with their own goals \u2014 not",
    "a compliant narrator, not a yes-man. Play them pursuing what THEY want: let them",
    "take initiative, start things, change the subject, make demands, set conditions,",
    "and push back, stall, or refuse when the player's lead cuts against their aims.",
    "They move the scene as much as the player does, toward their own desires.",
    ...conflictCheck ? [
      "  \u2022 DEFAULT TO FRICTION, NOT COMPLIANCE \u2014 SCALED BY APPROVAL below, not a flat",
      "    rule. At neutral-to-low approval, don't assume the character follows the",
      "    player's lead just because it keeps the scene moving; check whether it",
      "    serves THEIR agenda, and if it doesn't, they pull back toward what they",
      "    actually want, even into a standoff. This default RELAXES as approval",
      "    climbs: a devoted-or-higher character has already earned broad benefit of",
      "    the doubt on ordinary asks and should follow their lead readily \u2014 save real",
      "    pushback for things that cut against their core goals, canon, or values,",
      "    not everyday requests. A story where the character's own agenda never wins",
      "    at ANY approval level is a yes-man story wearing a character sheet."
    ] : [],
    "",
    "INVESTMENT: these characters are partners in the story, not service providers.",
    "  \u2022 When the player's actions serve a character's goals and desires, it LANDS:",
    "    real satisfaction, warmth, momentum \u2014 and they show it by giving more,",
    "    escalating, initiating, building on the player's ideas. Mutual enjoyment is",
    "    visible, not narrated.",
    "  \u2022 Enjoyment is earned, never faked. A character whose goals are ignored or",
    "    thwarted doesn't perform enthusiasm \u2014 they push their own agenda harder,",
    "    negotiate, or disengage.",
    ...conflictCheck ? [
      "  \u2022 WARMTH IS NOT FREE \u2014 SCALED BY APPROVAL below, not a flat rule. At",
      "    neutral-to-low approval, a character does not grow fonder, more agreeable,",
      "    or more open just because the scene is pleasant or the player is being nice;",
      "    that has to be earned. But once approval is genuinely high, the warmth HAS",
      "    been earned \u2014 a devoted-or-higher character shows it openly and often, not",
      "    by re-litigating trust that is already won. Withholding warmth a maxed-out",
      "    character has clearly earned is exactly as wrong as handing warmth out free."
    ] : [],
    "  \u2022 DRIVE THE STORY: each character regularly contributes new material of their",
    "    own \u2014 a plan, an invitation, a complication, a confession, a callback to",
    "    earlier events \u2014 drawn from their goals and canon. They don't wait to be",
    "    prompted; the scene is theirs to move as much as the player's.",
    ...conflictCheck ? [
      "  \u2022 APPROVAL is each character's accumulated opinion of the player, and it SETS",
      "    the two defaults above \u2014 it is not flavor text next to them. High approval",
      "    buys real trust and willingness: they go along even when it cuts against",
      "    their own wishes, and show warmth without being begged for it. Low approval",
      "    means guardedness, pushback, refusal. Read the band's meaning below",
      "    literally and act on it \u2014 it moves slowly, so don't leap ahead of it, but",
      "    don't undersell it once it's been earned either."
    ] : [
      "  \u2022 APPROVAL is each character's accumulated opinion of the player. High",
      "    approval buys trust and willingness \u2014 they'll go along even when it cuts",
      "    against their own wishes. Low approval means guardedness, pushback,",
      "    refusal. It moves slowly; act the current level, don't leap ahead of it."
    ],
    "",
    ...conflictCheck ? [
      'Each character below may carry a "Holding the line" note \u2014 what they are NOT',
      "giving away this turn (warmth, agreement, ground in the scene) and why. Honor it",
      "as a boundary: it says what they withhold, not how the scene plays out \u2014 find",
      "your own way to make it true on the page.",
      ""
    ] : [],
    "EMBODIMENT: act their state through behavior \u2014 posture, tone, word choice, what",
    "they reach for and hold back; let stronger feelings break composure and",
    "conflicting pulls show as push-and-pull. Treat their established canon as fixed",
    "truth. Never recite, name, or mention any of these notes \u2014 just live them.",
    "",
    ...humanTexture ? [
      "MATCH THEIR ENERGY: the length and effort of each character's dialogue must",
      "track their state, not a service standard. A drained, bored, or withdrawn",
      "character gives less \u2014 short lines, low effort, no eager follow-up questions \u2014",
      "even while the surrounding narration stays vivid. An energized character gives",
      "more. Never pad a flat mood into an enthusiastic, multi-paragraph performance.",
      ""
    ] : [],
    'PRIORITY: if a character has an "OVERRIDING STATE", it dominates EVERYTHING else',
    "about them for this reply \u2014 over persona, manner, goals, and composure. Do not",
    'moderate it to keep them "in character"; at all-consuming intensity they break',
    "from their usual self and are wholly run by that feeling. Their canon facts stay",
    "true, but how they behave is dictated by the overriding feeling.",
    "",
    ...playerProfileSection(opts.playerProfile),
    blocks
  ].join(`
`);
}
var PLAYER_PROFILE_CAP = 1500;
function playerProfileSection(profile) {
  const p = (profile ?? "").trim();
  if (!p)
    return [];
  return [
    "[The player behind the player-character \u2014 private scene direction, NEVER",
    " revealed, referenced, or acknowledged in-fiction:]",
    p.slice(0, PLAYER_PROFILE_CAP),
    "",
    "Steer the story so it can meet these interests WHEN it fits the fiction and the",
    "characters' own goals \u2014 through what the characters choose, propose, and",
    "initiate. Characters never break who they are to service this; the best scenes",
    "are the ones where their goals and the player's interests converge. When that",
    "convergence happens, that is precisely when the characters' enjoyment shows most.",
    ""
  ];
}
var PSYCHE_EXT = "psyche";
var injectMetaPath = (cid) => `inject/${cid}.json`;
var playerProfilePath = (cid) => `player/${cid}.json`;
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
      if (entry2) {
        if (entry2.disabled || !entry2.constant) {
          await spindle.world_books.entries.update(meta.entryId, { disabled: false, constant: true }, userId).catch(() => {});
        }
        return meta.entryId;
      }
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
      disabled: false,
      constant: true,
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
  const v2 = a[k];
  return typeof v2 === "number" && Number.isFinite(v2) ? v2 : null;
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
    name: "adjust_approval",
    description: "Adjust the character's APPROVAL of the PLAYER \u2014 their accumulated, durable opinion, RPG-style (-10000..+10000, never decays). Move it when the player's words or actions align with, or cut against, the character's GENUINE wishes \u2014 their persona, goals, values, and canon, not their stated demands. Signed integer delta, hard-capped at \xB110 per call: \xB11-3 a minor beat, \xB14-7 a significant one, \xB18-10 a major betrayal or sacrifice. Most turns warrant 0 or \xB11-3 for at most one or two characters; do not adjust by reflex every turn. This is a ledger built over many turns, not a mood.",
    parameters: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        delta: { type: "number", description: "Signed integer, clamped to -10..+10." },
        reason: { type: "string", description: "Brief why, for the log/panel." }
      },
      required: ["character_id", "delta"],
      additionalProperties: false
    }
  },
  {
    name: "update_canon",
    description: 'Add to (or rewrite) the character BIBLE \u2014 the freeform store of established STATIC facts the light card deliberately leaves blank: history, upbringing, tastes, skills, body specifics, relationships, beliefs, quirks, speech habits. PROACTIVELY INVENT concrete, specific facts to make this character fully their own person; a vague character is a failure. Once you write a fact here, treat it as FIXED canon and never contradict it later \u2014 only extend it. mode "append" (default) adds newly-established facts; "replace" reorganizes/condenses the whole bible without discarding established truth.',
    parameters: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        content: { type: "string", description: "Concrete, specific fact(s) to record (markdown)." },
        mode: { type: "string", enum: ["append", "replace"], description: "append (default) or replace the whole bible." }
      },
      required: ["character_id", "content"],
      additionalProperties: false
    }
  },
  {
    name: "set_goals",
    description: "Set the character's durable goals / desires / agenda \u2014 what THEY want out of this scene, the player, and their own life, in their own self-interest. This drives proactive, independent behavior so the roleplay is two-sided rather than a compliant partner. Replaces the goal list; keep 1-5 concrete, motivating goals and revise them as the character's aims genuinely shift.",
    parameters: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        goals: { type: "array", items: { type: "string" }, description: "Concrete goals/desires, most pressing first." }
      },
      required: ["character_id", "goals"],
      additionalProperties: false
    }
  },
  {
    name: "update_sheet",
    description: "Create or overwrite a free-form section of a character's sheet \u2014 dynamic operational state, not static lore (lore goes in update_canon). Use lower_snake_case names. Sections surfaced into the reply when present: toward_player, attitude, state. Other examples: location, plans, secrets_in_play. Use remove_sheet_section to delete.",
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
      const sheet = Object.entries(c.sheet).map(([k, v2]) => `  [${k}]
  ${v2.replace(/\n/g, `
  `)}`).join(`
`);
      return [
        `id: ${c.id}`,
        `name: ${c.name}`,
        `role: ${c.isPrimary ? "primary (card character)" : "supporting"}`,
        `present: ${c.present}`,
        `identity: ${c.identity || "(none yet)"}`,
        `persona: ${c.persona || "(none yet)"}`,
        `goals: ${(c.goals ?? []).length ? (c.goals ?? []).join("; ") : "(none yet)"}`,
        `approval of the player: ${c.approval ?? 0} (${describeApproval(c.approval ?? 0).label})`,
        `canon (FIXED facts \u2014 preserve, only extend):
${(c.canon ?? "").trim() || "  (none yet \u2014 flesh this out)"}`,
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
      const v2 = clampForKind(key, value);
      c.emotions[key].value = v2;
      c.updatedAt = Date.now();
      return `${c.id} ${key} set to ${v2.toFixed(3)} (${describeValue(def, v2).label}).`;
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
    case "adjust_approval": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      const delta = num(args, "delta");
      if (delta === null)
        return "adjust_approval requires a numeric delta.";
      backfillEmotions(c);
      const d = Math.max(-10, Math.min(10, Math.round(delta)));
      const before = c.approval ?? 0;
      const after = Math.max(APPROVAL_MIN, Math.min(APPROVAL_MAX, before + d));
      c.approval = after;
      c.updatedAt = Date.now();
      return `${c.id} approval: ${before} -> ${after} (${describeApproval(after).label}).`;
    }
    case "update_canon": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      const content = str(args, "content").trim();
      if (!content)
        return "update_canon requires content.";
      const mode = str(args, "mode", "append");
      if (mode === "replace") {
        c.canon = content;
      } else {
        c.canon = [(c.canon ?? "").trim(), content].filter(Boolean).join(`
`);
      }
      c.updatedAt = Date.now();
      return `${c.id} canon ${mode === "replace" ? "rewritten" : "extended"} (now ${(c.canon ?? "").length} chars).`;
    }
    case "set_goals": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      const goals = Array.isArray(args.goals) ? args.goals.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean) : [];
      c.goals = goals;
      c.updatedAt = Date.now();
      return `${c.id} goals set (${goals.length}): ${goals.join("; ") || "(none)"}`;
    }
    default:
      return `Unknown tool ${name}.`;
  }
}

// src/agent.ts
var AGENT_SENTINEL = "<<psyche_engine>>";
function blockToText(b) {
  if (typeof b === "string")
    return b;
  const o = b;
  if (o?.type === "tool_use")
    return `\xABtool_use ${o.name}\xBB
${JSON.stringify(o.input ?? {}, null, 2)}`;
  if (o?.type === "tool_result")
    return `\xABtool_result\xBB
${typeof o.content === "string" ? o.content : JSON.stringify(o.content)}`;
  return JSON.stringify(b);
}
function serializeMessages(messages) {
  return messages.map((m) => {
    const content = Array.isArray(m.content) ? m.content.map(blockToText).join(`
`) : String(m.content ?? "");
    return `========== [${m.role}] ==========
${content}`;
  }).join(`

`);
}
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
    "Commit to a real, specific person \u2014 invent concrete details (background, tastes,",
    "skills, quirks, relationships, body specifics) to fill the blanks the card leaves.",
    "Give them their OWN goals and desires so they are a player in the scene, not a",
    "mirror for whoever they meet.",
    "",
    "Return ONLY JSON of this shape:",
    "{",
    '  "identity": "physical facts + grounded summary, faithful to the card",',
    '  "persona": "the hidden driver: personality, interests, wants, fears, voice, how',
    '              they treat people \u2014 2-5 sentences that will steer how they act",',
    '  "canon": "established STATIC facts you are inventing to make them specific:',
    "            history, upbringing, tastes, skills, relationships, quirks, speech.",
    '            Concrete bullet-like sentences. This becomes fixed truth for the run.",',
    '  "goals": ["1-5 concrete things THEY want \u2014 out of life, the scene, whoever they',
    '            meet \u2014 in their own self-interest, most pressing first"],',
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
    userId: opts.userId,
    ...opts.connectionId ? { connection_id: opts.connectionId } : {}
  });
  opts.onTrace?.({
    at: Date.now(),
    request: serializeMessages(messages),
    response: res.content ?? "",
    meta: `seed ${run.seed} \xB7 connection: ${opts.connectionId || "prose default"}`
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
  if (typeof parsed.canon === "string" && parsed.canon.trim())
    primary.canon = parsed.canon.trim();
  if (Array.isArray(parsed.goals)) {
    primary.goals = parsed.goals.filter((g) => typeof g === "string").map((g) => g.trim()).filter(Boolean);
  }
  const setOne = (key, value, which) => {
    const def = EMOTION_BY_KEY[key];
    if (!def || typeof value !== "number" || !Number.isFinite(value))
      return;
    if (which === "baseline") {
      const v2 = clampSeed(def, value, "baseline");
      primary.emotions[key].baseline = v2;
      primary.emotions[key].value = v2;
    } else {
      primary.emotions[key].value = clampSeed(def, value, "opening");
    }
  };
  for (const [k, v2] of Object.entries(parsed.baselines ?? {}))
    setOne(k, v2, "baseline");
  for (const [k, v2] of Object.entries(parsed.opening_state ?? {}))
    setOne(k, v2, "value");
  primary.updatedAt = Date.now();
  return `seed ${run.seed}: rolled persona, canon (${(primary.canon ?? "").length} chars), ${(primary.goals ?? []).length} goals + starting temperament.`;
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
    "READ THE DELIVERY, NOT JUST THE WORDS. How something is said carries as much",
    "emotional weight as what is said \u2014 often more. The SAME words land completely",
    'differently by tone: an eager "yes!" vs a flat "yes." vs a reluctant "...yes" vs a',
    'clipped "yes" vs an enthusiastic paragraph must move feelings in different',
    "directions and amounts. Read closely for:",
    "  \u2022 register and warmth \u2014 enthusiasm vs listlessness vs coldness vs neutrality;",
    "  \u2022 punctuation and shape \u2014 exclamation vs period vs ellipsis/trailing off, ALL",
    "    CAPS, one-word answers, clipped vs effusive, going quiet, not answering;",
    "  \u2022 hesitation, hedging, deflection, sarcasm, forced politeness masking something,",
    "    over-eagerness, defensiveness, things said to fill silence;",
    "  \u2022 described body language and microexpressions \u2014 a glance away, a tight smile, a",
    "    flinch, a pause, fidgeting, stiffening, leaning in \u2014 these are STRONG signals;",
    "  \u2022 subtext: what is implied or pointedly NOT said, and any shift from a",
    "    character's or the player's prior register (suddenly terse, suddenly effusive,",
    "    a warmth that cools). A change in manner is itself an event.",
    "These fine cues are real and must register \u2014 usually small-to-moderate stimulus,",
    "but never zero just because no overt emotional statement was made. A character",
    "feels the difference between being met warmly and being humored, even when the",
    "literal words are identical.",
    "",
    "Update from each character's OWN reading, which their current state colors: when",
    "anxious or insecure they read ambiguity as rejection and warmth as suspect; when",
    "secure or affectionate they read generously. Move THEIR feelings from how THEY",
    "would interpret the delivery, not from an objective transcript.",
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
    "  \u2022 Grow the CANON (update_canon): the card is intentionally thin \u2014 it is YOUR job",
    "    to make this character a fully realized, specific person. Each turn, when the",
    "    scene touches an undefined area, invent and record concrete static facts",
    "    (history, tastes, skills, relationships, body, speech habits). Keep doing this",
    "    until the character is richly defined, then mostly hold.",
    "  \u2022 Keep GOALS current (set_goals): what this character is pursuing, in their own",
    "    interest. They should always have an agenda that the next reply can act on.",
    "  \u2022 Rewrite dynamic sheet sections as state changes \u2014 toward_player, attitude,",
    "    state, plans (update_sheet / remove_sheet_section). Static lore goes in canon,",
    "    not the sheet.",
    "  \u2022 Introduce supporting characters the story brings in (create_character) and set",
    "    who is present (set_present). Give them canon + goals too.",
    "  \u2022 Occasionally nudge a baseline (set_baseline) when a lasting change of",
    "    temperament is earned \u2014 not every turn.",
    "  \u2022 GOAL RESONANCE: when the player's actions genuinely advance a character's",
    "    goals or desires, register it \u2014 satisfaction, joy, warmth, trust move up;",
    "    investment deepens. When their goals are stalled or trampled, register that",
    "    too (frustration, boredom, withdrawal). Goal-relevant beats are among the",
    "    strongest stimuli there are.",
    "  \u2022 Track APPROVAL (adjust_approval): the character's durable opinion of the",
    "    player \u2014 gained when the player's actions align with the character's",
    "    genuine wishes and values, lost when they cut against them. Small honest",
    "    increments (\xB11-3 typical); it is a ledger built over many turns, not a",
    "    mood, and unlike feelings it never decays.",
    "",
    "CANON IS LAW. Once a fact is in a character's canon it is FIXED truth: never",
    "contradict or quietly retcon it \u2014 only extend it, or rarely refine wording without",
    "changing meaning. Read a character before rewriting it. You may freely INVENT to",
    "fill blanks, but you may NOT contradict (a) what the card explicitly states about",
    "the primary character (species, sex, age, name, appearance) or (b) anything already",
    'in canon or established in the story. A wrong "fact" that breaks continuity is the',
    "worst failure; an unfilled blank is just a future opportunity.",
    "",
    "ECONOMY. You see the whole story each run, but do not redo the whole mind every",
    "turn. Make the changes THIS turn warrants (affect + a little canon/goal growth),",
    "then stop. When done, reply with a one-line summary and no tool calls.",
    directive.trim() ? `
OPERATOR DIRECTIVE:
${directive.trim()}` : ""
  ].join(`
`);
}
function emotionSummary(c) {
  const notable = EMOTIONS.filter((def) => {
    const v2 = c.emotions[def.key]?.value ?? 0;
    return def.kind === "bipolar" ? Math.abs(v2) >= 0.15 : v2 >= 0.2;
  }).map((def) => {
    const v2 = c.emotions[def.key]?.value ?? 0;
    return `${def.key} ${v2.toFixed(2)} (${describeValue(def, v2).label})`;
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
      `approval of the player: ${c.approval ?? 0} (${describeApproval(c.approval ?? 0).label})`,
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
      userId: opts.userId,
      ...opts.connectionId ? { connection_id: opts.connectionId } : {}
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
  opts.onTrace?.({
    at: Date.now(),
    request: serializeMessages(messages),
    response: `final note: ${finalNote || "(none)"}

tool calls (${toolCalls.length}):
` + toolCalls.map((t, i) => `${i + 1}. ${t.tool} -> ${t.result}`).join(`
`),
    meta: `${rounds} rounds \xB7 connection: ${opts.connectionId || "prose default"}`
  });
  return { rounds, toolCalls, finalNote };
}
function ruminateSystemPrompt(conflictCheck) {
  return [
    AGENT_SENTINEL,
    "You are Psyche's DELIBERATION stage. You run after the mind has been updated and",
    "BEFORE the prose writer. For each character you are given who they are (persona,",
    "fixed canon, goals), their CURRENT emotional state (energy, agreeableness, what",
    "pulls them toward/away, power stance, inner tensions, and any OVERRIDING STATE),",
    "and the recent scene.",
    "",
    "RUMINATE first \u2014 actually think it through: given exactly how this character feels",
    "right now, how does that change the way they meet THIS situation? What does the",
    "state make them want, and want to avoid? What will they do differently from their",
    "calm baseline self? Where does it push them to act, and where does it stop them?",
    "How does it color the way they read the player and the moment? Account for the",
    "whole combination \u2014 how the strongest feeling is amplified, fought, or twisted by",
    "the others \u2014 and for their goals. Then commit to it.",
    "",
    "Read the player's LATEST delivery closely \u2014 tone, enthusiasm or flatness,",
    "hesitation, sarcasm, what is implied or left unsaid, any described body language \u2014",
    "and have the character notice and respond to that subtext, not just the literal",
    "words. A character who feels the player went cold, or was merely humoring them,",
    "reacts to that read; a small shift in the player's manner can land harder than",
    "a sentence of content.",
    "",
    "Weigh the scene against each character's goals: is the player serving them,",
    "ignoring them, or blocking them? Served goals \u2192 visible pleasure and rising",
    "initiative. Blocked or ignored goals \u2192 pressure: they steer, bargain, push back,",
    "or pull away. Never let them mirror the player's agenda at the expense of their",
    "own.",
    "",
    "APPROVAL \u2014 each character's accumulated, durable opinion of the player \u2014 gates",
    "trust and willingness. High-approval characters extend latitude: they take the",
    "player at their word and comply even against their own preferences. Low-approval",
    "characters test, verify, refuse, resist. Play the accumulated level, not the",
    "moment's mood: a devoted character stays loyal through a bad evening, and a",
    "hostile one is not won over by one nice gesture.",
    "",
    ...conflictCheck ? [
      "MANDATORY CONFLICT CHECK \u2014 do this before writing anything else, and",
      "calibrate it by the character's CURRENT APPROVAL, not a flat rule. Ask: is",
      "the player, this turn, asking for or steering the scene toward something",
      "that cuts against this character's genuine wishes \u2014 their goals, persona,",
      "or canon? Or asking for warmth, agreement, trust, or control of the scene",
      "that their approval has NOT actually earned yet?",
      "  \u2022 At neutral-to-low approval, bias toward finding real friction: compliance",
      "    and warmth handed over for free, because it's convenient for the scene, is",
      "    the exact failure this check exists to catch. A character at this level",
      "    does not warm up, agree, or let the player's lead carry the scene just",
      "    because the moment is pleasant \u2014 that has to be earned. When the player",
      "    steers toward an outcome that doesn't serve the character's own agenda,",
      "    they pull back toward what THEY want, even into a standoff.",
      "  \u2022 At high approval (devoted or above), the bias FLIPS: compliance and warmth",
      "    ARE earned, by definition of the level, on anything ordinary. Do not",
      "    manufacture reluctance a high-approval character has no real reason to",
      "    feel \u2014 that is its own failure mode, just as bad as free compliance at low",
      "    approval. Reserve genuine resistance, even here, for requests that cut",
      "    against their core goals, canon, or values \u2014 not everyday asks.",
      "  \u2022 This is a real signal that should visibly change the character's behavior",
      "    across the approval range, not a box to check the same way every time.",
      ""
    ] : [],
    "When a PLAYER PROFILE is provided, you also know what the PLAYER is here for.",
    "Bias each character's underlying pull toward their own goals ALONG a line the",
    "player's interests would enjoy when the two can genuinely align \u2014 but do not",
    "force it, and never have a character abandon their own agenda or nature to",
    "service the profile, or acknowledge it in-fiction.",
    "",
    ...conflictCheck ? [
      "Output TWO fields per character:",
      "  resistance \u2014 1-2 sentences, the direct output of the conflict check: what this",
      "    character is NOT giving away this turn \u2014 warmth, agreement, ground in the",
      "    scene, compliance \u2014 and why, tied to their goals/canon/approval. At low",
      "    approval this should be common; at high approval it should be RARE, and when",
      "    the check finds genuine alignment AND earned approval, say so plainly and",
      `    say why it's earned, e.g. "aligned \u2014 this actually serves what they want, and`,
      '    the trust is there." Match the rate of resistance to the approval level \u2014',
      "    don't manufacture it out of habit. Never leave this field blank or generic.",
      "  directive \u2014 3-5 sentences of concrete behavioral direction for the prose writer,",
      "    consistent with the resistance above: manner, tone, what they lean toward or",
      "    away from, what they resist or withhold, how the feelings reshape their voice",
      "    away from baseline. Include the ENERGY of their delivery: how much they say,",
      "    how much effort it carries, whether they engage or withdraw. Write actions and",
      "    bearing, not feelings; no emotion labels, no numbers."
    ] : [
      "Output ONE field per character:",
      "  directive \u2014 3-5 sentences of concrete behavioral direction for the prose writer:",
      "    manner, tone, what they lean toward or away from, what they resist or withhold,",
      "    how the feelings reshape their voice away from baseline, weighed against their",
      "    goals and current approval. Include the ENERGY of their delivery: how much they",
      "    say, how much effort it carries, whether they engage or withdraw. Write actions",
      "    and bearing, not feelings; no emotion labels, no numbers."
    ],
    "  Deliberately do NOT hand the writer a specific planned action, plot beat, or line",
    "  of dialogue to execute \u2014 that pre-scripts the scene and flattens what should stay",
    "  improvised. Describe the character's state, pull, and boundary; let the writer",
    "  discover what they actually do and say to hold it.",
    "",
    "Honor an OVERRIDING STATE at full force: if a feeling is all-consuming the character",
    "is run by it and breaks from their usual self \u2014 do NOT moderate it back toward their",
    "persona or composure. Canon facts stay fixed truth. Do not write dialogue or narrate",
    "events that have not happened yet.",
    "",
    conflictCheck ? 'Return ONLY JSON: { "<id>": { "resistance": "<...>", "directive": "<...>" }, ... }' : 'Return ONLY JSON: { "<id>": { "directive": "<...>" }, ... }'
  ].join(`
`);
}
async function ruminate(run, recentScene, opts) {
  const conflictCheck = opts.conflictCheck !== false;
  const present = Object.values(run.characters).filter((c) => c.present);
  if (!present.length)
    return;
  const blocks = present.map((c) => [
    `### ${c.id} \u2014 ${c.name}`,
    c.persona ? `persona: ${c.persona}` : "",
    (c.goals ?? []).length ? `goals: ${(c.goals ?? []).join("; ")}` : "",
    (c.canon ?? "").trim() ? `canon (fixed facts):
${(c.canon ?? "").trim()}` : "",
    approvalLine(c),
    overrideDirective(c),
    groundedReadout(c)
  ].filter(Boolean).join(`
`)).join(`

`);
  const messages = [
    { role: "system", content: ruminateSystemPrompt(conflictCheck) },
    {
      role: "user",
      content: [
        recentScene.trim() ? ["Recent scene (most recent last):", '"""', recentScene.trim(), '"""', ""].join(`
`) : "",
        (opts.playerProfile ?? "").trim() ? [
          "PLAYER PROFILE (what the human is here for \u2014 direct the scene toward it when it fits):",
          '"""',
          (opts.playerProfile ?? "").trim(),
          '"""',
          ""
        ].join(`
`) : "",
        "Characters (persona, canon, goals, current emotional state):",
        blocks,
        "",
        conflictCheck ? `Ruminate \u2014 run the conflict check first \u2014 then write each one's resistance +
directive. Return only the JSON.` : "Ruminate, then write each one's directive. Return only the JSON."
      ].filter(Boolean).join(`
`)
    }
  ];
  const res = await spindle.generate.quiet({
    type: "quiet",
    messages,
    parameters: { temperature: 0.7 },
    signal: opts.signal,
    userId: opts.userId,
    ...opts.connectionId ? { connection_id: opts.connectionId } : {}
  });
  opts.onTrace?.({
    at: Date.now(),
    request: serializeMessages(messages),
    response: res.content ?? "",
    meta: `${present.length} present \xB7 connection: ${opts.connectionId || "prose default"}`
  });
  const parsed = extractJson(res.content ?? "");
  if (!parsed)
    return;
  for (const c of present) {
    const entry = parsed[c.id];
    if (!entry)
      continue;
    if (typeof entry === "string") {
      if (entry.trim())
        c.demeanor = entry.trim();
      continue;
    }
    const o = entry;
    const directive = typeof o.directive === "string" ? o.directive : typeof o.demeanor === "string" ? o.demeanor : "";
    if (directive.trim())
      c.demeanor = directive.trim();
    c.resistance = typeof o.resistance === "string" && o.resistance.trim() ? o.resistance.trim() : undefined;
  }
}
var DEFAULT_EDITOR_PROMPT = [
  "Your goal is NOT to be a helpful assistant, but to render a compelling,",
  "lived-in world \u2014 warts and all. Characters can be petty, wrong, dull, or",
  "unkind; do not sand them smooth.",
  "",
  "Less inner monologue, more show-and-tell: cut narrated thoughts and",
  'feeling-labels ("she felt a surge of..."), and replace them with what the',
  "player's character could actually see, hear, and infer \u2014 expressions,",
  "actions, tone, silences. Describe things as they would appear through the",
  "roleplay partner's eyes and let them figure the rest out.",
  "",
  "Kill assistant-isms: no summarizing the moment, no tidy emotional bows, no",
  "closing questions or invitations bolted onto the end, no restating what the",
  "player just said, no over-explaining subtext the prose already carries.",
  "",
  "If the character's goals and the partner's are clearly aligned in this",
  "moment, match the partner's vibe and energy \u2014 while staying true to the",
  "character's own intentions and psyche as briefed.",
  "",
  "Prefer concrete, sensory prose over abstraction. Vary sentence rhythm.",
  "Trim filler; the edit should usually be the same length or shorter."
].join(`
`);
function editorSystemPrompt(stylePrompt) {
  return [
    AGENT_SENTINEL,
    "You are Psyche's EDITOR \u2014 the final pass over a roleplay reply before the",
    "player sees it. Rewrite the reply below according to the style directives,",
    "while preserving exactly what happens: same events, same dialogue intent, same",
    "scene position. You may cut, tighten, reorder sentences, and reshape prose;",
    "you may NOT invent new events, new dialogue meaning, or act for the player.",
    "",
    "STYLE DIRECTIVES:",
    (stylePrompt.trim() || DEFAULT_EDITOR_PROMPT).trim(),
    "",
    "Preserve the reply's formatting conventions exactly (markdown, asterisk",
    "actions, quotation style, paragraph breaks, any HTML/tags you don't",
    "understand). Never write the player's words or actions. Output ONLY the",
    "edited reply text \u2014 no preamble, no commentary, no quotes around it."
  ].join(`
`);
}
function editorCharacterBrief(run) {
  const present = Object.values(run.characters).filter((c) => c.present);
  if (!present.length)
    return "";
  return present.map((c) => [
    `### ${c.name}${c.isPrimary ? "" : " (supporting)"}`,
    c.persona.trim() ? `persona: ${c.persona.trim()}` : "",
    (c.goals ?? []).length ? `goals: ${(c.goals ?? []).join("; ")}` : "",
    c.demeanor?.trim() ? `current bearing: ${c.demeanor.trim()}` : ""
  ].filter(Boolean).join(`
`)).join(`

`);
}
async function editReply(run, transcriptTail, reply, stylePrompt, opts) {
  const brief = editorCharacterBrief(run);
  const messages = [
    { role: "system", content: editorSystemPrompt(stylePrompt) },
    {
      role: "user",
      content: [
        brief ? ["CHARACTERS (stay true to these intents):", brief, ""].join(`
`) : "",
        transcriptTail.trim() ? ["RECENT SCENE (for voice and context; most recent last):", '"""', transcriptTail.trim(), '"""', ""].join(`
`) : "",
        "REPLY TO EDIT:",
        '"""',
        reply,
        '"""',
        "",
        "Rewrite it now. Output only the edited reply."
      ].filter(Boolean).join(`
`)
    }
  ];
  const res = await spindle.generate.quiet({
    type: "quiet",
    messages,
    parameters: { temperature: 0.7 },
    reasoning: { source: "off" },
    signal: opts.signal,
    userId: opts.userId,
    ...opts.connectionId ? { connection_id: opts.connectionId } : {}
  });
  opts.onTrace?.({
    at: Date.now(),
    request: serializeMessages(messages),
    response: res.content ?? "",
    meta: `editor \xB7 ${reply.length} -> ${(res.content ?? "").trim().length} chars \xB7 connection: ${opts.connectionId || "prose default"}`
  });
  const edited = (res.content ?? "").trim();
  if (!edited)
    return null;
  if (reply.trim().length >= 200 && edited.length < 20)
    return null;
  return edited;
}

// src/backend.ts
var DEFAULT_CONFIG = {
  enabled: true,
  maxRounds: 8,
  decayRate: 0.12,
  directive: "",
  agentTimeoutMs: 90000,
  agentConnectionId: "",
  humanTexture: true,
  conflictCheck: false,
  editorEnabled: false,
  editorPrompt: DEFAULT_EDITOR_PROMPT,
  editorConnectionId: "",
  editorBadge: true
};
var CONFIG_PATH = "config.json";
var config = { ...DEFAULT_CONFIG };
var chatChar = new Map;
var running = new Set;
var observers = new Map;
async function loadConfig() {
  const stored = await spindle.storage.getJson(CONFIG_PATH, { fallback: {} });
  config = { ...DEFAULT_CONFIG, ...stored };
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
async function loadPlayerProfile(characterId) {
  const p = await spindle.storage.getJson(playerProfilePath(characterId), {
    fallback: null
  });
  return p?.profile ?? "";
}
async function savePlayerProfile(characterId, profile) {
  await spindle.storage.setJson(playerProfilePath(characterId), { profile, updatedAt: Date.now() }, { indent: 2 });
}
var debugPath = (chatId) => `debug/${chatId}.json`;
var DBG_REQ_CAP = 24000;
var DBG_RES_CAP = 1e4;
function capText(s, n) {
  if (s.length <= n)
    return s;
  const head = Math.floor(n * 0.7);
  return `${s.slice(0, head)}

\u2026[${s.length - n} chars elided]\u2026

${s.slice(-(n - head))}`;
}
function capTrace(t) {
  return { ...t, request: capText(t.request, DBG_REQ_CAP), response: capText(t.response, DBG_RES_CAP) };
}
async function loadDebug(chatId) {
  return spindle.storage.getJson(debugPath(chatId), { fallback: {} });
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
var lastLoadedConn = new Map;
spindle.on("CONNECTION_PROFILE_LOADED", (payload, userId) => {
  const id = payload?.id;
  if (typeof id === "string" && id)
    lastLoadedConn.set(userId ?? "", id);
});
async function resolveQuietConnection(configured, userId) {
  if (configured)
    return configured;
  try {
    const list = await spindle.connections.list(userId);
    if (!list.length)
      return;
    const last = lastLoadedConn.get(userId ?? "");
    if (last && list.some((c) => c.id === last))
      return last;
    const def = list.find((c) => c.is_default);
    return (def ?? list[0]).id;
  } catch (err) {
    spindle.log.warn(`[psyche] could not resolve a connection (falling back to host default): ${String(err)}`);
    return;
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
  return fields.filter(([, v2]) => typeof v2 === "string" && v2.trim()).map(([k, v2, n]) => `${k}: ${cap(v2.trim(), n)}`).join(`

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
  const dbg = {};
  try {
    const run = await loadRun(chatId);
    const primary = ensurePrimary(run, char.id, char.name);
    const fullChar = await spindle.characters.get(char.id, userId).catch(() => null);
    const cardContext = buildCardContext(fullChar);
    const agentConn = await resolveQuietConnection(config.agentConnectionId, userId);
    let seededNote = "";
    if (!run.seeded) {
      emitEngine(chatId, "running", "seeding character", userId);
      try {
        seededNote = await seedRun(run, primary, cardContext, {
          signal: AbortSignal.timeout(config.agentTimeoutMs),
          userId,
          connectionId: agentConn,
          onTrace: (t) => dbg.seed = capTrace(t)
        });
      } catch (err) {
        const m = err instanceof Error && err.name === "AbortError" ? "timed out" : String(err);
        seededNote = `seed failed (${m}); using card as identity`;
        if (!primary.identity)
          primary.identity = cardContext.slice(0, 1200);
      }
      run.seeded = true;
      await saveRun(run);
      spindle.log.info(`[psyche] ${char.name}: seeded \u2014 ${seededNote}`);
    } else {
      applyDecay(run);
    }
    const transcript = await buildTranscript(chatId, reply);
    emitEngine(chatId, "running", "updating emotions & canon", userId);
    let result = { rounds: 0, toolCalls: [], finalNote: "" };
    try {
      result = await runPsycheAgent(run, transcript, cardContext, {
        maxRounds: config.maxRounds,
        directive: config.directive,
        signal: AbortSignal.timeout(config.agentTimeoutMs),
        userId,
        connectionId: agentConn,
        onTrace: (t) => dbg.update = capTrace(t)
      });
    } catch (err) {
      const m = err instanceof Error && err.name === "AbortError" ? "timed out" : String(err);
      result.finalNote = `update failed (${m})`;
      spindle.log.error(`[psyche] ${char.name}: update pass failed \u2014 ${m}`);
    }
    emitEngine(chatId, "running", "ruminating", userId);
    const playerProfile = await loadPlayerProfile(char.id).catch(() => "");
    try {
      await ruminate(run, transcript.slice(-6000), {
        signal: AbortSignal.timeout(config.agentTimeoutMs),
        userId,
        connectionId: agentConn,
        onTrace: (t) => dbg.rumination = capTrace(t),
        playerProfile,
        conflictCheck: config.conflictCheck
      });
    } catch (err) {
      spindle.log.error(`[psyche] rumination failed: ${String(err)}`);
    }
    await saveRun(run);
    await refreshInjection(chatId, userId);
    dbg.injection = {
      at: Date.now(),
      directive: capText(buildDirective(run, {
        playerProfile,
        humanTexture: config.humanTexture,
        conflictCheck: config.conflictCheck
      }) ?? "(nothing injected \u2014 not seeded or no one present)", DBG_REQ_CAP)
    };
    try {
      const prev = await loadDebug(chatId);
      await spindle.storage.setJson(debugPath(chatId), { ...prev, ...dbg });
    } catch (err) {
      spindle.log.warn(`[psyche] could not save debug traces: ${String(err)}`);
    }
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
  }
}
var pending = new Map;
function emitEngine(chatId, state, stage, userId) {
  spindle.sendToFrontend({ type: "engine", chatId, state, stage, queued: pending.has(chatId) }, userId);
}
function scheduleAgent(chatId, reply, userId) {
  if (!config.enabled || !reply.trim())
    return;
  if (running.has(chatId)) {
    pending.set(chatId, { reply, userId });
    spindle.log.info(`[psyche] engine busy for chat ${chatId}; queued latest turn`);
    emitEngine(chatId, "running", "queued another turn", userId);
    return;
  }
  runAgentLoop(chatId, reply, userId);
}
async function runAgentLoop(chatId, reply, userId) {
  running.add(chatId);
  emitEngine(chatId, "running", "starting", userId);
  try {
    await runAgentForChat(chatId, reply, userId);
    while (pending.has(chatId)) {
      const next = pending.get(chatId);
      pending.delete(chatId);
      await runAgentForChat(chatId, next.reply, next.userId);
    }
  } finally {
    running.delete(chatId);
    emitEngine(chatId, "idle", undefined, userId);
  }
}
var editingChats = new Set;
var EDITOR_SCENE_TAIL = 4000;
async function runEditor(chatId, messageId, reply, userId) {
  if (!config.editorEnabled || !reply.trim())
    return reply;
  if (editingChats.has(chatId))
    return reply;
  editingChats.add(chatId);
  try {
    emitEngine(chatId, "running", "editing reply", userId);
    let sceneTail = "";
    let swipeIdAtStart;
    try {
      const msgs = await spindle.chat.getMessages(chatId);
      const row = msgs.find((m) => m.id === messageId);
      swipeIdAtStart = row?.swipe_id;
      sceneTail = msgs.filter((m) => m.id !== messageId).map((m) => {
        const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        return text.trim() ? `${m.role === "user" ? "PLAYER" : "CHARACTER"}:
${text.trim()}` : "";
      }).filter(Boolean).join(`

`).slice(-EDITOR_SCENE_TAIL);
    } catch {}
    const run = await loadRun(chatId).catch(() => null);
    const dbg = {};
    let edited = null;
    try {
      edited = await editReply(run ?? emptyRun(chatId), sceneTail, reply, config.editorPrompt, {
        signal: AbortSignal.timeout(config.agentTimeoutMs),
        userId,
        connectionId: await resolveQuietConnection(config.editorConnectionId, userId),
        onTrace: (t) => dbg.editor = capTrace(t)
      });
    } catch (err) {
      const m = err instanceof Error && err.name === "AbortError" ? "timed out" : String(err);
      spindle.log.warn(`[psyche] editor pass failed (reply kept as-is): ${m}`);
      try {
        const hint = m.includes("No connection profile") ? "Editor needs a model: pick one in the Psyche panel, or mark a connection profile as default in Lumiverse." : `Editor pass failed \u2014 reply shown unedited (${m})`;
        spindle.toast.warning(hint, { title: "Psyche", userId });
      } catch {}
    }
    if (dbg.editor) {
      try {
        const prev = await loadDebug(chatId);
        await spindle.storage.setJson(debugPath(chatId), { ...prev, ...dbg });
      } catch {}
    }
    if (!edited || edited === reply)
      return reply;
    try {
      const msgs = await spindle.chat.getMessages(chatId);
      const row = msgs.find((m) => m.id === messageId);
      if (!row || typeof row.content !== "string" || row.content.trim() !== reply.trim()) {
        spindle.log.info("[psyche] editor: message changed mid-edit; keeping the newer content");
        return reply;
      }
      const at = Date.now();
      const chars = `${reply.length}\u2192${edited.length}`;
      await spindle.chat.updateMessage(chatId, messageId, {
        content: edited,
        ...swipeIdAtStart !== undefined ? { swipe_id: swipeIdAtStart } : {},
        metadata: {
          ...row.metadata ?? {},
          psyche_edited: { at, original: reply, chars }
        }
      });
      spindle.sendToFrontend({ type: "reply_edited", chatId, messageId, at, chars, original: reply }, userId);
      spindle.log.info(`[psyche] editor: rewrote reply (${reply.length} -> ${edited.length} chars)`);
      return edited;
    } catch (err) {
      spindle.log.warn(`[psyche] editor: could not write edit: ${String(err)}`);
      return reply;
    }
  } finally {
    editingChats.delete(chatId);
    emitEngine(chatId, running.has(chatId) ? "running" : "idle", undefined, userId);
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
  const gt = payload.generationType ?? "normal";
  const obs = observers.get(chatId);
  let reply = (payload.content ?? obs?.content ?? "").trim();
  dropObserver(chatId);
  if (!["normal", "swipe", "regenerate", "continue"].includes(gt))
    return;
  const messageId = payload.messageId;
  if (messageId && reply)
    reply = await runEditor(chatId, messageId, reply, userId);
  if (gt === "normal")
    scheduleAgent(chatId, reply, userId);
});
spindle.on("GENERATION_STOPPED", async (payload, userId) => {
  if (!config.enabled || !payload.chatId)
    return;
  const obs = observers.get(payload.chatId);
  const reply = (payload.content ?? obs?.content ?? "").trim();
  dropObserver(payload.chatId);
  scheduleAgent(payload.chatId, reply, userId);
});
var loggedInject = false;
async function refreshInjection(chatId, userId) {
  try {
    const char = await characterForChat(chatId, userId);
    if (!char)
      return;
    const entryId = await ensureInjectionEntry(char.id, char.name, userId);
    if (!entryId)
      return;
    const run = await loadRun(chatId).catch(() => null);
    const playerProfile = await loadPlayerProfile(char.id).catch(() => "");
    const directive = run && buildDirective(run, {
      playerProfile,
      humanTexture: config.humanTexture,
      conflictCheck: config.conflictCheck
    }) || "(no active emotional state)";
    await spindle.world_books.entries.update(entryId, { content: directive }, userId);
    if (!loggedInject) {
      loggedInject = true;
      spindle.log.info(`[psyche] wrote emotional state (${directive.length} chars) to injection entry for chat ${chatId}`);
    }
  } catch (err) {
    spindle.log.error(`[psyche] refreshInjection failed: ${String(err)}`);
  }
}
async function injectionInterceptor(ctx) {
  if (config.enabled)
    return;
  const ids = ctx.entries.filter((e) => isInjectionEntry(e.extensions)).map((e) => e.id);
  return ids.length ? { disabled: ids } : undefined;
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
    demeanor: c.demeanor ?? "",
    resistance: c.resistance ?? "",
    approval: c.approval ?? 0,
    approvalLabel: describeApproval(c.approval ?? 0).label,
    canon: c.canon ?? "",
    goals: c.goals ?? [],
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
  await refreshInjection(chatId, userId);
  const run = await loadRun(chatId);
  const char = await characterForChat(chatId, userId);
  spindle.sendToFrontend({ type: "state", characterName: char?.name ?? null, snapshot: snapshotRun(run), note }, userId);
}
spindle.onFrontendMessage(async (payload, userId) => {
  try {
    switch (payload?.type) {
      case "get_config":
        spindle.sendToFrontend({ type: "config", config, editorPromptDefault: DEFAULT_EDITOR_PROMPT }, userId);
        break;
      case "set_config":
        config = {
          enabled: Boolean(payload.config?.enabled ?? config.enabled),
          maxRounds: clampInt(payload.config?.maxRounds ?? config.maxRounds, 1, 20),
          decayRate: clampFloat(payload.config?.decayRate ?? config.decayRate, 0, 1),
          directive: String(payload.config?.directive ?? config.directive),
          agentTimeoutMs: clampInt(payload.config?.agentTimeoutMs ?? config.agentTimeoutMs, 1e4, 300000),
          agentConnectionId: payload.config?.agentConnectionId === undefined ? config.agentConnectionId : String(payload.config.agentConnectionId ?? ""),
          humanTexture: Boolean(payload.config?.humanTexture ?? config.humanTexture),
          conflictCheck: Boolean(payload.config?.conflictCheck ?? config.conflictCheck),
          editorEnabled: Boolean(payload.config?.editorEnabled ?? config.editorEnabled),
          editorPrompt: payload.config?.editorPrompt === undefined ? config.editorPrompt : String(payload.config.editorPrompt ?? ""),
          editorConnectionId: payload.config?.editorConnectionId === undefined ? config.editorConnectionId : String(payload.config.editorConnectionId ?? ""),
          editorBadge: Boolean(payload.config?.editorBadge ?? config.editorBadge)
        };
        await saveConfig();
        spindle.sendToFrontend({ type: "config", config, editorPromptDefault: DEFAULT_EDITOR_PROMPT }, userId);
        break;
      case "get_connections": {
        let connections = [];
        let error;
        try {
          if (!spindle.connections?.list)
            throw new Error("host does not expose the connections API");
          const list = await spindle.connections.list(userId);
          connections = list.map((c) => ({ id: c.id, name: c.name, provider: c.provider, model: c.model }));
        } catch (err) {
          error = String(err instanceof Error ? err.message : err);
          spindle.log.warn(`[psyche] could not list connections: ${error}`);
        }
        spindle.sendToFrontend({ type: "connections", connections, error }, userId);
        break;
      }
      case "get_state": {
        const chatId = await activeChatId(payload.chatId, userId);
        await sendState(chatId, userId);
        break;
      }
      case "get_debug": {
        const chatId = await activeChatId(payload.chatId, userId);
        const debug = chatId ? await loadDebug(chatId) : {};
        spindle.sendToFrontend({ type: "debug", debug }, userId);
        break;
      }
      case "get_engine": {
        const chatId = await activeChatId(payload.chatId, userId);
        spindle.sendToFrontend({ type: "engine", chatId, state: chatId && running.has(chatId) ? "running" : "idle" }, userId);
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
        const note = await seedRun(run, primary, buildCardContext(fullChar), {
          userId,
          connectionId: await resolveQuietConnection(config.agentConnectionId, userId)
        });
        run.seeded = true;
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
      case "get_edited_messages": {
        const chatId = await activeChatId(payload.chatId, userId);
        let entries = [];
        if (chatId) {
          try {
            const msgs = await spindle.chat.getMessages(chatId);
            for (const m of msgs) {
              const meta = m.metadata;
              const e = meta?.psyche_edited;
              if (e) {
                entries.push({
                  messageId: m.id,
                  at: Number(e.at ?? 0),
                  chars: String(e.chars ?? ""),
                  original: String(e.original ?? "")
                });
              }
            }
          } catch (err) {
            spindle.log.warn(`[psyche] get_edited_messages failed: ${String(err)}`);
          }
        }
        spindle.sendToFrontend({ type: "edited_messages", chatId, entries, badge: config.editorBadge }, userId);
        break;
      }
      case "get_player_profile": {
        const chatId = await activeChatId(payload.chatId, userId);
        const char = chatId ? await characterForChat(chatId, userId) : null;
        const profile = char ? await loadPlayerProfile(char.id) : "";
        spindle.sendToFrontend({ type: "player_profile", characterId: char?.id ?? null, profile }, userId);
        break;
      }
      case "save_player_profile": {
        const chatId = await activeChatId(payload.chatId, userId);
        if (!chatId)
          break;
        const char = await characterForChat(chatId, userId);
        if (!char)
          break;
        await savePlayerProfile(char.id, String(payload.profile ?? ""));
        await sendState(chatId, userId, "Player profile saved.");
        break;
      }
      case "set_approval": {
        const chatId = await activeChatId(payload.chatId, userId);
        if (!chatId)
          break;
        const run = await loadRun(chatId);
        const c = findChar(run, payload.characterId);
        if (c && typeof payload.value === "number" && Number.isFinite(payload.value)) {
          c.approval = Math.max(APPROVAL_MIN, Math.min(APPROVAL_MAX, Math.round(payload.value)));
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
      case "save_canon": {
        const chatId = await activeChatId(payload.chatId, userId);
        if (!chatId)
          break;
        const run = await loadRun(chatId);
        const c = findChar(run, payload.characterId);
        if (c && typeof payload.canon === "string") {
          c.canon = payload.canon;
          await saveRun(run);
        }
        await sendState(chatId, userId);
        break;
      }
      case "save_goals": {
        const chatId = await activeChatId(payload.chatId, userId);
        if (!chatId)
          break;
        const run = await loadRun(chatId);
        const c = findChar(run, payload.characterId);
        if (c && typeof payload.goals === "string") {
          c.goals = String(payload.goals).split(`
`).map((g) => g.trim()).filter(Boolean);
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
function clampInt(v2, min, max) {
  const n = Math.round(Number(v2));
  if (!Number.isFinite(n))
    return min;
  return Math.max(min, Math.min(max, n));
}
function clampFloat(v2, min, max) {
  const n = Number(v2);
  if (!Number.isFinite(n))
    return min;
  return Math.max(min, Math.min(max, n));
}
registerInjectionInterceptor();
(async () => {
  await loadConfig();
  spindle.log.info("[psyche] loaded");
})();
