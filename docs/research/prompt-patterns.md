# Prompt & workflow patterns from the Claude community (research 2026-10-03)

Owner asked to check r/Anthropic, r/ClaudeAI and r/ClaudeCode for prompts people use to build
impressive things. **Method/limits:** Reddit blocks this sandbox (HTTP 403 on every
`reddit.com/r/*/search.json` request), so findings come from web search results that surfaced
Reddit threads (via a mirror snapshot) and the write-ups they link. Treat as secondary sources.

## What the standout builds had in common

1. **Design doc first, then one prompt.** "Topple Pier" (r/ClaudeAI, Opus 5.5, ~30 min): the author
   wrote a design doc for a physics game and gave Claude Code one prompt. Result: three.js +
   Rapier, endless generated levels, 4 worlds, a shop, sound effects made in code.
   → We keep `docs/GDD.md` + `docs/ART_BIBLE.md` as the brief.
2. **Rules separate from graphics, tested headless.** The same post: Claude "kept all the game
   rules separate from the graphics so it could test them without even opening the game".
   → `src/core` is pure TS with Vitest tests.
3. **Simulate the real code for balance, not a model of it.** Galactic Idle (dev.to, 2026-09-30):
   a `?__sim` hook lets a harness fast-forward the real economy; found a credits-negative trough
   at hours 3–8 that playtests missed. → `tests/balance.test.ts` drives the real sim with a bot.
4. **Turn a vague ask into a brief before coding.** "Kartit Nitro" (dev.to, 2026-09-28): Claude
   rewrote "super fast fire stuff" into a short brief, then iterated on blunt playtest notes.
5. **Game bible + dated decision log + "don't redesign without asking".** Martin Krpan adventure
   (dev.to, 2026-09-25): 1,472-line bible, 25 one-line dated decisions, 14 milestone tasks,
   Playwright play-throughs, two attempts per task then stop and ask.
   → PROJECT.md standing decisions, harness retry rule.
6. **Screenshot → critique → fix loops.** Use Playwright to capture, review the image against
   the intended layout, fix, recapture. "Opus 5 runs the loop itself… iterates toward a feel
   instead of stopping at 'it loads'."
7. **Ask for game feel by name.** Coyote time, hit-stop, decaying screen shake (camera not UI),
   easing on every tween, squash & stretch, particles with gravity, a sound for every action with
   pitch variation, a camera that leads with a dead zone, one tuning file + an off switch.
8. **Avoid "AI slop" aesthetics explicitly** (Anthropic cookbook "Prompting for frontend
   aesthetics"): distinctive typography (not Inter/Roboto/Arial), commit to a palette via CSS
   variables with dominant colours + sharp accents, one orchestrated staggered page-load reveal,
   atmospheric backgrounds instead of flat fills.
9. **Model, don't stack boxes.** Procedural low-poly scenes look good when each prop is composed
   (rounded boxes, cylinders, extrusions, canvas-texture faces) and drawn with merged geometry
   and instancing to stay batch-friendly.
10. **One asset / one world at a time.** Build and verify one model, map or world before the next.

## Reusable prompt skeleton (what we use for each feature)

> Read GDD §X and ART_BIBLE. Build <one feature>. Keep rules in `src/core` with tests that can
> fail. Then capture screenshots at 390×844 and critique them against the art bible: name the
> three weakest things and fix them before calling it done. Juice: <named techniques>.
> Stop only for money, credentials or irreversible actions.

Sources: reddit.sentinel-team.org snapshot of r/ClaudeAI post "Opus 5.5 one-shotted a full 3D
physics game in 30 minutes"; dev.to/akartit (Kartit Nitro); dev.to/nunc (Martin Krpan);
dev.to/renderscribe (Galactic Idle); gamesbyai.win/guides/game-feel-with-ai;
platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics;
github.com/jasonsturges/three-low-poly; github.com/fcsouza/agent-skills (vision loop).
