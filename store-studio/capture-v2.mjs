import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { film, close, menu, photo, calculator } from "./capture-scenarios.mjs";

// Capture visible controls from the normal installed app; timestamps describe
// editorial cuts, never engine state injection or a fabricated action.
export async function nativeScenarios(app) {
  const output = process.env.NOIR_STORE_OUTPUT;
  const collected = [];
  for (const locale of (process.env.NOIR_STORE_LOCALES || "zh-CN,en").split(
    ",",
  )) {
    app.log(`V2 ${locale}: configuring the real installed app`);
    assert.equal(await app.evaluate(() => Boolean(window.qa)), false);
    await app.click("#opponents-button");
    await app.select("#language-select", locale);
    await photo(app, `${locale}/06-settings`);
    await app.evaluate(() =>
      document
        .querySelector("#profile-cards")
        .scrollIntoView({ block: "start", behavior: "instant" }),
    );
    await photo(app, `${locale}/06-styles`);
    await close(app, "#opponents-dialog");
    const clips = {};
    let active;
    const mark = async (name, selector) => {
      const entry = { name, at: (Date.now() - active.startedAt) / 1000 };
      if (selector)
        entry.target = await app.evaluate((s) => {
          const e = document.querySelector(s),
            r = e.getBoundingClientRect();
          return {
            selector: s,
            x: r.x + r.width / 2,
            y: r.y + r.height / 2,
            width: r.width,
            height: r.height,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
          };
        }, selector);
      active.events.push(entry);
    };
    const tap = async (selector, name) => {
      await app.evaluate(
        (s) =>
          document
            .querySelector(s)
            .scrollIntoView({ block: "nearest", behavior: "instant" }),
        selector,
      );
      await app.sleep(150);
      await mark(name, selector);
      await app.click(selector);
      await mark(`${name}:done`);
    };
    const take = async (name, action, hold = 1800) => {
      active = { name, startedAt: 0, events: [] };
      await film(
        app,
        `${locale}/${name}`,
        async () => {
          active.startedAt = Date.now() - 600;
          await action();
        },
        hold,
      );
      clips[name] = active;
      writeFileSync(
        path.join(output, `${locale}--edit-events.json`),
        JSON.stringify(clips, null, 2),
      );
    };
    const finish = async () => {
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        const s = await app.state();
        if (s.phase === "done") return s;
        if (s.legal.enabled)
          await app.click(
            s.board.length >= 3 ? "#fold-button" : "#call-button",
          );
        else if (await app.visible("#continue-deal-button"))
          await app.click("#continue-deal-button");
        else await app.sleep(300);
      }
      throw Error("The visibly played hand must finish");
    };
    // 1. The tutorial is the opening, with real advancement and a taught action.
    await menu(app, "#tutorial-menu-item");
    await app.click("#tutorial-dialog-primary");
    await photo(app, `${locale}/02-tutorial`);
    await take("tutorial", async () => {
      await app.sleep(700);
      for (let n = 0; n < 80; n++) {
        const t = (await app.state()).tutorial;
        if (t.allowed?.action === "call" || t.allowed?.action === "check") {
          await tap("#call-button", "tutorial-action");
          break;
        }
        if (t.canContinue) await tap("#tutorial-next", "tutorial-continue");
        else if (t.options?.length) break;
        else await app.sleep(250);
      }
      await mark("tutorial-action-visible");
    });
    await app.click("#tutorial-exit");
    let live = await app.state();
    if (live.phase === "idle") await app.nativeTap("#join-table-button");
    else {
      if (live.phase !== "done") await finish();
      await app.click("#next-button");
    }
    await app.waitHero();
    const original = await app.state();
    await photo(app, `${locale}/01-practice`);
    let before, after;
    // 2. A genuine action followed by the live, updating hand activity list.
    await take(
      "practice",
      async () => {
        before = await app.evaluate(
          () => document.querySelector("#activity-list").textContent,
        );
        await app.sleep(700);
        await tap("#call-button", "live-action");
        await app.evaluate(() =>
          document
            .querySelector(".activity-card")
            .scrollIntoView({ block: "start", behavior: "instant" }),
        );
        await mark("activity-visible");
        await app.waitFor(
          async () =>
            (await app.evaluate(
              () => document.querySelector("#activity-list").textContent,
            )) !== before,
          10000,
          "Live activity must change after a real action",
        );
        await app.sleep(1300);
        after = await app.evaluate(
          () => document.querySelector("#activity-list").textContent,
        );
        await mark("activity-updated");
        await photo(app, `${locale}/01-activity`);
      },
      2200,
    );
    await finish();
    await photo(app, `${locale}/04-result`);
    let correction;
    // 3. Start on the completed hand, tap Review, then show its reasoning.
    await take(
      "review",
      async () => {
        await app.evaluate(() =>
          window.scrollTo({ top: 0, behavior: "instant" }),
        );
        await app.sleep(700);
        await tap("#review-hand-button", "open-review");
        await app.waitFor(
          () =>
            app.evaluate(
              () =>
                document.querySelector("#review-dialog")?.dataset
                  .analysisStatus === "done",
            ),
          240000,
          "Review must finish",
        );
        correction = await app.evaluate(() => {
          const choices = [
            ...document.querySelectorAll("#review-timeline button"),
          ].map((e) => ({
            index: e.dataset.reviewIndex,
            status: e.querySelector(".review-status")?.textContent || "",
            street: e.querySelector("small")?.textContent || "",
            actual: e.querySelector("strong")?.textContent || "",
          }));
          for (const c of choices) {
            const action = /Fold|弃牌/i.test(c.status)
              ? "fold"
              : /Check|过牌/i.test(c.status)
                ? "check"
                : /Raise|Bet|加注|下注/i.test(c.status)
                  ? "raise"
                  : /Call|跟注/i.test(c.status)
                    ? "call"
                    : null;
            if (!action) continue;
            const matches = [...c.status.matchAll(/([\d,.]+)\s*([kKmM])?/g)],
              m = matches.at(-1);
            return {
              ...c,
              action,
              amount: m
                ? Number(m[1].replaceAll(",", "")) *
                  (m[2]?.toLowerCase() === "k"
                    ? 1000
                    : m[2]?.toLowerCase() === "m"
                      ? 1000000
                      : 1)
                : null,
              boardCount: /Preflop|翻牌前/i.test(c.street)
                ? 0
                : /Flop|翻牌/i.test(c.street)
                  ? 3
                  : /Turn|转牌/i.test(c.street)
                    ? 4
                    : 5,
              concreteAdvice: true,
            };
          }
          return { action: "fold", boardCount: 0, concreteAdvice: false };
        });
        if (correction.index !== undefined)
          await app.click(`[data-review-index="${correction.index}"]`);
        await mark("review-ready");
        await photo(app, `${locale}/03-review-top`);
        await app.evaluate(() =>
          document
            .querySelector("#review-coach-explanation")
            .scrollIntoView({ block: "start", behavior: "instant" }),
        );
        await mark("reason-visible");
        await photo(app, `${locale}/03-review-detail`);
      },
      2500,
    );
    await close(app, "#review-dialog");
    // 4. Preserve the before/after button transition and actually choose anew.
    let replay;
    await take(
      "retry",
      async () => {
        await app.sleep(800);
        await tap("#restart-hand-button", "start-replay");
        await app.waitHero();
        replay = await app.state();
        assert.deepEqual(
          replay.hole,
          original.hole,
          "Replay must restore the same hole cards",
        );
        await mark("replay-dealt");
        await photo(app, `${locale}/04-retry`);
        const targetDeadline = Date.now() + 180000;
        while ((await app.state()).board.length < correction.boardCount) {
          if (Date.now() > targetDeadline)
            throw Error(
              "Replay must reach the reviewed street through normal actions",
            );
          await app.waitHero();
          await app.click("#call-button");
        }
        await app.waitHero();
        if (correction.action === "raise" && correction.amount) {
          await app.evaluate((amount) => {
            const input = document.querySelector("#bet-slider");
            if (
              !input ||
              amount < Number(input.min) ||
              amount > Number(input.max)
            )
              throw Error("Reviewed amount must fit the visible raise control");
            input.value = String(amount);
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }, correction.amount);
        }
        await app.sleep(800);
        await tap(
          correction.action === "fold"
            ? "#fold-button"
            : correction.action === "raise"
              ? "#raise-button"
              : "#call-button",
          "different-decision",
        );
        correction.executedAction = (await app.state()).players.find(
          (p) => p.id === 0,
        ).lastAction;
        await mark("different-decision-visible");
      },
      1300,
    );
    await finish();
    // 5. Navigate from the table to the real records list and saved hand detail.
    await take(
      "records",
      async () => {
        await app.sleep(700);
        await tap("#rules-button", "open-menu");
        await tap("#records-menu-item", "open-records");
        await app.waitFor(
          () =>
            app.evaluate(() => !document.querySelector("#records-page").hidden),
          20000,
        );
        await mark("records-list-visible");
        await photo(app, `${locale}/07-records`);
        const id = await app.waitFor(
          () =>
            app.evaluate(
              () =>
                document.querySelector("[data-record-hand]")?.dataset
                  .recordHand,
            ),
          20000,
        );
        await app.sleep(1000);
        await tap(`[data-record-hand="${id}"]`, "open-record-detail");
        await app.waitFor(() => app.visible("#history-arena"), 20000);
        await mark("record-detail-visible");
        await photo(app, `${locale}/07-record-detail`);
      },
      2500,
    );
    await app.click(".brand");
    await app.waitFor(
      () =>
        app.evaluate(
          () => document.documentElement.dataset.appReady === "true",
        ),
      30000,
    );
    // 6. Actual card picker input and computed odds, not a drawn calculator.
    await calculator(app, locale);
    const evidence = {
      locale,
      actualInstalledApp: true,
      injectedGameState: false,
      liveActivity: { before, after, changed: before !== after },
      replay: {
        originalHole: original.hole,
        retriedHole: replay.hole,
        originalAction: "call/check",
        replayedAction: correction.action,
        correction,
      },
      records: "Opened actual saved list and hand detail through UI",
      clips,
      completedAt: new Date().toISOString(),
    };
    collected.push(evidence);
    app.record(evidence);
    writeFileSync(
      path.join(output, "capture-evidence-v2.json"),
      JSON.stringify(collected, null, 2),
    );
  }
  return collected;
}
