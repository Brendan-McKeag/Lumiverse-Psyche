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
  desires** and a per-turn **intent** (what they want now + the move they're
  likely to make). The injected guidance pushes the writer model to have them
  take initiative, steer the scene, set conditions, and push back or refuse —
  pursuing their own agenda, not mirroring the player.

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

In the **Psyche** drawer tab: enable/disable, engine rounds per turn, decay rate,
an optional engine directive (tone steering), reroll seed, reset run, and
per-character persona/sheet/presence editing.
