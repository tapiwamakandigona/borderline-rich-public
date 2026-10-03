#!/bin/sh
# Fail CI when the always-read boot set or progress.md outgrows its budget.
# Usage: sh check_budget.sh [boot files...]   (defaults below; ~4 bytes per token)
# Env:   BOOT_MAX (bytes, default 32000), PROGRESS_MAX (default 65536),
#        RULES_MAX_LINES (default 100).
set -eu
BOOT_MAX=${BOOT_MAX:-32000}
PROGRESS_MAX=${PROGRESS_MAX:-65536}
RULES_MAX_LINES=${RULES_MAX_LINES:-100}
if [ "$#" -eq 0 ]; then set -- AGENTS.md PROJECT.md features.json; fi

status=0
total=0
for f in "$@"; do
  if [ ! -f "$f" ]; then echo "check_budget: missing boot file $f"; status=1; continue; fi
  total=$((total + $(wc -c < "$f")))
done
echo "check_budget: boot set $total bytes (~$((total / 4)) tokens), limit $BOOT_MAX"
if [ "$total" -gt "$BOOT_MAX" ]; then
  echo "check_budget: FAIL boot set over budget; move depth to docs/ or archive/"; status=1
fi
if [ -f AGENTS.md ]; then
  lines=$(wc -l < AGENTS.md)
  if [ "$lines" -gt "$RULES_MAX_LINES" ]; then
    echo "check_budget: FAIL AGENTS.md has $lines lines (max $RULES_MAX_LINES)"; status=1
  fi
fi
if [ -f progress.md ]; then
  size=$(wc -c < progress.md)
  if [ "$size" -gt "$PROGRESS_MAX" ]; then
    echo "check_budget: FAIL progress.md is $size bytes; rotate it verbatim to archive/"; status=1
  fi
fi
exit "$status"
