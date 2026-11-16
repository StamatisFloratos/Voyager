"""Replace known upstream product artwork in a private staging copy, before signing."""

import gzip
import hashlib
from pathlib import Path
import plistlib
import re
import struct
import sys
import xml.etree.ElementTree as ET


BRAND = Path(__file__).resolve().parents[1] / "branding"
# Hash the incoming resource, not its ID: Chromium can renumber and alias IDs.
# These are the logo bytes shipped in the verified framework for 0.2.46.
UPSTREAM = {
    "a6bcdce1cb422bd5b5e0e6e27783db8c49e75ef3789c88f90e3cdc649539e405": "product-16.png",
    "1bd8805c33f93580c1d07233e92d8cd7c5aa97a4d1a13cd8dbef7777575c2048": "product-22.png",
    "f7f44ebc6e95f0e3697bc76da763d8d2ca9213ded4c484d802ce493943f11b94": "product-22-mono.png",
    "ea1b9b2e20af6be93be9786c88ee03097220802c8e66be18d34fc6daa4fa2f61": "product-24.png",
    "896d7475aaa8e6f0fbb9ee9c85914fb965712203369257178786410a082c5645": "product-32.png",
    "f668c3e4cc1d86d8db4fbfbbaa9ad41b31b9d1eb5f7f9b8158a21bb65bfd8345": "product-44.png",
    "33340ef42f7e764025421d1c0e9df538c9bf9be36db77ea636e9d77ce20ddee5": "product-64.png",
    "fb69883caa40ffe6019851da51f0b8df7886c3e908cd877d9de65fbea1a42ea6": "product-128.png",
    "a64998b4d359e542c12c7b440e3355d5f712918d91be22ba45c4d1664444e38b": "product-256.png",
    "d1bf0b34aa08ccb82de84e61103f3711d6079958c6e459f727ef2250fe49771e": "product.svg",
}
ALERTS_ICON_SHA = "da415f0adbcbcaa2b91c4f7e602b2f3aceb033fdc91017cfd0dc4bbc05cb1c93"
ALERTS_CATALOG_SHA = "c67f5f698fb4199c48b26a1d9df6b11dd8bb064f0e4000d2be0b30d544a8c106"
WEBUI_GROUP = re.compile(rb'<g id="chrome-product" viewBox="0 0 24 24">\s*<path d="[^"]*"></path>\s*</g>')
WEBUI_GROUP_SHA = "2820b4a725f6d97e91b76f96668b20ae4adb8eee9d2abd5137f9f5e4efa48eff"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def webui_mark():
    mark = ET.parse(BRAND / "product.svg").getroot().find("{*}svg")
    _, _, w, h = map(float, mark.get("viewBox").split())
    scale = 21.6 / max(w, h)
    path = " ".join(mark.find("{*}path").get("d").split())
    transform = f"translate({(24-w*scale)/2:.4f} {(24-h*scale)/2:.4f}) scale({scale:.7f})"
    return (f'<g id="chrome-product" viewBox="0 0 24 24"><path transform="{transform}" '
            f'fill-rule="evenodd" d="{path}"></path></g>').encode("ascii")


def replace_pack(path, replacements, webui_bundles, mark):
    data = path.read_bytes()
    if struct.unpack_from("<I", data)[0] != 5:
        return
    count, aliases = struct.unpack_from("<HH", data, 8)
    table_end = 12 + (count + 1) * 6
    body_start = table_end + aliases * 4
    rows = list(struct.iter_unpack("<HI", data[12:table_end]))
    if rows[0][1] != body_start or rows[-1][1] != len(data):
        raise ValueError(f"Unexpected Chromium resource table in {path}")
    body = bytearray()
    changed = False
    header = bytearray(data[:body_start])  # Keep all aliases, IDs, and encoding.
    for index, ((rid, start), (_, end)) in enumerate(zip(rows, rows[1:])):
        original = data[start:end]
        key = digest(original)
        new = replacements.get(key)
        if key in webui_bundles:
            source = gzip.decompress(original)
            groups = WEBUI_GROUP.findall(source)
            if not groups or any(digest(group) != WEBUI_GROUP_SHA for group in groups):
                raise ValueError(f"Unexpected chrome-product group in {path}, resource {rid}")
            new = gzip.compress(source.replace(groups[0], mark), mtime=0)
        struct.pack_into("<HI", header, 12 + 6 * index, rid, body_start + len(body))
        body.extend(original if new is None else new)
        changed |= new is not None
    if changed:
        struct.pack_into("<HI", header, 12 + 6 * count, rows[-1][0], body_start + len(body))
        path.write_bytes(header + body)


def replace_alert_icon(contents):
    resources = contents / "Resources"
    icns = resources / "app.icns"
    catalog = resources / "Assets.car"
    if not (icns.is_file() and catalog.is_file()):
        return
    if digest(icns.read_bytes()) != ALERTS_ICON_SHA or digest(catalog.read_bytes()) != ALERTS_CATALOG_SHA:
        return
    info_path = contents / "Info.plist"
    info = plistlib.loads(info_path.read_bytes())
    if info.get("CFBundleIconFile") != "app.icns" or info.get("CFBundleIconName") != "AppIcon":
        return
    # This exact upstream catalog contains only AppIcon renditions. Use the
    # declared ICNS file so the OS shows the same artwork for both helpers.
    icns.write_bytes((BRAND / "alerts.icns").read_bytes())
    catalog.unlink()
    del info["CFBundleIconName"]
    info_path.write_bytes(plistlib.dumps(info, sort_keys=False))


def main(version):
    replacements = {key: (BRAND / name).read_bytes() for key, name in UPSTREAM.items()}
    webui_bundles = {line.split()[0] for line in (BRAND / "webui-icons.sha256").read_text().splitlines()
                     if line and not line.startswith("#")}
    mark = webui_mark()
    for key, name in UPSTREAM.items():
        if name.endswith(".svg"):
            replacements[key] = gzip.compress(replacements[key], mtime=0)
    resources = version / "Resources"
    for name in ("resources.pak", "chrome_100_percent.pak", "chrome_200_percent.pak"):
        if (resources / name).is_file():
            replace_pack(resources / name, replacements, webui_bundles, mark)
    loose = resources / "product_logo_32.png"
    if loose.is_file() and UPSTREAM.get(digest(loose.read_bytes())) == "product-32.png":
        loose.write_bytes((BRAND / "product-32.png").read_bytes())
    for helper in ("Chromium Helper (Alerts).app", "Chromium Helper (Aperitif Alerts).app"):
        replace_alert_icon(version / "Helpers" / helper / "Contents")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
