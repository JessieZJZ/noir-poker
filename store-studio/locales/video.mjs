import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { catalog } from "./catalog.mjs";
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  root = path.dirname(studio),
  base = path.join(root, ".artifacts/store-media-v6");
const output = path.resolve(process.argv[2] || path.join(base, "delivery"));
const plans = JSON.parse(fs.readFileSync(path.join(base, "edit-plan.json"))),
  board = JSON.parse(fs.readFileSync(path.join(studio, "storyboard.json"))),
  ids = board.scenes.map((s) => s.id),
  lengths = board.scenes.map((s) => s.durationFrames);
const complete = (file) => {
  if (!fs.existsSync(file)) return false;
  try {
    const p = JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=nb_frames:format=duration",
        "-of",
        "json",
        file,
      ]),
    );
    return (
      p.streams[0].nb_frames === "894" &&
      Math.abs(Number(p.format.duration) - 29.8) < 0.05
    );
  } catch {
    return false;
  }
};
const run = (args) =>
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], {
    stdio: "inherit",
    maxBuffer: 128 * 1024 * 1024,
  });
const tmp = path.join(base, "video-work");
fs.mkdirSync(tmp, { recursive: true });
const shape = path.join(tmp, "screen-mask.png");
await sharp(
  Buffer.from(
    '<svg width="740" height="1612"><rect width="740" height="1612" fill="black"/><rect width="740" height="1612" rx="111" fill="white"/></svg>',
  ),
)
  .removeAlpha()
  .greyscale()
  .png()
  .toFile(shape);
const pointer = path.join(tmp, "pointer");
fs.mkdirSync(pointer, { recursive: true });
const ease = (t, a, b) => {
  const v = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return v * v * (3 - 2 * v);
};
for (let n = 0; n < 25; n++) {
  const d = n - 17,
    alpha = Math.min(ease(d, -17, -11), 1 - ease(d, 0, 7)),
    drift = 13 * (1 - ease(d, -15, -2)),
    press = 1 - 0.15 * ease(d, -6, -1) + 0.15 * ease(d, 0, 6),
    ring = 4 + 16 * ease(d, -4, 7);
  const svg =
    '<svg width="116" height="116" viewBox="0 0 80 80"><g opacity="' +
    alpha +
    '"><circle cx="18.4" cy="19.2" r="' +
    ring +
    '" fill="none" stroke="#91ffcf" stroke-width="2.8" opacity="' +
    (1 - ease(d, 1, 7)) +
    '"/><g transform="translate(' +
    (18.4 + drift) +
    " " +
    (19.2 + drift) +
    ") scale(" +
    press +
    ') rotate(-19)"><path d="M-3.6 3.6Q-3.6 -1 0 0Q3.4 .1 3.7 3.8L4.5 16.5L5.3 13.5Q7.3 9.5 10.6 12L12.1 14.7Q14.1 9.7 17.5 13.5L19.2 16.4Q22.3 13.5 25 17Q28.2 22 27.1 30.8L25.3 41Q24.7 44.9 21 45L7 45Q3.7 45 1.5 41.7L-8.1 27.7Q-11 23.8 -8.8 21.5Q-6.5 19.7 -3.1 23.2L.2 26.9Z" fill="#fff9e8" stroke="#143c31" stroke-width="1.9" stroke-linejoin="round"/></g></g></svg>';
  await sharp(Buffer.from(svg))
    .png()
    .toFile(path.join(pointer, String(n).padStart(2, "0") + ".png"));
}
const locales = (
  process.env.NOIR_STORE_LOCALES || Object.keys(plans).join(",")
).split(",");
for (const locale of locales) {
  const p = plans[locale],
    c = catalog[locale],
    work = path.join(tmp, locale),
    dest = path.join(output, locale, "video");
  fs.mkdirSync(work, { recursive: true });
  fs.mkdirSync(dest, { recursive: true });
  const audio = path.join(dest, "soundtrack.m4a");
  const hashFiles = (files, extra = "") => {
    const h = createHash("sha256").update(extra);
    for (const f of files) h.update(fs.readFileSync(f));
    return h.digest("hex");
  };
  const audioInputs = [
    path.join(studio, "public/assets/background-music-mobile.m4a"),
    ...ids.map((id) =>
      path.join(studio, "public/voice-locales", locale, id + ".wav"),
    ),
  ];
  const audioFingerprint = hashFiles(
    audioInputs,
    JSON.stringify(c.say) + "music.30/voice.30/29.8",
  );
  const audioMeta = path.join(dest, "soundtrack-source.json");
  if (
    !fs.existsSync(audio) ||
    !fs.existsSync(audioMeta) ||
    JSON.parse(fs.readFileSync(audioMeta)).fingerprint !== audioFingerprint
  ) {
    const args = [
      "-stream_loop",
      "-1",
      "-i",
      path.join(studio, "public/assets/background-music-mobile.m4a"),
    ];
    for (const id of ids)
      args.push(
        "-i",
        path.join(studio, "public/voice-locales", locale, id + ".wav"),
      );
    const f = ["[0:a]volume=0.30,afade=t=in:d=1,afade=t=out:st=28.5:d=1.3[m]"];
    for (let i = 0; i < 6; i++)
      f.push(
        "[" +
          (i + 1) +
          ":a]adelay=" +
          Math.round((board.scenes[i].from + 0.3) * 1000) +
          ":all=1[a" +
          i +
          "]",
      );
    f.push(
      "[m]" +
        ids.map((_, i) => "[a" + i + "]").join("") +
        "amix=inputs=7:normalize=0,alimiter=limit=0.89:level=false,atrim=end=29.8[out]",
    );
    run([
      ...args,
      "-filter_complex",
      f.join(";"),
      "-map",
      "[out]",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-c:a",
      "aac",
      "-b:a",
      "256k",
      audio,
    ]);
    fs.writeFileSync(
      audioMeta,
      JSON.stringify(
        {
          locale,
          fingerprint: audioFingerprint,
          voice: c.voice,
          text: c.say,
          musicGain: 0.3,
        },
        null,
        2,
      ),
    );
  }
  const renderFingerprint = hashFiles(
    [
      ...ids.map((id, i) =>
        path.join(base, "render", locale, "panel-" + i + ".png"),
      ),
      ...ids.slice(0, 5).map((id) => path.join(p.source, locale, id + ".mp4")),
      path.join(p.source, locale + "--05-calculator.png"),
      path.join(studio, "locales/video.mjs"),
    ],
    JSON.stringify({ cuts: p.cuts, cues: p.cues, audioFingerprint }),
  );
  const existingMeta = path.join(dest, "edit-provenance.json");
  if (
    process.env.NOIR_VIDEO_OVERWRITE !== "1" &&
    fs.existsSync(existingMeta) &&
    JSON.parse(fs.readFileSync(existingMeta)).renderFingerprint ===
      renderFingerprint &&
    complete(path.join(dest, "master-3840.mp4")) &&
    complete(path.join(dest, "shared-preview.mp4"))
  ) {
    console.log(locale + " video already current");
    continue;
  }
  for (let i = 0; i < 6; i++) {
    const id = ids[i],
      file = path.join(work, id + ".mkv");
    if (fs.existsSync(file)) continue;
    const args = [],
      filters = [],
      cuts = p.cuts[id],
      cues = p.cues[id] || [],
      n = lengths[i];
    if (id === "calculator") {
      args.push(
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        path.join(p.source, locale + "--05-calculator.png"),
      );
      filters.push("[0:v]trim=end_frame=" + n + ",setpts=PTS-STARTPTS[s0]");
    } else {
      args.push("-i", path.join(p.source, locale, id + ".mp4"));
      filters.push(
        "[0:v]fps=30,split=" +
          cuts.length +
          cuts.map((_, j) => "[a" + j + "]").join(""),
      );
      let at = 0;
      cuts.forEach(([start, d], j) => {
        const first = Math.round(start * 30),
          len = Math.round((at + d) * 30) - Math.round(at * 30);
        at += d;
        filters.push(
          "[a" +
            j +
            "]trim=start_frame=" +
            first +
            ":end_frame=" +
            (first + len) +
            ",setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=6,trim=end_frame=" +
            len +
            "[v" +
            j +
            "]",
        );
      });
      filters.push(
        cuts.map((_, j) => "[v" + j + "]").join("") +
          "concat=n=" +
          cuts.length +
          ":v=1:a=0[s0]",
      );
    }
    filters.push(
      "[s0]scale=740:1612:force_original_aspect_ratio=decrease:flags=lanczos+accurate_rnd+full_chroma_int,pad=740:1612:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=rgba[phone0]",
    );
    let current = "phone0";
    for (let j = 0; j < cues.length; j++) {
      const cue = cues[j],
        t = cue.target,
        start = (cue.frame - 17) / 30;
      if (start < 0) throw Error("Tap cue must enter after scene starts");
      args.push("-framerate", "30", "-i", path.join(pointer, "%02d.png"));
      filters.push(
        "[" + (j + 1) + ":v]setpts=PTS-STARTPTS+" + start + "/TB[tap" + j + "]",
      );
      const next = "phone" + (j + 1);
      filters.push(
        "[" +
          current +
          "][tap" +
          j +
          "]overlay=x=" +
          ((t.x / t.viewportWidth) * 740 - 116 * 0.23) +
          ":y=" +
          ((t.y / t.viewportHeight) * 1612 - 116 * 0.24) +
          ":eof_action=pass:repeatlast=0:enable=between(t\\," +
          start +
          "\\," +
          (start + 25 / 30) +
          ")[" +
          next +
          "]",
      );
      current = next;
    }
    args.push("-loop", "1", "-framerate", "30", "-i", shape);
    filters.push("[" + (cues.length + 1) + ":v]format=gray[mask]");
    filters.push("[" + current + "][mask]alphamerge,format=bgra[out]");
    run([
      ...args,
      "-filter_complex_threads",
      "1",
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[out]",
      "-frames:v",
      String(n),
      "-an",
      "-c:v",
      "ffv1",
      "-level",
      "3",
      "-pix_fmt",
      "bgra",
      "-threads",
      "2",
      file,
    ]);
    console.log(locale + " prepared " + id);
  }
  // Composite one scene at a time to keep native capture/other apps responsive.
  // RGB H.264 at CRF 0 is lossless; final store and master encodes remain independent.
  for (let i = 0; i < 6; i++) {
    const file = path.join(work, ids[i] + "-full.mkv");
    if (!fs.existsSync(file))
      run([
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        path.join(base, "render", locale, "panel-" + i + ".png"),
        "-i",
        path.join(work, ids[i] + ".mkv"),
        "-filter_complex_threads",
        "1",
        "-filter_complex",
        "[0:v][1:v]overlay=2590:80:shortest=1,format=rgb24[out]",
        "-map",
        "[out]",
        "-frames:v",
        String(lengths[i]),
        "-an",
        "-c:v",
        "libx264rgb",
        "-crf",
        "0",
        "-preset",
        "ultrafast",
        "-threads",
        "2",
        file,
      ]);
    console.log(locale + " composited " + ids[i]);
  }
  const args = [],
    f = [];
  for (let i = 0; i < 6; i++) {
    args.push("-i", path.join(work, ids[i] + "-full.mkv"));
    f.push(
      "[" +
        i +
        ":v]trim=end_frame=" +
        lengths[i] +
        ",setpts=PTS-STARTPTS,setsar=1,format=yuv444p[v" +
        i +
        "]",
    );
  }
  let prev = "v0";
  for (let i = 1; i < 6; i++) {
    const next = "x" + i;
    f.push(
      "[" +
        prev +
        "][v" +
        i +
        "]xfade=transition=fade:duration=0.2:offset=" +
        board.scenes[i].from +
        "[" +
        next +
        "]",
    );
    prev = next;
  }
  f.push("[" + prev + "]split=2[master][small]");
  f.push(
    "[small]scale=1920:886:flags=lanczos+accurate_rnd+full_chroma_int[standard]",
  );
  args.push("-i", audio);
  const opts = [
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-threads",
    "2",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-colorspace",
    "bt709",
    "-color_trc",
    "bt709",
    "-color_primaries",
    "bt709",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    "-t",
    "29.8",
  ];
  // The fingerprint gate above is the only completion cache. A changed edit
  // must encode again even when the old movies have valid dimensions/length.
  {
    run([
      ...args,
      "-filter_complex_threads",
      "1",
      "-filter_complex",
      f.join(";"),
      "-map",
      "[master]",
      "-map",
      "6:a",
      ...opts,
      "-crf",
      "12",
      "-level:v",
      "5.1",
      path.join(dest, "master-3840.mp4"),
      "-map",
      "[standard]",
      "-map",
      "6:a",
      ...opts,
      "-level:v",
      "4.0",
      "-b:v",
      "11M",
      "-minrate",
      "11M",
      "-maxrate",
      "11M",
      "-bufsize",
      "11M",
      "-x264-params",
      "nal-hrd=cbr:force-cfr=1",
      path.join(dest, "shared-preview.mp4"),
    ]);
  }
  const stamp = (t) =>
    new Date(Math.round(t * 1000))
      .toISOString()
      .slice(11, 23)
      .replace(".", ",");
  fs.writeFileSync(
    path.join(dest, "captions.srt"),
    board.scenes
      .map(
        (s, i) =>
          i +
          1 +
          "\n" +
          stamp(s.from + 0.3) +
          " --> " +
          stamp(s.to - 0.24) +
          "\n" +
          c.say[i] +
          "\n",
      )
      .join("\n"),
  );
  run([
    "-ss",
    "1.3",
    "-i",
    path.join(dest, "master-3840.mp4"),
    "-frames:v",
    "1",
    path.join(dest, "poster.png"),
  ]);
  fs.writeFileSync(
    path.join(dest, "edit-provenance.json"),
    JSON.stringify(
      {
        locale,
        renderFingerprint,
        source: p.source,
        method:
          "Actual native source -> lossless FFV1 phone footage and 2x Remotion panels -> each final delivery encode once",
        frames: 894,
        width: 3840,
        height: 1772,
        voice: c.voice,
        cuts: p.cuts,
        cues: p.cues,
      },
      null,
      2,
    ),
  );
  if (process.env.NOIR_KEEP_VIDEO_WORK !== "1")
    fs.rmSync(work, { recursive: true, force: true });
  console.log(locale + " video complete");
}
