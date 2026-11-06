import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { nativeScenarios } from "./capture-stills-locales.mjs";
const output = path.resolve(
  process.env.NOIR_STORE_OUTPUT || ".artifacts/store-media-v6/raw/desktop",
);
mkdirSync(output, { recursive: true });
process.env.NOIR_STORE_OUTPUT = output;
process.env.NOIR_STORE_STILLS_ONLY = "1";
const browser = await chromium.launch({
  headless: true,
  executablePath: path.resolve(
    "store-studio/node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell",
  ),
});
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const report = {
  platform: "production-web-desktop",
  actualInstalledApp: false,
  injectedGameState: false,
  scenarios: [],
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, timeout = 30000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(160);
  }
  throw Error("UI wait timed out");
};
try {
  await page.goto("http://127.0.0.1:4412");
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
  if (await page.evaluate(() => Boolean(window.qa)))
    throw Error("Production-only capture required");
  const app = {
    platform: "web",
    sleep,
    waitFor,
    state: () => page.evaluate(() => window.noir.getState()),
    evaluate: (fn, ...args) =>
      page.evaluate("(" + fn.toString() + ")(..." + JSON.stringify(args) + ")"),
    visible: (s) => page.locator(s).isVisible(),
    log: console.log,
    record: (e) => report.scenarios.push(e),
  };
  app.click = async (s) => {
    await page.locator(s).click({ timeout: 30000 });
    await sleep(100);
  };
  app.nativeTap = app.click;
  app.resetPage = async () => {
    await page.goto("http://127.0.0.1:4412");
    await page.waitForFunction(
      () => document.documentElement.dataset.appReady === "true",
    );
  };
  app.select = async (s, v) => {
    if ((await page.locator(s).inputValue()) === v) return;
    await app.click(s + " + .dropdown-trigger");
    await app.click('.dropdown-option[data-value="' + v + '"]');
    await waitFor(() =>
      page.evaluate(({ s, v }) => document.querySelector(s).value === v, {
        s,
        v,
      }),
    );
  };
  app.waitHero = () =>
    waitFor(async () => {
      const s = await app.state();
      return s.phase !== "done" && s.legal.enabled;
    }, 90000);
  app.screenshot = async (name) => {
    const file = path.join(output, name + ".png");
    await page.screenshot({ path: file });
    return { imagePath: file };
  };
  await nativeScenarios(app);
  report.status = "captured";
} catch (e) {
  report.status = "failed";
  report.error = e.stack;
  await page.screenshot({ path: path.join(output, "failure.png") });
  report.dom = await page.evaluate(() => ({
    html: document.documentElement.lang,
    ready: document.documentElement.dataset.appReady,
    buttons: [...document.querySelectorAll("button")]
      .filter((b) => b.getClientRects().length)
      .map((b) => ({ id: b.id, text: b.textContent })),
    state: window.noir?.getState(),
  }));
  throw e;
} finally {
  writeFileSync(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
