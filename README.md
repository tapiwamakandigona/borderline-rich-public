# Borderline Rich

*Start broke. Cross borders. Get rich.*

An open-world business-tycoon game for phones. Pick one of six starting regions, each with its
own economy, politics and risks. Start with $0, hustle for your first dollars and open a street
stall. From there, buy up a living 3D city lot by lot. Along the way you compete with rival
companies, ride out elections and price wars, and decide whether to pay your tariffs or smuggle
past them.

## Play it

- **Android:** download `borderline-rich.apk` from the
  [playtest release](https://github.com/tapiwamakandigona/borderline-rich-public/releases/tag/playtest), which is rebuilt from `main` after every green
  pipeline. Allow installs from your browser when Android asks. New builds install over old ones
  and keep your save.
- **Web:** `npm ci && npm run dev`, then open the printed URL. Use your browser's phone emulation
  for touch controls.

In-app purchases in playtest builds go through a **test store**, so no real money is ever charged.

## Build

```bash
npm ci
npm run ci                                  # typecheck + unit/balance tests + build + budget
npm run build:test && npx playwright test   # e2e on a 390x844 touch viewport
npm run build:single                        # one-file HTML build for hosted playtests
npm run build && npx cap sync android       # then: cd android && ./gradlew assembleDebug
```

CI (`.github/workflows/ci.yml`) runs these stages:

1. The gate (typecheck, tests, build, budget).
2. Playwright e2e.
3. A signed release APK.
4. An Android emulator smoke test. It installs the APK, starts a game and hustles.
5. Publishing the `playtest` release.

Stack: TypeScript, three.js, Preact + signals, Vite, Vitest, Playwright, Capacitor.
Everything is procedural (geometry, textures and sound), so there are no external assets.

## Docs

- `plan.md`: master plan and task board (start here if you are picking the project up).
- `docs/GDD.md`: game design. `docs/ART_BIBLE.md`: visual direction. `docs/IAP.md`: purchases.
- `AGENTS.md`, `PROJECT.md`, `features.json`, `progress.md`: working state for the build agent.

© 2026 the Borderline Rich authors. All rights reserved. The source is visible so that CI
can run in the open. No licence is granted.
