#!/usr/bin/env bash
# Capture Play Store phone screenshots from a running emulator.
#
#   ./capture-screenshots.sh            # use whatever is already installed
#   ./capture-screenshots.sh --build    # rebuild + reinstall the release APK first
#
# Prerequisites: an emulator already booted (`emulator -avd <name> &`) and
# visible to `adb devices`. Pixel 7 Pro API 34 gives 1440x3120, which Play
# accepts directly.
#
# WARNING: navigation below is coordinate-based tapping against the 1440x3120
# frame. Any layout change to the home screen moves these targets and the script
# will silently screenshot the wrong screen. Eyeball the output every time.
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"
PKG=com.limanovic.dailyquran
OUT="$PWD/screenshots"
mkdir -p "$OUT"

if [ "${1:-}" = "--build" ]; then
  echo "==> prebuild + assembleRelease (slow: ~9 min cold)"
  npx expo prebuild -p android --clean
  "$ROOT/android/gradlew" -p "$ROOT/android" assembleRelease
  adb install -r "$ROOT/android/app/build/outputs/apk/release/app-release.apk"
fi

# A real status bar leaks the host clock, wifi state and stray notification
# icons. Demo mode pins it to something presentable.
demo() { adb shell am broadcast -a com.android.systemui.demo "$@" >/dev/null; }
adb shell settings put global sysui_demo_allowed 1
demo -e command enter
demo -e command battery -e level 100 -e plugged false
demo -e command network -e wifi show -e level 4
demo -e command network -e mobile hide
demo -e command notifications -e visible false

clock() { demo -e command clock -e hhmm "$1"; sleep 1; }
shot()  { adb exec-out screencap -p > "$OUT/$1"; echo "  $1"; }
tap()   { adb shell input tap "$1" "$2"; sleep "${3:-3}"; }

# Without POST_NOTIFICATIONS the home screen shows a "Notifications are off"
# warning banner, which shifts every row below it and looks broken in a listing.
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS 2>/dev/null || true

adb shell am force-stop $PKG
adb shell am start -n $PKG/.MainActivity >/dev/null
sleep 9

echo "capturing:"
clock 0930
shot 01-home.png

tap 338 655 6            # Continue reading
clock 0930
shot 02-reader.png

tap 98 242               # back
tap 212 1050 5           # Surahs
clock 0930
shot 03-surahs.png

tap 98 242               # back
tap 1106 2186            # Appearance -> Dark
tap 338 655 6            # Continue reading
clock 2115
shot 04-reader-dark.png

tap 98 242               # back
tap 700 2186             # Appearance -> Light, so the next run starts clean

echo "done -> $OUT"
