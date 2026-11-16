# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy==2.2.6", "Pillow==11.3.0", "potracer==0.0.4"]
# ///
"""Run `uv run docs/brand/voyager/trace-logo.py` to rebuild both SVGs."""

import argparse
from pathlib import Path

import numpy as np
import potrace
from PIL import Image


BRAND_DIR = Path(__file__).resolve().parent
SUBPIXELS = 4


def trace_mark(source: Path) -> tuple[str, str]:
    with Image.open(source) as image:
        gray = image.convert("L")

    # The reference uses antialiased white over a nearly black background.
    # Trace the half-coverage edge in the original image's color space.
    histogram = gray.histogram()
    background = max(range(256), key=histogram.__getitem__)
    if background >= 128:
        raise ValueError("Expected a white mark on a dark background.")
    threshold = (background + 255) / 2
    bounds = gray.point(lambda value: 255 if value >= threshold else 0).getbbox()
    if bounds is None:
        raise ValueError("The source contains no foreground at the tracing threshold.")

    left, top, right, bottom = bounds
    cropped = gray.crop((left - 2, top - 2, right + 2, bottom + 2))
    width, height = cropped.size
    enlarged = cropped.resize((width * SUBPIXELS, height * SUBPIXELS), Image.Resampling.BICUBIC)

    # Potrace treats dark (False) pixels as ink. Its coordinates follow pixel edges.
    bitmap = potrace.Bitmap(np.asarray(enlarged) < threshold)
    contours = bitmap.trace(turdsize=0, alphamax=1.0, opttolerance=0.5)

    def point(p):
        return f"{p.x / SUBPIXELS:.3f},{p.y / SUBPIXELS:.3f}"

    commands = []
    for contour in contours:
        commands.append(f"M {point(contour.start_point)}")
        for segment in contour:
            if segment.is_corner:
                commands.append(f"L {point(segment.c)} {point(segment.end_point)}")
            else:
                commands.append(f"C {point(segment.c1)} {point(segment.c2)} {point(segment.end_point)}")
        commands.append("Z")
    return f"0 0 {width} {height}", "\n      ".join(commands)


def main():
    parser = argparse.ArgumentParser(description="Trace a white-on-dark logo and build its colorful app icon.")
    parser.add_argument("source", nargs="?", type=Path, default=BRAND_DIR / "source/orbit.png")
    parser.add_argument("--output-dir", type=Path, default=BRAND_DIR)
    args = parser.parse_args()

    viewbox, path = trace_mark(args.source)
    mark = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" role="img" aria-labelledby="title">\n'
        '  <title id="title">Voyager</title>\n'
        f'  <path fill="#fff" fill-rule="evenodd" d="{path}"/>\n'
        '</svg>\n'
    )
    template = (BRAND_DIR / "icon.svg.in").read_text(encoding="utf-8")
    icon = template.replace("MARK_VIEWBOX", viewbox).replace("MARK_PATH", path)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "mark.svg").write_text(mark, encoding="utf-8")
    (args.output_dir / "app-icon.svg").write_text(icon, encoding="utf-8")


if __name__ == "__main__":
    main()
