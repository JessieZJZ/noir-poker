"""Regenerate bundled fonts with fontTools; see docs/interface-parity.md."""
import argparse
import json
import hashlib
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
