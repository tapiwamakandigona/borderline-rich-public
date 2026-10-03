# plan.md — Borderline Rich master plan (handoff document)

> If you are an AI (or human) taking over: read this file, then `AGENTS.md`,
> `PROJECT.md`, `features.json`, and `tail -n 120 progress.md`. Run `npm ci && npm run ci`.
> Pick the first unchecked task in the **Task board** below whose feature is still
> `"passes": false`. One task per iteration: plan → act → verify → commit → log.
> The operating protocol is the Single-Agent Harness v3.2.0
> (github.com/tapiwamakandigona/subagent-toolkit, `HARNESS.md`).

## 1. What we are building

**Borderline Rich** — *Start broke. Cross borders. Get rich.*
An open-world business-tycoon simulation for mobile (portrait-first, landscape OK).
You start with $0 in one of six hand-designed regions, hustle for your first dollars,
open a street business, and climb the continent's Rich List by buying up the city —
lot by lot, building by building — while rival companies, elections, tariffs,
smuggling heat and region-specific crises push back.

Design source of truth: `docs/GDD.md`. Visual direction: `docs/ART_BIBLE.md`.
Prompting/workflow research that shaped this plan: `docs/research/prompt-patterns.md`.

## 2. Architecture (decided — see PROJECT.md standing decisions)

```
src/core/      pure TypeScript simulation. NO DOM, NO three.js. Deterministic (seeded RNG in state).
  data/        regions.ts, businesses.ts, events.ts, goods.ts, progression.ts  ← content lives here
  *.ts         economy, politics, trade, rivals, events engine, region mechanics, goals,
               save/offline, sim step, actions (the only way UI mutates state)
src/iap/       product catalog, Store interface, sandbox (web) store, native adapter stub, fulfillment
src/world/     three.js renderer: city builder (reads core city layout), sky, water, traffic,
               props, weather, player, camera rig, markers, picking, quality presets
src/input/     floating joystick, orbit drag, pinch zoom, tap picking (Pointer Events)
src/ui/        Preact overlay: region select, HUD, bottom sheets (Empire/Trade/Politics/Rivals/Store),
               lot card, event modal, toasts, welcome-back, rank-up
src/audio/     WebAudio-synthesised SFX (no audio files)
tests/         Vitest unit + balance tests (run the REAL sim headless)
e2e/           Playwright (mobile viewport, touch via CDP, screenshots per region)
```

Builds: `npm run build` (multi-file, for Capacitor/web), `npm run build:single`
(one self-contained HTML for hosted playtests, must stay < 2 MB), `npm run build:test`
(adds `window.__BR` sim hook for e2e only — never ship it).

## 3. Milestones

| Milestone | Scope | Status |
|---|---|---|
| **M1 — Vertical slice** | All 6 starting regions playable; core loop (hustle → businesses → upgrades → managers); trade + tariff avoidance; politics; rivals + Rich List; events; goals; vehicles; expansion/travel; IAP sandbox; save/offline; 3D city per region with day/night, traffic, weather; mobile controls; hosted playable build | in progress |
| M2 — Depth | Lobbying for specific laws; stock market & IPO; hostile takeovers via share buying; loans/credit rating; daily login + daily contracts; achievements; procedural ambient music per region; pedestrians with routines; interiors for HQ | planned |
| M3 — Ship | Capacitor Android/iOS projects; real IAP via cordova-plugin-purchase or RevenueCat + server receipt validation; cloud save; analytics (consent-gated); localisation; store listing art; performance pass on real low-end devices | planned |
| M4 — Live | Legacy/prestige (retire → heir with perks); seasonal events; new regions (capital city, arctic port); leaderboards | planned |

## 4. Task board (M1) — one task per iteration, commit after each

Feature ids refer to `features.json`. Check a box only when the feature's verify command is green.

- [x] T1 Repo + harness scaffold, CI, docs (F1)
- [x] T2 Core sim: types, RNG, data (businesses, regions, goods), city layout, economy, save (F2, F5)
- [x] T3 Region mechanics + politics + trade/tariffs + heat (F3, F6, F7)
- [x] T4 Rivals + Rich List + events + goals + vehicles + expansion (F8, F9, F10)
- [x] T5 IAP layer + offline earnings (F11, F12)
- [x] T6 Balance bot tests + tuning (F4, F17)
- [x] T7 3D world renderer, six region looks, perf budget, screenshots (F13)
- [x] T8 Input + UI + audio + main loop wiring (F14, F15)
- [ ] T9 Hosted single-file build, PWA manifest, Capacitor config (F16)
- [ ] T10 Max-tier read-only critic → `evaluation.json` → fix NEEDS_WORK findings

## 5. How to verify (definition of done)

- `npm run ci` → typecheck + unit/balance tests + production build + boot-budget check.
- `npm run build:test && npx playwright test` → e2e on a 390×844 touch viewport, writes
  screenshots to `e2e/__shots__/` (gitignored) — look at them; "it loads" is not done.
- Completion = checks green + every `features.json` entry `"passes": true` with evidence
  + the read-only evaluator agrees (`evaluation.json` verdict PASS).

## 6. Known risks / open questions

- Real IAP needs Apple/Google developer accounts + product setup (owner action, costs money).
- Headless Chromium uses SwiftShader: frame timings there are NOT device performance.
- Native packaging (Android SDK / Xcode) is not available in the build sandbox.
- Balance is tuned by the bot in `tests/balance.test.ts`; real players will differ — add
  analytics in M3 before trusting numbers.

## 7. Resume checklist for a new agent

1. `git pull`, `npm ci`, `npx playwright install chromium`.
2. Read files listed at the top. Do not re-litigate PROJECT.md standing decisions.
3. Find the first open task above → do only that → verify → commit → append to progress.md
   → tick the box here.
4. Two iterations with no diff = stop and report. One retry on failure, then descope/escalate.
