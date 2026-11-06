import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import sharp from "sharp";
const studio = path.dirname(fileURLToPath(import.meta.url));
if (!process.argv[2]) throw Error("Pass shared output directory");
const dir = path.resolve(process.argv[2]);
const getJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const put = (p, s) => fs.writeFileSync(path.join(dir, p), s);
const board = getJSON(path.join(studio, "storyboard.json"));
const taps = getJSON(path.join(studio, "src/shared-taps.json"));
const listings = getJSON(path.join(studio, "listings.json"));
const langs = ["zh-CN", "en"];
const checks = {
  productCommit: listings.source.commit,
  sources:
    "iOS simulator film; iOS, iPadOS and Android installed app screenshots",
  oneCommonStoreFilePerLanguage: true,
  layout:
    "Reference layout: left copy and captions; one full iPhone at right; contain; no crop or duplicated UI",
  languages: {},
  created: new Date().toISOString(),
};
function capture(p, frame) {
  return execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-ss",
      (frame / 30).toFixed(6),
      "-i",
      p,
      "-frames:v",
      "1",
      "-vf",
      "scale=640:-2",
      "-c:v",
      "mjpeg",
      "-f",
      "image2pipe",
      "-",
    ],
    { maxBuffer: 4e6 },
  );
}
for (const lang of langs) {
  const video = path.join(dir, lang, "shared-preview.mp4"),
    probe = JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        video,
      ]),
    );
  const v = probe.streams.find((s) => s.codec_type === "video"),
    a = probe.streams.find((s) => s.codec_type === "audio");
  assert.deepEqual(
    [
      v.width,
      v.height,
      v.r_frame_rate,
      v.nb_frames,
      v.codec_name,
      v.pix_fmt,
      v.profile,
      v.level,
    ],
    [1920, 886, "30/1", "894", "h264", "yuv420p", "High", 40],
  );
  assert.ok(
    Math.abs(+probe.format.duration - 29.8) < 0.04 &&
      +v.bit_rate >= 10e6 &&
      +v.bit_rate <= 12e6,
  );
  assert.deepEqual(
    [a.codec_name, a.profile, a.channels, a.sample_rate],
    ["aac", "LC", 2, "48000"],
  );
  const decode = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      video,
      "-af",
      "ebur128=peak=true",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", maxBuffer: 6e6 },
  );
  assert.equal(decode.status, 0);
  assert.ok(!/Error while decoding/i.test(decode.stderr));
  const summary = decode.stderr.split("Summary:").at(-1);
  const lufs = Number(summary.match(/I:\s*([-\d.]+) LUFS/)[1]),
    peak = Number(summary.match(/Peak:\s*([-\d.]+) dBFS/)[1]);
  assert.ok(peak <= -1 && lufs > -22 && lufs < -12);
  for (const [group, w, h] of [
    ["apple/iphone-large", 1290, 2796],
    ["apple/iphone-medium", 1206, 2622],
    ["apple/ipad-13", 2752, 2064],
    ["google/phone", 1080, 1920],
  ]) {
    for (let n = 1; n <= 8; n++) {
      const m = await sharp(
        path.join(dir, lang, group, String(n).padStart(2, "0") + ".png"),
      ).metadata();
      assert.deepEqual([m.width, m.height, m.hasAlpha], [w, h, false]);
    }
  }
  const m = await sharp(
    path.join(dir, lang, "google/feature-graphic.png"),
  ).metadata();
  assert.deepEqual([m.width, m.height, m.hasAlpha], [1024, 500, false]);
  const samples = [];
  for (const [id, base] of [
    ["review", 276],
    ["retry", 432],
    ["records", 591],
  ])
    for (const c of taps[lang][id])
      samples.push([base + c.frame - 4, base + c.frame + 11]);
  samples.push([772, 861]);
  const tiles = samples.flatMap((pair, row) =>
    pair.map((n, col) => ({
      input: capture(video, n),
      top: row * 302,
      left: col * 646,
    })),
  );
  await sharp({
    create: {
      width: 1286,
      height: samples.length * 302,
      channels: 3,
      background: "#14211d",
    },
  })
    .composite(tiles)
    .jpeg({ quality: 87 })
    .toFile(path.join(dir, lang, "tap-checks.jpg"));
  const master = path.join(dir, lang, "master-3840.mp4");
  const masterProbe = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      master,
    ]),
  );
  const mv = masterProbe.streams.find((s) => s.codec_type === "video");
  assert.deepEqual(
    [mv.width, mv.height, mv.r_frame_rate, mv.nb_frames, mv.pix_fmt],
    [3840, 1772, "30/1", "894", "yuv420p"],
  );
  execFileSync("ffmpeg", ["-v", "error", "-i", master, "-f", "null", "-"], {
    stdio: "pipe",
  });
  const audioHash = (file) =>
    createHash("sha256")
      .update(
        execFileSync(
          "ffmpeg",
          [
            "-v",
            "error",
            "-i",
            file,
            "-map",
            "0:a:0",
            "-c:a",
            "copy",
            "-f",
            "adts",
            "-",
          ],
          { maxBuffer: 3e6 },
        ),
      )
      .digest("hex");
  const locked = audioHash(
    path.join(studio, "public/locked-audio", lang + ".m4a"),
  );
  assert.equal(audioHash(video), locked);
  assert.equal(audioHash(master), locked);
  const id = lang === "en" ? "en-US" : "zh-Hans",
    t = listings[id],
    copy = (x) =>
      fs
        .readFileSync(path.join(dir, lang, "copy", x + ".txt"), "utf8")
        .trimEnd();
  for (const [field, limit] of [
    ["name", 30],
    ["subtitle", 30],
    ["promotionalText", 170],
    ["description", 4000],
    ["keywords", 100],
  ]) {
    const value = copy("apple-" + field);
    assert.equal(value, t.apple[field]);
    assert.ok([...value].length <= limit);
    if (field === "keywords") assert.ok(Buffer.byteLength(value) <= 100);
  }
  assert.equal(copy("google-short-description"), t.google.shortDescription);
  assert.ok([...t.google.shortDescription].length <= 80);
  const srt = fs.readFileSync(path.join(dir, lang, "captions.srt"), "utf8");
  assert.equal(srt.match(/ --> /g).length, 6);
  assert.ok(
    srt.includes(
      board.scenes[5][lang === "en" ? "sharedVoiceEn" : "sharedVoiceZh"],
    ),
  );
  checks.languages[lang] = {
    file: lang + "/shared-preview.mp4",
    sha256: createHash("sha256").update(fs.readFileSync(video)).digest("hex"),
    frames: +v.nb_frames,
    videoBitrate: +v.bit_rate,
    duration: +probe.format.duration,
    lufs,
    truePeakDb: peak,
    touchFramePairs: samples,
    deviceScreenshots: 32,
    master: {
      file: lang + "/master-3840.mp4",
      width: 3840,
      height: 1772,
      frames: 894,
      sha256: createHash("sha256")
        .update(fs.readFileSync(master))
        .digest("hex"),
    },
    audioUnchangedFromV4: true,
    aacSha256: locked,
  };
}
const zh = checks.languages["zh-CN"],
  en = checks.languages.en;
assert.notEqual(zh.sha256, en.sha256);
put("verification.json", JSON.stringify(checks, null, 2) + "\n");
put(
  "listings.json",
  JSON.stringify(
    { ...listings, source: { ...listings.source, revision: 5 } },
    null,
    2,
  ) + "\n",
);
const intro =
  "V5 清晰度增强版。高清母版用于放大观看，商店通用版由同一母版生成；排版、分镜和声音沿用 V4。";
const usage =
  "iPhone 风格外框属于创意叠层。Apple 要求以 App 内画面为主，允许用于讲解操作的触点；外框是否接受由审核决定。Google 使用可嵌入、公开或不公开列出的无广告 YouTube 视频。";
put(
  "使用说明.txt",
  "NOIR Poker · V5\n\n" +
    intro +
    "\n" +
    usage +
    "\n\n中英文目录分别包含 master-3840.mp4（3840×1772 高清母版）、shared-preview.mp4（1920×886 商店共用版）、预览封面、SRT、原生界面截图、商店文案与点击前后对照。手机截图共用外框，但保留各平台的实际画面；iPad 使用独立平板截图。每种语言只提交对应的一条视频。\n这是制作交付，未上传商店或 YouTube。\n",
);
const strings = { "zh-CN": "简体中文", en: "English" };
const parts = langs
  .map(
    (l) =>
      `<section><h2>${strings[l]}</h2><video controls playsinline preload="metadata" poster="${l}/poster.png" src="${l}/master-3840.mp4"></video><nav><a href="${l}/master-3840.mp4" download>下载高清母版</a><a href="${l}/shared-preview.mp4" download>下载商店通用 MP4</a><a href="${l}/captions.srt" download>SRT 字幕</a><a href="${l}/tap-checks.jpg">点按前后逐帧对照</a></nav><details><summary>查看八张 iPhone 截图</summary><div class="grid">${Array.from(
        { length: 8 },
        (_, i) => {
          const src =
            l +
            "/apple/iphone-large/" +
            String(i + 1).padStart(2, "0") +
            ".png";
          return (
            '<a href="' +
            src +
            '"><img loading="lazy" src="' +
            src +
            '" alt="截图 ' +
            (i + 1) +
            '"></a>'
          );
        },
      ).join("")}</div></details></section>`,
  )
  .join("");
put(
  "index.html",
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NOIR Poker · V5</title><style>*{box-sizing:border-box}body{margin:auto;max-width:1100px;padding:42px 20px 90px;background:#091b19;color:#f2f0e5;font:17px/1.65 system-ui}small,a{color:#a5e5c5}h1{font-size:clamp(34px,5vw,60px);line-height:1.12;margin:8px 0}section{margin:38px 0}video{width:100%;border-radius:14px;background:#071412}nav{display:flex;gap:22px;flex-wrap:wrap}summary{cursor:pointer;margin:12px 0}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.grid img{width:100%}p{max-width:900px}</style><small>NOIR POKER / STORE EDITION 05</small><h1>一手牌的练习旅程</h1><p>' +
    intro +
    "</p>" +
    parts +
    "<p>" +
    usage +
    '</p><a href="listings.json">中英文完整字段</a> · <a href="verification.json">导出校验</a></html>',
);
console.log(JSON.stringify(checks.languages, null, 2));
