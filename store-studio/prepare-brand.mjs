import { mkdirSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const studio = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.resolve(studio, "../public");
const destination = path.join(studio, "public/assets");
mkdirSync(destination, { recursive: true });
for (const [source, name] of [
  ["fonts/manrope.woff2", "manrope.woff2"],
  ["fonts/noto-sans-sc.woff2", "noto-sans-sc.woff2"],
  ["fonts/barlow-condensed.woff2", "barlow-condensed.woff2"],
  ["fonts/Manrope-OFL.txt", "Manrope-OFL.txt"],
  ["fonts/NotoSansSC-OFL.txt", "NotoSansSC-OFL.txt"],
  ["fonts/BarlowCondensed-OFL.txt", "BarlowCondensed-OFL.txt"],
  ["audio/CREDITS.md", "AUDIO-CREDITS.md"],
  ["audio/background-music-mobile.m4a", "background-music-mobile.m4a"],
  ["brand-mark.svg", "brand-mark.svg"],
  ["app-icon.png", "app-icon.png"],
])
  copyFileSync(path.join(publicRoot, source), path.join(destination, name));
console.log(
  "Prepared existing NOIR brand assets, local fonts, music and attribution",
);
