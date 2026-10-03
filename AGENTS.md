# AGENTS.md — Borderline Rich

## Project

Open-world mobile tycoon sim: start with $0 in one of six unique regions, build a business
empire against AI rivals, politics, tariffs and risk. Web-first (Vite) → Capacitor for stores.
Stack: TypeScript, three.js r186, Preact 11 + signals, Vite 8, Vitest 5, Playwright.

## Commands

```bash
npm ci                                   # setup
npx vitest run                           # unit + balance tests — run before claiming anything works
npm run ci                               # full gate: typecheck + tests + build + budget — must pass before commit
npm run dev                              # local dev server
npm run build:test && npx playwright test   # e2e + screenshots (e2e/__shots__/), touch viewport 390x844
npm run build:single                     # one-file HTML for hosted playtests (< 2 MB)
```

## Structure

- `src/core/` — pure deterministic sim (no DOM/three). All state changes go through `actions.ts`.
- `src/core/data/` — content: regions, businesses, events, goods, progression. Balance lives here.
- `src/iap/` — catalog, Store interface, sandbox + native adapters, idempotent fulfillment.
- `src/world/` — three.js renderer; reads `core/city.ts` layout; never mutates sim state.
- `src/input/`, `src/ui/`, `src/audio/` — controls, Preact overlay, synthesized SFX.
- `tests/` (Vitest) and `e2e/` (Playwright).
- State: `PROJECT.md` (decisions), `features.json` (definition of done),
  `progress.md` (append-only log), `plan.md` (master plan + task board for handoffs).
  Read the first two and `tail -n 120 progress.md` every session; never the whole log.

## Boundaries

**Always:** one task per iteration; commit after each verified task; append to `progress.md`;
tick the task in `plan.md`; run `npm run ci` before commit; keep sim logic out of `world/` and `ui/`;
use the seeded RNG in state (never `Math.random()` in `src/core`); keep the boot set in budget
(`sh check_budget.sh`); label claims VERIFIED (with evidence) or ASSUMED.

**Ask first:** spending money, real store/IAP accounts, new runtime dependencies,
changing a standing decision in `PROJECT.md`, deleting saves/migrations.

**Never:** edit or weaken tests to make them pass; flip `passes` without evidence;
commit secrets or tokens; force-push; ship the `__BR` sim hook in production builds;
hot-link external assets (everything is procedural or bundled).

## Deeper docs (read on demand)

- `docs/GDD.md` — game design (regions, systems, numbers).
- `docs/ART_BIBLE.md` — palettes, shapes, UI style, juice rules.
- `docs/research/prompt-patterns.md` — what worked for others building games with Claude.
- `EVALUATOR.md` — brief for the read-only critic agent.
