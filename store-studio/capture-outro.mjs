import assert from "node:assert/strict";
import { photo } from "./capture-scenarios.mjs";

export async function nativeScenarios(app) {
  for (const locale of (process.env.NOIR_STORE_LOCALES || "zh-CN,en").split(
    ",",
  )) {
    assert.equal(
      (await app.state()).phase,
      "idle",
      "Use the first-launch table",
    );
    await app.click("#opponents-button");
    await app.select("#language-select", locale);
    await app.click("#opponents-dialog .icon-button.close-dialog");
    await app.waitFor(async () => {
      const ready = await app.evaluate(() => ({
        locale: document.documentElement.lang,
        ready: document.documentElement.dataset.appReady === "true",
        testMode: Boolean(window.qa),
      }));
      return ready.locale === locale && ready.ready && !ready.testMode;
    }, 20000);
    await app.evaluate(() => window.scrollTo(0, 0));
    assert.equal(await app.visible("#join-table-button"), true);
    await photo(app, `${locale}/08-invitation`);
    app.log(`Captured ${locale} first-launch table`);
  }
}
