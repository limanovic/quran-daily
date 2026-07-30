#!/usr/bin/env bash
# Rasterise store/graphics/src/*.html to PNG via headless Chrome.
# Chrome is the rasteriser because sips cannot read SVG and this machine has no
# rsvg-convert / ImageMagick / Pillow.
set -euo pipefail

cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SRC="$PWD/src"

shot() { # html width height out [extra-flags...]
  local html=$1 w=$2 h=$3 out=$4
  shift 4
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --allow-file-access-from-files --force-device-scale-factor=1 \
    "$@" --screenshot="$out" --window-size="$w,$h" "file://$SRC/$html" \
    >/dev/null 2>&1
  echo "  $out  (${w}x${h})"
}

echo "rendering:"
shot icon.html            512  512  play-icon-512.png
shot icon.html           1024 1024  app-icon-1024.png
shot icon-foreground.html 512  512  android-icon-foreground.png --default-background-color=00000000
shot icon-monochrome.html 432  432  android-icon-monochrome.png --default-background-color=00000000
shot feature.html        1024  500  feature-graphic-1024x500.png

# Play rejects alpha on the store icon and feature graphic; the full-bleed
# background makes them opaque, but assert it rather than trust it.
for f in play-icon-512.png feature-graphic-1024x500.png; do
  if [ "$(sips -g hasAlpha "$f" | tail -1 | tr -d ' ')" != "hasAlpha:no" ]; then
    echo "ERROR: $f has an alpha channel; Play will reject it" >&2
    exit 1
  fi
done
echo "ok"
