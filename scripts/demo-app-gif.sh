#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Render docs/screenshots/app.gif from the REAL desktop app window.
#
# The app runs on an isolated Xvfb display (not your desktop session), is
# driven with the dashboard's keyboard shortcuts, captured frame by frame with
# ImageMagick `import`, and assembled with ffmpeg.
#
# Requirements: Xvfb, openbox, xdotool, ImageMagick (import), ffmpeg, and a
# built app binary (src-tauri/target/release/linux-doctor, or APP=...).
# On immutable distros, install those in a toolbox and run with TOOLBOX=<name>.
#
# Usage:
#   scripts/demo-app-gif.sh [output.gif]
#   TOOLBOX=ldbuild scripts/demo-app-gif.sh
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=${1:-"$ROOT/docs/screenshots/app.gif"}
APP=${APP:-"$ROOT/src-tauri/target/release/linux-doctor"}
FRAMES_DIR="$ROOT/.demo-app-frames"
FPS=8
# Window region inside the Xvfb root, measured from the capture margins.
CROP="1322:807:78:53"

rm -rf "$FRAMES_DIR"; mkdir -p "$FRAMES_DIR"

capture() {
  export XDG_RUNTIME_DIR=$(mktemp -d)
  Xvfb :99 -screen 0 1400x860x24 >/tmp/ld-xvfb.log 2>&1 & local xp=$!
  sleep 2
  export DISPLAY=:99
  openbox >/tmp/ld-openbox.log 2>&1 & local op=$!
  sleep 1
  export LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1
  "$APP" >/tmp/ld-app.log 2>&1 & local ap=$!
  local id="" i=0
  for i in $(seq 1 90); do
    id=$(xdotool search --name "Linux Doctor" 2>/dev/null | head -1 || true)
    [ -n "$id" ] && break
    sleep 1
  done
  if [ -z "$id" ]; then
    echo "app window never appeared (see /tmp/ld-app.log)" >&2
    kill $ap $op $xp 2>/dev/null || true
    return 1
  fi
  xdotool windowactivate --sync "$id" 2>/dev/null || true
  sleep 7 # let the first report finish rendering

  # One frame per step; the dashboard shortcuts drive the UI:
  #   1..5 = views, ArrowDown = focus a card, Enter = open it.
  i=0
  while [ $i -lt 72 ]; do
    import -window root "$FRAMES_DIR/$(printf %04d $i).png" 2>/dev/null || true
    case $i in
      8) xdotool key 2 ;;
      22) xdotool key 3 ;;
      34) xdotool key 5 ;;
      46) xdotool key 1 ;;
      54) xdotool key Down ;;
      58) xdotool key Return ;;
    esac
    i=$((i + 1))
  done
  kill $ap $op $xp 2>/dev/null || true
}

if [ -n "${TOOLBOX:-}" ]; then
  toolbox run -c "$TOOLBOX" -- bash -lc "$(declare -f capture); ROOT='$ROOT' APP='$APP' FRAMES_DIR='$FRAMES_DIR' capture"
else
  capture
fi

ffmpeg -y -loglevel error -framerate "$FPS" -i "$FRAMES_DIR/%04d.png" \
  -vf "crop=$CROP,fps=$FPS,scale=940:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4" \
  -loop 0 "$OUT"
rm -rf "$FRAMES_DIR"
echo "Wrote $OUT"
