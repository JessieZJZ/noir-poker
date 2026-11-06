import { bundle } from "@remotion/bundler";
import { getCompositions, openBrowser, renderStill } from "@remotion/renderer";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
const studio = path.dirname(fileURLToPath(import.meta.url));
if (!process.argv[2]) throw Error("Pass V3 output directory");
const dir = path.resolve(process.argv[2]);
const put = (f, bytes) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, bytes);
};
const serveUrl = await bundle({
  entryPoint: path.join(studio, "src/index.ts"),
  rootDir: studio,
  publicDir: path.join(studio, "public"),
});
const puppeteerInstance = await openBrowser("chrome");
try {
  const options = { serveUrl, puppeteerInstance, logLevel: "error" };
  const cs = await getCompositions(serveUrl, { puppeteerInstance });
  const still = async (id, file) => {
    const composition = cs.find((c) => c.id === id);
    if (!composition) throw Error("Missing " + id);
    const { buffer } = await renderStill({
      ...options,
      composition,
      frame: 0,
      imageFormat: "png",
    });
    put(
      file,
      await sharp(buffer)
        .flatten({ background: "#080e15" })
        .removeAlpha()
        .png()
        .toBuffer(),
    );
  };
  const listing = JSON.parse(
    fs.readFileSync(path.join(studio, "listings.json")),
  );
  for (const [lang, suffix, key] of [
    ["zh-CN", "ZH", "zh-Hans"],
    ["en", "EN", "en-US"],
  ]) {
    const base = path.join(dir, lang);
    const folder = {
      ios: "apple/iphone-large",
      android: "google/phone",
      ipad: "apple/ipad-13",
    };
    for (const dev of ["ios", "android", "ipad"])
      for (let i = 1; i <= 8; i++) {
        const stem = String(i).padStart(2, "0") + ".png",
          file = path.join(base, folder[dev], stem);
        await still("Screen-" + dev + "-" + lang + "-" + i, file);
        if (dev === "ios")
          put(
            path.join(base, "apple/iphone-medium", stem),
            await sharp(file)
              .resize(1206, 2622, { fit: "contain", background: "#080e15" })
              .removeAlpha()
              .png()
              .toBuffer(),
          );
      }
    await still(
      "Feature-" + suffix,
      path.join(base, "google/feature-graphic.png"),
    );
    const local = listing[key],
      copyDir = path.join(base, "copy");
    for (const [field, value] of Object.entries(local.apple))
      put(path.join(copyDir, "apple-" + field + ".txt"), value + "\n");
    for (const [field, value] of Object.entries({
      "google-name": local.google.name,
      "google-short-description": local.google.shortDescription,
      "google-full-description": local.apple.description,
      "review-notes": local.reviewNotes,
    }))
      put(path.join(copyDir, field + ".txt"), value + "\n");
  }
  put(
    path.join(dir, "icons/apple-1024.png"),
    await sharp(path.join(studio, "public/assets/app-icon.png"))
      .resize(1024, 1024)
      .flatten({ background: "#0b1017" })
      .removeAlpha()
      .png()
      .toBuffer(),
  );
  put(
    path.join(dir, "icons/google-512.png"),
    await sharp(path.join(studio, "public/assets/app-icon.png"))
      .resize(512, 512)
      .ensureAlpha()
      .png()
      .toBuffer(),
  );
  console.log(
    "Exported 64 screenshots, 2 feature graphics, icons and localized copy",
  );
} finally {
  await puppeteerInstance.close({ silent: true });
  fs.rmSync(serveUrl, { recursive: true, force: true });
}
