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

## 2026-10-03 06:45 UTC — T3–T6 systems tests, IAP layer, balance pass
- Added src/iap (catalog, idempotent fulfillment, SandboxStore, NativeStoreUnavailable) and tests for trade, politics, rivals, events, progression, iap, save/offline, balance. VERIFIED `npx vitest run` → 12 files, 79 tests passed.
- Balance: first bot run showed runaway growth (Red Mesa $18.5B at 45 min). Root causes found with scripts/balance-report.ts: stacked multipliers (demand×fit×law×mechanic up to 5–8x), costs scaling with region price level but income not, flat paybacks across tiers, cheap L10 x2 milestone.
  Changes: src/core/balance.ts knobs (demand/fit spreads, upgradeK 0.8, growth 1.18, incomeElasticity 0.8, empire overhead 0.4 %/biz over 10, cap 25 %); tier paybacks 60 s → 830 s; L10 milestone x1.5; seasons 0.75/1.0/1.6/0.5; tourism 1.5/0.7; hype 0.7–1.5; fuel 0.6–1.6; Red Mesa permits 60+180*reg s; governor's cut 12 %.
  Result (45 min, seeds 21/7/99): solenne 3.3–3.6M, redmesa 9.7–18.9M, neonvale 2.3–7.7M, amberfield 16–20M, verano 11–13M, ironhold 1.8–4.3M.
- Test updates caused by the deliberate retune (called out per harness rule): 4 tests that pinned old literals (L10 x2, seasons 5x, tourism 3x, farm subsidy 1.35) now read the exported constants AND keep minimum-effect floors (harvest/winter >= 3, tourism >= 2, hype >= 2, subsidy effect > 3 %) so they still fail if a mechanic stops mattering. Price-war test setup now constructs the trigger condition explicitly (seed 3 had no Vance logistics lot).
- "Easy outpaces expert" is measured in purchasing-power terms (net worth / cost index) because nominal prices differ 4x between regions. ASSUMED this is the intended reading of the F17 acceptance text.
- Difficulty note: Red Mesa (Hard) is still faster than Solenne in nominal terms; its difficulty is risk/complexity (permits, bribes, rigged votes, bandits), which the bot does not exercise.
