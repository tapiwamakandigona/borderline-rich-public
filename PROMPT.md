# PROMPT.md — standing instructions for loop.sh (fresh context each iteration)

Read AGENTS.md, PROJECT.md, features.json, the task board in plan.md and `tail -n 120 progress.md`.
Do exactly ONE task: the first unchecked task in plan.md whose features are not passing.
Verify with the feature's `verify` command (and screenshots for visual work — look at them).
Commit with what + why. Append an entry to progress.md (VERIFIED/ASSUMED labels). Tick the task.
Flip `passes` in features.json only with evidence. Never edit tests to make them pass.
When every feature passes print DONE_ALL. If nothing can move without a human, print a line
starting `BLOCKED:` with the reason.
