import { filmSource } from "./sources.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { catalog } from "./catalog.mjs";
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  root = path.dirname(studio),
  base = path.join(root, ".artifacts/store-media-v6");
const keys = [
  "01-practice",
  "02-tutorial",
  "03-review-top",
  "04-result",
  "05-calculator",
  "06-styles",
  "07-records",
  "07-record-detail",
];
const mapping = {},
  evidence = {},
  missing = [];
const old = path.join(root, ".artifacts/store-media-v2/raw"),
  raw = path.join(base, "raw");
for (const locale of Object.keys(catalog)) {
  mapping[locale] = {};
  evidence[locale] = {};
  for (const device of [
    "ios",
    "phone",
    "tablet7",
    "tablet10",
    "desktop",
    "ipad",
  ]) {
    let folders = [];
    if (device === "ios")
      folders =
        locale === "en"
          ? [path.join(old, "ios-en-correction")]
          : locale === "zh-CN"
            ? [path.join(old, "ios")]
            : [filmSource(locale).dir];
    else if (device === "ipad")
      folders = ["zh-CN", "en"].includes(locale)
        ? [path.join(old, "ipad")]
        : [
            path.join(raw, "ipad-warm"),
            path.join(raw, "ipad-repair"),
            path.join(raw, "ipad"),
          ];
    else if (device === "desktop")
      folders = [path.join(raw, "desktop-repair"), path.join(raw, "desktop")];
    else folders = [path.join(raw, "android-" + device, locale)];
    const files = {};
    for (const key of keys) {
      const source = folders
        .map((f) => path.join(f, locale + "--" + key + ".png"))
        .find(fs.existsSync);
      if (!source) {
        missing.push(locale + "/" + device + "/" + key);
        continue;
      }
      const relative = "locales/" + locale + "/" + device + "/" + key + ".png",
        target = path.join(studio, "public", relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      files[key] = relative;
      evidence[locale][device] ||= [];
      evidence[locale][device].push({
        feature: key,
        source: path.relative(root, source),
        sha256: createHash("sha256")
          .update(fs.readFileSync(source))
          .digest("hex"),
        native: device !== "desktop",
      });
    }
    mapping[locale][device] = files;
  }
}
fs.writeFileSync(
  path.join(studio, "src/locale-media.json"),
  JSON.stringify(mapping, null, 2) + "\n",
);
fs.writeFileSync(
  path.join(base, "capture-provenance.json"),
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(
  "Staged " +
    Object.values(mapping).reduce(
      (n, x) =>
        n + Object.values(x).reduce((a, b) => a + Object.keys(b).length, 0),
      0,
    ) +
    " actual captures. Missing " +
    missing.length,
);
console.log(missing.slice(0, 12).join("\n"));
