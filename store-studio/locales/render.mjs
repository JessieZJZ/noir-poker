import { bundle } from "@remotion/bundler";
import { getCompositions, openBrowser, renderStill } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] || "panels",
  out = path.resolve(process.argv[3] || ".artifacts/store-media-v6/render");
const catalog = JSON.parse(
  fs.readFileSync(path.join(studio, "locales/catalog.json")),
);
const locales = (
  process.env.NOIR_STORE_LOCALES || Object.keys(catalog).join(",")
).split(",");
const formats = {
  phone: [1080, 1920],
  tablet7: [1920, 1080],
  tablet10: [1920, 1080],
  desktop: [1920, 1080],
  apple: [1290, 2796],
  ipad: [2752, 2064],
};
const folder = {
  phone: "google/phone",
  tablet7: "google/tablet-7",
  tablet10: "google/tablet-10",
  desktop: "google/desktop",
  apple: "apple/iphone-large",
  ipad: "apple/ipad-13",
};
fs.mkdirSync(out, { recursive: true });
const renderPublic = path.join(
  studio,
  "../.artifacts/store-media-v6/public-render",
);
fs.mkdirSync(renderPublic, { recursive: true });
for (const dir of ["assets", "locales"])
  if (fs.existsSync(path.join(studio, "public", dir)))
    fs.cpSync(path.join(studio, "public", dir), path.join(renderPublic, dir), {
      recursive: true,
    });
const serveUrl = await bundle({
  entryPoint: path.join(studio, "src/index.ts"),
  rootDir: studio,
  publicDir: renderPublic,
});
const puppeteerInstance = await openBrowser("chrome");
try {
  const cs = await getCompositions(serveUrl, {
    puppeteerInstance,
    logLevel: "error",
  });
  const render = async (id, file, scale = 1) => {
    if (fs.existsSync(file) && process.env.NOIR_RENDER_OVERWRITE !== "1")
      return fs.readFileSync(file);
    const c = cs.find((c) => c.id === id);
    if (!c) throw Error("Missing composition " + id);
    const { buffer } = await renderStill({
      serveUrl,
      puppeteerInstance,
      composition: c,
      frame: 0,
      imageFormat: "png",
      scale,
      logLevel: "error",
      timeoutInMilliseconds: 120000,
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buffer);
    return buffer;
  };
  for (const locale of locales) {
    if (mode === "panels") {
      for (const i of (process.env.NOIR_STORE_SCENES || "0,1,2,3,4,5")
        .split(",")
        .map(Number)) {
        await render(
          "Panel-" + locale + "-" + i,
          path.join(out, locale, "panel-" + i + ".png"),
          2,
        );
        console.log(locale + " panel " + i);
      }
    } else {
      const media = JSON.parse(
        fs.readFileSync(path.join(studio, "src/locale-media.json")),
      )[locale];
      for (const format of (
        process.env.NOIR_STORE_FORMATS || Object.keys(formats).join(",")
      ).split(",")) {
        const target = format === "apple" ? "ios" : format;
        if (Object.keys(media?.[target] || {}).length < 8)
          throw Error("Missing actual captures " + locale + "/" + target);
        const [w, h] = formats[format],
          sheet = path.join(out, ".sheets", locale + "-" + format + ".png");
        const buffer = await render("Sheet-" + locale + "-" + format, sheet);
        for (let i = 0; i < 8; i++) {
          const file = path.join(
            out,
            locale,
            folder[format],
            String(i + 1).padStart(2, "0") + ".png",
          );
          fs.mkdirSync(path.dirname(file), { recursive: true });
          await sharp(buffer)
            .extract({
              left: (i % 2) * w,
              top: Math.floor(i / 2) * h,
              width: w,
              height: h,
            })
            .flatten({ background: "#080e15" })
            .removeAlpha()
            .png({ compressionLevel: 9 })
            .toFile(file);
          if (format === "apple") {
            const small = path.join(
              out,
              locale,
              "apple/iphone-medium",
              path.basename(file),
            );
            fs.mkdirSync(path.dirname(small), { recursive: true });
            await sharp(file)
              .resize(1206, 2622, { fit: "contain", background: "#080e15" })
              .removeAlpha()
              .png({ compressionLevel: 9 })
              .toFile(small);
          }
        }
        console.log(locale + " " + format + " 8 screenshots");
        fs.rmSync(sheet);
      }
      if (
        (process.env.NOIR_STORE_FORMATS || "phone").split(",").includes("phone")
      )
        await render(
          "Intl-Feature-" + locale,
          path.join(out, locale, "google/feature-graphic.png"),
        );
    }
  }
} finally {
  await puppeteerInstance.close({ silent: true });
  fs.rmSync(serveUrl, { recursive: true, force: true });
}
