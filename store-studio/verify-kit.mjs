import assert from "node:assert/strict";
import {
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
const folder = path.resolve(process.argv[2] || "out");
const source = JSON.parse(
  readFileSync(new URL("./listings.json", import.meta.url), "utf8"),
);
const checks = [];
for (const locale of ["en-US", "zh-Hans"]) {
  const a = source[locale].apple,
    g = source[locale].google;
  assert.ok(
    Buffer.byteLength(a.keywords, "utf8") <= 100,
    `${locale} keywords exceed 100 UTF-8 bytes`,
  );
  for (const [field, limit] of [
    ["name", 30],
    ["subtitle", 30],
    ["promotionalText", 170],
    ["keywords", 100],
    ["description", 4000],
  ])
    assert.ok(
      [...a[field]].length <= limit,
      `${locale} ${field} exceeds ${limit}`,
    );
  assert.ok([...g.name].length <= 30 && [...g.shortDescription].length <= 80);
  checks.push({ kind: "metadata", locale, status: "passed" });
}
const manifest = JSON.parse(
  readFileSync(path.join(folder, "manifest.json"), "utf8"),
);
const listed = new Set(manifest.files.map((file) => file.path));
for (const language of manifest.languages)
  for (const store of manifest.stores) {
    const groups =
      store === "apple"
        ? ["apple/iphone-large", "apple/iphone-medium", "apple/ipad-13"]
        : ["google/phone"];
    for (const group of groups)
      for (let n = 1; n <= 8; n++)
        assert.ok(
          listed.has(`${language}/${group}/${String(n).padStart(2, "0")}.png`),
          `Missing screenshot ${language}/${group}/${n}`,
        );
    if (store === "google")
      assert.ok(listed.has(`${language}/google/feature-graphic.png`));
    if (manifest.includesVideo)
      for (const kind of ["narrated", "music"]) {
        assert.ok(listed.has(`${language}/${store}/preview-${kind}.mp4`));
        assert.ok(
          listed.has(`${language}/${store}/preview-${kind}-poster.png`),
        );
      }
  }
for (const file of manifest.files) {
  const actual = path.join(folder, file.path);
  assert.ok(existsSync(actual), `Missing ${file.path}`);
  assert.equal(
    createHash("sha256").update(readFileSync(actual)).digest("hex"),
    file.sha256,
    `${file.path} changed after manifest`,
  );
  if (file.path.endsWith(".png")) {
    const m = await sharp(actual).metadata();
    if (!file.path.includes("google-512"))
      assert.equal(m.channels, 3, `${file.path} must be opaque RGB`);
    let expected;
    if (file.path.includes("iphone-large/")) expected = [1290, 2796];
    if (file.path.includes("iphone-medium/")) expected = [1206, 2622];
    if (file.path.includes("ipad-13/")) expected = [2752, 2064];
    if (file.path.includes("google/phone/")) expected = [1080, 1920];
    if (file.path.endsWith("feature-graphic.png")) expected = [1024, 500];
    if (file.path.endsWith("apple-1024.png")) expected = [1024, 1024];
    if (file.path.endsWith("google-512.png")) expected = [512, 512];
    if (expected) assert.deepEqual([m.width, m.height], expected, file.path);
    checks.push({
      kind: "image",
      path: file.path,
      width: m.width,
      height: m.height,
      channels: m.channels,
      status: "passed",
    });
  }
  if (file.path.endsWith(".mp4")) {
    const r = spawnSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", actual],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr);
    const data = JSON.parse(r.stdout),
      v = data.streams.find((s) => s.codec_type === "video"),
      a = data.streams.find((s) => s.codec_type === "audio");
    assert.ok(
      Math.abs(Number(data.format.duration) - 29.8) < 0.05,
      file.path + " duration",
    );
    assert.equal(v.codec_name, "h264");
    assert.equal(v.pix_fmt, "yuv420p");
    assert.equal(v.r_frame_rate, "30/1");
    assert.equal(a.codec_name, "aac");
    assert.equal(a.channels, 2);
    assert.equal(a.sample_rate, "48000");
    assert.deepEqual(
      [v.width, v.height],
      file.path.includes("/apple/") ? [1920, 886] : [1920, 1080],
    );
    if (file.path.includes("/apple/")) {
      assert.equal(v.profile, "High");
      assert.ok(v.level <= 40);
      assert.ok(Number(data.format.size) < 500 * 1024 * 1024);
    }
    const decode = spawnSync(
      "ffmpeg",
      ["-v", "error", "-i", actual, "-f", "null", "-"],
      { encoding: "utf8" },
    );
    assert.equal(decode.status, 0, decode.stderr);
    checks.push({
      kind: "video",
      path: file.path,
      width: v.width,
      height: v.height,
      profile: v.profile,
      level: v.level,
      seconds: Number(data.format.duration),
      status: "passed",
    });
  }
}
const result = {
  source: source.source,
  verifiedAt: new Date().toISOString(),
  stores: manifest.stores,
  languages: manifest.languages,
  status: "passed",
  checks,
  limits: [
    "Simulator/emulator captures; no signed physical-device or store acceptance claim",
    "Voiceover is neural synthesized speech; zh-CN voice chosen by user",
    "Public privacy policy URL and YouTube URL remain unset",
  ],
};
writeFileSync(
  path.join(folder, "verification.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(`Verified ${checks.length} metadata, image and video records`);
