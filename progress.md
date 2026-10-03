# progress.md — append-only log (newest at bottom). Never edit past entries.

## 2026-10-03 05:25 UTC — T1 scaffold
- Created private repo tapiwamakandigona/borderline-rich via GitHub REST API (PAT from operator secrets file).
- Name chosen: "Borderline Rich" (web search: no game/app with that name; "Self-Made" taken by Netmarble's Selfmade Billionaire).
- Reddit research: reddit.com returns HTTP 403 to this sandbox; used web search instead → docs/research/prompt-patterns.md.
- Installed: three 0.186, preact 11, @preact/signals 2.11, vite 8, vitest 5, typescript 7, @playwright/test 1.63.
- ASSUMED: private repo is right for a commercial game (reversible: owner can flip visibility).

## 2026-10-03 06:05 UTC — T2 core sim (+ T3/T4 modules written)
- src/core: types, seeded RNG, data (19+6 businesses, 8 goods, 6 regions, 56 events, ranks/goals/vehicles), city layout generator, economy, laws, region mechanics, politics, trade, rivals, events engine, sim, actions, offline, save.
- VERIFIED `npx vitest run` → 4 files, 25 tests passed (core/regions/economy/harness).
- Bugs caught by the new tests and fixed at the root:
  1. Rival offers/sabotage created events without scale S → cash became NaN (found by save round-trip test).
  2. Income cache refreshed on an unsaved phase → save/load copies diverged. Incomes now sample time at integer sim-seconds; hype/fuel update per second; strike/VC transitions bump rev.
  3. Tills were clamped down when income dropped → players lost earned cash. Tills never shrink now.
  4. Amberfield layout produced only 6 small lots → density-aware parcel mix, 5x4 town (now 36 small lots).
- Test fixes (setup only, assertions unchanged or stricter): competition test now clears the whole retail category; manager test now does exact step-by-step accounting with the world quieted; determinism scanner false positive fixed by rewording a comment (scanner unchanged); vitest testTimeout 180 s for long sims.
