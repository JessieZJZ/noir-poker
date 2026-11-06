import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const studio = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(
  process.argv[2] || path.join(studio, "../.artifacts/store-media-v2/raw"),
);
const plan = {};
// Actual screen changes, measured from the decoded variable-frame-rate recording.
// Driver completion timestamps can lag the first changed pixels by many frames.
const timings = {
  "zh-CN": {
    review: 2.1,
    reason: 4.4,
    replay: 2.17,
    fold: 10.2,
    menu: 1.8,
    history: 2.87,
    detail: 5.83,
    feed: 2.0,
  },
  en: {
    review: 2.13,
    reason: 5.23,
    replay: 1.6,
    fold: 10.3,
    menu: 2.0,
    history: 3.1,
    detail: 5.97,
    feed: 1.8,
  },
};
for (const lang of ["zh-CN", "en"]) {
  const dir = path.join(base, lang === "en" ? "ios-en-correction" : "ios");
  const out = path.join(studio, "public/shared", lang);
  mkdirSync(out, { recursive: true });
  const report = JSON.parse(readFileSync(path.join(dir, "report.json")));
  if (
    !["passed", "captured"].includes(report.status) ||
    report.build.sourceDigest !==
      "392adab3981eccbe478c517af67ba17873a7f24c2ef2ba32262c7d2cdf0a2e81"
  )
    throw Error("Unexpected capture build");
  const ui = readFileSync(
    path.join(dir, lang + "--05-calculator.native.xml"),
    "utf8",
  );
  if (!["56.06%", "Outs 16", "J♠", "10♠", "2♣"].every((s) => ui.includes(s)))
    throw Error("Calculator example no longer matches the captured UI");
  const events = JSON.parse(
    readFileSync(path.join(dir, lang + "--edit-events.json")),
  );
  const t = timings[lang];
  const edits = {
    practice: [
      [t.feed - 1.65, 2.2],
      [t.feed + 0.55, 2.8],
    ],
    review: [
      [t.review - 1.3, 3.0],
      [t.reason + 0.13, 2.4],
    ],
    retry: [
      [t.replay - 1.3, 2.43],
      [t.fold - 1.85, 3.07],
    ],
    records: [
      [t.menu - 0.87, 2.58],
      [t.detail - 0.93, 2.52],
    ],
    // Hold the real flop before the turn picker opens. A later turn has a different win rate.
    calculator: [[0.1, 0.4]],
  };
  const cues = (scene, name, frame) => {
    const e = events[scene].events.find((e) => e.name === name);
    if (
      !e?.target ||
      e.target.viewportWidth !== 402 ||
      e.target.viewportHeight !== 874
    )
      throw Error("Missing iPhone coordinates " + name);
    return { name, frame: Math.round(frame), x: e.target.x, y: e.target.y };
  };
  plan[lang] = {
    review: [cues("review", "open-review", 39)],
    retry: [
      cues("retry", "start-replay", 39),
      cues("retry", "different-decision", (2.43 + 1.85) * 30),
    ],
    records: [
      cues("records", "open-menu", 0.87 * 30),
      cues("records", "open-records", (t.history - t.menu + 0.87) * 30),
      cues("records", "open-record-detail", (2.58 + 0.93) * 30),
    ],
  };
  for (const [scene, cuts] of Object.entries(edits)) {
    const src = path.join(dir, lang, scene + ".mp4");
    const lens = cuts.map((c, i) =>
      scene === "calculator"
        ? 156
        : Math.round(cuts.slice(0, i + 1).reduce((s, c) => s + c[1], 0) * 30) -
          Math.round(cuts.slice(0, i).reduce((s, c) => s + c[1], 0) * 30),
    );
    // Normalize the entire VFR timeline before trimming. Input seeking can
    // skip a held frame and put touch cues on the destination screen.
    const filters = [
      "[0:v]fps=30,setsar=1,split=" +
        cuts.length +
        cuts.map((_, i) => "[a" + i + "]").join(""),
    ];
    cuts.forEach(([start, d], i) => {
      const first = Math.round(start * 30),
        last = first + Math.round(d * 30);
      filters.push(
        "[a" +
          i +
          "]trim=start_frame=" +
          first +
          ":end_frame=" +
          last +
          ",setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=6,trim=end_frame=" +
          lens[i] +
          "[v" +
          i +
          "]",
      );
    });
    filters.push(
      cuts.map((_, i) => "[v" + i + "]").join("") +
        "concat=n=" +
        cuts.length +
        ":v=1:a=0[out]",
    );
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      src,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[out]",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "15",
      "-threads",
      "2",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      path.join(out, scene + ".mp4"),
    ]);
  }
}
writeFileSync(
  path.join(studio, "src/shared-taps.json"),
  JSON.stringify(plan, null, 2) + "\n",
);
