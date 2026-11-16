# Voyager artwork

[app-icon.svg](app-icon.svg) is the full-color icon. [mark.svg](mark.svg) contains the same white orbit and star on a transparent background. The macOS browser bundles both SVGs directly.

To change the silhouette, update [the reference](source/orbit.png). To change the rainbow or the mark's position on the tile, edit [the icon template](icon.svg.in). Run these commands from the repository root on macOS:

```sh
uv run docs/brand/voyager/trace-logo.py
python3 docs/brand/voyager/apple-icons.py
python3 docs/brand/voyager/engine-icons.py
```

The exports use librsvg, ImageMagick, Pillow, and macOS `iconutil`. The Apple export updates the macOS and iOS catalogs, the Raycast icon, and the standalone PNG and ICNS in `output/brand/`. The engine export updates the artwork applied to Voyager's local framework staging copy. The original engine download retains its pinned checksum.
