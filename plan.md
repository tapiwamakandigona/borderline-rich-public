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
- [x] T9 Hosted single-file build, PWA manifest, Capacitor config (F16) — playtest: https://bridgeton-grants.viktor.page/borderline-rich (workspace sign-in)
- [x] T10 Max-tier read-only critic → `evaluation.json` (verdict **NEEDS_WORK**, 14 findings, 2026-10-03)
- T10 fix list — critic findings in player-impact order (finding # in `evaluation.json` in brackets):
  - [x] T10a Joystick moved the whole HUD (Preact adopted the joystick div as its root) + e2e that
        asserts the HUD/joystick on screen + CI e2e robustness (camera settle, no random modals) [1, 13] (F14, F1)
  - [x] T10b Notifications: churn/rival toasts throttled into News, nothing over modals/lot card,
        rank-up banner placement, no duplicate toasts [7] (F15)
  - [x] T10c Regions play differently in the first 20 min: region starter businesses + signature
        mechanics that touch tier-1, Solenne Free Port works for residents, region cards generated from
        the real numbers, difficulty stars match measured outcomes [2, 3, 11] (F3, F17)
  - [x] T10d Lot-card "≈ $/s" uses the real income function (tax, upkeep, competition, laws) [4] (F5)
  - [x] T10e Incremental city rebuild (per-chunk), no full-city rebuild on a lot change [5] (F13)
  - [x] T10f Visual pass: per-region landmark at spawn, camera framing, palm fronds, nights,
        Neon Vale windows, Verano sand; squash-and-stretch on upgrade + visible per-level growth [6, 12] (F13)
  - [x] T10g Systems: wage deal has a real cost, every faction's standing does something,
        buying out the rival ends a price war, early event variety [8, 9, 10, 14] (F7, F8, F9)
  - [x] T10g+ Neon Vale vendor medallion: carts ×2.5 to open there, so the local tech hustle is the
        cheapest opener (12-seed tech share 46–79 %, was min 11 %) (F3, F17)
  - [x] T10i Region select works on small phones (375×667, 360×640, 360×740): scrollable cards,
        sticky Start, one-line title + e2e with real touch drags (F14)
  - [x] T10h Re-run the critic → evaluation #2 (2026-10-03 10:45 UTC): **NEEDS_WORK**, prior findings
        10 FIXED / 4 PARTIAL, 11 new findings → T12 below
- [x] T11 Android APK + public CI copy (owner request 2026-10-03 10:37 UTC) (F18, F1): Capacitor 8 `android/`
      (portrait, immersive, branded icon/splash from `public/icon.svg`), back button + pause/resume via
      `src/app/native.ts`, public repo `borderline-rich-public` with signing secrets, CI jobs apk →
      device-smoke (emulator: install, Start, hustle, screenshots) → rolling `playtest` release.
      First fully green run: 37122408326 (a715fd3), Playtest build #5 (2026-10-03 12:27 UTC)
- T12 fix list — critic evaluation #2, player-impact order (finding # in `evaluation.json` in brackets):
  - [x] T12a Rivals play fair: no price war on a brand-new player (same 600 s gate as offers/sabotage),
        an affordable remedy; rivals seeded at their designed size (startCash, capped levels; the
        "mega-rival" really is the biggest); rivals can't spend money they don't have [new 1, 2, 3] (F8, F17)
        Done 2026-10-03: `RivalDef.startWorth` (net worth at t = 0, 60 % in businesses ≤ level 25), rivals
        bank 25 % of profit, wars only where the buy-out ≤ your net worth (toast names the price), stale
        offers fall through; the balance bot passes a home rival in every 1–2★ region; difficulty.test 8 seeds
  - [ ] T12b Toasts never cover the lot-card header or the cash card (360×640) + e2e guard; the region
        starter is listed first on a vacant lot, tagged as the local pick [new 4, 5; prior 7] (F14, F15)
  - [x] T12c Text tells the truth: Solenne Free Port panel + no transship option for Solenne residents;
        rm_nephew "Refuse" has a real effect; "an Egg Stand" [new 9, 10, 11] (F6, F9)
  - [ ] T12d Evidence: ui.spec compares the card estimate with the real income; F15/F16 wording matches
        the specs [new 7; prior 13] (F15, F16)
  - [ ] T12e Region goal chains: the first 10–20 min of goals teach each region's signature [new 8; prior 2] (F3, F10)
  - [ ] T12f Visuals: follow-camera framing, readable Neon Vale day, Amberfield meadow ground [new 6; prior 6] (F13)
  - [ ] T12g Re-run the critic until PASS
- [x] T13 Mobile performance + Play Store bundle (owner request 2026-10-03 19:59 UTC): per-lot geometry
      cache (a chunk rebuild concatenates cached lots; 1-lot sync 333 → 125 ms, full city 1477 → 208 ms
      at 4× CPU throttle, SwiftShader), medium = no tree shadows + shadow map every 2nd frame, adaptive
      fallback drops shadows after 4 s at min DPR under 40 fps, 120 Hz screens paced to 60 fps;
      CI also builds the signed AAB (`bundleRelease`) for Google Play (app "Borderline Rich", com.borderlinerich.game)

## 5. How to verify (definition of done)

- `npm run ci` → typecheck + unit/balance tests + production build + boot-budget check.
- `npm run build:test && npx playwright test` → e2e on a 390×844 touch viewport (+ a 360×640 small-phone check), writes
  screenshots to `e2e/__shots__/` (gitignored) — look at them; "it loads" is not done.
- Completion = checks green + every `features.json` entry `"passes": true` with evidence
  + the read-only evaluator agrees (`evaluation.json` verdict PASS).

## 6. Known risks / open questions

- Real IAP needs Apple/Google developer accounts + product setup (owner action, costs money).
- Headless Chromium uses SwiftShader: frame timings there are NOT device performance (same for the
  CI Android emulator, which renders with swiftshader_indirect).
- Neither the Android SDK nor Xcode is available in the build sandbox, so the APK is built and tested only in CI (public repo).
  iOS needs macOS + Xcode + an Apple developer account.
- The Android signing key lives in the public repo's Actions secrets and the operator's secrets store.
  If it is lost, installed playtest builds can't be updated in place (uninstall/reinstall loses the save).
- Balance is tuned by the bot in `tests/balance.test.ts`; real players will differ — add
  analytics in M3 before trusting numbers.

## 7. Resume checklist for a new agent

1. `git pull`, `npm ci`, `npx playwright install chromium`. Push `main` to BOTH remotes (`origin` private,
   `public` = borderline-rich-public); CI, the APK and the `playtest` release run only on `public`.
2. Read files listed at the top. Do not re-litigate PROJECT.md standing decisions.
3. Find the first open task above → do only that → verify → commit → append to progress.md
   → tick the box here.
4. Two iterations with no diff = stop and report. One retry on failure, then descope/escalate.
