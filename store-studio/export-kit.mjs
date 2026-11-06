import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const studio = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(studio);
const output = path.resolve(
  process.argv[2] || path.join(root, ".artifacts/store-media/delivery"),
);
const stillOnly = process.argv.includes("--stills-only");
const selectedStore = (
  process.argv.find((x) => x.startsWith("--store=")) || "--store=all"
).slice(8);
if (!["all", "apple", "google"].includes(selectedStore))
  throw Error("Use --store=all|apple|google");
const plan = JSON.parse(
  readFileSync(path.join(studio, "src/media-plan.json"), "utf8"),
);
if (plan.revision !== 2)
  throw Error("Prepare the revised real native captures before export");
const requiredPlatforms =
  selectedStore === "apple"
    ? ["ios", "ipad"]
    : selectedStore === "google"
      ? ["android"]
      : ["ios", "ipad", "android"];
if (
  !requiredPlatforms.every(
    (p) =>
      ["en", "zh-CN"].every((l) => plan[p]?.[l]?.["06-styles"]) &&
      plan.captureRevisions?.[p]?.actualNative,
  )
)
  throw Error(
    "All target-platform native captures must be prepared before export",
  );
for (const platform of requiredPlatforms)
  for (const language of ["en", "zh-CN"]) {
    const ids = [
      "01-practice",
      "02-tutorial",
      "03-review",
      "04-result",
      "05-calculator",
      "06-styles",
      "07-records",
      "07-record-detail",
    ];
    if (!stillOnly && platform !== "ipad")
      ids.push(
        "practice",
        "tutorial",
        "review",
        "retry",
        "records",
        "calculator",
      );
    for (const id of ids) {
      const source = plan[platform]?.[language]?.[id];
      if (
        !source?.startsWith(`media/${platform}/${language}/`) ||
        !existsSync(path.join(studio, "public", source))
      )
        throw Error(
          `Missing recorded ${platform}/${language}/${id}; placeholder export is not allowed`,
        );
    }
  }
const run = (bin, args) => {
  const r = spawnSync(bin, args, { cwd: studio, stdio: "inherit" });
  if (r.status !== 0) throw Error(`${bin} failed with exit ${r.status}`);
};
const cli = path.join(studio, "node_modules/@remotion/cli/remotion-cli.js");
const render = (type, id, destination, args = []) => {
  mkdirSync(path.dirname(destination), { recursive: true });
  if (existsSync(destination) && process.env.NOIR_STORE_OVERWRITE !== "1")
    return;
  console.log(`Rendering ${id}`);
  run(process.execPath, [cli, type, id, destination, "--log=warn", ...args]);
};
const opaque = async (file) => {
  const buffer = await sharp(file)
    .flatten({ background: "#080e15" })
    .removeAlpha()
    .png()
    .toBuffer();
  writeFileSync(file, buffer);
};
mkdirSync(output, { recursive: true });
for (const [language, suffix] of [
  ["en", "EN"],
  ["zh-CN", "ZH"],
]) {
  const localFolder = path.join(output, language);
  for (const [platform, folder] of [
    ["ios", "apple/iphone-large"],
    ["android", "google/phone"],
    ["ipad", "apple/ipad-13"],
  ]) {
    if (selectedStore !== "all" && !folder.startsWith(selectedStore + "/"))
      continue;
    for (let feature = 1; feature <= 8; feature++) {
      const destination = path.join(
        localFolder,
        folder,
        `${String(feature).padStart(2, "0")}.png`,
      );
      render("still", `Screen-${platform}-${language}-${feature}`, destination);
      await opaque(destination);
      if (platform === "ios") {
        const medium = path.join(
          localFolder,
          "apple/iphone-medium",
          `${String(feature).padStart(2, "0")}.pad`,
        );
        mkdirSync(path.dirname(medium), { recursive: true });
        await sharp(destination)
          .resize(1206, 2622, { fit: "contain", background: "#080e15" })
          .removeAlpha()
          .png()
          .toFile(medium.replace(".pad", ".png"));
      }
    }
  }
  if (selectedStore !== "apple") {
    const featureGraphic = path.join(localFolder, "google/feature-graphic.png");
    render("still", `Feature-${suffix}`, featureGraphic);
    await opaque(featureGraphic);
  }
  if (!stillOnly)
    for (const [store, stem] of [
      ["apple", "Apple"],
      ["google", "Google"],
    ])
      if (selectedStore === "all" || selectedStore === store)
        for (const variant of ["", "-Music"]) {
          const video = path.join(
            localFolder,
            store,
            variant ? "preview-music.mp4" : "preview-narrated.mp4",
          );
          render("render", `${stem}-${suffix}${variant}`, video, [
            "--codec=h264",
            "--video-bitrate=11M",
            "--audio-bitrate=256k",
            "--pixel-format=yuv420p",
            "--color-space=bt709",
            "--x264-preset=medium",
            "--concurrency=1",
          ]);
          const poster = video.replace(".mp4", "-poster.png");
          run("ffmpeg", [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            "5",
            "-i",
            video,
            "-frames:v",
            "1",
            poster,
          ]);
          await opaque(poster);
        }
}

const icons = path.join(output, "icons");
mkdirSync(icons, { recursive: true });
await sharp(path.join(studio, "public/assets/app-icon.png"))
  .resize(1024, 1024)
  .flatten({ background: "#0b1017" })
  .removeAlpha()
  .png()
  .toFile(path.join(icons, "apple-1024.png"));
await sharp(path.join(studio, "public/assets/app-icon.png"))
  .resize(512, 512)
  .ensureAlpha()
  .png()
  .toFile(path.join(icons, "google-512.png"));

const listings = JSON.parse(
  readFileSync(path.join(studio, "listings.json"), "utf8"),
);
for (const [locale, language] of [
  ["en-US", "en"],
  ["zh-Hans", "zh-CN"],
]) {
  const folder = path.join(output, language, "copy");
  mkdirSync(folder, { recursive: true });
  const local = listings[locale];
  for (const [key, value] of Object.entries(local.apple))
    writeFileSync(path.join(folder, `apple-${key}.txt`), value + "\n");
  writeFileSync(path.join(folder, "google-name.txt"), local.google.name + "\n");
  writeFileSync(
    path.join(folder, "google-short-description.txt"),
    local.google.shortDescription + "\n",
  );
  writeFileSync(
    path.join(folder, "google-full-description.txt"),
    local.apple.description + "\n",
  );
  writeFileSync(
    path.join(folder, "review-notes.txt"),
    local.reviewNotes + "\n",
  );
}
copyFileSync(
  path.join(studio, "listings.json"),
  path.join(output, "listings.json"),
);
copyFileSync(
  path.join(studio, "storyboard.json"),
  path.join(output, "storyboard.json"),
);

// Caption timings match the five editorial scene boundaries. These sidecars
// remain usable independently of the burned-in captions.
const board = JSON.parse(
  readFileSync(path.join(studio, "storyboard.json"), "utf8"),
);
const stamp = (seconds) => {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};
for (const [language, voiceKey] of [
  ["en", "voiceEn"],
  ["zh-CN", "voiceZh"],
]) {
  const captions = board.scenes.map((s) => ({
    text: s[voiceKey],
    startMs: Math.round((s.from + 0.3) * 1000),
    endMs: Math.round(s.to - 0.3 * 1000),
    timestampMs: null,
    confidence: null,
  }));
  const folder = path.join(output, language, "subtitles");
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    path.join(folder, "captions.json"),
    JSON.stringify(captions, null, 2) + "\n",
  );
  writeFileSync(
    path.join(folder, "captions.srt"),
    captions
      .map(
        (s, i) =>
          `${i + 1}\n${stamp(s.startMs / 1000)} --> ${stamp(s.endMs / 1000)}\n${s.text}\n`,
      )
      .join("\n"),
  );
}

// An eight-image contact sheet for quick editorial review.
for (const language of ["en", "zh-CN"]) {
  if (!existsSync(path.join(output, language, "apple/iphone-large/01.png")))
    continue;
  const inputs = [];
  for (let i = 1; i <= 8; i++)
    inputs.push({
      input: await sharp(
        path.join(
          output,
          language,
          "apple/iphone-large",
          `${String(i).padStart(2, "0")}.png`,
        ),
      )
        .resize(258, 559)
        .toBuffer(),
      left: ((i - 1) % 4) * 278 + 20,
      top: Math.floor((i - 1) / 4) * 579 + 20,
    });
  await sharp({
    create: { width: 1132, height: 1178, channels: 3, background: "#080e15" },
  })
    .composite(inputs)
    .png()
    .toFile(path.join(output, `contact-sheet-${language}.png`));
  await opaque(path.join(output, `contact-sheet-${language}.png`));
}
const allFiles = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (
      !["manifest.json", "verification.json", "visual-qa.json"].includes(name)
    )
      allFiles.push(p);
  }
};
walk(output);
const files = allFiles.map((file) => ({
  path: path.relative(output, file),
  bytes: statSync(file).size,
  sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
}));
writeFileSync(
  path.join(output, "manifest.json"),
  JSON.stringify(
    {
      source: listings.source,
      renderedAt: new Date().toISOString(),
      generator: "Remotion 4.0.541",
      stores: selectedStore === "all" ? ["apple", "google"] : [selectedStore],
      languages: ["en", "zh-CN"],
      includesVideo: !stillOnly,
      nativeCapture: true,
      physicalDeviceCapture: false,
      orientations: ["landscape"],
      voiceProvider: "Microsoft Edge neural TTS via edge-tts 7.3.1",
      appleLayout:
        "Actual app capture with matching enlarged detail; no device shell",
      googleLayout: "Actual app capture in unbranded phone housing",
      files,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Store media exported to ${output}`);
