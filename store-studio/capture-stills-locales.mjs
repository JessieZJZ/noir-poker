import { close, menu, photo, calculator } from "./capture-scenarios.mjs";
export async function nativeScenarios(app) {
  const finish = async () => {
    const end = Date.now() + 180000;
    while (Date.now() < end) {
      const s = await app.state();
      if (s.phase === "done") return;
      if (s.legal.enabled)
        await app.click(s.board.length >= 3 ? "#fold-button" : "#call-button");
      else if (await app.visible("#continue-deal-button"))
        await app.click("#continue-deal-button");
      else await app.sleep(200);
    }
    throw Error("Normal hand must finish");
  };
  const table = async () => {
    const s = await app.state();
    if (s.phase === "idle") await app.nativeTap("#join-table-button");
    else if (s.phase === "done") await app.click("#restart-hand-button");
    else {
      await finish();
      await app.click("#restart-hand-button");
    }
    await app.waitHero();
  };
  const entries = [];
  let first = true;
  for (const lang of (
    process.env.NOIR_STORE_LOCALES || "zh-CN,en,zh-TW,ja,ko,es,it,pt,de,fr,ru"
  ).split(",")) {
    app.log("Stills " + lang);
    if (app.resetPage) await app.resetPage();
    else if (!first && app.back) {
      await app.back();
      await app.waitFor(
        () => app.evaluate(() => document.body.dataset.recordsPage === "list"),
        20000,
      );
      await app.back();
      await app.waitFor(
        () => app.evaluate(() => document.body.dataset.recordsPage === "game"),
        20000,
      );
    }
    first = false;
    await app.click("#opponents-button");
    await app.select("#language-select", lang);
    await app.evaluate(() =>
      document
        .querySelector("#profile-cards")
        .scrollIntoView({ block: "start", behavior: "instant" }),
    );
    await photo(app, lang + "/06-styles");
    await close(app, "#opponents-dialog");
    await calculator(app, lang);
    await table();
    await app.evaluate(() => window.scrollTo(0, 0));
    await photo(app, lang + "/01-practice");
    await menu(app, "#tutorial-menu-item");
    await app.click("#tutorial-dialog-primary");
    await photo(app, lang + "/02-tutorial");
    await app.click("#tutorial-exit");
    await finish();
    await app.evaluate(() => window.scrollTo(0, 0));
    await photo(app, lang + "/04-result");
    await app.click("#review-hand-button");
    await app.waitFor(
      () =>
        app.evaluate(
          () =>
            document.querySelector("#review-dialog")?.dataset.analysisStatus ===
            "done",
        ),
      240000,
    );
    await photo(app, lang + "/03-review-top");
    await app.evaluate(() =>
      document
        .querySelector("#review-coach-explanation")
        .scrollIntoView({ block: "start", behavior: "instant" }),
    );
    await photo(app, lang + "/03-review-detail");
    await close(app, "#review-dialog");
    await menu(app, "#records-menu-item");
    await app.waitFor(() => app.visible("#records-page"), 20000);
    await photo(app, lang + "/07-records");
    const id = await app.evaluate(
      () => document.querySelector("[data-record-hand]")?.dataset.recordHand,
    );
    if (!id) throw Error("Actual saved hand required");
    await app.click('[data-record-hand="' + id + '"]');
    await app.waitFor(() => app.visible("#history-arena"), 20000);
    await photo(app, lang + "/07-record-detail");
    // The caller opens a fresh native session or resets the Web page per locale.
    // Leave the actual saved-hand detail visible at the end of the capture.
    entries.push({
      locale: lang,
      actualUI: true,
      geometry: await app.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
        language: document.documentElement.lang,
      })),
      snapshots: 10,
    });
    app.record(entries.at(-1));
  }
  return entries;
}
