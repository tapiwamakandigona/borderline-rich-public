# PROJECT.md — Borderline Rich

## Goal

A mobile business-tycoon sim people can't put down: the player picks one of six genuinely
different starting regions, starts with $0, hustles, opens a first business, and grows an
empire across an explorable 3D city — buying lots and rival properties, shipping goods across
borders (legally or not), playing regional politics, and climbing the Rich List. M1 is done when
every entry in `features.json` passes with evidence and a hosted build is playable on a phone.

## Session-start ritual

1. Read this file, `features.json`, `plan.md` task board, and `tail -n 120 progress.md`.
2. Run `npm run ci` to confirm the baseline is green.
3. Pick the single most important unfinished task; work only on that.

## Standing decisions

- Name "Borderline Rich" — web search found no game/app with this name; "Self-Made" is taken (2026-10-03)
- Stack TypeScript + three.js + Preact + Vite, packaged later with Capacitor — verifiable in a headless sandbox, one codebase for web/iOS/Android (2026-10-03)
- Sim core is pure TS and deterministic (seeded RNG stored in state), separate from rendering — testable headless, balance-testable with the real code (2026-10-03)
- All art is procedural (code-built geometry, canvas textures, synthesized audio) — no asset licensing, tiny bundle, consistent style (2026-10-03)
- Portrait-first mobile UI; floating joystick + drag-orbit + pinch + tap (2026-10-03)
- Monetisation: premium "Gold" + starter pack + 2 non-consumables; no ads, no paywalls; sandbox store on web until store accounts exist (2026-10-03)
- One builder agent; one read-only critic on the highest tier after features (owner request 2026-10-03)
- Source repo is private; an identical public copy (tapiwamakandigona/borderline-rich-public) runs CI for free and publishes the Android APK as the rolling `playtest` release — owner request (2026-10-03 10:37 UTC)
- Android via Capacitor 8 (`android/` committed, portrait, immersive); release APK signed in CI with a key held in repo secrets + the operator's secrets store, never in git (2026-10-03)

## Constraints

- Mobile performance budget: ≤ 220 draw calls, ≤ 500k triangles, DPR capped at 2, adaptive quality.
- Single-file hosted build ≤ 2 MB.
- No paid services or store accounts without owner approval. No secrets in the repo.
- Determinism: no `Math.random()` / `Date.now()` inside `src/core` (time and RNG are injected).

## Current phase

build — M1 vertical slice (see plan.md task board).
