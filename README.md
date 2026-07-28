# Psyche

A **roguelike emotional-roleplay engine** for Lumiverse (Spindle extension).

Psyche flips the usual character-card model on its head. Instead of a heavily
authored card, you write a **deliberately thin** one — a vague physical
description and a one-line summary. Everything else is rolled per run.

## The idea

- **Roguelike seeding.** Every new chat is a *run*. On the first message Psyche
  rolls a hidden **persona** (personality, wants, fears, voice, agenda) and a
  starting **temperament** from the sparse card and a numeric **seed**. Same
  card, different seed → a genuinely different character. Reroll any time.

- **A 40-dimension affect vector.** Every non-player character carries 40
  feelings, updated after every reply:
  - **38 unipolar feelings** in `0…1`, where `0` is *absent* and `1` is
    *all-consuming, drives them to extremes*. `sexual_arousal` is one of these —
    this is an adult engine in the spirit of Tapestries-style MU\* roleplay.
  - **2 bipolar axes** in `-1…1`:
    - **valence** — psychological energy / arousal (`-1` drained & inert,
      `+1` wired & activated)
    - **mood** — agreeableness (`-1` hostile & contrary, `+1` warm & open)

- **Feelings resist their extremes.** Stimulus is applied through a *saturating*
  transfer (`value = 1 − e^(−pressure)` for unipolar, `tanh` for bipolar), so the
  same push moves a calm mind far more than an overwhelmed one. Climbing from
  `0.90` to `0.95` costs as much as going `0.00 → ~0.61`. Reaching the extreme is,
  by design, asymptotically hard — exactly as in real life. Between turns,
  present characters **relax toward their baseline** temperament (homeostasis).

- **A self-authoring character sheet.** Beyond feelings, each character has a
  free-form sheet (attitude toward the player, plans, secrets, body state…) that
  the engine **rewrites Claude Code-style** — full authority to add, edit, and
  delete sections — based on the totality of the story so far.

- **A growing, locked canon (the character bible).** The card is thin on
  purpose. The engine **invents concrete static facts** to fill the blanks —
  history, tastes, skills, relationships, quirks — and then treats them as
  **fixed canon it must never contradict**, only extend. The character becomes a
  specific, consistent person over the run instead of vague improv.

- **Real agency, not a yes-man.** Each character carries durable **goals &
  desires**. The injected guidance pushes the writer model to have them take
  initiative, steer the scene, set conditions, and push back or refuse —
  pursuing their own agenda, not mirroring the player. Deliberately no
  pre-planned "next action" is handed to the writer — mood, goals, and canon
  steer it; the specific move stays improvised, not scripted in advance.

- **A mandatory conflict check, every turn.** Before writing, rumination is
  forced to name what each present character is **holding the line on** —
  warmth, agreement, or ground in the scene they are NOT giving away this
  turn, and why, tied to their goals/canon/approval. Generic "don't be a
  yes-man" guidance is easy for a model to drop under context pressure; a
  required per-turn field isn't. It's a boundary, not a script — it says what
  the character withholds, never the line or action they use to withhold it.

- **An invested partner, not a service provider.** A live **investment
  register** derived from the affect vector tells the writer how much the
  character is enjoying the scene: when the player serves their goals they
  visibly light up, give more, and initiate; when their goals are ignored they
  don't fake enthusiasm — they push their agenda or disengage. Enjoyment is
  earned, and it shows.

- **A player profile (per character card).** A freeform note about the **human
  behind the player-character** — interests, goals, kinks, hard lines — edited
  in the panel and shared by every chat with that character. It softly steers
  scenes toward what you're here for, through the characters' own in-fiction
  choices; they never see it, never mention it, and never break who they are to
  serve it. The player is never given emotion stats — feelings stay the
  characters' alone.

- **An approval ledger (RPG-style).** Every character carries a durable
  **approval** of the player, −10000…+10000 (neutral 0), moved ±1–10 at a time
  by the mind engine when the player's actions align with — or cut against —
  the character's *genuine* wishes (persona, goals, values, canon; not their
  stated demands). Unlike feelings it never decays. It gates trust and
  willingness: high approval buys latitude, even against the character's own
  preferences; low approval means guardedness, pushback, refusal. Graduated
  bands run from "mildly favorable/wary" through devoted/hostile all the way
  to "unshakeable bond"/"implacable enemy" at the pegged extremes. Visible and
  editable in the panel above the affect bars.

- **An editing pass (off by default).** A final LLM call rewrites each reply —
  including swipes, regens, and continues — per an editable style prompt before
  you read it: show-don't-tell over inner monologue, the world through the
  partner's eyes, no assistant-isms, warts left in. What happens is preserved;
  how it reads is rewritten. The raw text streams in first, then is replaced in
  place, and a small "✎ edited by Psyche" chip appears under the reply (click
  it to view the original; toggleable). If the editor fails, a warning toast
  says so and the raw reply stands. Own model dropdown, prompt editor, and
  toggle in the panel.

- **Energy-matched delivery.** Deterministic `delivery:` lines translate the
  state into how much the character says and how much effort it carries —
  drained or sulking reads short and flat, lit-up reads quick and expansive —
  so replies stop being uniformly polished essays regardless of mood.
  Toggleable ("Human texture" in settings).

- **Multi-character & full CRUD.** The card character is the primary target, but
  the engine introduces, advances, and retires supporting characters as the
  story brings them in. Every present character's state is tracked independently.

- **It actually drives the reply.** The live emotional state of every present
  character is injected into the next generation (via a force-injected,
  content-overridden world-info entry), so the visible character *behaves the way
  they feel*. The entry is **disabled at rest**: turn the extension off and
  nothing is injected — the prompt is completely normal.

## Breakpoints

The meaning of each axis is pinned at `0.25, 0.50, 0.75, 0.80, 0.90, 0.95, 1.00`
(mirrored to the negatives on the bipolar axes) — see `genericScaleText()` in
`src/affect.ts`. These calibrate both the engine's updates and the panel's
descriptors.

## Architecture

| file | role |
|------|------|
| `src/affect.ts` | the 40-emotion schema, the pressure↔value saturation math, decay, and breakpoint descriptors |
| `src/run.ts` | per-chat run state, the live state→behavior directive, and injection-entry provisioning |
| `src/agent.ts` | seeding (persona roll) + the post-turn update agent (tool loop) |
| `src/tools.ts` | the engine's tools: character + emotion + sheet CRUD |
| `src/backend.ts` | wiring: generation hooks, seeding, decay, the world-info injection interceptor, frontend bridge |
| `src/frontend.ts` | the operator drawer: affect bars, persona, sheet, seed controls, settings |

State is keyed by `chatId` under the extension's scoped storage (`runs/<chatId>.json`).

## Build

```sh
bun install
bun run build   # emits dist/backend.js and dist/frontend.js
```

The extension loads `dist/` (per `spindle.json`), **not** `src/` — always rebuild
before publishing.

## Settings

In the **Psyche** drawer tab: enable/disable, human texture (energy-matched
replies), engine rounds per turn, decay rate, an optional engine directive
(tone steering), reroll seed, reset run, per-character persona/sheet/presence
editing, the player profile for the current character card, and the editor
(toggle, style prompt, model).
