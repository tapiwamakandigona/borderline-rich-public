#!/bin/sh
# loop.sh — reference fresh-context loop (Ralph pattern) with guards.
# Usage: ./loop.sh [max_iterations]   (default 20)
#
# Requires in the working repo:
#   PROMPT.md      — standing instructions, re-fed every iteration. Must tell
#                    the agent to: read state files, do ONE task, verify,
#                    commit, update progress.md, print DONE_ALL when
#                    features.json is fully green, and print a line starting
#                    "BLOCKED: <reason>" only when nothing can move without
#                    a human.
#   AGENT_CMD env  — the agent invocation, e.g. 'claude -p' or 'codex exec'.
#
# Stops on: a BLOCKED line (exit 3), the completion marker, max iterations,
# or two consecutive iterations with no new commit (stall, exit 2).
#
# A text-only exit without BLOCKED is a progress report, not "done":
# Opus 5.5-class models can end a turn with a summary while work is still
# owed, so each prompt names the features still open in features.json.
# Completion is gated on the files, never on the marker alone.

set -u
MAX_ITER="${1:-20}"
AGENT_CMD="${AGENT_CMD:?set AGENT_CMD, e.g. AGENT_CMD='claude -p'}"
MARKER="DONE_ALL"
stall=0
i=0

# Space-separated ids of features.json entries not yet passing. Empty when
# every feature passes, or when there is no features.json / no python3.
# A malformed file reports itself as open, so it can never pass the gate.
open_features() {
  [ -f features.json ] || return 0
  command -v python3 >/dev/null 2>&1 || return 0
  python3 -c '
import json
try:
    data = json.load(open("features.json"))
    ids = [f["id"] for f in data["features"] if f.get("passes") is not True]
except Exception:
    ids = ["features.json-unreadable"]
print(" ".join(ids))
'
}

while [ "$i" -lt "$MAX_ITER" ]; do
  i=$((i + 1))
  before=$(git rev-parse HEAD 2>/dev/null || echo none)
  echo "=== iteration $i/$MAX_ITER ==="

  open=$(open_features)
  out=$(
    {
      cat PROMPT.md
      if [ -n "$open" ]; then
        printf '\nStill open in features.json: %s. Continue with the most important one; if it is blocked, print a line starting BLOCKED: with the reason.\n' "$open"
      fi
    } | $AGENT_CMD 2>&1
  ) || echo "agent exited non-zero (continuing)"
  printf '%s\n' "$out" | tail -20

  if printf '%s\n' "$out" | grep -q '^BLOCKED:'; then
    echo "agent reports a blocker — stopping for human input"
    exit 3
  fi

  case "$out" in
    *"$MARKER"*) echo "completion marker seen — verifying"; break ;;
  esac

  after=$(git rev-parse HEAD 2>/dev/null || echo none)
  if [ "$before" = "$after" ]; then
    stall=$((stall + 1))
    echo "no new commit (stall $stall/2)"
    [ "$stall" -ge 2 ] && { echo "STALLED — stopping for human review"; exit 2; }
  else
    stall=0
  fi
done

# Trust the checks, not the marker: final verification gate.
left=$(open_features)
if [ -n "$left" ]; then
  echo "features still open: $left"
  exit 1
fi
if [ -x ./verify.sh ]; then
  if ./verify.sh; then
    echo "VERIFIED green"
  else
    echo "marker/iterations hit but checks FAIL"
    exit 1
  fi
fi
