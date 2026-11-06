import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import path from "node:path";

export async function encodeFrames(source, filters, folder, expected) {
  mkdirSync(folder, { recursive: true });
  const meta = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-of",
      "json",
      source,
    ]),
  ).streams.find((s) => s.codec_type === "video");
  const { width, height } = meta,
    size = width * height * 3,
    frames = [],
    hashes = new Map();
  const proc = spawn(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      source,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[out]",
      "-an",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "-",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let error = "";
  proc.stderr.on("data", (d) => (error += d));
  const finish = new Promise((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (n) => (n === 0 ? resolve() : reject(Error(error))));
  });
  let buffers = [],
    bytes = 0,
    checked = false;
  for await (const chunk of proc.stdout) {
    buffers.push(chunk);
    bytes += chunk.length;
    if (bytes < size) continue;
    const all = Buffer.concat(buffers, bytes),
      rgb = all.subarray(0, size);
    const rest = all.subarray(size);
    buffers = rest.length ? [rest] : [];
    bytes = rest.length;
    const hash = createHash("sha256").update(rgb).digest("hex");
    let name = hashes.get(hash);
    if (!name) {
      name = String(hashes.size).padStart(4, "0") + ".webp";
      const encoded = await sharp(rgb, { raw: { width, height, channels: 3 } })
        .webp({ lossless: true, effort: 0 })
        .toBuffer();
      if (!checked) {
        const decoded = await sharp(encoded).raw().toBuffer();
        if (!decoded.equals(rgb))
          throw Error("Lossless WebP roundtrip differs");
        checked = true;
      }
      writeFileSync(path.join(folder, name), encoded);
      hashes.set(hash, name);
    }
    frames.push(name);
  }
  await finish;
  if (frames.length !== expected || bytes)
    throw Error("Frame count " + frames.length + " expected " + expected);
  return { width, height, frames, uniqueFrames: hashes.size, lossless: true };
}
