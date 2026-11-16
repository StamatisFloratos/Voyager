"""Build the image resources applied to a staged Chromium framework.

Run with Python 3 and Pillow on macOS with rsvg-convert and iconutil installed.
"""

from io import BytesIO
from pathlib import Path
from subprocess import check_output, run
from tempfile import TemporaryDirectory
import xml.etree.ElementTree as ET

from PIL import Image


BRAND = Path(__file__).resolve().parent
OUT = BRAND.parents[2] / "packages/ardiacore/branding"
SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)


def render(svg):
    data = check_output(["rsvg-convert", "-w", "1024", "-h", "1024"], input=ET.tostring(svg))
    return Image.open(BytesIO(data)).convert("RGBA")


def save_size(image, size, path):
    image.resize((size, size), Image.Resampling.LANCZOS).save(path, optimize=True)


def main():
    OUT.mkdir(exist_ok=True)
    tile = ET.parse(BRAND / "app-icon.svg").getroot()
    # The engine's product badge occupies 92% of its square, with rounded corners.
    tile.attrib.update(width="256", height="256", viewBox="-44 -44 1112 1112")
    tile.find(f"{{{SVG}}}rect").set("rx", "226")
    ET.ElementTree(tile).write(OUT / "product.svg", encoding="utf-8")
    product = render(tile)
    for size in (16, 22, 24, 32, 44, 64, 128, 256):
        save_size(product, size, OUT / f"product-{size}.png")

    mark = ET.parse(BRAND / "mark.svg").getroot()
    mark.find(f"{{{SVG}}}path").set("fill", "#282829")
    save_size(render(mark), 22, OUT / "product-22-mono.png")

    # The Alerts helpers use the same 824/1024 optical footprint as the Dock icon.
    tile.set("viewBox", "-124 -124 1272 1272")
    dock = render(tile)
    with TemporaryDirectory() as temp:
        iconset = Path(temp) / "Alerts.iconset"
        iconset.mkdir()
        for size in (16, 32, 128):
            for scale, suffix in ((1, ""), (2, "@2x")):
                save_size(dock, size * scale, iconset / f"icon_{size}x{size}{suffix}.png")
        run(["iconutil", "-c", "icns", "-o", OUT / "alerts.icns", iconset], check=True)


if __name__ == "__main__":
    main()
