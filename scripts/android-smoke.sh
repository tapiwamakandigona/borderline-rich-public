#!/usr/bin/env bash
# Android emulator smoke test for the built APK (CI job device-smoke, inside the emulator runner).
# Proves on a real Android WebView: the APK installs and cold-starts, the region select renders,
# "Start in …" enters the city, Hustle taps earn cash, and the app has not crashed.
# Usage: scripts/android-smoke.sh path/to.apk [out-dir]   (screenshots, UI dumps, logcat → out-dir)
set -uo pipefail
APK=${1:?usage: android-smoke.sh app.apk [out]}
OUT=${2:-smoke}
PKG=com.borderlinerich.game
UI="python3 scripts/android_ui.py"
mkdir -p "$OUT"

finish() { adb logcat -d > "$OUT/logcat.txt" 2>/dev/null || true; }
fail() { echo "SMOKE FAIL: $*"; tail -n 4 "$OUT/uiautomator.log" 2>/dev/null; shot "fail"; finish; exit 1; }
shot() { adb exec-out screencap -p > "$OUT/$1.png" 2>/dev/null || true; }
# dump NAME: accessibility tree → $OUT/NAME.xml; non-zero when uiautomator produced none. uiautomator
# answers only after the page has been still for 1 s; otherwise it gives up ("could not get idle
# state") without writing a file. So delete the previous dump first, or the stale one is read back as
# if it were current. Its messages go to $OUT/uiautomator.log (the app keeps an idle HUD still for
# this: e2e/a11y.spec.ts).
dump() {
  adb shell rm -f /sdcard/ui.xml > /dev/null 2>&1
  echo "--- $1 $(date -u +%T)" >> "$OUT/uiautomator.log"
  adb shell uiautomator dump /sdcard/ui.xml >> "$OUT/uiautomator.log" 2>&1
  adb shell cat /sdcard/ui.xml > "$OUT/$1.xml" 2>/dev/null
  grep -q '<hierarchy' "$OUT/$1.xml"
}
# fresh NAME TRIES: retry dump until uiautomator delivers a tree.
fresh() { local i; for ((i = 0; i < $2; i++)); do dump "$1" && return 0; sleep 2; done; return 1; }
# wait_for NAME REGEX TRIES: poll the accessibility tree until a node matches; prints "x y".
wait_for() {
  local i xy
  for ((i = 0; i < $3; i++)); do
    sleep 3
    dump "$1"
    if xy=$($UI "$OUT/$1.xml" find "$2"); then echo "$xy"; return 0; fi
    # Fallback if the full-screen confirmation still appears: dismiss it and look again.
    if xy=$($UI "$OUT/$1.xml" find '^Got it$'); then adb shell input tap $xy > /dev/null 2>&1; fi
    # A slow emulator can raise an ANR for the system launcher (never for our app — that still fails
    # the crash check) whose dialog hides the WebView. Choose "Wait" and look again.
    if $UI "$OUT/$1.xml" find "^(Pixel Launcher|System UI)[^ ]* isn.t responding" > /dev/null; then
      if xy=$($UI "$OUT/$1.xml" find '^Wait$'); then adb shell input tap $xy > /dev/null 2>&1; fi
    fi
  done
  return 1
}

adb install -r "$APK" || fail "adb install"
adb shell dumpsys package "$PKG" | grep -E "versionCode|versionName" | head -2
adb logcat -c
# The app runs immersive, so on a fresh device Android shows its one-time "Viewing full screen"
# confirmation on top. uiautomator then dumps only that system window, never the WebView, so the
# region select looks missing. Mark the confirmation as seen before launching.
adb shell settings put secure immersive_mode_confirmations confirmed
adb shell am start -W -n "$PKG/.MainActivity" || fail "launch"

XY=$(wait_for 1-select 'Start in ' 40) || fail "region select never showed a Start button"
sleep 4; shot 1-region-select          # let the 3D flyover draw a few frames
echo "Start button at $XY"
adb shell input tap $XY

HX=$(wait_for 2-city '^Hustle$' 30) || fail "no Hustle button after Start"
sleep 4; shot 2-city
BEFORE=$($UI "$OUT/2-city.xml" money) || fail "no cash label in the city UI dump"
AFTER=$BEFORE
rose() { python3 -c "import sys; sys.exit(0 if float('$AFTER') > float('$BEFORE') else 1)"; }
for _round in 1 2 3; do
  for _ in 1 2 3 4; do adb shell input tap $HX; sleep 0.5; done
  sleep 3
  fresh 3-hustle 5 || continue
  AFTER=$($UI "$OUT/3-hustle.xml" money || echo "$BEFORE")
  rose && break
  # The software-rendered emulator can stall the WebView for over a second, so a tap may count as
  # Hustle's 550 ms long-press, which opens Empire > Upgrades over the button. Close it and go again.
  if CX=$($UI "$OUT/3-hustle.xml" find '^Close$'); then adb shell input tap $CX; sleep 2; fi
done
shot 3-hustle
echo "cash before=$BEFORE after=$AFTER"
rose || fail "hustle taps did not raise cash"

adb shell pidof "$PKG" > /dev/null || fail "app process is gone"
finish
if grep -E "FATAL EXCEPTION|ANR in $PKG" "$OUT/logcat.txt"; then fail "crash/ANR in logcat"; fi
echo "SMOKE OK"
