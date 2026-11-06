import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  ),
  folder = path.join(root, ".artifacts/store-media-v6/font-sources");
fs.mkdirSync(folder, { recursive: true });
for (const [name, expected] of [
  ["sc", "a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da"],
  ["kr", "194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252"],
]) {
  const file = path.join(folder, "noto-" + name + ".ttf");
  if (!fs.existsSync(file)) {
    const response = await fetch(
      "https://raw.githubusercontent.com/google/fonts/main/ofl/notosans" +
        name +
        "/NotoSans" +
        name.toUpperCase() +
        "%5Bwght%5D.ttf",
    );
    if (!response.ok) throw Error("Official font download failed");
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  if (
    createHash("sha256").update(fs.readFileSync(file)).digest("hex") !==
    expected
  )
    throw Error("Font source changed; review its version before regeneration");
}
execFileSync(
  "uv",
  [
    "run",
    "--with",
    "fonttools==4.68.0",
    "--with",
    "brotli==1.2.1",
    "python",
    "store-studio/locales/fonts.py",
  ],
  { cwd: root, stdio: "inherit" },
);
