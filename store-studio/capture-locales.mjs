import assert from "node:assert/strict";
import { writeFileSync, copyFileSync } from "node:fs";
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
    app.log(`V6 ${locale}: configuring the real installed app`);
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
    const finish = async ({ freeFold = false } = {}) => {
      await app.evaluate(() => window.scrollTo(0, 0));
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        const s = await app.state();
        if (s.phase === "done") return s;
        if (s.legal.enabled)
          await app.click(
            s.board.length >= 3 && (!freeFold || s.legal.canCheck)
              ? "#fold-button"
              : "#call-button",
          );
        else await app.sleep(300);
      }
      const details = await app.state();
      writeFileSync(
        path.join(output, locale + "--unfinished-state.json"),
        JSON.stringify(details, null, 2),
      );
      throw Error(
        "The visibly played hand must finish: " +
          JSON.stringify({ phase: details.phase, legal: details.legal }),
      );
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
    const nextHero = async () => {
      for (let n = 0; n < 35; n++) {
        const s = await app.waitFor(async () => {
          const s = await app.state();
          return s.phase === "done" || s.legal.enabled ? s : null;
        }, 90000);
        if (s.phase !== "done") return s;
        await app.click("#next-button");
      }
      throw Error("A normal actionable hand is required");
    };
    await nextHero();
    if (process.env.NOIR_STORE_TARGET_SEAT) {
      let found = false;
      for (let n = 0; n < 25; n++) {
        const s = await app.state();
        if (
          s.players.find((p) => p.id === 0).position ===
            process.env.NOIR_STORE_TARGET_SEAT &&
          s.legal.enabled &&
          s.legal.callAmount < s.stack / 2
        ) {
          found = true;
          break;
        }
        if (s.legal.enabled) await app.click("#fold-button");
        await finish();
        await app.click("#next-button");
        await nextHero();
      }
      if (!found)
        throw Error(
          "A normal playable hand in the selected public position is required",
        );
    }
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
    await finish({ freeFold: process.env.NOIR_STORE_CORRECTION_DEMO === "1" });
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
          choices.sort(
            (a, b) =>
              Number(
                /Check|过牌|過牌|チェック|체크|pasar|passar|checken|parole|чек/i.test(
                  b.status,
                ),
              ) -
              Number(
                /Check|过牌|過牌|チェック|체크|pasar|passar|checken|parole|чек/i.test(
                  a.status,
                ),
              ),
          );
          for (const c of choices) {
            const action =
              /Fold|弃牌|棄牌|フォールド|폴드|Retir|tirar|Desist|Passen|couch|Пас|сброс/i.test(
                c.status,
              )
                ? "fold"
                : /Check|过牌|過牌|チェック|체크|pasar|passar|mesa|checken|parole|чек/i.test(
                      c.status,
                    )
                  ? "check"
                  : /Raise|Bet|加注|下注|レイズ|ベット|레이즈|베팅|subir|aument|mise|relanc|erhöh|став|рейз/i.test(
                        c.status,
                      )
                    ? "raise"
                    : /Call|跟注|コール|콜|igual|pagar|suivre|mitgeh|колл/i.test(
                          c.status,
                        )
                      ? "call"
                      : null;
            if (!action) continue;
            const matches = [...c.status.matchAll(/([\d,.]+)\s*([kKmM])?/g)],
              m = matches.at(-1);
            return {
              ...c,
              action,
              amount: m
                ? Number(m[1].replaceAll(",", ".")) *
                  (m[2]?.toLowerCase() === "k"
                    ? 1000
                    : m[2]?.toLowerCase() === "m"
                      ? 1000000
                      : 1)
                : null,
              boardCount:
                /Pre.?flop|翻牌前|プリフロップ|프리플[랍롭]|pré.?flop|префлоп/i.test(
                  c.street,
                )
                  ? 0
                  : /Flop|翻牌|フロップ|플[랍롭]|флоп/i.test(c.street)
                    ? 3
                    : /Turn|转牌|轉牌|ターン|턴|tournant|т[её]рн/i.test(
                          c.street,
                        )
                      ? 4
                      : 5,
              concreteAdvice: true,
            };
          }
          return { action: "fold", boardCount: 0, concreteAdvice: false };
        });
        if (
          process.env.NOIR_STORE_CORRECTION_DEMO === "1" &&
          !correction.concreteAdvice
        )
          throw Error(
            "A visible, specific review suggestion is required for this correction demonstration",
          );
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
    let replay,
      corrected = false;
    const rejectedReplayAttempts = [];
    for (let attempt = 1; attempt <= 8 && !corrected; attempt++) {
      let unavailable = "";
      await take(
        "retry",
        async () => {
          await app.sleep(800);
          await tap("#restart-hand-button", "start-replay");
          replay = await app.waitFor(async () => {
            const s = await app.state();
            return s.phase === "done" || s.legal.enabled ? s : null;
          }, 90000);
          if (replay.phase === "done") {
            unavailable = "Opponents completed the replay before a hero action";
            return;
          }
          assert.deepEqual(
            replay.hole,
            original.hole,
            "Replay must restore the same hole cards",
          );
          await mark("replay-dealt");
          await photo(app, `${locale}/04-retry`);
          const targetDeadline = Date.now() + 180000;
          while (true) {
            if (Date.now() > targetDeadline)
              throw Error(
                "Replay must reach the reviewed street through normal actions",
              );
            const ready = await app.waitFor(async () => {
              const s = await app.state();
              return s.phase === "done" || s.legal.enabled ? s : null;
            }, 90000);
            if (ready.phase === "done") {
              unavailable = "Hand completed before the reviewed decision";
              return;
            }
            if (ready.board.length === correction.boardCount) break;
            if (ready.board.length > correction.boardCount) {
              unavailable = "Reviewed street passed";
              return;
            }
            await app.click("#call-button");
          }
          const current = await app.state();
          if (correction.action === "check" && !current.legal.canCheck) {
            unavailable =
              "Opponent actions changed; a free check is no longer available";
            return;
          }
          if (correction.action === "call" && current.legal.canCheck) {
            unavailable =
              "This attempt offers check rather than the reviewed call";
            return;
          }
          if (
            correction.action === "raise" &&
            (!current.legal.canRaise ||
              correction.amount < current.legal.minRaiseTo ||
              correction.amount > current.legal.maxRaiseTo)
          ) {
            unavailable =
              "Reviewed raise is outside this attempt's visible legal range";
            return;
          }
          if (correction.action === "raise" && correction.amount) {
            await app.evaluate(() =>
              document
                .querySelector("#raise-button")
                .scrollIntoView({ block: "nearest", behavior: "instant" }),
            );
            const bounds = await app.evaluate(() => {
              const e = document.querySelector("#bet-slider");
              return { min: Number(e.min), max: Number(e.max) };
            });
            let low = bounds.min,
              high = bounds.max,
              matched = false;
            // Slider values are positions, not chip amounts. Use the visible UI's
            // own displayed raise total to find the requested legal amount.
            for (let i = 0; i < 14 && low <= high; i++) {
              const position = Math.floor((low + high) / 2);
              const shown = await app.evaluate((p) => {
                const e = document.querySelector("#bet-slider");
                e.value = String(p);
                e.dispatchEvent(new Event("input", { bubbles: true }));
                return Number(e.dataset.raiseTo);
              }, position);
              if (shown === correction.amount) {
                matched = true;
                break;
              }
              if (shown < correction.amount) low = position + 1;
              else high = position - 1;
            }
            if (!matched)
              throw Error(
                "The visible slider must offer the reviewed raise amount",
              );
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
          correction.executedBoardCount = (await app.state()).board.length;
          const expectedStreet = [0, 3, 4, 5].indexOf(correction.boardCount);
          if (correction.executedAction.street !== expectedStreet)
            throw Error("Correction must happen on the reviewed street");
          if (
            correction.action === "raise" &&
            correction.amount &&
            correction.executedAction.bet !== correction.amount
          )
            throw Error("Visible raise must match the chosen reviewed amount");
          const expectedText = {
            check: /^过牌/,
            call: /^跟注/,
            fold: /^弃牌/,
            raise: /下注|加注|开池|全下/,
          }[correction.action];
          if (!expectedText.test(correction.executedAction.text))
            throw Error(
              "Recorded action must match the visible review suggestion",
            );
          corrected = true;
          await mark("different-decision-visible");
        },
        1300,
      );
      if (!corrected) {
        rejectedReplayAttempts.push({
          attempt,
          reason: unavailable,
          clips: clips.retry,
        });
        copyFileSync(
          path.join(output, locale, "retry.mp4"),
          path.join(output, locale, "retry-rejected-" + attempt + ".mp4"),
        );
        writeFileSync(
          path.join(output, locale + "--rejected-replay-attempts.json"),
          JSON.stringify(rejectedReplayAttempts, null, 2),
        );
        await finish();
      }
    }
    if (!corrected)
      throw Error("A replay with the visible reviewed action must be captured");
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
                [...document.querySelectorAll("[data-record-hand]")].at(-1)
                  ?.dataset.recordHand,
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
        rejectedReplayAttempts,
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
