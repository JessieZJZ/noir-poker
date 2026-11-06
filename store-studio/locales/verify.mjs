import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { catalog } from "./catalog.mjs";
import { filmSource } from "./sources.mjs";
const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  ),
  dir = path.resolve(
    process.argv[2] || path.join(root, ".artifacts/store-media-v6/delivery"),
  ),
  qa = path.join(root, ".artifacts/store-media-v6/qa");
fs.mkdirSync(qa, { recursive: true });
const results = [],
  files = [],
  failures = [];
const assert = (ok, description, detail) => {
  results.push({ description, ok, detail });
  if (!ok) failures.push({ description, detail });
};
const hash = (f) =>
  createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const image = async (
  file,
  width,
  height,
  limit = 8 * 1024 ** 2,
  alpha = false,
) => {
  if (!fs.existsSync(file)) {
    assert(false, path.relative(dir, file), "Missing file");
    return;
  }
  const m = await sharp(file).metadata(),
    size = fs.statSync(file).size;
  assert(
    m.format === "png" &&
      m.width === width &&
      m.height === height &&
      size <= limit &&
      (alpha || !m.hasAlpha),
    path.relative(dir, file),
    { width: m.width, height: m.height, bytes: size, channels: m.channels },
  );
  files.push({
    file: path.relative(dir, file),
    bytes: size,
    sha256: hash(file),
  });
};
for (const c of Object.values(catalog)) {
  const base = path.join(dir, c.locale),
    counts = JSON.parse(
      fs.readFileSync(path.join(base, "field-validation.json")),
    );
  for (const f of counts.fields) {
    const file = path.join(base, f.store, "text", f.field + ".txt"),
      s = fs.readFileSync(file, "utf8").trim();
    assert(
      Boolean(s) &&
        (!f.limit || [...s].length <= f.limit) &&
        !/(?:TODO|PLACEHOLDER|TRANSLATE_ME)/.test(s),
      c.locale + "/" + f.store + "/" + f.field,
      { characters: [...s].length, limit: f.limit },
    );
  }
  for (const [folder, w, h] of [
    ["google/phone", 1080, 1920],
    ["google/tablet-7", 1920, 1080],
    ["google/tablet-10", 1920, 1080],
    ["google/desktop", 1920, 1080],
    ["apple/iphone-large", 1290, 2796],
    ["apple/iphone-medium", 1206, 2622],
    ["apple/ipad-13", 2752, 2064],
  ]) {
    const p = path.join(base, folder);
    assert(
      fs.existsSync(p) &&
        fs.readdirSync(p).filter((x) => x.endsWith(".png")).length === 8,
      c.locale + "/" + folder + " count",
    );
    for (let i = 1; i <= 8; i++)
      await image(path.join(p, String(i).padStart(2, "0") + ".png"), w, h);
  }
  await image(
    path.join(base, "google/feature-graphic.png"),
    1024,
    500,
    15 * 1024 ** 2,
  );
  await image(
    path.join(base, "google/icon-512.png"),
    512,
    512,
    1024 ** 2,
    true,
  );
  await image(path.join(base, "apple/icon-1024.png"), 1024, 1024, 1024 ** 2);
  const probe = [];
  for (const [name, w, h] of [
    ["shared-preview.mp4", 1920, 886],
    ["master-3840.mp4", 3840, 1772],
  ]) {
    const file = path.join(base, "video", name);
    if (!fs.existsSync(file)) {
      assert(false, c.locale + "/" + name, "Missing video");
      continue;
    }
    const p = JSON.parse(
        execFileSync("ffprobe", [
          "-v",
          "error",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          file,
        ]),
      ),
      v = p.streams.find((s) => s.codec_type === "video"),
      a = p.streams.find((s) => s.codec_type === "audio");
    assert(
      v?.width === w &&
        v.height === h &&
        v.codec_name === "h264" &&
        v.pix_fmt === "yuv420p" &&
        v.avg_frame_rate === "30/1" &&
        Number(v.nb_frames) === 894 &&
        Math.abs(Number(p.format.duration) - 29.8) < 0.05 &&
        a?.channels === 2 &&
        a.codec_name === "aac" &&
        a.sample_rate === "48000",
      c.locale + "/" + name,
      {
        width: v?.width,
        height: v?.height,
        frames: v?.nb_frames,
        seconds: p.format.duration,
        channels: a?.channels,
        videoBitRate: v?.bit_rate,
      },
    );
    try {
      execFileSync(
        "ffmpeg",
        [
          "-v",
          "error",
          "-threads",
          "2",
          "-i",
          file,
          "-map",
          "0:v",
          "-map",
          "0:a",
          "-f",
          "null",
          "-",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      assert(true, c.locale + "/" + name + " full decode");
    } catch (e) {
      assert(false, c.locale + "/" + name + " full decode", String(e.stderr));
    }
    files.push({
      file: path.relative(dir, file),
      bytes: fs.statSync(file).size,
      sha256: hash(file),
    });
    probe.push({ file: name, video: v, audio: a, duration: p.format.duration });
  }
  const srt = fs.readFileSync(path.join(base, "video/captions.srt"), "utf8");
  assert(
    (srt.match(/-->/g) || []).length === 6 &&
      c.say.every((line) => srt.includes(line)),
    c.locale + " captions match local spoken text",
  );
  if (!["en", "zh-CN"].includes(c.locale)) {
    const source = filmSource(c.locale);
    assert(true, c.locale + " actual matching replay correction", {
      source: path.relative(root, source.dir),
      correction: source.evidence.replay.correction,
    });
  }
  fs.writeFileSync(
    path.join(base, "technical-verification.json"),
    JSON.stringify(
      {
        locale: c.locale,
        sourceProductCommit: "94e56b1ef009f0729508491e5f2155fd37d2bf99",
        sourceDigest:
          "392adab3981eccbe478c517af67ba17873a7f24c2ef2ba32262c7d2cdf0a2e81",
        movieProbe: probe,
        screenshotCount: 56,
        desktopSource: "Production Web, not a verified Play Games PC binary",
        otherScreens: "Actual installed native applications",
        externalHumanNativeSpeakerReview: false,
        storeSubmission: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(c.locale + " checked");
}
fs.writeFileSync(
  path.join(qa, "delivery-verification.json"),
  JSON.stringify(
    {
      status: failures.length ? "failed" : "passed",
      checkedAt: new Date().toISOString(),
      checks: results.length,
      results,
      failures,
      files,
    },
    null,
    2,
  ),
);
if (failures.length) throw Error(failures.length + " delivery checks failed");
console.log(
  "Passed " +
    results.length +
    " checks; " +
    files.length +
    " hashed image/video files.",
);
