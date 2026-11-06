import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalog } from "./catalog.mjs";
import sharp from "sharp";
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  dir = path.resolve(process.argv[2] || ".artifacts/store-media-v6/delivery");
const escape = (s) =>
  String(s).replace(
    /[&<>\"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
for (const c of Object.values(catalog)) {
  const base = path.join(dir, c.locale);
  const thumbs = [];
  const feature = path.join(base, "google/feature-graphic.png");
  fs.writeFileSync(
    feature,
    await sharp(feature)
      .flatten({ background: "#080e15" })
      .removeAlpha()
      .png({ compressionLevel: 9 })
      .toBuffer(),
  );
  for (let n = 1; n <= 8; n++) {
    const img = path.join(
      base,
      "google/phone",
      String(n).padStart(2, "0") + ".png",
    );
    thumbs.push({
      input: await sharp(img).resize(270, 480).toBuffer(),
      left: ((n - 1) % 4) * 270,
      top: Math.floor((n - 1) / 4) * 480,
    });
  }
  await sharp({
    create: { width: 1080, height: 960, channels: 3, background: "#080e15" },
  })
    .composite(thumbs)
    .png()
    .toFile(path.join(base, "screenshots-overview.png"));
  await sharp(path.join(base, "video/poster.png"))
    .resize(1920, 886)
    .removeAlpha()
    .png()
    .toFile(path.join(base, "video/poster-store-1920x886.png"));
  await sharp(path.join(base, "video/poster.png"))
    .resize(1280, 720, { fit: "contain", background: "#080e15" })
    .removeAlpha()
    .png()
    .toFile(path.join(base, "video/youtube-thumbnail-1280x720.png"));
  const legal = path.join(base, "credits");
  fs.mkdirSync(legal, { recursive: true });
  for (const name of [
    "AUDIO-CREDITS.md",
    "Manrope-OFL.txt",
    "NotoSansSC-OFL.txt",
    "NotoSansKR-OFL.txt",
    "BarlowCondensed-OFL.txt",
  ])
    fs.copyFileSync(
      path.join(studio, "public/assets", name),
      path.join(legal, name),
    );
  fs.copyFileSync(
    path.join(studio, "locales/editorial.json"),
    path.join(base, "localization-notes.json"),
  );
  fs.copyFileSync(
    path.join(studio, "locales/known-app-copy-issues.md"),
    path.join(base, "原有界面译文待办.md"),
  );
}
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NOIR Poker · 11 种语言上架素材</title><style>*{box-sizing:border-box}body{margin:0;background:#080e15;color:#f2f4ea;font:16px/1.65 system-ui,sans-serif}main{max-width:1240px;margin:auto;padding:56px 28px}header{margin-bottom:38px}.brand{color:#9de7cd;letter-spacing:5px;font-size:14px}h1{font-size:clamp(30px,4vw,50px);line-height:1.2;letter-spacing:-1px;margin:18px 0}p{color:#b1c6bd}.intro{max-width:810px}nav{display:flex;flex-wrap:wrap;gap:8px;margin:28px 0}a{color:#a0e9ce;text-decoration:none}nav a,.download{border:1px solid #36584c;border-radius:30px;padding:7px 15px}section{border:1px solid #243c34;border-radius:24px;padding:26px;margin:28px 0;background:linear-gradient(120deg,#11211f,#0a1118)}h2{font-size:27px;margin:0}.meta{color:#8ca69a;font-size:13px;margin:3px 0 20px}.split{display:grid;grid-template-columns:1.7fr 1fr;gap:24px;align-items:start}video{display:block;width:100%;border-radius:14px;background:#000}.shots{width:100%;border-radius:12px}.links{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0}.links a{background:#14342a;padding:7px 13px;border-radius:9px}.text{margin-top:22px}.field{margin:14px 0}label{display:flex;justify-content:space-between;color:#b1c6bd;font-size:13px;margin-bottom:5px}textarea,input{width:100%;background:#080f15;color:#eaf3ec;border:1px solid #385247;border-radius:8px;padding:12px;font:15px/1.7 system-ui}textarea{resize:vertical}button{cursor:pointer;color:#a0e9ce;border:0;background:transparent}small{color:#8ca69a}.fold{color:#a0e9ce;cursor:pointer}.top{font-size:12px;float:right}@media(max-width:760px){main{padding:32px 14px}.split{grid-template-columns:1fr}section{padding:17px;border-radius:16px}.shots{max-width:540px}h1{font-size:32px}}</style><main><header id="top"><div class="brand">NOIR POKER</div><h1>11 种语言，完整上架素材。</h1><p class="intro">每种语言都有对应的画面、旁白、字幕、截图和应用介绍。视频保留已确认的六个分镜与 iPhone 边框。下方默认播放高清母版，商店上传请取标准版。</p><a class="download online-only" href="NOIR-Poker-11-Language-Store-Kits.zip" download>下载全部 11 份资料包</a></header><nav>${Object.values(
  catalog,
)
  .map((c) => `<a href="#${c.locale}">${escape(c.label)}</a>`)
  .join("")}</nav>${Object.values(catalog)
  .map(
    (c) =>
      `<section id="${c.locale}"><a class="top" href="#top">返回语言索引 ↑</a><h2>${escape(c.label)}</h2><div class="meta">Apple ${c.apple} · Google ${c.google} · ${c.locale}</div><div class="split"><div><video controls preload="none" poster="${c.locale}/video/poster.png"><source src="${c.locale}/video/master-3840.mp4" type="video/mp4"></video><div class="links"><a href="packages/NOIR-Poker-${c.locale}.zip" download>下载本语言资料包</a><a href="${c.locale}/video/shared-preview.mp4" download>商店标准视频</a><a href="${c.locale}/video/master-3840.mp4" download>高清母版</a><a href="${c.locale}/README-填写指南.md">填写指南</a></div><small>29.8 秒 · 横屏 · 本语言配音与画内字幕</small></div><a href="${c.locale}/screenshots-overview.png"><img class="shots" src="${c.locale}/screenshots-overview.png" alt="${escape(c.label)} 八张手机截图概览" loading="lazy"></a></div><details class="text"><summary class="fold">查看可复制的商店文案</summary><div class="field"><label>名称 · ${[...c.appName].length}/30 <button onclick="copy(this)">复制</button></label><input readonly value="${escape(c.appName)}"></div><div class="field"><label>Google Play 简短说明 · ${[...c.short].length}/80 <button onclick="copy(this)">复制</button></label><textarea readonly rows="2">${escape(c.short)}</textarea></div><div class="field"><label>Apple 副标题 · ${[...c.subtitle].length}/30 <button onclick="copy(this)">复制</button></label><input readonly value="${escape(c.subtitle)}"></div><div class="field"><label>完整说明 · ${[...c.description].length}/4000 <button onclick="copy(this)">复制</button></label><textarea readonly rows="13">${escape(c.description)}</textarea></div></details></section>`,
  )
  .join(
    "",
  )}<p>原生画面来自 PR70 的实际安装版本。新增宣传文案按语言改写；原有 App 词库的审校边界见包内说明。本资料尚未上传商店。桌面图片为实际生产 Web 界面。</p></main><script>if(location.protocol==='file:')document.querySelectorAll('.online-only').forEach(e=>e.style.display='none');function copy(b){const e=b.parentElement.nextElementSibling;e.select();e.setSelectionRange(0,e.value.length);try{document.execCommand('copy');b.textContent='已复制'}catch{}setTimeout(()=>b.textContent='复制',1200)}</script></html>`;
fs.writeFileSync(path.join(dir, "打开预览.html"), html);
console.log("Prepared 11 localized galleries, credits and thumbnails");
