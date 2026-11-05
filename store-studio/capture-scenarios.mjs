import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const output = process.env.NOIR_STORE_OUTPUT;
const device = process.env.NOIR_STORE_DEVICE;
const adb = process.env.ANDROID_HOME
  ? path.join(process.env.ANDROID_HOME, "platform-tools/adb")
  : "adb";
const run = (bin, args) => {
  const r = spawnSync(bin, args, { encoding: "utf8", timeout: 120000 });
  if (r.status !== 0) throw Error(`${bin}: ${r.stderr || r.error}`);
  return r.stdout.trim();
};

export async function film(app, name, action, hold = 3500) {
  if (process.env.NOIR_STORE_STILLS_ONLY === "1") return action();
  const destination = path.join(output, `${name}.mp4`);
  mkdirSync(path.dirname(destination), { recursive: true });
  const remote = `/sdcard/noir-store-${name.replaceAll("/", "-")}.mp4`;
  const proc =
    app.platform === "ios"
      ? spawn("xcrun", [
          "simctl",
          "io",
          device,
          "recordVideo",
          "--codec=h264",
          "--force",
          destination,
        ])
      : spawn(adb, [
          "-s",
          device,
          "shell",
          "screenrecord",
          "--bit-rate",
          "12000000",
          remote,
        ]);
  let log = "";
  proc.stderr.on("data", (data) => {
    log += data;
  });
  const exited = new Promise((resolve) => proc.on("exit", resolve));
  await app.sleep(600);
  try {
    await action();
    await app.sleep(hold);
  } finally {
    if (app.platform === "ios") proc.kill("SIGINT");
    else {
      const pid = run(adb, ["-s", device, "shell", "pidof", "screenrecord"]);
      if (!/^\d+$/.test(pid)) throw Error(`Unexpected recorder PID: ${pid}`);
      run(adb, ["-s", device, "shell", "kill", "-2", pid]);
    }
    const code = await exited;
    if (code !== 0 && code !== null && code !== 130)
      throw Error(`Recorder failed: ${log}`);
    if (app.platform === "android") {
      run(adb, ["-s", device, "pull", remote, destination]);
      run(adb, ["-s", device, "shell", "rm", remote]);
    }
  }
  app.log(`Recorded ${name}`);
}

export async function close(app, selector) {
  await app.click(`${selector} .icon-button.close-dialog`);
}
export async function menu(app, selector) {
  await app.click("#rules-button");
  await app.click(selector);
}
export async function photo(app, name) {
  await app.sleep(800);
  const result = await app.screenshot(name.replaceAll("/", "--"));
  return result.imagePath;
}
export async function settle(app, locale) {
  const deadline = Date.now() + 240000;
  let photographed = false;
  while (Date.now() < deadline) {
    const state = await app.state();
    if (state.phase === "done") return state;
    if (!photographed && state.board.length >= 3 && state.legal.enabled) {
      await photo(app, `${locale}/01-practice`);
      photographed = true;
    }
    if (state.legal.enabled)
      await app.click(
        app.platform === "android" && state.board.length >= 3
          ? "#fold-button"
          : "#call-button",
      );
    else if (await app.visible("#continue-deal-button"))
      await app.click("#continue-deal-button");
    else await app.sleep(500);
  }
  throw Error("The naturally dealt hand did not settle");
}

async function tutorial(app, locale) {
  await menu(app, "#tutorial-menu-item");
  await photo(app, `${locale}/02-tutorial-intro`);
  await app.click("#tutorial-dialog-primary");
  await photo(app, `${locale}/02-tutorial`);
  await film(app, `${locale}/tutorial`, async () => {
    const deadline = Date.now() + 40000;
    let acted = false;
    while (Date.now() < deadline) {
      const view = (await app.state()).tutorial;
      if (view.allowed?.action === "call" || view.allowed?.action === "check") {
        await app.sleep(800);
        await app.click("#call-button");
        acted = true;
      } else if (acted) break;
      else if (view.canContinue) {
        await app.sleep(600);
        await app.click("#tutorial-next");
      } else if (view.options?.length) break;
      else await app.sleep(300);
    }
  });
  await app.click("#tutorial-exit");
}

export async function calculator(app, locale) {
  await menu(app, "#win-rate-menu-item");
  await app.click("#win-rate-clear");
  const pick = async (...cards) => {
    for (const card of cards) await app.click(`[data-pick="${card}"]`);
  };
  await app.click('[data-player="0"][data-card="0"]');
  await pick("0-14", "0-13");
  await app.click('[data-player="1"][data-card="0"]');
  await pick("2-12", "1-12");
  await app.click('[data-board="0"]');
  await pick("0-11", "0-10", "2-2");
  await app.waitFor(
    () =>
      app.evaluate(
        () =>
          document
            .querySelector(".win-rate-odds-values")
            ?.textContent.includes("%") &&
          document.querySelector(".win-rate-outs-heading")?.textContent.trim(),
      ),
    90000,
    "Calculator must display completed odds and outs",
  );
  await photo(app, `${locale}/05-calculator`);
  await film(
    app,
    `${locale}/calculator`,
    async () => {
      await app.click('[data-board="3"]');
      await pick("0-9");
      await app.sleep(2000);
    },
    5000,
  );
  await close(app, "#win-rate-dialog");
}

export async function nativeScenarios(app) {
  const evidence = [];
  for (const locale of (process.env.NOIR_STORE_LOCALES || "zh-CN,en").split(
    ",",
  )) {
    app.log(`Capturing ${locale} on ${app.platform}`);
    const initial = await app.state();
    assert.ok(
      !(await app.evaluate(() => Boolean(window.qa))),
      "No production QA fixture API",
    );
    await app.click("#opponents-button");
    await app.select("#language-select", locale);
    if (
      !(await app.evaluate(
        () =>
          document
            .querySelector("#mix-opponents")
            .getAttribute("aria-pressed") === "true",
      ))
    )
      await app.click("#mix-opponents");
    await photo(app, `${locale}/06-settings`);
    await app.evaluate(() =>
      document
        .querySelector("#profile-cards")
        .scrollIntoView({ block: "start", behavior: "instant" }),
    );
    await photo(app, `${locale}/06-styles`);
    await close(app, "#opponents-dialog");
    if (initial.phase === "idle") {
      await film(app, `${locale}/practice`, async () => {
        await app.nativeTap("#join-table-button");
        await app.waitHero();
      });
    } else {
      if (initial.phase !== "done") await settle(app, locale);
      await app.click("#next-button");
      await app.waitHero();
      await film(
        app,
        `${locale}/practice`,
        async () => {
          await app.click("#call-button");
        },
        7000,
      );
    }
    await photo(app, `${locale}/01-practice`);
    const finished = await settle(app, locale);
    await photo(app, `${locale}/04-result`);
    await app.click("#review-hand-button");
    await app.waitFor(
      () =>
        app.evaluate(() => {
          return (
            document.querySelector("#review-dialog")?.dataset.analysisStatus ===
              "done" &&
            document
              .querySelector("#review-coach-explanation")
              ?.textContent.trim()
          );
        }),
      240000,
      "Decision review must complete",
    );
    await photo(app, `${locale}/03-review`);
    await film(
      app,
      `${locale}/review`,
      async () => {
        const buttons = await app.evaluate(
          () => document.querySelectorAll("#review-timeline button").length,
        );
        if (buttons > 1)
          await app.click("#review-timeline button:nth-child(2)");
        await app.evaluate(() =>
          document
            .querySelector("#review-coach-explanation")
            .scrollIntoView({ block: "start", behavior: "instant" }),
        );
      },
      5000,
    );
    await photo(app, `${locale}/03-review-detail`);
    await close(app, "#review-dialog");
    await film(app, `${locale}/retry`, async () => {
      await app.click("#restart-hand-button");
      await app.waitHero();
    });
    const retried = await app.state();
    assert.deepEqual(
      retried.hole,
      finished.hole,
      "Retry keeps the original hole cards",
    );
    await photo(app, `${locale}/04-retry`);
    await tutorial(app, locale);
    await calculator(app, locale);
    evidence.push({
      locale,
      platform: app.platform,
      actualInstalledApp: true,
      injectedGameState: false,
      tutorial: "Opened and played through visible tutorial controls",
      replay: { originalHole: finished.hole, retriedHole: retried.hole },
      calculator:
        "Entered cards through visible picker; odds and outs appeared",
      completedAt: new Date().toISOString(),
    });
    app.record(evidence.at(-1));
  }
  writeFileSync(
    path.join(output, "capture-evidence.json"),
    JSON.stringify(evidence, null, 2),
  );
  return evidence;
}
