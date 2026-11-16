"""Rebuild Voyager's Apple and Raycast icon resources from the canonical SVGs."""

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET


BRAND = Path(__file__).resolve().parent
ROOT = BRAND.parents[2]
APP = ROOT / "apps/browser/macos/Voyager-macOS"
IOS = ROOT / "apps/ios"
CATALOG = APP / "Assets.xcassets"
COMPOSER = APP / "AppIcon.icon"
SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)


def write_layers(work):
    icon = ET.parse(BRAND / "app-icon.svg")
    root = icon.getroot()
    mark = root.find(f"{{{SVG}}}svg")
    root.remove(mark)
    # Render the gradient alone. Icon Composer applies the platform's own clip.
    subprocess.run(["rsvg-convert", "-o", str(work / "rainbow.png")],
                   input=ET.tostring(root), check=True)

    # Flatten the SVG's xMidYMid meet viewport so Apple only has to import a path.
    x, y, width, height = (float(mark.attrib[key]) for key in ("x", "y", "width", "height"))
    vx, vy, vw, vh = map(float, mark.attrib["viewBox"].split())
    scale = min(width / vw, height / vh)
    dx = x + (width - vw * scale) / 2 - vx * scale
    dy = y + (height - vh * scale) / 2 - vy * scale
    path = mark.find(f"{{{SVG}}}path")
    path.set("transform", f"translate({dx:.8f} {dy:.8f}) scale({scale:.8f})")
    canvas = ET.Element(f"{{{SVG}}}svg", {key: root.attrib[key] for key in ("width", "height", "viewBox")})
    canvas.append(path)
    for name, fill in (("orbit", "#ffffff"), ("orbit-dark", "#35343b")):
        path.set("fill", fill)
        (work / f"{name}.svg").write_bytes(ET.tostring(canvas) + b"\n")
    # iOS uses an action extension's icon as a template in the share sheet.
    path.set("fill", "#000000")
    subprocess.run(["rsvg-convert", "-o", str(work / "share-action.png")],
                   input=ET.tostring(canvas), check=True)


def main():
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        write_layers(work)
        subprocess.run([BRAND / "export-icon.sh", BRAND / "app-icon.svg", work], check=True)
        icons = work / "fallback.iconset"
        subprocess.run(["iconutil", "-c", "iconset", "-o", icons, work / "voyager-app-icon.icns"], check=True)

        legacy = CATALOG / "AppIcon.appiconset"
        for slot in json.loads((legacy / "Contents.json").read_text())["images"]:
            suffix = "@2x" if slot["scale"] == "2x" else ""
            shutil.copyfile(icons / f"icon_{slot['size']}{suffix}.png", legacy / slot["filename"])

        ios_composer = IOS / "App/AppIcon.icon"
        for name in ("rainbow.png", "orbit.svg"):
            for composer in (COMPOSER, ios_composer):
                shutil.copyfile(work / name, composer / "Assets" / name)
        spec = json.loads((COMPOSER / "icon.json").read_text())
        spec["supported-platforms"] = {"squares": "shared"}
        (ios_composer / "icon.json").write_text(json.dumps(spec, indent=2) + "\n")

        for image_set, name in (("AppIconMark", "orbit"), ("AppIconMark-dark", "orbit-dark")):
            shutil.copyfile(work / f"{name}.svg", CATALOG / f"{image_set}.imageset/mark.svg")

        design_assets = IOS / "Packages/VoyagerKit/Sources/VoyagerDesign/Resources/Brand.xcassets"
        shutil.copyfile(BRAND / "mark.svg", design_assets / "VoyagerMark.imageset/mark.svg")
        preview = IOS / "App/Assets.xcassets/AppIconPreview.imageset/AppIconPreview.png"
        action = IOS / "Action/Assets.xcassets/AppIcon.appiconset/OpenInVoyager.png"
        subprocess.run(["magick", work / "voyager-app-icon.png", "-resize", "360x360",
                        "-strip", f"PNG24:{preview}"], check=True)
        shutil.copyfile(work / "share-action.png", action)

        shutil.copyfile(icons / "icon_512x512.png", ROOT / "extras/raycast-voyager/assets/icon.png")
        exports = ROOT / "output/brand"
        exports.mkdir(parents=True, exist_ok=True)
        for name in ("voyager-app-icon.png", "voyager-app-icon.icns"):
            shutil.copyfile(work / name, exports / name)


if __name__ == "__main__":
    main()
