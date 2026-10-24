"""Regenerate bundled fonts with fontTools; see docs/interface-parity.md."""
import argparse
import json
import hashlib
import re
import subprocess
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument("source_dir", type=Path)
args = parser.parse_args()
text = (root / "index.html").read_text()
text += (root / "public/app-privacy.html").read_text()
for directory in ["src", "miniprogram"]:
    for path in (root / directory).rglob("*"):
        if path.suffix in [".js", ".json", ".wxml"]:
            text += path.read_text()
characters = set(map(ord, text)) | set(range(32, 127))
output = root / "public/fonts"
output.mkdir(exist_ok=True)
coverage = set()
files = {}
for source, name in [
    ("manrope", "manrope"),
    ("noto-sc", "noto-sans-sc"),
    ("noto-kr", "noto-sans-kr"),
    ("barlow", "barlow-condensed"),
]:
    font = TTFont(args.source_dir / (source + ".ttf"))
    cmap = font.getBestCmap()
    # Keep all Latin/Cyrillic glyphs. CJK subsets cover shipped app copy only.
    codepoints = set(cmap) if source in ["manrope", "barlow"] else characters & set(cmap)
    options = subset.Options()
    options.flavor = "woff2"
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    coverage.update(font.getBestCmap())
    font.flavor = "woff2"
    font.save(output / (name + ".woff2"))
    files[name + ".woff2"] = hashlib.sha256((output / (name + ".woff2")).read_bytes()).hexdigest()
    print(name, (output / (name + ".woff2")).stat().st_size)
(output / "coverage.json").write_text(json.dumps({"files": files, "codepoints": sorted(coverage)}, indent=2) + "\n")

# The WeChat main package embeds its Chinese face as base64, so it gets a
# smaller subset limited to the copy that actually ships in the mini-program.
subprocess.run(["node", "scripts/wechat.mjs", "build"], cwd=root, check=True)
wechat_text = ""
for path in (root / ".artifacts/wechat").rglob("*"):
    if path.suffix in [".js", ".json", ".wxml", ".wxss"] and path.name != "fonts.wxss":
        wechat_text += path.read_text()
# esbuild writes non-ASCII JavaScript strings as escapes.
wechat_text = re.sub(r"\\u\{([0-9a-fA-F]+)\}", lambda m: chr(int(m.group(1), 16)), wechat_text)
wechat_text = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), wechat_text)
wechat_output = root / "src/platform/wechat-fonts"
wechat_output.mkdir(exist_ok=True)
font = TTFont(args.source_dir / "noto-sc.ttf")
options = subset.Options()
options.flavor = "woff2"
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=(set(map(ord, wechat_text)) | set(range(32, 127))) & set(font.getBestCmap()))
subsetter.subset(font)
font.flavor = "woff2"
font.save(wechat_output / "noto-sans-sc.woff2")
(wechat_output / "coverage.json").write_text(
    json.dumps(
        {
            "sha256": hashlib.sha256((wechat_output / "noto-sans-sc.woff2").read_bytes()).hexdigest(),
            "codepoints": sorted(font.getBestCmap()),
        },
        indent=2,
    )
    + "\n"
)
print("noto-sans-sc (WeChat)", (wechat_output / "noto-sans-sc.woff2").stat().st_size)
print("Run npm run wechat:build to embed the regenerated WeChat font.")
