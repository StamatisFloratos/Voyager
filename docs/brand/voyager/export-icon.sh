#!/bin/bash
# Export a square logo SVG as a full-bleed PNG and an inset macOS icon.
# Requires librsvg (rsvg-convert), ImageMagick 7 (magick), and macOS iconutil.
set -euo pipefail

if (( $# < 1 || $# > 2 )); then
  echo "Usage: $0 ICON.svg [OUTPUT_DIRECTORY]" >&2
  exit 2
fi

project_root=$(cd "$(dirname "$0")/../../.." && pwd)
destination=${2:-"$project_root/output/brand"}
mkdir -p "$destination"
work=$(mktemp -d "$destination/.icon-export.XXXXXX")
trap 'rm -rf "$work"' EXIT

master="$work/voyager-app-icon.png"
iconset="$work/Voyager.iconset"
mkdir "$iconset"
rsvg-convert -w 1024 -h 1024 -o "$master" -- "$1"

# Center an 824 px rounded tile in a transparent 1024 px Dock icon canvas.
magick "$master" -resize 824x824 -alpha set \
  \( -size 824x824 xc:none -fill white -draw 'roundrectangle 0,0 823,823 182,182' \) \
  -compose DstIn -composite -compose Over -background none -gravity center \
  -extent 1024x1024 "PNG32:$work/dock.png"

for points in 16 32 128 256 512; do
  name="$iconset/icon_${points}x${points}"
  magick "$work/dock.png" -resize "${points}x${points}" "PNG32:$name.png"
  retina=$((points * 2))
  magick "$work/dock.png" -resize "${retina}x${retina}" "PNG32:$name@2x.png"
done
iconutil -c icns "$iconset" -o "$work/voyager-app-icon.icns"

mv -f "$master" "$work/voyager-app-icon.icns" "$destination/"
