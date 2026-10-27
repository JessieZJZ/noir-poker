import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { themes } from './manifest.mjs';
const output = '.artifacts/art-direction-pr64/green-v2';
const sizes = [
  { id: 'web-320', device: 'mobile', w: 320, h: 568, top: 0, bottom: 0 },
  { id: 'se-320', device: 'ios', w: 320, h: 568, top: 20, bottom: 0 },
  { id: 'app-360', device: 'android', w: 360, h: 640, top: 24, bottom: 24 },
  { id: 'web-375', device: 'mobile', w: 375, h: 667, top: 0, bottom: 0 },
  { id: 'web-390', device: 'mobile', w: 390, h: 844, top: 0, bottom: 0 },
  { id: 'ios-393', device: 'ios', w: 393, h: 852, top: 59, bottom: 34 },
  { id: 'wechat-393', device: 'wechat', w: 393, h: 852, top: 88, bottom: 34 },
  { id: 'android-412', device: 'android', w: 412, h: 915, top: 28, bottom: 24 },
  { id: 'tablet-768', device: 'tablet', w: 768, h: 1024, top: 24, bottom: 20 },
  { id: 'tablet-1194', device: 'tablet', w: 1194, h: 834, top: 24, bottom: 20 },
  { id: 'desktop-1280', device: 'desktop', w: 1280, h: 720, top: 0, bottom: 0 },
  { id: 'desktop-1440', device: 'desktop', w: 1440, h: 1000, top: 0, bottom: 0 },
  { id: 'desktop-1920', device: 'desktop', w: 1920, h: 1080, top: 0, bottom: 0 },
];
const browser = await chromium.launch();
let next = 0;
const records = [];
const jobs = themes.flatMap((t) => sizes.flatMap((d) => [5, 6, 7, 8, 9].map((n) => ({ t, d, n }))));
async function work() {
  const p = await browser.newPage({ deviceScaleFactor: 1 });
  while (next < jobs.length) {
    const { t, d, n } = jobs[next++];
    await p.setViewportSize({ width: d.w, height: d.h });
    await p.goto(
      `http://127.0.0.1:4394/screen.html?theme=${t.id}&device=${d.device}&screen=table${n}&safeTop=${d.top}&safeBottom=${d.bottom}&notch=${d.id === 'se-320' ? 'none' : 'default'}`,
      { waitUntil: 'networkidle' },
    );
    await p.waitForFunction(() => document.body.dataset.ready === 'true');
    const m = await p.evaluate(() => {
      const box = (e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
      };
      const text = (sel) =>
        [...document.querySelectorAll(sel)].map((e) => ({
          font: parseFloat(getComputedStyle(e).fontSize),
          ...box(e),
          scroll: e.scrollWidth,
          client: e.clientWidth,
        }));
      return {
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        players: [...document.querySelectorAll('.player')].map(box),
        seats: [...document.querySelectorAll('.seat')].map(box),
        board: [...document.querySelectorAll('.board .card')].map(box),
        hero: [...document.querySelectorAll('.hero-cards .card')].map(box),
        pot: box(document.querySelector('.pot')),
        chips: [...document.querySelectorAll('.chip')].map(box).filter((r) => r.w > 0),
        potGlyphs: [...document.querySelectorAll('.pot>span,.pot>strong')].map((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return box(range);
        }),
        potClear: [...document.querySelectorAll('.pot>span,.pot>strong')].every((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const r = range.getBoundingClientRect();
          return [
            [r.left + r.width * 0.2, r.top + r.height * 0.5],
            [r.left + r.width * 0.8, r.top + r.height * 0.5],
          ].every(([x, y]) => document.elementFromPoint(x, y)?.closest('.pot'));
        }),
        rank: box(document.querySelector('.hero-rank')),
        actionTop: document.querySelector('.action-area').getBoundingClientRect().top,
        home: !!document.querySelector('.home-indicator'),
        touch: [
          ...document.querySelectorAll(
            'header button,.size-open,.pot>.quiet,.preset,.practice .quiet,.action-area input',
          ),
        ]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
          })
          .map(box),
        actions: [...document.querySelectorAll('.action-buttons button')].map(box),
        name: text('.identity>strong'),
        amount: text('.identity>b'),
        style: text('.style-label'),
        lastAction: text('.seat-action'),
        arena: box(document.querySelector('.felt-area')),
        assets: [...document.images].every((i) => i.complete && i.naturalWidth),
        safe:
          innerHeight -
          parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bottom')),
      };
    });
    const faults = [];
    if (!m.potClear) faults.push('pot text occluded');
    if (m.rank.bottom > m.actionTop - 1) faults.push('hero rank under actions');
    if (d.bottom === 0 && m.home) faults.push('unexpected home indicator');
    if (
      m.chips.length &&
      Math.min(...m.hero.map((r) => r.y)) - Math.max(...m.chips.map((r) => r.bottom)) < 15.9
    )
      faults.push('visible chips/hero clearance');
    if (d.device !== 'desktop')
      for (const t of m.touch) if (t.h < 47.9 || t.w < 47.9) faults.push('touch target under 48');
    const hit = (a, b, g = 0) =>
      Math.min(a.right, b.right) + g > Math.max(a.x, b.x) &&
      Math.min(a.bottom, b.bottom) + g > Math.max(a.y, b.y);
    if (m.width !== m.scroll) faults.push('horizontal overflow');
    if (!m.assets) faults.push('broken image');
    for (const a of m.players) if (a.x < -0.5 || a.right > d.w + 0.5) faults.push('seat clipped');
    for (let i = 0; i < m.players.length; i++)
      for (let j = i + 1; j < m.players.length; j++)
        if (hit(m.players[i], m.players[j], 2)) faults.push('player overlap');
    for (const a of m.board) {
      for (const b of m.players) if (hit(a, b, 4)) faults.push('board/player clearance');
      for (const b of m.hero) if (hit(a, b, 7)) faults.push('board/hero clearance');
    }
    for (const a of m.actions) {
      if (a.h < 47.9) faults.push('action target under 48');
      if (a.bottom > m.safe + 0.5) faults.push('action beyond safe area');
    }
    for (const a of [...m.name, ...m.amount]) if (a.font < 11) faults.push('name/amount font');
    for (const a of [...m.style, ...m.lastAction])
      if (a.font < 10) faults.push('style/action font');
    const folder = `${output}/fit/${t.id}/${d.id}`;
    await mkdir(folder, { recursive: true });
    await p.screenshot({
      path: folder + `/table${n}.jpg`,
      type: 'jpeg',
      quality: 90,
      animations: 'disabled',
    });
    records.push({
      theme: t.id,
      size: d.id,
      count: n,
      dimensions: d,
      faults: [...new Set(faults)],
      metrics: m,
    });
    if (faults.length) console.log(t.id, d.id, n, [...new Set(faults)].join(','));
  }
  await p.close();
}
await Promise.all(Array.from({ length: 3 }, work));
await browser.close();
await writeFile(
  output + '/responsive-audit.json',
  JSON.stringify(
    {
      sizes,
      total: records.length,
      passed: records.every((r) => !r.faults.length),
      results: records,
    },
    null,
    2,
  ),
);
console.log(
  'Responsive matrix',
  records.length,
  'cases;',
  records.filter((r) => r.faults.length).length,
  'with faults',
);
if (records.some((r) => r.faults.length)) process.exitCode = 1;
