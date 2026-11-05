import {
  calculator,
  close,
  film,
  menu,
  photo,
  settle,
} from "./capture-scenarios.mjs";
export async function nativeScenarios(app) {
  if (await app.visible("#win-rate-picker"))
    await app.click("#win-rate-picker-back");
  if (await app.visible("#win-rate-dialog"))
    await close(app, "#win-rate-dialog");
  await app.click("#opponents-button");
  await app.select("#language-select", "en");
  await close(app, "#opponents-dialog");
  if ((await app.state()).phase === "idle") {
    await app.nativeTap("#join-table-button");
    await app.waitHero();
  }
  await calculator(app, "en");
  await settle(app, "en");
  const evidence = [];
  for (const locale of ["en", "zh-CN"]) {
    await app.click("#opponents-button");
    await app.select("#language-select", locale);
    await close(app, "#opponents-dialog");
    await app.click("#review-hand-button");
    await app.waitFor(
      () =>
        app.evaluate(
          () =>
            document.querySelector("#review-dialog")?.dataset.analysisStatus ===
            "done",
        ),
      240000,
      "Review must finish before photographing its explanation",
    );
    await film(
      app,
      `${locale}/review`,
      async () => {
        await app.evaluate(() =>
          document
            .querySelector("#review-coach-explanation")
            .scrollIntoView({ block: "start", behavior: "instant" }),
        );
      },
      6500,
    );
    await photo(app, `${locale}/03-review-detail`);
    await close(app, "#review-dialog");
    const entry = {
      locale,
      scope:
        "Completed calculator and scrolled decision reasoning in the existing installed app",
      actualInstalledApp: true,
      injectedGameState: false,
    };
    app.record(entry);
    evidence.push(entry);
  }
  return evidence;
}
