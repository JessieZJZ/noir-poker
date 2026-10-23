import assert from 'node:assert/strict';
import { readTableLayout, assertTableLayout } from './layout.mjs';
import { readCardRankState, readNativeRankInk, assertStableRankInk } from './card-ranks.mjs';
import {
  readRecordTableGeometry,
  recordGeometryDifferences,
} from '../fixtures/records-geometry.js';
import { nativePageReady } from '../../scripts/native-back.mjs';
import { withCenteredNativeClicks } from './position-target.mjs';
import { withPreservedForegroundPage } from './foreground-page.mjs';
import { watchNativeMusicLoop } from './music-loop-probe.mjs';
import { pressSelectedAndroidHome } from './immediate-background.mjs';
import { readActionNoticeSpacing } from '../fixtures/action-notice-spacing.js';
import { BOT_THINK_LIMITS } from '../../src/engine/bot-timing.js';
import { readReviewTagGeometry } from '../fixtures/review-tag-geometry.js';
async function enterNativeTable(app) {
  if ((await app.state()).phase !== 'idle') return;
  await app.click('#join-table-button');
  await app.waitFor(
    async () => (await app.state()).entryState === 'playing',
    10000,
    'The entry deal must finish before play',
  );
}

async function waitForNativeGuidePaint(app) {
  // DOM geometry can precede UIKit's composited dialog and scroll frame.
  await app.evaluate(() => {
    window.__nativeGuidePainted = false;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.__nativeGuidePainted = true;
      }),
    );
  });
  await app.waitFor(
    () => app.evaluate(() => window.__nativeGuidePainted),
    5000,
    'The guide must paint before the native screenshot',
  );
  await app.sleep(750);
}

export async function waitForNativeHeroTurn(app, { now = Date.now, advanceSettled = false } = {}) {
  const started = now();
  await enterNativeTable(app);
  const { playerCount } = await app.state();
  // An eight-player reset can have seven sequential, genuine bot pauses.
  // Budget those configured pauses rather than assuming one 20-second turn.
  // This changes no application timers or analysis workload.
  const timeoutMs = (playerCount - 1) * BOT_THINK_LIMITS.maximum + 10000;
  const observations = [];
  let advancedSettlement = false;
  try {
    await app.waitFor(
      async () => {
        const snapshot = await app.evaluate(() => {
          const game = window.noir.getState();
          return {
            hand: game.hand,
            phase: game.phase,
            actor: game.actor,
            enabled: game.legal.enabled,
            controlEnabled: !document.querySelector('#call-button').disabled,
          };
        });
        if (JSON.stringify(snapshot) !== JSON.stringify(observations.at(-1)?.state))
          observations.push({ elapsedMs: now() - started, state: snapshot });
        if (advanceSettled && !advancedSettlement && snapshot.phase === 'done') {
          advancedSettlement = true;
          await app.click('#next-button');
          return false;
        }
        return (
          snapshot.phase === 'playing' &&
          snapshot.actor === '你' &&
          snapshot.enabled &&
          snapshot.controlEnabled
        );
      },
      timeoutMs,
      'The reset hand must reach the real hero turn',
    );
    return { timeoutMs, elapsedMs: now() - started, observations, advancedSettlement };
  } catch (error) {
    error.turnDiagnostics = { timeoutMs, elapsedMs: now() - started, observations };
    throw error;
  }
}

export async function waitForPendingOpponent(app) {
  // A real opponent can answer before Android's next HTTP state read. Follow
  // the normal UI to the next decision instead of waiting on a hero turn.
  return app.waitFor(
    async () => {
      const game = await app.state();
      if (game.phase === 'playing' && game.actor && game.actor !== '你') return game;
      if (game.phase === 'playing' && game.legal.enabled) await app.click('#call-button');
      else if (game.phase === 'done') await app.click('#next-button');
      else return null;
      // A real native click can finish near the polling deadline. Check the
      // resulting public state now rather than discarding the opponent turn.
      const next = await app.state();
      return next.phase === 'playing' && next.actor && next.actor !== '你' ? next : null;
    },
    15000,
    'Background test needs a pending opponent action',
  );
}

// Keep the installed-app completion assertion and its existing deadline. The
// observations distinguish a working but slow review from a failed WebView or
// an analysis that stopped progressing; they do not authorize a partial pass.
export async function waitForNativeReview(app, { now = Date.now } = {}) {
  const started = now();
  const diagnostics = { timeoutMs: 30000, observations: [], progress: [] };
  let lastSnapshot;
  let lastDone = -1;
  let lastProgressAt = started;
  try {
    const review = await app.waitFor(
      async () => {
        let snapshot;
        try {
          snapshot = await app.evaluate(() => {
            const analysisState = document
              .querySelector('#review-analysis-state')
              ?.textContent.trim();
            const ratio = /正在分析决策\s+(\d+)\s*\/\s*(\d+)/.exec(analysisState || '');
            const retry = document.querySelector('#review-retry');
            return {
              dialogOpen: Boolean(document.querySelector('#review-dialog')?.open),
              analysisState,
              done: ratio ? Number(ratio[1]) : null,
              total: ratio ? Number(ratio[2]) : null,
              decisionCount: document.querySelectorAll('#review-timeline .review-step').length,
              retryVisible: Boolean(retry && !retry.hidden),
              analysisStatus: document.querySelector('#review-dialog')?.dataset.analysisStatus,
              decisionTitle: document.querySelector('#review-detail-title')?.textContent.trim(),
              summaryCount: document.querySelectorAll('.review-summary, #review-overview').length,
              suggestion: document.querySelector('#review-coach-explanation')?.textContent.trim(),
            };
          });
        } catch (error) {
          diagnostics.observations.push({ elapsedMs: now() - started, readError: error.message });
          throw error;
        }
        const elapsedMs = now() - started;
        const key = JSON.stringify(snapshot);
        if (key !== lastSnapshot) {
          diagnostics.observations.push({ elapsedMs, ...snapshot });
          lastSnapshot = key;
        }
        if (Number.isInteger(snapshot.done) && snapshot.done > lastDone) {
          diagnostics.progress.push({
            done: snapshot.done,
            total: snapshot.total,
            elapsedMs,
            sincePreviousProgressMs: now() - lastProgressAt,
          });
          lastDone = snapshot.done;
          lastProgressAt = now();
        }
        return snapshot.dialogOpen &&
          snapshot.analysisStatus === 'done' &&
          snapshot.decisionTitle &&
          snapshot.suggestion &&
          !/分析中|undefined/.test(snapshot.decisionTitle + snapshot.suggestion)
          ? { decisionTitle: snapshot.decisionTitle, suggestion: snapshot.suggestion }
          : null;
      },
      diagnostics.timeoutMs,
      'Installed local review worker must produce a decision explanation and suggestion',
    );
    diagnostics.elapsedMs = now() - started;
    return { ...review, diagnostics };
  } catch (error) {
    diagnostics.elapsedMs = now() - started;
    error.reviewDiagnostics = diagnostics;
    throw error;
  }
}

export async function readNativePersonaTags(app) {
  const token = `persona-tags-${Date.now()}-${Math.random()}`;
  // XCUITest execute/sync serializes a returned Promise as {}. Start the real
  // asynchronous paint read in-page, then transport only a completed string.
  await app.evaluate((token) => {
    const observation = { token, result: null };
    window.__nativePersonaTagsObservation = observation;
    void (async () => {
      try {
        await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const state = window.noir.getState();
        observation.result = JSON.stringify({
          snapshot: {
            hand: state.hand,
            stack: state.stack,
            hole: state.hole,
            completedHands: document.querySelector('#stat-hands').textContent,
            tags: [...document.querySelectorAll('#seats .seat-style-label')].map((tag) => ({
              text: tag.textContent,
              height: tag.getBoundingClientRect().height,
              fontSize: getComputedStyle(tag).fontSize,
            })),
          },
        });
      } catch (error) {
        observation.result = JSON.stringify({ error: error.message || String(error) });
      }
    })();
    return token;
  }, token);
  try {
    const serialized = await app.waitFor(
      () =>
        app.evaluate((token) => {
          const observation = window.__nativePersonaTagsObservation;
          return observation?.token === token ? observation.result : null;
        }, token),
      10000,
      'Installed persona tags must finish fonts.ready and two animation frames',
    );
    assert.equal(
      typeof serialized,
      'string',
      'Persona measurement must cross the native bridge as JSON',
    );
    const result = JSON.parse(serialized);
    if (result.error) throw new Error(`Installed persona tag measurement failed: ${result.error}`);
    return result.snapshot;
  } finally {
    try {
      await app.evaluate((token) => {
        if (window.__nativePersonaTagsObservation?.token === token)
          delete window.__nativePersonaTagsObservation;
        return true;
      }, token);
    } catch {
      // Cleanup must not replace the original read/timeout failure.
    }
  }
}

// These scenarios drive the installed production bundle. They read only the
// public state already exposed by the app and never install browser fixtures.
export async function nativeScenarios(app) {
  app = withCenteredNativeClicks(withPreservedForegroundPage(app));
  const result = [];
  const selection = process.env.NOIR_NATIVE_SCENARIOS;
  const selectedScenarios = selection?.split(',').map((name) => name.trim());
  if (selectedScenarios?.some((name) => !name))
    throw Error('NOIR_NATIVE_SCENARIOS must contain nonempty scenario names');
  const seenScenarios = new Set();
  const check = async (name, run) => {
    seenScenarios.add(name);
    if (selectedScenarios && !selectedScenarios.includes(name)) {
      const entry = {
        name,
        status: 'skipped',
        elapsedMs: 0,
        reason: 'Not selected by the test-only NOIR_NATIVE_SCENARIOS filter',
      };
      result.push(entry);
      app.record(entry);
      app.log(`SKIP ${name}: ${entry.reason}`);
      return;
    }
    const started = Date.now();
    try {
      if (name !== 'entry-waiting-music-and-first-deal') await enterNativeTable(app);
      const evidence = await run();
      await app.screenshot(name);
      const entry = { name, status: 'passed', elapsedMs: Date.now() - started, evidence };
      result.push(entry);
      app.record(entry);
      app.log(`PASS ${name}`);
    } catch (error) {
      app.record({
        name,
        status: 'failed',
        elapsedMs: Date.now() - started,
        error: error.stack || String(error),
        ...(error.reviewDiagnostics ? { reviewDiagnostics: error.reviewDiagnostics } : {}),
        ...(error.turnDiagnostics ? { turnDiagnostics: error.turnDiagnostics } : {}),
        ...(error.tooltipDiagnostics ? { tooltipDiagnostics: error.tooltipDiagnostics } : {}),
      });
      throw error;
    }
  };
  await check('entry-waiting-music-and-first-deal', async () => {
    const before = await app.state();
    assert.equal(before.phase, 'idle');
    assert.equal(before.entryState, 'waiting');
    assert.equal(before.pot, 0);
    assert.equal(before.hole.length, 0);
    assert.ok(before.players.every((player) => player.bet === 0));
    const music = await app.waitFor(
      () =>
        app.evaluate(() => {
          const audio = document.querySelector('audio[data-background-music]');
          return audio &&
            !audio.paused &&
            audio.currentTime > 0.1 &&
            Number(audio.dataset.musicGain) === 1
            ? {
                time: audio.currentTime,
                gain: Number(audio.dataset.musicGain),
                source: audio.currentSrc,
                count: document.querySelectorAll('audio[data-background-music]').length,
              }
            : null;
        }),
      15000,
      'Music must already play before the first native touch',
    );
    await app.evaluate(() => {
      const audio = document.querySelector('audio[data-background-music]');
      window.__entryMusicAudio = audio;
      window.__entryMusicTimes = [audio.currentTime];
      window.__entryMusicObserve = () => window.__entryMusicTimes.push(audio.currentTime);
      audio.addEventListener('timeupdate', window.__entryMusicObserve);
    });
    const progress = () =>
      app.evaluate(() => {
        const audio = document.querySelector('audio[data-background-music]');
        const samples = window.__entryMusicTimes;
        return {
          time: audio.currentTime,
          count: document.querySelectorAll('audio[data-background-music]').length,
          samePlayer: audio === window.__entryMusicAudio,
          naturalLoop: samples.some(
            (time, index) => index > 0 && samples[index - 1] > audio.duration - 0.6 && time < 0.6,
          ),
        };
      });
    await app.sleep(300);
    const later = await progress();
    assert.ok(later.time > music.time || later.naturalLoop);
    assert.equal(later.samePlayer, true);
    assert.deepEqual(await app.state(), before, 'Waiting must not start a hand or move chips');
    const chrome = await app.evaluate(() => {
      const settings = document.querySelector('#opponents-button'),
        menu = document.querySelector('#rules-button');
      const a = getComputedStyle(settings),
        b = getComputedStyle(menu);
      return {
        font: a.fontSize,
        menuFont: b.fontSize,
        weight: a.fontWeight,
        menuWeight: b.fontWeight,
        border: a.borderWidth,
        settingsOnRight:
          menu.getBoundingClientRect().right <= settings.getBoundingClientRect().left,
        blindsAtTop:
          Math.abs(
            document.querySelector('.hand-label').getBoundingClientRect().top -
              document.querySelector('.blind-info').getBoundingClientRect().top,
          ) <= 1,
        heroGap:
          document.querySelector('#hero-stack').getBoundingClientRect().left -
          document.querySelector('.hero-identity strong').getBoundingClientRect().right,
        dock: document.querySelector('.action-dock-slot').getBoundingClientRect().height,
        activityHidden: document.querySelector('.activity-card').hidden,
        entryCopy: document.querySelector('#entry-welcome').textContent.trim(),
      };
    });
    assert.equal(chrome.font, chrome.menuFont);
    assert.equal(chrome.weight, chrome.menuWeight);
    assert.equal(chrome.border, '0px');
    assert.equal(chrome.settingsOnRight, true);
    assert.equal(chrome.blindsAtTop, true);
    assert.ok(chrome.heroGap >= 0 && chrome.heroGap <= 7);
    assert.equal(chrome.dock, 0);
    assert.equal(chrome.activityHidden, true);
    assert.ok(!chrome.entryCopy.includes('第一手'));
    await app.screenshot('waiting-before-first-touch');
    await app.click('#join-table-button');
    const during = await app.state();
    assert.equal(during.hand, before.hand + 1);
    assert.equal(during.hole.length, 2);
    assert.equal(
      during.players.reduce((sum, player) => sum + player.stack, 0) + during.pot,
      before.players.reduce((sum, player) => sum + player.stack, 0),
    );
    await app.waitFor(
      async () => (await app.state()).entryState === 'playing',
      10000,
      'Visible entry deal must finish',
    );
    assert.equal((await app.state()).hand, during.hand);
    const continued = await progress();
    assert.ok(continued.time > music.time || continued.naturalLoop);
    assert.equal(continued.samePlayer, true);
    assert.equal(continued.count, 1);
    await app.evaluate(() => {
      window.__entryMusicAudio.removeEventListener('timeupdate', window.__entryMusicObserve);
      delete window.__entryMusicAudio;
      delete window.__entryMusicObserve;
      delete window.__entryMusicTimes;
    });
    await app.evaluate(() => {
      window.__entryMusicLifecycle = [];
      window.__entryMusicListener = ({ detail }) => {
        const audio = document.querySelector('audio[data-background-music]');
        window.__entryMusicLifecycle.push({
          active: detail.active,
          paused: audio.paused,
          time: audio.currentTime,
          gain: Number(audio.dataset.musicGain),
        });
      };
      document.addEventListener('noir:app-state', window.__entryMusicListener);
    });
    await app.background();
    // As in the music check, stay out long enough for the pause to reach the
    // page; a slower Android emulator can resume before a shorter stay is seen.
    await app.sleep(1500);
    assert.ok([2, 3].includes(await app.nativeState()));
    await app.activate();
    // The foreground event can arrive after the native resume returns.
    try {
      await app.waitFor(
        () =>
          app.evaluate(() => {
            const events = window.__entryMusicLifecycle,
              hidden = events.findIndex((event) => !event.active);
            return hidden >= 0 && events.slice(hidden + 1).some((event) => event.active);
          }),
        10000,
        'Both actual native lifecycle boundaries must arrive',
      );
    } catch (error) {
      const seen = await app.evaluate(() => window.__entryMusicLifecycle);
      throw Error(`${error.message}; received ${JSON.stringify(seen)}`);
    }
    const events = await app.evaluate(() => {
      document.removeEventListener('noir:app-state', window.__entryMusicListener);
      return window.__entryMusicLifecycle;
    });
    const hiddenIndex = events.findIndex((event) => !event.active);
    const paused = events[hiddenIndex];
    const foreground = events.slice(hiddenIndex + 1).find((event) => event.active);
    assert.ok(paused && foreground, 'Both actual native lifecycle boundaries must arrive');
    assert.equal(paused.paused, true);
    assert.equal(paused.gain, 0);
    assert.ok(foreground.time >= paused.time);
    assert.ok(foreground.time - paused.time < 0.8);
    const resumed = await app.waitFor(
      () =>
        app.evaluate(() => {
          const audio = document.querySelector('audio[data-background-music]');
          return !audio.paused && Number(audio.dataset.musicGain) === 1
            ? { time: audio.currentTime }
            : null;
        }),
      10000,
      'Foreground music must resume',
    );
    assert.ok(resumed.time >= paused.time);
    return {
      before,
      musicBeforeFirstTouch: music,
      chrome,
      during,
      continued,
      paused,
      foreground,
      resumed,
    };
  });
  await check('entry-high-stakes-layout', async () => {
    const originalStakes = (await app.state()).stakes;
    await app.relaunch();
    try {
      await app.evaluate(() => window.noir.requestSmallBlind('10000'));
      await app.relaunch();
      const layout = await app.evaluate(() => {
        const box = (s) => document.querySelector(s).getBoundingClientRect();
        const hand = box('.hand-label'),
          blinds = box('.blind-info'),
          surface = box('.game-surface'),
          practice = box('.session-card');
        return {
          waiting: document.querySelector('.game-surface').dataset.entryState,
          blinds: document.querySelector('.blind-info b').textContent,
          stack: document.querySelector('#hero-stack').textContent,
          sameTop: Math.abs(hand.top - blinds.top) <= 1,
          noOverlap: hand.right <= blinds.left,
          gap: box('#hero-stack').left - box('.hero-identity strong').right,
          followsTable: practice.top >= surface.bottom && practice.top - surface.bottom <= 20,
        };
      });
      assert.equal(layout.waiting, 'waiting');
      assert.equal(layout.blinds, '10K / 20K');
      assert.equal(layout.stack, '2M');
      assert.equal(layout.sameTop, true);
      assert.equal(layout.noOverlap, true);
      assert.ok(layout.gap >= 0 && layout.gap <= 7);
      assert.equal(layout.followsTable, true);
      await app.screenshot('waiting-high-stakes-layout');
      return layout;
    } finally {
      // This scenario changes a persisted setting. Later scenarios still
      // verify the clean install's original stakes and denomination.
      await app.evaluate(
        (smallBlind) => window.noir.requestSmallBlind(String(smallBlind)),
        originalStakes.smallBlind,
      );
      await app.relaunch();
      assert.deepEqual((await app.state()).stakes, originalStakes);
    }
  });
  await check('practice-reset-in-card-heading', async () => {
    await app.evaluate(() =>
      document.querySelector('.session-card').scrollIntoView({ block: 'center' }),
    );
    const layout = await app.evaluate(() => {
      const card = document.querySelector('.session-card'),
        title = card.querySelector('h2').getBoundingClientRect(),
        reset = document.querySelector('#reset-button'),
        rect = reset.getBoundingClientRect();
      return {
        inHeading: card.querySelector('.section-title').contains(reset),
        aligned: Math.abs((rect.top + rect.bottom - title.top - title.bottom) / 2) < 1,
        rightOfTitle: rect.left >= title.right + 8,
        fits: rect.right <= card.getBoundingClientRect().right,
        height: rect.height,
        oldFooter: Boolean(document.querySelector('.practice-info')),
      };
    });
    assert.deepEqual(layout, {
      inHeading: true,
      aligned: true,
      rightOfTitle: true,
      fits: true,
      height: 32,
      oldFooter: false,
    });
    const before = await app.state();
    await app.click('#reset-button');
    assert.equal(await app.evaluate(() => document.querySelector('#reset-dialog').open), true);
    await app.screenshot('practice-reset-confirmation');
    await app.click('#reset-dialog .dialog-actions .close-dialog');
    assert.equal((await app.state()).hand, before.hand);
    await app.click('#reset-button');
    await app.click('#confirm-reset');
    await app.waitFor(
      async () => (await app.state()).hand === 1,
      15000,
      'Practice reset must start a fresh first hand',
    );
    assert.equal(await app.evaluate(() => document.querySelector('#stat-hands').textContent), '0');
    return { layout, cancelPreservesHand: true, confirmedResetHands: 0 };
  });
  await check('local-launch-and-no-login', async () => {
    const fonts = await app.waitFor(
      () =>
        app.evaluate(() =>
          ['Manrope', 'Noto Sans SC'].every((name) =>
            [...document.fonts].some(
              (face) => face.family.replaceAll('"', '') === name && face.status === 'loaded',
            ),
          ),
        ),
      5000,
      'Installed WebView must load the shared local UI fonts',
    );
    if (app.comparePage)
      await app.comparePage('table', [
        '.header',
        '.surface-top',
        '.table-viewport',
        '#bet-slider',
        '.action-buttons',
      ]);
    const layout = await app.evaluate(readTableLayout);
    assertTableLayout(layout);
    const info = await app.evaluate(() => ({
      href: location.href,
      native: document.documentElement.classList.contains('native-app'),
      fixtures: typeof window.qa,
      footerIntro: Boolean(document.querySelector('.practice-info')),
      login: Boolean(document.querySelector('input[type=password], input[autocomplete=username]')),
      state: window.noir?.getState(),
      startup: {
        ready: document.documentElement.dataset.appReady === 'true',
        inert: document.body.inert,
        visibility: getComputedStyle(document.body).visibility,
        background: getComputedStyle(document.body).backgroundColor,
        fontRequests: performance
          .getEntriesByType('resource')
          .filter((entry) => /fonts\.(googleapis|gstatic)\.com/.test(entry.name)).length,
        remoteFontLink: Boolean(document.querySelector('[data-web-fonts]')),
      },
      viewport: { width: innerWidth, height: innerHeight },
      controls: ['raise', 'fold', 'call'].map((action) => {
        const rect = document.querySelector(`#${action}-button`).getBoundingClientRect();
        return { action, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
      }),
    }));
    assert.ok(info.native, 'The installed app must use the native platform adapter');
    assert.equal(info.fixtures, 'undefined', 'Production app must not contain QA fixtures');
    assert.ok(
      /^(capacitor|https?):\/\/localhost(?:\/|$)/.test(info.href),
      'App must load bundled local code',
    );
    assert.equal(info.footerIntro, false);
    assert.equal(info.login, false);
    assert.equal(info.state.playerCount, 5, 'A clean install starts with five players');
    assert.deepEqual(info.startup, {
      ready: true,
      inert: false,
      visibility: 'visible',
      background: 'rgb(11, 16, 23)',
      fontRequests: 0,
      remoteFontLink: false,
    });
    assert.ok(
      info.controls.every(
        (rect) =>
          rect.top >= 0 &&
          rect.bottom <= info.viewport.height &&
          rect.left >= 0 &&
          rect.right <= info.viewport.width &&
          rect.bottom > rect.top &&
          rect.right > rect.left,
      ),
      'The first viewport must contain every action button before any test scroll',
    );
    return {
      origin: info.href,
      playerCount: info.state.playerCount,
      viewport: info.viewport,
      controls: info.controls,
      layout,
      startup: info.startup,
    };
  });
  await check('completed-check-persists', async () => {
    await app.click('#opponents-button');
    await app.select('#player-count', '9');
    await app.click('#opponents-dialog .close-dialog');
    await app.click('#reset-button');
    await app.click('#confirm-reset');
    await app.waitFor(async () => (await app.state()).playerCount === 9, 15000);
    // Observe normal renders in the installed bundle, without changing the
    // deal, action fields, bot timers or production code.
    await app.evaluate(() => {
      const evidence = { checks: [], waiting: [], errors: [] };
      const read = () => {
        const state = window.noir.getState();
        if (state.phase !== 'playing') return;
        for (const player of state.players.slice(1)) {
          if (player.folded || player.allin || player.name === state.actor) continue;
          const label = document.querySelector(`.seat-${player.id} .seat-action`)?.textContent;
          const street = ['翻牌前', '翻牌', '转牌', '河牌'][player.lastAction?.street];
          const row = {
            hand: state.hand,
            street: state.street,
            id: player.id,
            actor: state.actor,
            label,
          };
          if (player.lastAction?.text === '过牌' && street === state.street) {
            evidence.checks.push(row);
            if (label !== '过牌') evidence.errors.push(row);
          } else if (state.street !== '翻牌前' && !player.action && street !== state.street) {
            evidence.waiting.push(row);
            if (label !== '等待行动') evidence.errors.push(row);
          }
        }
      };
      const observer = new MutationObserver(read);
      observer.observe(document.querySelector('#seats'), { childList: true });
      window.__nativeCheckCaption = { evidence, observer };
      read();
    });
    try {
      for (let decision = 0; decision < 24; decision++) {
        const evidence = await app.evaluate(() => window.__nativeCheckCaption.evidence);
        assert.deepEqual(evidence.errors, []);
        if (evidence.checks.length >= 2 && evidence.waiting.length) return evidence;
        const state = await app.waitFor(
          async () => {
            const state = await app.state();
            return state.phase === 'done' || state.legal.enabled ? state : null;
          },
          90000,
          'Normal play must reach the next hero decision or settlement',
        );
        await app.click(state.phase === 'done' ? '#next-button' : '#call-button');
      }
      throw Error('Normal play did not produce enough completed-check observations');
    } finally {
      await app.evaluate(() => {
        window.__nativeCheckCaption.observer.disconnect();
        delete window.__nativeCheckCaption;
      });
    }
  });
  await check('configured-stakes-and-shared-icon', async () => {
    const state = await app.state();
    assert.deepEqual(state.stakes, {
      smallBlind: 100,
      bigBlind: 200,
      startingStack: 20000,
      chipUnit: 100,
    });
    const artwork = await app.evaluate(() => {
      const image = document.querySelector('.brand-mark img');
      return {
        src: image.getAttribute('src'),
        loaded: image.complete && image.naturalWidth > 0,
        blinds: document.querySelector('#blind-values').textContent,
        step: document.querySelector('#bet-slider').step,
      };
    });
    assert.match(artwork.src, /^(?:\.\/|\/)app-icon\.png$/);
    assert.equal(artwork.loaded, true);
    assert.equal(artwork.blinds, '100 / 200');
    if (state.legal.enabled) assert.equal(artwork.step, '100');
    for (const p of state.players) assert.equal(p.stack % state.chipUnit, 0);
    return { stakes: state.stakes, artwork };
  });
  await check('card-ranks-stay-stable-after-native-repaint', async () => {
    await app.waitHero();
    const before = await app.evaluate(readCardRankState);
    assert.equal(before.textCount, 0);
    assert.equal(before.ranks.length, 2);
    const first = await readNativeRankInk(await app.screenshot('card-ranks-before'), before);
    await app.background();
    await app.sleep(1200);
    await app.activate();
    await app.evaluate(async () => {
      for (let i = 0; i < 6; i++) {
        window.dispatchEvent(new Event('resize'));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
    });
    const after = await app.evaluate(readCardRankState);
    assert.equal(after.textCount, 0);
    assert.deepEqual(
      after.ranks.map(({ rank, path }) => ({ rank, path })),
      before.ranks.map(({ rank, path }) => ({ rank, path })),
    );
    const second = await readNativeRankInk(await app.screenshot('card-ranks-after'), after);
    assertStableRankInk(first, second);
    return { before: first, after: second, resizePasses: 6, backgroundMs: 1200 };
  });
  await check('phone-portrait-or-tablet-rotation', async () => {
    await app.waitHero();
    const readOrientation = () =>
      app.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        tablet: document.documentElement.dataset.tablet === 'true',
        blocked: document.querySelector('#orientation-dialog').open,
        hand: window.noir.getState().hand,
      }));
    const before = await readOrientation();
    let landscape;
    let request;
    try {
      request = await app.rotate('LANDSCAPE', { allowPortraitLock: !before.tablet });
      await app.sleep(1000);
      landscape = await readOrientation();
      if (before.tablet)
        assert.ok(landscape.width > landscape.height, 'Tablet must allow landscape');
      else assert.ok(landscape.height > landscape.width, 'Phone must keep normal portrait');
      assert.equal(
        landscape.blocked,
        false,
        'The native orientation policy must keep the table usable',
      );
      assert.equal(landscape.hand, before.hand, 'Rotation must not redeal');
      await app.screenshot('orientation-landscape-request');
    } finally {
      await app.rotate('PORTRAIT');
    }
    await app.sleep(1000);
    const portrait = await readOrientation();
    assert.ok(portrait.height > portrait.width, 'Normal upright portrait must remain available');
    assert.equal(portrait.blocked, false);
    assert.equal(portrait.hand, before.hand);
    return { before, request, landscape, portrait };
  });
  await check('crown-seat-and-style-row', async () => {
    const tables = [];
    for (const count of [6, 8]) {
      await app.click('#opponents-button');
      await app.select('#player-count', String(count));
      if (
        await app.evaluate(
          () => document.querySelector('#mix-opponents').getAttribute('aria-pressed') !== 'true',
        )
      )
        await app.click('#mix-opponents');
      await app.click('#opponents-dialog .close-dialog');
      await app.click('#reset-button');
      await app.click('#confirm-reset');
      await app.waitFor(
        async () => (await app.state()).playerCount === count,
        15000,
        'The selected table size must apply through the normal reset controls',
      );
      await app.evaluate(() => window.scrollTo(0, 0));
      const layout = await app.evaluate(readTableLayout);
      assertTableLayout(layout);
      const presentation = await app.evaluate(() => {
        const crown = document.querySelector('.seat-crown .seat-profile').getBoundingClientRect(),
          rail = document.querySelector('.poker-table').getBoundingClientRect();
        const names = [...document.querySelectorAll('.seat-style-label')].map((tag) => ({
          full: tag.scrollWidth <= tag.clientWidth + 1,
          below:
            tag.closest('.seat-profile').querySelector('.seat-stack').getBoundingClientRect().top >=
            tag.getBoundingClientRect().bottom - 0.5,
        }));
        return { straddles: crown.top < rail.top && crown.bottom > rail.top, names };
      });
      assert.ok(presentation.straddles, 'The crown profile must straddle the rail');
      assert.ok(
        presentation.names.every((tag) => tag.below),
        'Chips must sit below the style row',
      );
      assert.ok(
        await app.evaluate(() =>
          [...document.querySelectorAll('.seat-style-label')].every(
            (tag) =>
              tag.textContent.trim() &&
              tag.title &&
              getComputedStyle(tag).textOverflow === 'ellipsis',
          ),
        ),
        'Named style labels preserve their complete accessible identity',
      );
      await app.screenshot(`crown-${count}-style-row`);
      tables.push({ count, presentation, layout });
    }
    return { tables };
  });
  await check('native-turn-haptics-bridge', async () => {
    await app.evaluate(() => {
      const available = window.Capacitor.isPluginAvailable('Haptics');
      if (!available) throw Error('Native Haptics plugin is missing');
      window.__noirHapticProbe = {
        available,
        style: 'LIGHT',
        status: 'pending',
        scope: 'Installed native bridge call; physical feel requires a device with a vibrator',
      };
      // execute/sync does not await a returned Promise in WKWebView. Observe
      // the actual native result in a later command instead of serializing it.
      window.Capacitor.nativePromise('Haptics', 'impact', { style: 'LIGHT' }).then(
        () => (window.__noirHapticProbe.status = 'resolved'),
        (error) => {
          window.__noirHapticProbe.status = 'rejected';
          window.__noirHapticProbe.error = String(error);
        },
      );
    });
    await app.waitFor(
      () => app.evaluate(() => window.__noirHapticProbe.status !== 'pending'),
      10000,
      'Native Haptics bridge must complete',
    );
    const bridge = await app.evaluate(() => window.__noirHapticProbe);
    assert.equal(bridge.available, true);
    assert.equal(bridge.status, 'resolved', bridge.error);
    return bridge;
  });
  await check('hero-turn-visual-attention', async () => {
    await app.evaluate(() => {
      window.__turnAttentionPhases = [];
      window.__turnAttentionLifecycle = [];
      const dock = document.querySelector('.action-dock');
      document.addEventListener('noir:app-state', ({ detail }) => {
        window.__turnAttentionLifecycle.push({
          active: detail.active,
          phase: dock.dataset.turnPhase,
        });
      });
      new MutationObserver(() => {
        window.__turnAttentionPhases.push({
          phase: dock.dataset.turnPhase,
          at: Date.now(),
          frame: [...document.querySelectorAll('#hero-cards .playing-card')].map((card) => {
            const style = getComputedStyle(card, '::before');
            return {
              name: style.animationName,
              duration: style.animationDuration,
              iterations: style.animationIterationCount,
            };
          }),
        });
      }).observe(dock, { attributes: true, attributeFilter: ['data-turn-phase'] });
    });
    // Leave any existing decision so entry and the eight-second reminder are
    // observed from a fresh, real turn in the installed production bundle.
    const initial = await app.state();
    if (initial.legal.enabled) await app.click('#call-button');
    await app.waitFor(
      async () => {
        const state = await app.state();
        if (state.phase === 'done') {
          await app.click('#next-button');
          return false;
        }
        return state.legal.enabled;
      },
      90000,
      'A fresh hero decision must become available',
    );
    // Read the first turn frame at its actual DOM transition so a slow driver
    // does not confuse the controller phase with the persistent border motion.
    const entry = await app.evaluate(
      () => window.__turnAttentionPhases.find((entry) => entry.phase === 'enter')?.frame,
    );
    assert.deepEqual(entry, [
      { name: 'turn-glow', duration: '2s', iterations: 'infinite' },
      { name: 'turn-glow', duration: '2s', iterations: 'infinite' },
    ]);
    await app.sleep(850);
    await app.screenshot('hero-turn-visible');
    const read = () =>
      app.evaluate(() => {
        const rect = (element) => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height };
        };
        const card = document.querySelector('#hero-cards .playing-card');
        const border = getComputedStyle(card, '::before');
        return {
          phase: document.querySelector('.action-dock').dataset.turnPhase,
          hero: document.querySelector('.hero-cards-wrap').dataset.turnPhase,
          prompt: document.querySelector('#turn-prompt').textContent.trim(),
          promptVisible: !document.querySelector('#turn-prompt').hidden,
          lineOpacity: Number(getComputedStyle(document.querySelector('.turn-line')).opacity),
          lineHeight: getComputedStyle(document.querySelector('.turn-line')).height,
          promptOpacity: Number(getComputedStyle(document.querySelector('#turn-prompt')).opacity),
          frameOpacity: Number(border.opacity),
          frameBorder: border.borderTopColor,
          frameBackground: border.backgroundImage,
          frameRadius: border.borderTopLeftRadius,
          cardRadius: getComputedStyle(card).borderTopLeftRadius,
          handBorders: [...document.querySelectorAll('#hero-cards .playing-card')].map((card) => {
            const style = getComputedStyle(card, '::before');
            return { name: style.animationName, iterations: style.animationIterationCount };
          }),
          railPulses: ['::before', '::after'].map((pseudo) => {
            const style = getComputedStyle(document.querySelector('.turn-line'), pseudo);
            return { name: style.animationName, duration: style.animationDuration };
          }),
          attentionMotion: ['.turn-line', '#turn-prompt'].map((selector) => {
            const style = getComputedStyle(document.querySelector(selector));
            return { name: style.animationName, duration: style.animationDuration };
          }),
          boxes: [
            ...document.querySelectorAll('#hero-cards .playing-card, .action-buttons button'),
          ].map(rect),
        };
      });
    await app.sleep(750); // Finish the independent hand-deal animation, if this is a new hand.
    const before = await app.waitFor(
      () => read().then((frame) => (frame.hero === 'waiting' ? frame : null)),
      5000,
      'Entry must settle into a steady turn state',
    );
    before.noticeSpacing = await app.evaluate(readActionNoticeSpacing);
    assert.ok(before.noticeSpacing.topGap >= 4, JSON.stringify(before.noticeSpacing));
    assert.ok(before.noticeSpacing.controlGap >= 4, JSON.stringify(before.noticeSpacing));
    assert.ok(
      Math.abs(before.noticeSpacing.topGap - before.noticeSpacing.controlGap) <= 1,
      JSON.stringify(before.noticeSpacing),
    );
    assert.equal(before.hero, 'waiting');
    assert.equal(before.promptVisible, true);
    assert.equal(before.lineHeight, '2px');
    assert.equal(before.promptOpacity, 1);
    assert.equal(before.frameOpacity, 1);
    assert.equal(before.frameBorder, 'rgb(110, 231, 197)');
    assert.equal(before.frameBackground, 'none');
    assert.equal(before.frameRadius, before.cardRadius);
    assert.deepEqual(before.handBorders, [
      { name: 'turn-glow', iterations: 'infinite' },
      { name: 'turn-glow', iterations: 'infinite' },
    ]);
    assert.deepEqual(before.attentionMotion, [
      { name: 'none', duration: '0s' },
      { name: 'none', duration: '0s' },
    ]);
    assert.deepEqual(before.railPulses, [
      { name: 'hero-turn-pulse-left', duration: '1.6s' },
      { name: 'hero-turn-pulse-right', duration: '1.6s' },
    ]);
    await app.screenshot('hero-turn-steady');
    const background = await app.background();
    await app.sleep(9000);
    assert.ok(
      [2, 3].includes(await app.nativeState()),
      'The turn must remain natively backgrounded',
    );
    const backgroundMs = performance.now() - background.startedAt;
    assert.ok(backgroundMs >= 9000);
    await app.activate();
    await app.waitFor(
      () =>
        app.evaluate(() => document.querySelector('.action-dock').dataset.turnPhase === 'waiting'),
      5000,
      'Returning to the same decision must show the steady state',
    );
    const lifecycle = await app.evaluate(() => window.__turnAttentionLifecycle);
    assert.ok(
      lifecycle.some((entry) => !entry.active && entry.phase === ''),
      'Real native background must clear visual attention',
    );
    await app.waitFor(
      () =>
        app.evaluate(() =>
          window.__turnAttentionPhases.some((entry) => entry.phase === 'reminder'),
        ),
      10000,
      'An untouched turn must remind once',
    );
    await app.waitFor(
      () =>
        app.evaluate(() => document.querySelector('.action-dock').dataset.turnPhase === 'waiting'),
      5000,
      'Reminder must stop pulsing',
    );
    const after = await read();
    assert.deepEqual(after.boxes, before.boxes);
    const observed = await app.evaluate(() => window.__turnAttentionPhases);
    assert.equal(observed.filter((entry) => entry.phase === 'enter').length, 1);
    assert.equal(observed.filter((entry) => entry.phase === 'reminder').length, 1);
    await app.click('#call-button');
    assert.equal(
      await app.evaluate(() => document.querySelector('.action-dock').dataset.turnPhase),
      '',
    );
    return {
      entry,
      before,
      after,
      observed,
      lifecycle,
      backgroundMs,
      scope:
        'Installed production UI; native background cancels attention and card/button geometry stays stable',
    };
  });
  await check('table-hint-content', async () => {
    await waitForNativeHeroTurn(app, { advanceSettled: true });
    // Refresh via the actual preference control, without injecting a hand or
    // exposing any private state in the installed production application.
    const observed = await app.evaluate(() => {
      const toggle = document.querySelector('#hint-toggle');
      if (toggle.getAttribute('aria-checked') === 'true') toggle.click();
      toggle.click();
      return {
        state: window.noir.getState(),
        text: document.querySelector('#coach-tip').textContent,
        visible: !document.querySelector('#coach-content').hidden,
      };
    });
    assert.equal(observed.visible, true);
    assert.equal(observed.state.actor, '你');
    assert.doesNotMatch(observed.text, /；|权益|跟注占可争夺底池/);
    if (observed.state.legal.toCall > 0)
      assert.match(observed.text, /跟注.*可争夺.*需要约 [\d.]+% 的胜率才能持平/);
    else assert.match(observed.text, /可以过牌|可以加注/);
    await app.screenshot('table-hint-content');
    return observed;
  });
  await check('combined-feedback-preference', async () => {
    await app.evaluate(() => {
      const nativePromise = window.Capacitor.nativePromise;
      const start = AudioBufferSourceNode.prototype.start;
      window.__feedbackProbe = { haptics: 0, audio: 0, levels: [] };
      window.__restoreFeedbackProbe = () => {
        window.Capacitor.nativePromise = nativePromise;
        AudioBufferSourceNode.prototype.start = start;
      };
      window.Capacitor.nativePromise = function (plugin, method, ...args) {
        if (plugin === 'Haptics' && method === 'impact') window.__feedbackProbe.haptics++;
        return nativePromise.call(this, plugin, method, ...args);
      };
      AudioBufferSourceNode.prototype.start = function (...args) {
        window.__feedbackProbe.audio++;
        const samples = this.buffer?.getChannelData(0);
        if (samples?.length) {
          let energy = 0,
            peak = 0;
          for (const sample of samples) {
            energy += sample * sample;
            peak = Math.max(peak, Math.abs(sample));
          }
          window.__feedbackProbe.levels.push({
            samples: samples.length,
            rms: Math.sqrt(energy / samples.length),
            peak,
          });
        }
        return start.apply(this, args);
      };
    });
    const resetToHero = async () => {
      await app.click('#reset-button');
      await app.click('#confirm-reset');
      return waitForNativeHeroTurn(app);
    };
    try {
      await app.click('#opponents-button');
      assert.equal(
        await app.evaluate(() => document.querySelector('#sound-label').textContent.trim()),
        '音效与音乐',
      );
      assert.equal(
        await app.evaluate(() =>
          document.querySelector('#sound-button').getAttribute('aria-checked'),
        ),
        'true',
      );
      await app.click('#sound-button');
      await app.click('#opponents-dialog .close-dialog');
      await app.evaluate(() => {
        window.__feedbackProbe = { haptics: 0, audio: 0, levels: [] };
      });
      const mutedTurn = await resetToHero();
      const muted = await app.evaluate(() => window.__feedbackProbe);
      assert.equal(muted.audio, 0);
      assert.deepEqual(muted.levels, []);
      assert.ok(muted.haptics > 0, 'Sound mute must preserve independent vibration');
      await app.click('#opponents-button');
      await app.click('#vibration-button');
      await app.click('#sound-button');
      await app.click('#opponents-dialog .close-dialog');
      await app.evaluate(() => {
        window.__feedbackProbe = { haptics: 0, audio: 0, levels: [] };
      });
      const enabledTurn = await resetToHero();
      const enabled = await app.evaluate(() => window.__feedbackProbe);
      assert.ok(
        enabled.haptics === 0 && enabled.audio > 0,
        'Unmuting restores sound while vibration stays disabled',
      );
      assert.equal(enabled.levels.length, enabled.audio);
      assert.ok(
        enabled.levels.every(({ rms, peak, samples }) => {
          const enhanced = [7938, 22491, 15876].includes(samples);
          return (
            rms >= (samples === 22491 ? 0.05 : enhanced ? 0.21 : 0.145) &&
            rms <= (samples === 22491 ? 0.06 : enhanced ? 0.245 : 0.165) &&
            peak <= (samples === 22491 ? 0.78 : 0.7)
          );
        }),
        'Actual installed-app PCM uses the approved chip and mastered cues with per-cue headroom',
      );
      await app.click('#opponents-button');
      await app.click('#vibration-button');
      await app.click('#opponents-dialog .close-dialog');
      return {
        muted,
        enabled,
        turns: { muted: mutedTurn, enabled: enabledTurn },
        scope: 'Actual installed-app dispatch; physical hearing and vibration feel are separate',
      };
    } finally {
      await app.evaluate(() => window.__restoreFeedbackProbe?.()).catch(() => {});
    }
  });
  await check('music-volume-and-chip-stack', async () => {
    await app.evaluate(() => {
      window.__polishCues = [];
      window.__polishStart = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        const pcm = this.buffer.getChannelData(0);
        window.__polishCues.push({
          samples: pcm.length,
          rms: Math.sqrt(pcm.reduce((sum, value) => sum + value * value, 0) / pcm.length),
          peak: pcm.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0),
          musicGain: Number(
            document.querySelector('audio[data-background-music]')?.dataset.musicGain,
          ),
        });
        return window.__polishStart.apply(this, args);
      };
    });
    try {
      await app.click('#opponents-button');
      const music = await app.waitFor(
        () =>
          app.evaluate(() => {
            const audio = document.querySelector('audio[data-background-music]');
            return audio && !audio.paused && audio.readyState >= 2 && audio.currentTime > 0.1
              ? {
                  source: audio.currentSrc,
                  time: audio.currentTime,
                  duration: audio.duration,
                  loop: audio.loop,
                }
              : null;
          }),
        15000,
        'The new bundled music must decode and advance after a real tap',
      );
      assert.equal(music.loop, true);
      assert.ok(music.source.endsWith('/audio/background-music-mobile.m4a'));
      assert.ok(music.duration > 93.6 && music.duration < 93.8);
      await app.waitFor(
        () =>
          app.evaluate(
            () =>
              Number(document.querySelector('audio[data-background-music]')?.dataset.musicGain) ===
              1,
          ),
        5000,
        'Entry music fade must finish before action volume is checked',
      );
      await app.click('#opponents-dialog .close-dialog');
      await waitForNativeHeroTurn(app);
      await app.evaluate(() => {
        const audio = document.querySelector('audio[data-background-music]');
        window.__polishCues = [];
        window.__steadyMusic = { audio, started: audio.currentTime, samples: [] };
        window.__steadyMusic.timer = setInterval(
          () =>
            window.__steadyMusic.samples.push({
              gain: Number(audio.dataset.musicGain),
              paused: audio.paused,
              samePlayer: document.querySelector('audio[data-background-music]') === audio,
            }),
          20,
        );
      });
      const state = await app.state();
      if (state.legal.canRaise) await app.click('#raise-button');
      else {
        assert.ok(state.legal.callAmount > 0, 'A real paid action is required for chip audio');
        await app.click('#call-button');
      }
      const cue = await app.waitFor(
        () => app.evaluate(() => window.__polishCues.find((cue) => cue.samples === 22491)),
        10000,
        'An actual wager must play the new chip stack',
      );
      assert.ok(cue.rms > 0.05 && cue.rms < 0.06);
      assert.ok(cue.peak <= 0.78);
      assert.equal(cue.musicGain, 1, 'A real wager must not lower music volume');
      await app.sleep(900);
      const steady = await app.evaluate(() => {
        const probe = window.__steadyMusic;
        clearInterval(probe.timer);
        return { started: probe.started, ended: probe.audio.currentTime, samples: probe.samples };
      });
      assert.ok(steady.samples.length >= 20);
      assert.ok(steady.ended > steady.started);
      assert.ok(
        steady.samples.every((sample) => sample.gain === 1 && !sample.paused && sample.samePlayer),
      );
      await app.screenshot('music-and-chip-stack');
      return {
        music,
        cue,
        steady,
        scope:
          'Installed production AAC playback and real wager PCM; no synthetic deal, physical hearing not assessed',
      };
    } finally {
      await app.evaluate(() => {
        clearInterval(window.__steadyMusic?.timer);
        delete window.__steadyMusic;
        AudioBufferSourceNode.prototype.start = window.__polishStart;
        delete window.__polishStart;
        delete window.__polishCues;
      });
    }
  });
  await check('background-music-loop-and-independent-vibration', async () => {
    await app.click('#opponents-button');
    const read = () =>
      app.evaluate(() => {
        const audio = document.querySelector('audio[data-background-music]');
        return audio
          ? {
              paused: audio.paused,
              loop: audio.loop,
              time: audio.currentTime,
              duration: audio.duration,
              ready: audio.readyState,
              source: audio.currentSrc,
            }
          : null;
      });
    const initial = await app.waitFor(
      async () => {
        const state = await read();
        return state && !state.paused && state.ready >= 2 && state.time > 0.1 ? state : null;
      },
      15000,
      'Local bundled background music must decode and advance',
    );
    assert.equal(initial.loop, true);
    assert.ok(initial.duration > 93 && initial.duration < 94);
    assert.ok(initial.source.endsWith('/audio/background-music-mobile.m4a'));
    await app.evaluate(watchNativeMusicLoop);
    await app.evaluate(() => {
      const audio = document.querySelector('audio[data-background-music]');
      window.__musicLifecycle = [];
      window.__musicLifecycleListener = ({ detail }) =>
        window.__musicLifecycle.push({
          active: detail.active,
          paused: audio.paused,
          time: audio.currentTime,
        });
      document.addEventListener('noir:app-state', window.__musicLifecycleListener);
    });
    const wrapped = await app.waitFor(
      async () => {
        const state = await read();
        const loop = await app.evaluate(() => window.__nativeMusicLoop);
        return state && !state.paused && loop?.wrapped ? { ...state, loop } : null;
      },
      10000,
      'The installed music player must loop beyond the end',
    );
    await app.evaluate(() => window.__stopNativeMusicLoopProbe());
    await app.click('#opponents-dialog .close-dialog');
    const background = await app.background();
    await app.sleep(1500);
    const backgroundState = await app.nativeState();
    assert.ok([2, 3].includes(backgroundState), 'Music check requires a real native background');
    const backgroundMs = performance.now() - background.startedAt;
    await app.activate();
    const events = await app.evaluate(() => {
      document.removeEventListener('noir:app-state', window.__musicLifecycleListener);
      return window.__musicLifecycle;
    });
    assert.ok(events.some((event) => !event.active && event.paused));
    await app.waitFor(
      async () => !(await read())?.paused,
      10000,
      'Music must resume in the foreground',
    );
    await app.click('#opponents-button');
    await app.click('#vibration-button');
    assert.equal((await read()).paused, false);
    await app.screenshot('music-on-vibration-off');
    await app.click('#sound-button');
    assert.equal((await read()).paused, true);
    await app.click('#opponents-dialog .close-dialog');
    await app.relaunch();
    await app.click('#opponents-button');
    const saved = await app.evaluate(() => ({
      sound: document.querySelector('#sound-button').getAttribute('aria-checked'),
      vibration: document.querySelector('#vibration-button').getAttribute('aria-checked'),
      musicElements: document.querySelectorAll('audio[data-background-music]').length,
    }));
    assert.deepEqual(saved, { sound: 'false', vibration: 'false', musicElements: 0 });
    await app.screenshot('music-and-vibration-disabled-after-restart');
    await app.click('#sound-button');
    await app.click('#vibration-button');
    await app.click('#opponents-dialog .close-dialog');
    return {
      initial,
      wrapped,
      background: { ...background, backgroundState, backgroundMs: Math.round(backgroundMs) },
      events,
      saved,
      scope:
        'Installed app local AAC decode, loop, lifecycle and independent preference persistence; not physical acoustic or motor acceptance',
    };
  });
  await check('hand-rankings-shortcut', async () => {
    await waitForNativeHeroTurn(app);
    const before = await app.state();
    const targets = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      await app.click('#hand-rankings-button');
      const target = await app.evaluate(() => {
        const dialog = document.querySelector('#rules-dialog');
        const body = dialog.querySelector('.guide-body');
        const target = dialog.querySelector('#hand-rankings').getBoundingClientRect();
        const header = dialog.querySelector('.dialog-header').getBoundingClientRect();
        return {
          open: dialog.open,
          offset: target.top - body.getBoundingClientRect().top,
          top: target.top,
          headerBottom: header.bottom,
          scrollTop: body.scrollTop,
        };
      });
      assert.ok(target.open && target.offset >= 0 && target.offset <= 14);
      assert.ok(target.top >= target.headerBottom && target.scrollTop > 50);
      targets.push(target);
      if (!attempt) {
        await waitForNativeGuidePaint(app);
        await app.screenshot('hand-rankings-target');
      }
      await app.click('#rules-dialog .dialog-header .close-dialog');
    }
    await app.click('#rules-button');
    await app.click('#guide-menu-item');
    assert.equal(
      await app.evaluate(() => document.querySelector('#rules-dialog .guide-body').scrollTop),
      0,
    );
    await app.click('#rules-dialog .dialog-header .close-dialog');
    assert.equal((await app.state()).hand, before.hand);
    return { targets, sameHand: true, normalGuideStartsAtTop: true };
  });
  await check('guide-sticky-header', async () => {
    await app.click('#rules-button');
    await app.click('#guide-menu-item');
    const before = await app.evaluate(() => {
      const header = document.querySelector('#rules-dialog .dialog-header');
      const body = document.querySelector('#rules-dialog .guide-body');
      const rect = header.getBoundingClientRect();
      body.scrollTop = body.scrollHeight;
      return { top: rect.top, bottom: rect.bottom };
    });
    const after = await app.waitFor(
      () =>
        app.evaluate(() => {
          const header = document
            .querySelector('#rules-dialog .dialog-header')
            .getBoundingClientRect();
          const body = document.querySelector('#rules-dialog .guide-body');
          return body.scrollTop > 100
            ? {
                top: header.top,
                bottom: header.bottom,
                bodyTop: body.getBoundingClientRect().top,
                scrollTop: body.scrollTop,
              }
            : null;
        }),
      5000,
      'Guide body must scroll independently',
    );
    assert.ok(Math.abs(after.top - before.top) < 1);
    assert.ok(Math.abs(after.bottom - before.bottom) < 1);
    assert.ok(after.top >= 0 && after.bodyTop >= after.bottom - 1);
    await waitForNativeGuidePaint(app);
    await app.screenshot('guide-header-after-scroll');
    await app.click('#rules-dialog .dialog-header .close-dialog');
    assert.equal(await app.evaluate(() => document.querySelector('#rules-dialog').open), false);
    return { before, after, scope: 'Installed app guide scrolling and fixed header geometry' };
  });
  await check('style-tag-long-press', async () => {
    await app.waitHero();
    const selector = '#seats .seat-style-label';
    await app.evaluate((selector) => {
      const label = document.querySelector(selector);
      const events = new AbortController();
      window.__noirTooltipEvents = [];
      window.__noirTooltipStop = () => events.abort();
      const record = (type, event) => {
        if (window.__noirTooltipEvents.length >= 256) return;
        const tip = document.querySelector('#seat-name-tooltip');
        window.__noirTooltipEvents.push({
          type,
          at: performance.now(),
          target: event?.target?.className,
          x: event?.clientX,
          y: event?.clientY,
          button: event?.button,
          connected: label.isConnected,
          visible: tip && !tip.hidden,
        });
      };
      for (const type of [
        'pointerdown',
        'pointerup',
        'pointercancel',
        'touchstart',
        'touchend',
        'contextmenu',
        'scroll',
      ])
        document.addEventListener(type, (event) => record(type, event), {
          capture: true,
          signal: events.signal,
        });
      document.addEventListener(
        'pointerdown',
        () => {
          for (const delay of [100, 400, 500, 700])
            setTimeout(() => record(`after-${delay}`), delay);
        },
        { once: true, signal: events.signal },
      );
    }, selector);
    const before = await app.evaluate((selector) => {
      const label = document.querySelector(selector);
      return {
        text: label.getAttribute('data-full-name'),
        hand: window.noir.getState().hand,
      };
    }, selector);
    let tooltip;
    try {
      await app.nativeHold(selector);
      tooltip = await app.waitFor(
        () =>
          app.evaluate(() => {
            const el = document.querySelector('#seat-name-tooltip');
            return el && !el.hidden
              ? { text: el.textContent, selected: getSelection().toString() }
              : null;
          }),
        5000,
        'A real native touch hold must open the style name',
      );
    } catch (error) {
      error.tooltipDiagnostics = await app.evaluate(() => window.__noirTooltipEvents);
      throw error;
    } finally {
      await app.evaluate(() => window.__noirTooltipStop?.());
    }
    assert.equal(tooltip.text, before.text);
    assert.equal(tooltip.selected, '');
    assert.equal((await app.state()).hand, before.hand);
    await app.screenshot('style-tag-native-hold');
    await app.click('#arena .hero-identity');
    assert.equal(
      await app.evaluate(() => document.querySelector('#seat-name-tooltip').hidden),
      true,
    );
    return { before, tooltip, scope: 'Installed app, real native pointer hold, no text selection' };
  });
  await check('mixed-toggle-and-visual-guide', async () => {
    await app.click('#opponents-button');
    if (
      await app.evaluate(
        () => document.querySelector('#mix-opponents').getAttribute('aria-pressed') === 'true',
      )
    )
      await app.click('#mix-opponents');
    await app.select('[data-bot-seat="1"]', 'rook');
    await app.select('[data-bot-seat="2"]', 'balanced');
    await app.click('#mix-opponents');
    assert.equal(
      await app.evaluate(() =>
        document.querySelector('#mix-opponents').getAttribute('aria-pressed'),
      ),
      'true',
    );
    // A random mixed allocation can already be Owen. Make an actual changed
    // selection so the native picker emits the user's ownership event.
    if (await app.evaluate(() => document.querySelector('[data-bot-seat="3"]').value === 'owen'))
      await app.select('[data-bot-seat="3"]', 'jett');
    await app.select('[data-bot-seat="3"]', 'owen');
    await app.click('#mix-opponents');
    const assignments = await app.evaluate(() =>
      [1, 2, 3].map((id) => document.querySelector(`[data-bot-seat="${id}"]`).value),
    );
    assert.deepEqual(assignments, ['rook', 'balanced', 'owen']);
    await app.click('#opponents-dialog .close-dialog');
    await app.click('#rules-button');
    await app.click('#guide-menu-item');
    const guide = await app.evaluate(() => ({
      hands: document.querySelectorAll('.hand-example').length,
      cards: document.querySelectorAll('.guide-card').length,
      positions: document.querySelector('.position-glossary').textContent,
      text: document.querySelector('#rules-dialog').textContent.replace(/\s+/g, ' '),
      glossary: document.querySelector('#review-glossary')?.textContent,
      glossaryEntries: document.querySelectorAll('#review-glossary .position-glossary > div')
        .length,
    }));
    assert.equal(guide.hands, 9);
    assert.equal(guide.glossaryEntries, 29);
    assert.match(guide.glossary, /底池赔率／保本胜率.*全下只会结束自己的下注选择/s);
    assert.match(guide.glossary, /主动权.*并不改变行动顺序/s);
    assert.match(guide.glossary, /权益把获胜和平分计为底池份额/);
    assert.equal(guide.cards, 45);
    assert.ok(guide.positions.includes('HJ · Hijack') && guide.positions.includes('CO · Cutoff'));
    assert.ok(guide.text.includes('选择加注 1.2K 则补 1K'));
    assert.ok(guide.text.includes('至少要加到 1K'));
    assert.ok(!/\b(?:1200|1000)\b/.test(guide.text), 'Guide chip examples must use K');
    await app.screenshot('visual-beginner-guide');
    await app.evaluate(() =>
      document.querySelector('#review-glossary').scrollIntoView({ block: 'start' }),
    );
    await app.screenshot('review-terms-glossary');
    await app.click('#rules-dialog .icon-button.close-dialog');
    return { assignments, guide };
  });
  await check('settings-autosave-and-local-portraits', async () => {
    await app.waitHero();
    await app.click('#opponents-button');
    const languageChanges = [];
    const changeLanguage = async (target) => {
      const before = await app.evaluate(() => ({
        language: document.querySelector('#language-select').value,
        timeOrigin: performance.timeOrigin,
        hand: window.noir.getState().hand,
      }));
      if (before.language === target) return;
      await app.select('#language-select', target);
      // Catalog loading updates the current document. Check translated text,
      // the open dialog and the hand as well as the locale attribute.
      const after = await app.waitFor(
        async () => {
          const loaded = await app.evaluate(() => ({
            language: document.documentElement.lang,
            timeOrigin: performance.timeOrigin,
            ready: document.documentElement.dataset.appReady === 'true',
            initialized: Boolean(window.noir?.getState()),
            settingsOpen: document.querySelector('#opponents-dialog')?.open,
            title: document.querySelector('#opponents-dialog h2')?.textContent.trim(),
            hand: window.noir?.getState().hand,
          }));
          return loaded.language === target &&
            loaded.title === { en: 'Settings', ko: '설정', 'zh-CN': '设置' }[target] &&
            loaded.ready &&
            loaded.initialized
            ? loaded
            : null;
        },
        30000,
        `Language ${target} must finish localizing the installed document`,
      );
      assert.equal(after.timeOrigin, before.timeOrigin, 'Changing language must not reload');
      assert.equal(after.settingsOpen, true, 'Changing language must keep settings open');
      assert.equal(after.hand, before.hand, 'Changing language must not start another hand');
      languageChanges.push({
        from: before.language,
        to: after.language,
        beforeTimeOrigin: before.timeOrigin,
        afterTimeOrigin: after.timeOrigin,
      });
    };
    const initialLanguage = await app.evaluate(() => document.documentElement.lang);
    // Force a real change even on a simulator that already starts in Chinese;
    // this exercises the same live catalog path as an English CI simulator.
    await changeLanguage(initialLanguage === 'en' ? 'zh-CN' : 'en');
    await changeLanguage('zh-CN');
    const chineseTags = await readNativePersonaTags(app);
    await changeLanguage('ko');
    const koreanTags = await readNativePersonaTags(app);
    assert.ok(chineseTags.tags.length > 0);
    assert.equal(koreanTags.tags.length, chineseTags.tags.length);
    for (let index = 0; index < chineseTags.tags.length; index++) {
      assert.ok(
        Math.abs(koreanTags.tags[index].height - chineseTags.tags[index].height) <= 0.6,
        'Korean persona tags retain their installed table height',
      );
      assert.equal(koreanTags.tags[index].fontSize, chineseTags.tags[index].fontSize);
    }
    assert.deepEqual(
      [koreanTags.hand, koreanTags.stack, koreanTags.hole, koreanTags.completedHands],
      [chineseTags.hand, chineseTags.stack, chineseTags.hole, chineseTags.completedHands],
    );
    await app.screenshot('korean-persona-tag-height');
    await changeLanguage('zh-CN');
    await app.select('#player-count', '5');
    await app.select('#emotion-mode', 'lively');
    await app.select('[data-bot-seat="1"]', 'rook');
    await app.click('#sound-button');
    await app.waitFor(
      async () => {
        const images = await app.evaluate(() =>
          [...document.querySelectorAll('#profile-cards img[data-portrait-profile]')].map(
            (image) => ({
              profile: image.dataset.portraitProfile,
              src: image.currentSrc || image.src,
              loaded: image.complete && image.naturalWidth > 0 && !image.hidden,
              local: new URL(image.currentSrc || image.src).origin === location.origin,
            }),
          ),
        );
        return images.length === 7 &&
          new Set(images.map((image) => image.profile)).size === 7 &&
          images.every((image) => image.loaded && image.local)
          ? images
          : null;
      },
      15000,
      'All retained portraits must load from the installed bundle',
    );
    const images = await app.evaluate(() =>
      [...document.querySelectorAll('#profile-cards img')].map((image) => ({
        profile: image.dataset.portraitProfile,
        source: new URL(image.src).pathname,
        width: image.naturalWidth,
      })),
    );
    if (app.comparePage)
      await app.comparePage('settings', [
        '#opponents-dialog',
        '.settings-dialog .dialog-header',
        '.general-settings',
        '.difficulty-module',
      ]);
    await app.click('#opponents-dialog .close-dialog');
    // Closing and relaunching exercises Capacitor Preferences, not just in-memory controls.
    await app.relaunch();
    await app.click('#opponents-button');
    const saved = await app.evaluate(() => ({
      language: document.querySelector('#language-select').value,
      players: document.querySelector('#player-count').value,
      emotion: document.querySelector('#emotion-mode').value,
      profile: document.querySelector('[data-bot-seat="1"]').value,
      sound: document.querySelector('#sound-button').getAttribute('aria-checked'),
    }));
    assert.deepEqual(saved, {
      language: 'zh-CN',
      players: '5',
      emotion: 'lively',
      profile: 'rook',
      sound: 'false',
    });
    await app.click('#opponents-dialog .close-dialog');
    return { saved, languageChanges, personaTags: { chineseTags, koreanTags }, portraits: images };
  });
  await check('pending-blinds-validation-retry-and-next-hand', async () => {
    const defaults = { smallBlind: 100, bigBlind: 200, startingStack: 20000, chipUnit: 100 };
    const configured = { smallBlind: 300, bigBlind: 600, startingStack: 60000, chipUnit: 300 };
    const readPreferences = async () => {
      await app.evaluate(() => {
        const probe = {
          status: 'pending',
          web: localStorage.getItem('noir-table-v1'),
        };
        window.__nativeStakesPrefsProbe = probe;
        // WKWebView execute/sync does not resolve a returned Promise. Observe
        // the real Preferences bridge result in a later serializable command.
        window.Capacitor.nativePromise('Preferences', 'get', { key: 'noir-table-v1' }).then(
          (result) => {
            probe.native = result.value;
            probe.status = 'resolved';
          },
          (error) => {
            probe.status = 'rejected';
            probe.error = String(error);
          },
        );
      });
      const probe = await app.waitFor(
        () =>
          app.evaluate(() => {
            const probe = window.__nativeStakesPrefsProbe;
            return probe?.status !== 'pending' ? probe : null;
          }),
        5000,
        'Read the installed native Preferences bridge result',
      );
      assert.equal(probe.status, 'resolved', probe.error);
      assert.ok(
        probe.native === null || typeof probe.native === 'string',
        'Native Preferences must return a saved string or an explicit missing value',
      );
      return { web: probe.web, native: probe.native };
    };
    const observeClick = async (selector) => {
      await app.evaluate((selector) => {
        window.__nativeStakesObservation = null;
        document.querySelector(selector).addEventListener(
          'click',
          () => {
            window.__nativeStakesObservation = {
              state: window.noir.getState(),
              hands: document.querySelector('#stat-hands').textContent,
              wins: document.querySelector('#stat-wins').textContent,
            };
          },
          { once: true },
        );
      }, selector);
      await app.click(selector);
      return app.evaluate(() => window.__nativeStakesObservation);
    };
    // The installed driver exposes clicks and evaluation, without a text-entry
    // helper. Dispatch a real input event on the visible editor; the production
    // input handler performs validation and saving. No game API sets this value.
    const inputSmallBlind = (value) =>
      app.evaluate((value) => {
        const input = document.querySelector('#small-blind-input');
        if (input.hidden || !input.getClientRects().length)
          throw Error('The installed small-blind editor must be visible');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, value);
    const finishHand = () =>
      app.waitFor(
        async () => {
          const game = await app.state();
          if (game.phase === 'done') return game;
          if (game.legal.enabled && !game.players[0].folded) await app.click('#fold-button');
          if (await app.visible('#continue-deal-button')) {
            try {
              await app.click('#continue-deal-button');
            } catch (error) {
              const settled = await app.state();
              if (settled.phase === 'done') return settled;
              throw error;
            }
          }
          // A slow native click can outlast the polling deadline while the
          // hand successfully settles. Return that observed result now.
          const settled = await app.state();
          return settled.phase === 'done' ? settled : null;
        },
        60000,
        'The real hand must settle before retry or applying queued blinds',
      );
    await app.waitHero();
    const original = await app.state();
    assert.deepEqual(original.stakes, defaults);
    assert.equal(original.pendingStakes, false);
    await app.click('#opponents-button');
    if ((await app.evaluate(() => document.documentElement.lang)) !== 'zh-CN') {
      await app.select('#language-select', 'zh-CN');
      await app.waitFor(
        () => app.evaluate(() => document.documentElement.lang === 'zh-CN'),
        30000,
        'Localize the installed blind editor before checking its Chinese notice',
      );
    }
    const initial = await app.evaluate(() => ({
      small: document.querySelector('#small-blind-button').textContent,
      big: document.querySelector('#big-blind-value').textContent,
      pendingHidden: document.querySelector('#stakes-change-note').hidden,
    }));
    assert.deepEqual(initial, { small: '100', big: '200', pendingHidden: true });
    const preferencesBefore = await app.waitFor(
      async () => {
        const preferences = await readPreferences();
        // An unchanged default table legitimately has no saved key yet.
        return (preferences.native === null || typeof preferences.native === 'string') &&
          preferences.native === preferences.web
          ? preferences
          : null;
      },
      5000,
      'Native and Web preference copies must agree before editing blinds',
    );
    await app.click('#small-blind-button');
    const invalid = [];
    for (const value of ['125.5', '50025']) {
      await inputSmallBlind(value);
      const error = await app.evaluate(() => {
        const element = document.querySelector('#stakes-error');
        return {
          visible: !element.hidden && Boolean(element.getClientRects().length),
          text: element.textContent,
          color: getComputedStyle(element).color,
          invalid: document.querySelector('#small-blind-input').getAttribute('aria-invalid'),
          big: document.querySelector('#big-blind-value').textContent,
        };
      });
      await app.screenshot(`pending-blinds-invalid-${value.replace('.', '-')}`);
      assert.equal(error.visible, true);
      assert.equal(error.invalid, 'true');
      assert.match(error.text, /25/);
      assert.match(error.text, /50K/);
      const [red, green, blue] = error.color.match(/[\d.]+/g).map(Number);
      assert.ok(red > green + 20 && red > blue + 20, 'Invalid input needs a red error message');
      assert.equal(error.big, '200');
      assert.deepEqual(await app.state(), original, 'Invalid input must preserve the live hand');
      assert.deepEqual(await readPreferences(), preferencesBefore, 'Invalid input must not save');
      invalid.push({ value, ...error });
    }
    await inputSmallBlind('300');
    const queued = await app.state();
    assert.deepEqual(queued, { ...original, requestedStakes: configured, pendingStakes: true });
    const note = await app.evaluate(() => ({
      big: document.querySelector('#big-blind-value').textContent,
      errorHidden: document.querySelector('#stakes-error').hidden,
      noteVisible: !document.querySelector('#stakes-change-note').hidden,
      note: document.querySelector('#stakes-change-note').textContent,
    }));
    assert.deepEqual(note, {
      big: '600',
      errorHidden: true,
      noteVisible: true,
      note: '下一手起始盲注300/600·筹码恢复为60K，统计重新开始',
    });
    const saved = await app.waitFor(
      async () => {
        const preferences = await readPreferences();
        return preferences.native === preferences.web &&
          JSON.parse(preferences.native)?.stakes?.smallBlind === 300
          ? preferences
          : null;
      },
      5000,
      'Valid pending blinds must save through the native Preferences bridge',
    );
    assert.deepEqual(JSON.parse(saved.native).stakes, configured);
    await app.screenshot('pending-blinds-valid-next-hand-note');
    await app.click('#opponents-dialog .close-dialog');
    const settled = await finishHand();
    const settledHands = Number(
      await app.evaluate(() => document.querySelector('#stat-hands').textContent),
    );
    assert.ok(settledHands > 0, 'The real original hand must record a completed-hand statistic');
    const budget = original.players.reduce((sum, player) => sum + player.stack, 0) + original.pot;
    assert.equal(
      settled.players.reduce((sum, player) => sum + player.stack, 0),
      budget,
    );
    const retried = await observeClick('#restart-hand-button');
    assert.deepEqual(retried.state.stakes, defaults);
    assert.deepEqual(retried.state.requestedStakes, configured);
    assert.equal(retried.state.pendingStakes, true);
    assert.equal(retried.state.hand, original.hand);
    assert.deepEqual(retried.state.hole, original.hole);
    assert.equal(retried.state.replayAttempt, original.replayAttempt + 1);
    assert.equal(
      Number(retried.hands),
      settledHands - 1,
      'Retry must retract the original completed hand exactly once',
    );
    assert.ok(retried.state.players.every((player) => (player.stack + player.bet) % 100 === 0));
    await app.screenshot('pending-blinds-retry-original-scale');
    await finishHand();
    assert.equal(
      Number(await app.evaluate(() => document.querySelector('#stat-hands').textContent)),
      settledHands,
      'The retried hand must restore the completed-hand statistic before the new-scale reset',
    );
    const applied = await observeClick('#next-button');
    assert.deepEqual(applied.state.stakes, configured);
    assert.deepEqual(applied.state.requestedStakes, configured);
    assert.equal(applied.state.pendingStakes, false);
    assert.equal(applied.state.hand, 1);
    assert.equal(applied.state.replayAttempt, 0);
    assert.equal(applied.hands, '0');
    assert.equal(applied.wins, '0');
    assert.ok(
      applied.state.players.every(
        (player) => player.stack + player.bet === configured.startingStack,
      ),
      'Every seat starts with 100 BB before the new hand posts its blinds',
    );
    assert.equal(
      applied.state.players.reduce((sum, player) => sum + player.stack, 0) + applied.state.pot,
      configured.startingStack * applied.state.playerCount,
      'The new denomination must conserve the reset table budget',
    );
    await app.screenshot('pending-blinds-applied-300-600-60K');
    await app.evaluate((stakes) => window.noir.setStakes(stakes), defaults);
    const restored = await app.state();
    assert.deepEqual(restored.stakes, defaults);
    assert.deepEqual(restored.requestedStakes, defaults);
    assert.equal(restored.pendingStakes, false);
    await app.waitFor(
      async () => JSON.parse((await readPreferences()).native)?.stakes?.smallBlind === 100,
      5000,
      'Restore default stakes for the remaining installed-app scenarios',
    );
    return {
      inputMethod: 'Visible input value plus bubbling input event through the native driver',
      invalid,
      note,
      saved: JSON.parse(saved.native),
      retry: retried,
      applied,
      restoredStakes: restored.stakes,
    };
  });
  await check('training-styles-and-persistence', async () => {
    const ids = ['balanced', 'rook', 'jett', 'owen', 'vale', 'nico', 'mira', 'iris'];
    await app.click('#opponents-button');
    const details = [];
    for (const id of ids) {
      await app.click(`[data-profile-preview="${id}"]`);
      await app.waitFor(
        () =>
          app.evaluate(() =>
            document
              .querySelector('#profile-detail')
              .getAnimations()
              .every((a) => a.playState !== 'running'),
          ),
        5000,
        'Profile circular reveal must finish before inspecting and closing it',
      );
      const detail = await app.evaluate(() => {
        const section = document.querySelector('#profile-detail .profile-research');
        return {
          text: section.textContent,
          claims: section.querySelectorAll('a').length,
          sections: section.querySelectorAll('.character-section').length,
          images: [...document.querySelectorAll('#profile-detail img')].map((i) => ({
            loaded: i.complete && i.naturalWidth > 0,
            src: i.getAttribute('src'),
          })),
          fallback: document.querySelector('#profile-detail .portrait-fallback').textContent,
          sources: document.querySelectorAll('#profile-detail .profile-source-records a').length,
          overflow: section.scrollWidth > section.clientWidth + 1,
        };
      });
      assert.equal(detail.sections, 5);
      assert.equal(detail.claims, 0);
      assert.equal(detail.sources, 0);
      assert.doesNotMatch(detail.text, /Triton|KPC|Phil Ivey|ST Wang|履历摘录|公开打法样本/);
      if (id === 'balanced') {
        assert.equal(detail.images.length, 0);
        assert.equal(detail.fallback, '均');
      } else {
        assert.equal(detail.images.length, 1);
        assert.ok(detail.images[0].loaded);
        assert.equal(detail.images[0].src, `/portraits/${id}.jpg`);
      }
      assert.equal(detail.overflow, false);
      if (id === 'iris') {
        await app.screenshot('delayed-aggression-style-detail');
        if (app.comparePage)
          await app.comparePage('player', [
            '#profile-detail',
            '.profile-detail-heading',
            '.profile-detail-content',
          ]);
      }
      details.push({ id, ...detail });
      if (await app.visible('[data-close-profile-detail]'))
        await app.click('[data-close-profile-detail]');
    }
    await app.select('[data-bot-seat="1"]', 'owen');
    await app.click('#opponents-dialog .close-dialog');
    await app.relaunch();
    const applied = await app.state();
    assert.equal(applied.players[1].botProfile, 'owen');
    await app.click('#opponents-button');
    const saved = await app.evaluate(() => document.querySelector('[data-bot-seat="1"]').value);
    assert.equal(saved, 'owen');
    await app.click('#opponents-dialog .close-dialog');
    return { details, saved, applied: applied.players[1].botProfile };
  });
  await check('raise-call-fold-and-settlement', async () => {
    await app.click('#opponents-button');
    await app.evaluate(() =>
      document.querySelector('input[name="difficulty"][value="hard"]').click(),
    );
    await app.click('#opponents-dialog .close-dialog');
    assert.equal(
      await app.evaluate(() => document.querySelector('input[name="difficulty"]:checked').value),
      'hard',
    );
    const coverage = { raise: null, call: null, fold: null };
    let settled;
    let settlementBudget;
    let beforeFold;
    // Capture public state immediately after the actual click handler, before
    // bot timers or an uncalled-bet refund can obscure the chip transfer.
    const actAndObserve = async (action) => {
      await app.evaluate((action) => {
        window.__nativeActionObservation = null;
        document.querySelector(`#${action}-button`).addEventListener(
          'click',
          () => {
            window.__nativeActionObservation = window.noir.getState();
          },
          { once: true },
        );
      }, action);
      await app.click(`#${action}-button`);
      return app.evaluate(() => window.__nativeActionObservation);
    };
    // A zero-priced call button is a check, not paid-call coverage. Real random
    // hands may also end immediately after a raise, so use bounded new deals.
    for (let decision = 0; decision < 45 && !Object.values(coverage).every(Boolean); decision++) {
      if ((await app.state()).phase === 'done') await app.click('#next-button');
      const turn = await app.waitFor(
        async () => {
          const game = await app.state();
          return game.phase === 'done' || game.legal.enabled ? game : null;
        },
        90000,
        'A real hand must reach a hero decision or settlement',
      );
      if (turn.phase === 'done') continue;
      // Public pot includes all committed chips from earlier streets. A bot
      // may rebuy between real hands, so infer this hand's budget rather than
      // treating the initial five stacks as a permanent table balance.
      settlementBudget = turn.players.reduce((sum, player) => sum + player.stack, 0) + turn.pot;
      const action =
        !coverage.call && turn.legal.toCall > 0
          ? 'call'
          : !coverage.raise && turn.legal.canRaise
            ? 'raise'
            : coverage.call && coverage.raise
              ? 'fold'
              : 'call';
      if (action === 'raise') await app.click('[data-preset="min"]');
      if (action === 'fold') beforeFold = await app.evaluate(readTableLayout);
      const acted = await actAndObserve(action);
      assert.ok(acted, 'A real enabled click must reach the game handler');
      const paid = turn.stack - acted.stack;
      if (action === 'fold') assert.ok(acted.players[0].folded);
      else if (action === 'raise') {
        assert.equal(paid, turn.legal.minRaiseTo - turn.players[0].bet);
        assert.equal(acted.players[0].lastAction?.bet, turn.legal.minRaiseTo);
        assert.ok(paid > turn.legal.callAmount, 'Raise must pay beyond the call');
      } else {
        assert.equal(paid, Math.min(turn.legal.toCall, turn.stack));
      }
      assert.equal(acted.stack % 25, 0);
      if (action !== 'call' || paid > 0)
        coverage[action] = {
          hand: acted.hand,
          street: turn.street,
          action: acted.players[0].lastAction,
          paid,
          callRequired: action === 'call' ? turn.legal.toCall : undefined,
        };
      if (action === 'fold' && (await app.visible('#continue-deal-button'))) {
        try {
          await app.click('#continue-deal-button');
        } catch (error) {
          // Real bots can finish during a slow driver round trip. Only an
          // already completed hand makes the disappearing button expected.
          if ((await app.state()).phase !== 'done') throw error;
        }
      }
      if (action !== 'fold') continue;
      await app.waitFor(
        () =>
          app.evaluate(
            () =>
              window.noir.getState().phase === 'done' &&
              document.querySelector('#arena').classList.contains('is-done') &&
              !document.querySelector('#next-button').hidden &&
              document.querySelector('#continue-deal-button').hidden,
          ),
        60000,
        'Hand must complete its visible settlement after fold',
      );
      settled = await app.state();
    }
    assert.ok(
      Object.values(coverage).every(Boolean),
      'Bounded real decisions must exercise a paid call, raise and fold',
    );
    settled ??= await app.state();
    assert.equal(settled.pot % 25, 0);
    assert.ok(settled.players.every((player) => player.stack % 25 === 0));
    assert.equal(
      settled.players.reduce((sum, player) => sum + player.stack, 0),
      settlementBudget,
      'Settlement must conserve chips',
    );
    await app.waitFor(
      () =>
        app.evaluate(() =>
          document
            .querySelector('#board')
            .getAnimations({ subtree: true })
            .every((animation) => animation.playState !== 'running'),
        ),
      5000,
      'Visible public-card deal and highlight animations must finish before reading face rows',
    );
    const layout = await app.evaluate(readTableLayout);
    assertTableLayout(layout);
    assert.ok(
      Math.abs(layout.table.height - beforeFold.table.height) <= 1,
      'Settlement preserves the live table height',
    );
    // Real native taps can scroll the document to reveal a control. Compare
    // document coordinates so that scrolling cannot masquerade as layout shift.
    const scrollDelta = layout.scrollY - beforeFold.scrollY;
    assert.ok(Math.abs(layout.table.top - beforeFold.table.top + scrollDelta) <= 1);
    assert.ok(
      Math.abs(layout.dock.top - beforeFold.dock.top + scrollDelta) <= 1,
      'Only the control dock shrinks',
    );
    const buttons = layout.settledButtons;
    assert.ok(
      buttons.every((button) => Math.abs(button.top - buttons[0].top) <= 1 && button.height >= 38),
    );
    assert.ok(layout.dock.height <= 65 + layout.bottomInset, 'Settlement must use the compact row');
    const crownInspection = [];
    const initialPressed = await app.evaluate(() =>
      document.querySelector('.seat-crown .seat-peek').getAttribute('aria-pressed'),
    );
    for (let toggle = 0; toggle < 2; toggle++) {
      await app.click('.seat-crown .seat-peek');
      await app.waitFor(
        () =>
          app.evaluate(() =>
            document
              .querySelector('.seat-crown .mini-cards')
              .getAnimations({ subtree: true })
              .every((animation) => animation.playState !== 'running'),
          ),
        5000,
        'Finish the staggered seat reveal before measuring its final card bounds',
      );
      const inspection = await app.evaluate(() => {
        const seat = document.querySelector('.seat-crown'),
          header = document.querySelector('.hand-label').getBoundingClientRect(),
          profile = seat.querySelector('.seat-profile').getBoundingClientRect(),
          scale = new DOMMatrix(getComputedStyle(document.querySelector('#arena')).transform).a;
        return {
          pressed: seat.querySelector('.seat-peek').getAttribute('aria-pressed'),
          positionFont: parseFloat(
            getComputedStyle(seat.querySelector('.position-badge')).fontSize,
          ),
          nameFont: parseFloat(getComputedStyle(seat.querySelector('.seat-name-label')).fontSize),
          eyeWidth: parseFloat(getComputedStyle(seat.querySelector('.seat-peek')).width),
          eyeArtworkWidth: parseFloat(getComputedStyle(seat.querySelector('.seat-peek svg')).width),
          cards: [...seat.querySelectorAll('.playing-card')].map((card) => {
            const r = card.getBoundingClientRect();
            return {
              clearOfHeader: r.top >= header.bottom + 2 * scale - 0.5,
              insetFromProfile:
                r.left >= profile.left + scale - 0.5 && r.right <= profile.right - scale + 0.5,
              visibleFraction: (profile.top - r.top) / r.height,
            };
          }),
        };
      });
      const expected =
        toggle === 0 ? (initialPressed === 'true' ? 'false' : 'true') : initialPressed;
      assert.equal(inspection.pressed, expected);
      assert.ok(inspection.positionFont < inspection.nameFont);
      assert.ok(inspection.eyeWidth >= 20 && inspection.eyeWidth > inspection.positionFont);
      assert.ok(inspection.eyeArtworkWidth >= 15);
      assert.equal(inspection.cards.length, expected === 'true' ? 2 : 0);
      assert.ok(
        inspection.cards.every(
          (card) =>
            card.clearOfHeader &&
            card.insetFromProfile &&
            card.visibleFraction >= 0.65 &&
            card.visibleFraction <= 0.98,
        ),
        JSON.stringify(inspection),
      );
      const peekLayout = await app.evaluate(readTableLayout);
      assertTableLayout(peekLayout);
      for (const anchor of ['arena', 'publicArea'])
        for (const key of ['top', 'left', 'height', 'right'])
          assert.ok(
            Math.abs(
              peekLayout[anchor][key] +
                (key === 'top' ? peekLayout.scrollY - layout.scrollY : 0) -
                layout[anchor][key],
            ) <= 1,
            `${anchor} must stay fixed when inspecting the crown hand`,
          );
      if (expected === 'true') {
        // Layout reads can precede WebKit's compositor frame. Keep the hand
        // open until two frame callbacks have run before the native screenshot.
        await app.evaluate(() => {
          window.__nativeInspectionPainted = false;
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              window.__nativeInspectionPainted = true;
            }),
          );
        });
        await app.waitFor(
          () => app.evaluate(() => window.__nativeInspectionPainted),
          5000,
          'Inspected crown cards must paint before the native screenshot',
        );
        await app.screenshot('crown-hand-inspection');
      }
      crownInspection.push(inspection);
    }
    if (app.comparePage)
      await app.comparePage('settlement', [
        '.surface-top',
        '.table-viewport',
        '#board',
        '.hero-area',
        '.action-panel.settled-actions',
        '#showdown-stage',
      ]);
    return { coverage, pot: settled.pot, settlementBudget, layout, crownInspection };
  });
  await check('review-overflow-and-activity-size', async () => {
    await waitForNativeHeroTurn(app, { advanceSettled: true });
    await app.click('#fold-button');
    if (await app.visible('#continue-deal-button')) {
      try {
        await app.click('#continue-deal-button');
      } catch (error) {
        if ((await app.state()).phase !== 'done') throw error;
      }
    }
    await app.waitFor(
      async () => (await app.state()).phase === 'done',
      60000,
      'A real folded hand must settle',
    );
    await app.click('#review-hand-button');
    await waitForNativeReview(app);
    const heroTags = await app.evaluate(readReviewTagGeometry, '#review-timeline');
    for (const tag of heroTags)
      assert.ok(Math.abs(tag.height - tag.naturalHeight) <= 1, JSON.stringify(tag));
    const hero = await app.evaluate(() => {
      const track = document.querySelector('#review-timeline');
      return { count: track.children.length, hint: track.classList.contains('has-overflow') };
    });
    assert.equal(hero.hint, hero.count > 2);
    await app.click('#review-activity summary');
    const fontSize = await app.evaluate(
      () => getComputedStyle(document.querySelector('#review-activity-list li')).fontSize,
    );
    assert.equal(fontSize, '13px');
    await app.screenshot('review-activity-13px');
    await app.click('#review-opponents-tab');
    const opponentTags = await app.evaluate(
      readReviewTagGeometry,
      '#review-opponents .review-timeline',
    );
    assert.equal(opponentTags.length, 0, 'Opponent action cards omit every persona/style tag');
    const opponentCards = await app.evaluate(() =>
      [...document.querySelectorAll('#review-opponents .review-step')].map((card) => ({
        number: card.querySelector('.review-step-number')?.textContent,
        playerAndStreet: card.querySelector('small')?.textContent,
        action: card.querySelector('strong')?.textContent,
      })),
    );
    assert.ok(opponentCards.length > 0, 'Real recorded opponent action cards remain visible');
    opponentCards.forEach((card, index) => {
      assert.equal(card.number, String(index + 1));
      assert.ok(
        card.playerAndStreet?.split(/[，,]/).every((part) => part.trim()) &&
          card.playerAndStreet.split(/[，,]/).length >= 2,
        'Each opponent card retains its player and street',
      );
      assert.ok(card.action?.trim(), 'Each opponent card retains its executed action');
    });
    const overflow = await app.evaluate(() => {
      const track = document.querySelector('#review-opponents .review-timeline'),
        third = track.children[2]?.getBoundingClientRect(),
        box = track.getBoundingClientRect();
      return {
        count: track.children.length,
        hint: track.classList.contains('has-overflow'),
        fraction: third
          ? (box.right - parseFloat(getComputedStyle(track).paddingRight) - third.left) /
            third.width
          : null,
        scrollable: track.scrollWidth > track.clientWidth,
      };
    });
    assert.ok(overflow.count > 2, 'Recorded opponents supply at least three real decisions');
    assert.equal(overflow.hint, true);
    assert.ok(overflow.fraction > 0.45 && overflow.fraction < 0.55);
    assert.equal(overflow.scrollable, true);
    const numbers = await app.evaluate(() =>
      [...document.querySelectorAll('#review-opponents .review-step-number')].map((el) =>
        Number(el.textContent),
      ),
    );
    assert.deepEqual(
      numbers,
      Array.from({ length: overflow.count }, (_, index) => index + 1),
    );
    await app.screenshot('review-two-and-half-cards');
    await app.evaluate(() => {
      const track = document.querySelector('#review-opponents .review-timeline');
      track.scrollLeft = track.scrollWidth;
    });
    const last = overflow.count - 1;
    await app.click(`[data-opponent-index="${last}"]`);
    const selected = await app.evaluate(() => ({
      index: document.querySelector('#review-opponents [aria-current="step"]').dataset
        .opponentIndex,
      scroll: document.querySelector('#review-opponents .review-timeline').scrollLeft,
    }));
    assert.equal(selected.index, String(last));
    assert.ok(selected.scroll > 0);
    await app.click('#review-dialog .icon-button.close-dialog');
    // The next scenario reopens this hand's settled review before retrying it.
    assert.equal((await app.state()).phase, 'done');
    return {
      hero,
      heroTags,
      opponentTags,
      overflow,
      fontSize,
      selected,
      scope: 'Installed production UI and a real recorded hand; no injected deal or review fixture',
    };
  });
  await check('settlement-decision-review', async () => {
    await app.click('#review-hand-button');
    const review = await waitForNativeReview(app);
    assert.equal(
      await app.evaluate(
        () =>
          document.querySelectorAll('.review-summary, #review-overview, #review-priority').length,
      ),
      0,
    );
    await app.screenshot('settlement-decision-review-open');
    const presentation = await app.evaluate(() => ({
      removed: document.querySelectorAll(
        '#review-advanced, #review-your-action, #review-suggestion, #review-simulation',
      ).length,
      evidence: document.querySelectorAll('#review-evidence li').length,
      keep: document.querySelector('#review-selected-status').textContent === '值得保留',
      focusHidden: document.querySelector('#review-practice-focus').hidden,
      reason: document.querySelector('#review-coach-explanation').textContent,
      keyInfo: document.querySelector('#review-evidence').textContent,
      method: document.querySelectorAll('.review-method, #review-method').length,
      rangeNotes: document.querySelectorAll('#review-coach-explanation .review-range-note').length,
    }));
    assert.equal(presentation.removed, 0);
    assert.ok(presentation.reason.indexOf('当前牌面') < presentation.reason.indexOf('当前牌力'));
    assert.match(presentation.reason, /当前牌面.*当前牌力/s);
    assert.ok(presentation.evidence >= 4);
    assert.equal(presentation.focusHidden, presentation.keep);
    assert.equal(presentation.method, 0);
    assert.equal(presentation.rangeNotes, 0);
    assert.doesNotMatch(
      presentation.reason,
      /相同牌力可能平分底池|不能只按成牌标签|是在回应这笔下注|已有过牌之后争取底池/,
    );
    assert.doesNotMatch(presentation.reason, /EV|模型|模拟器|抽样|新增投入/);
    assert.doesNotMatch(presentation.reason + presentation.keyInfo, /；/);
    assert.match(
      presentation.keyInfo,
      /这次(?:弃牌不再投入|过牌无需投入|(?:全下|加注|跟注|跟注全下)拿出)/,
    );
    assert.doesNotMatch(presentation.keyInfo, /有效剩余|新增投入/);
    const analysisLayout = await app.evaluate(() => ({
      oldControls: document.querySelectorAll(
        '#review-public-actions, .review-step-nav, [data-opponent-nav]',
      ).length,
      sections: document.querySelectorAll('#review-coach-explanation [data-matchup-direction]')
        .length,
      preflop: document.querySelectorAll('#review-board .playing-card').length === 0,
      collapsed: !document.querySelector('#review-activity').open,
      summary: document.querySelector('#review-coach-explanation .review-analysis-heading')
        ?.textContent,
      losingExamples: document.querySelectorAll(
        '#review-coach-explanation [data-matchup-direction="behind"] .review-matchup-example',
      ).length,
    }));
    assert.equal(analysisLayout.oldControls, 0);
    assert.equal(analysisLayout.sections, analysisLayout.preflop ? 1 : 2);
    assert.equal(analysisLayout.collapsed, true);
    assert.equal(analysisLayout.summary, '复盘分析总结');
    assert.ok(analysisLayout.losingExamples <= 4);
    await app.click('#review-activity summary');
    assert.ok(
      await app.evaluate(
        () =>
          document.querySelectorAll('#review-activity-list .review-activity-emphasis').length > 0,
      ),
    );
    await app.screenshot('review-activity-expanded');
    await app.click('#review-activity summary');
    const observedDeceptiveMotives = [];
    if (app.comparePage) {
      await app.comparePage('review', [
        '#review-dialog',
        '.review-title-row',
        '.review-tabs',
        '#review-timeline',
        '.review-scene',
      ]);
      await app.click('#review-opponents-tab');
      const opponent = await app.evaluate(() => ({
        metrics: document.querySelectorAll('.opponent-metrics').length,
        removed: document.querySelectorAll(
          '#review-opponent-detail .review-choice, #review-opponent-detail .review-status, #review-opponent-detail details',
        ).length,
        reason: document.querySelector('#review-opponent-detail .review-explanation')?.textContent,
        rangeNotes: document.querySelectorAll('#review-opponent-detail .review-range-note').length,
        scope: document.querySelector('.review-scope').textContent,
      }));
      assert.ok(opponent.reason);
      assert.equal(opponent.metrics, 0);
      assert.equal(opponent.rangeNotes, 0);
      assert.doesNotMatch(opponent.reason, /相同牌力可能平分底池|补成顺子／同花/);
      assert.doesNotMatch(opponent.reason, /它|EV|模型|模拟器|抽样/);
      assert.equal(opponent.removed, 0);
      assert.match(opponent.scope, /按当时信息判断/);
      await app.comparePage('opponent-review', [
        '#review-dialog',
        '.review-tabs',
        '.review-opponent-heading',
      ]);
      const count = await app.evaluate(
        () => document.querySelectorAll('[data-opponent-index]').length,
      );
      for (let index = 0; index < Math.min(count, 24); index++) {
        await app.click(`[data-opponent-index="${index}"]`);
        const text = await app.evaluate(
          () => document.querySelector('#review-opponent-detail .review-explanation').textContent,
        );
        if (/埋牌|脏牌|donk|2–7/.test(text)) {
          if (text.includes('donk')) assert.match(text, /前一街进攻者/);
          if (text.includes('脏牌再加注')) assert.match(text, /阻断/);
          if (text.includes('2–7')) assert.match(text, /诈唬|试探下注/);
          observedDeceptiveMotives.push({ index, text });
        }
      }
      // Real deals only. A low-frequency branch is recorded if observed;
      // deterministic coverage belongs to external Web/DevTools fixtures.
      if (observedDeceptiveMotives.length) await app.screenshot('observed-deceptive-motive');
    }
    await app.click('#review-dialog .close-dialog');
    assert.equal(await app.evaluate(() => document.querySelector('#review-dialog').open), false);
    return { ...review, presentation, observedDeceptiveMotives };
  });
  await check('retry-original-deal-and-next-hand', async () => {
    const original = await app.state();
    const handsBefore = await app.evaluate(() => document.querySelector('#stat-hands').textContent);
    await app.click('#restart-hand-button');
    const retried = await app.state();
    assert.equal(retried.hand, original.hand);
    assert.deepEqual(retried.hole, original.hole);
    assert.equal(retried.replayAttempt, original.replayAttempt + 1);
    const handsAfter = await app.evaluate(() => document.querySelector('#stat-hands').textContent);
    assert.equal(
      Number(handsAfter),
      Number(handsBefore) - 1,
      'Retry retracts completed-hand statistics once',
    );
    await app.waitHero();
    await app.click('#fold-button');
    if (await app.visible('#continue-deal-button')) await app.click('#continue-deal-button');
    await app.waitFor(
      async () => (await app.state()).phase === 'done',
      60000,
      'Retried hand must settle',
    );
    await app.click('#next-button');
    const next = await app.state();
    assert.equal(next.hand, original.hand + 1);
    assert.equal(next.replayAttempt, 0);
    assert.ok(!next.players[0].folded);
    return {
      originalHand: original.hand,
      retry: retried.replayAttempt,
      nextHand: next.hand,
      retractedHands: { before: handsBefore, after: handsAfter },
    };
  });
  await check('real-background-cancels-pending-action', async () => {
    const heroTurn = await waitForNativeHeroTurn(app, { advanceSettled: true });
    // Observers only record public snapshots. No timers, cards, legal actions
    // or production behavior are replaced. Android hides WebView debugging in
    // the background, so capture both real native lifecycle boundaries.
    await app.evaluate(() => {
      window.__nativeLifecycleObservations = [];
      document.addEventListener('noir:app-state', ({ detail }) => {
        window.__nativeLifecycleObservations.push({
          active: detail.active,
          at: Date.now(),
          state: window.noir.getState(),
        });
      });
    });
    // Prepare realm identity before observing the short real opponent window.
    // HOME then freezes the app before slow context discovery can miss it.
    await app.preserveForegroundPage?.();
    await waitForPendingOpponent(app);
    const immediateHome = pressSelectedAndroidHome({ platform: app.platform });
    const nativeBackground = await app.background();
    await app.sleep(6000);
    const stillBackgrounded = await app.nativeState();
    const backgroundMs = performance.now() - nativeBackground.startedAt;
    assert.ok([2, 3].includes(stillBackgrounded), 'App must still be natively backgrounded');
    assert.ok(backgroundMs >= 6000, 'Native app must remain in the background for six seconds');
    await app.activate();
    const boundaries = await app.evaluate(() => window.__nativeLifecycleObservations);
    const hiddenIndex = boundaries.findIndex((entry) => !entry.active);
    const paused = boundaries[hiddenIndex];
    const resumed = boundaries.slice(hiddenIndex + 1).find((entry) => entry.active);
    assert.ok(paused && resumed, 'Native inactive and active events must both arrive');
    assert.equal(paused.state.phase, 'playing');
    assert.ok(paused.state.actor && paused.state.actor !== '你');
    assert.deepEqual(
      resumed.state,
      paused.state,
      'Game must not advance while the native app is in the background',
    );
    await app.waitFor(
      async () => {
        const current = await app.state();
        return JSON.stringify(current) !== JSON.stringify(paused.state);
      },
      45000,
      'Game should resume after native foreground event',
    );
    return {
      heroTurn,
      backgroundMs: Math.round(backgroundMs),
      nativeStateBefore: nativeBackground.nativeState,
      nativeStateAfter: stillBackgrounded,
      jsLifecycleIntervalMs: resumed.at - paused.at,
      pausedActor: paused.state.actor,
      pausedHand: paused.state.hand,
      pausedPhase: paused.state.phase,
      immediateHome,
    };
  });
  if (app.comparePage)
    await check('every-player-count-matches-web', async () => {
      const comparisons = [];
      for (const count of [5, 6, 7, 8, 9]) {
        await app.click('#opponents-button');
        await app.select('#player-count', String(count));
        comparisons.push(
          await app.comparePage(`settings-${count}`, [
            '#opponents-dialog',
            '.general-settings',
            '#player-count',
            '.seats-module',
          ]),
        );
        await app.click('#opponents-dialog .close-dialog');
        await app.click('#reset-button');
        await app.click('#confirm-reset');
        await app.waitFor(async () => (await app.state()).playerCount === count, 15000);
        await app.waitHero();
        await app.evaluate(() => window.scrollTo(0, 0));
        assertTableLayout(await app.evaluate(readTableLayout));
        const liveGeometry = await app.evaluate(() => ({
          tableHeight: document.querySelector('.table-viewport').getBoundingClientRect().height,
          buttons: [...document.querySelectorAll('.action-panel .action')].map(
            (el) => el.getBoundingClientRect().height,
          ),
        }));
        assert.equal(liveGeometry.buttons.length, 3);
        for (const height of liveGeometry.buttons) assert.equal(height, 38);
        comparisons.push(
          await app.comparePage(`table-${count}`, [
            '.table-viewport',
            '#board',
            '.hero-area',
            '.action-panel',
            ...Array.from({ length: count - 1 }, (_, index) => `.seat-${index + 1}`),
          ]),
        );
        await app.click('#fold-button');
        if (await app.visible('#continue-deal-button')) {
          try {
            await app.click('#continue-deal-button');
          } catch (error) {
            if ((await app.state()).phase !== 'done') throw error;
          }
        }
        await app.waitFor(async () => (await app.state()).phase === 'done', 90000);
        const settledGeometry = await app.evaluate(() => ({
          tableHeight: document.querySelector('.table-viewport').getBoundingClientRect().height,
          buttons: [...document.querySelectorAll('.settled-actions > button:not([hidden])')].map(
            (el) => el.getBoundingClientRect().height,
          ),
        }));
        assert.equal(settledGeometry.tableHeight, liveGeometry.tableHeight);
        assert.ok(settledGeometry.buttons.length >= 3);
        for (const height of settledGeometry.buttons) assert.equal(height, 38);
        comparisons.push(
          await app.comparePage(`settlement-${count}`, [
            '.table-viewport',
            '#board',
            '.hero-area',
            '.action-panel.settled-actions',
            '#showdown-stage',
          ]),
        );
        await app.click('#review-hand-button');
        await waitForNativeReview(app);
        comparisons.push(
          await app.comparePage(`review-${count}`, [
            '#review-dialog',
            '.review-tabs',
            '#review-timeline',
            '.review-scene',
          ]),
        );
        await app.click('#review-dialog .close-dialog');
      }
      return comparisons;
    });
  if (app.comparePage)
    await check('all-secondary-pages-match-web', async () => {
      const comparisons = [];
      await app.click('#rules-button');
      await app.click('#guide-menu-item');
      comparisons.push(
        await app.comparePage('guide', [
          '#rules-dialog',
          '#rules-dialog .dialog-header',
          '#rules-dialog h2',
          '.rules-flow',
        ]),
      );
      await app.click('#rules-dialog .close-dialog');
      await app.click('.pot-details-trigger');
      comparisons.push(
        await app.comparePage('pots', [
          '#pot-dialog',
          '#pot-dialog .dialog-header',
          '#pot-dialog-title',
          '.pot-detail-card',
        ]),
      );
      await app.click('#pot-dialog .close-dialog');
      await app.click('#reset-button');
      comparisons.push(
        await app.comparePage('reset', [
          '#reset-dialog',
          '#reset-dialog .dialog-header',
          '#reset-dialog h2',
          '.dialog-actions',
        ]),
      );
      await app.click('#reset-dialog .close-dialog');
      await app.evaluate(() => document.querySelector('.session-card').scrollIntoView());
      const stickyChrome = await app.evaluate(() => {
        const header = document.querySelector('.header'),
          style = getComputedStyle(header);
        return {
          top: header.getBoundingClientRect().top,
          inset: parseFloat(style.top),
          background: style.backgroundColor,
          cap: getComputedStyle(header, '::before').backgroundColor,
        };
      });
      assert.ok(
        Math.abs(stickyChrome.top - stickyChrome.inset) <= 1,
        'Header remains at the native safe area while scrolling',
      );
      assert.equal(stickyChrome.background, 'rgb(10, 16, 22)');
      assert.equal(stickyChrome.cap, stickyChrome.background);
      comparisons.push(
        await app.comparePage('session-activity', [
          '.session-card',
          '.activity-card',
          '.session-card .section-title',
        ]),
      );
      await app.evaluate(() => window.scrollTo(0, 0));
      await app.click('#native-about-button');
      comparisons.push(
        await app.comparePage('about', [
          '#native-about-dialog',
          '#native-about-dialog h2',
          '#native-about-dialog p',
        ]),
      );
      await app.click('#native-about-dialog a[href="./app-privacy.html"]');
      await app.waitFor(
        async () => app.evaluate(() => !!document.querySelector('#policy-language')),
        15000,
        'Local privacy policy must load',
      );
      comparisons.push(
        await app.comparePage('privacy', [
          'main',
          '#policy-language',
          'article:not([hidden]) h1',
          'article:not([hidden]) p',
        ]),
      );
      await app.click('article:not([hidden]) a[href="./"]');
      await app.waitFor(
        async () =>
          (await app.evaluate(
            () =>
              document.documentElement.dataset.appReady === 'true' &&
              typeof window.noir?.getState === 'function' &&
              !!window.noir.getState(),
          )) && (await app.visible('#reset-button')),
        15000,
        'The privacy return link must load a ready game before the next scenario',
      );
      return comparisons;
    });
  await check('records-history-pot-dialog-and-return', async () => {
    await app.waitFor(
      async () => {
        const game = await app.state();
        return game.phase === 'done' || game.legal.enabled;
      },
      90000,
      'Real practice must reach a hero decision',
    );
    if ((await app.state()).phase !== 'done') await app.click('#fold-button');
    if ((await app.state()).canContinue) {
      try {
        await app.click('#continue-deal-button');
      } catch (error) {
        // Opponents can settle during the real native tap's measurement.
        // Only accept the disappearing optional control after proving done.
        if (
          !/target geometry did not stabilize|zero size|stale element|not interactable/.test(
            error.message,
          ) ||
          (await app.state()).phase !== 'done'
        )
          throw error;
      }
    }
    await app.waitFor(
      async () => (await app.state()).phase === 'done',
      90000,
      'Real hand must settle',
    );
    const liveHand = (await app.state()).hand;
    const record = await app.evaluate(() =>
      window.noir
        .getRecords()[0]
        .attempts.findLast(
          (hand) => hand.status === 'completed' && hand.hand === window.noir.getState().hand,
        ),
    );
    assert.ok(record?.snapshot);
    await app.click('#rules-button');
    await app.click('#records-menu-item');
    await app.click(`[data-record-hand="${record.id}"]`);
    const details = await app.evaluate(() => ({
      page: document.body.dataset.recordsPage,
      standalonePots: document.querySelectorAll('.records-settlement').length,
      showdownVisible: !document.querySelector('#history-showdown-stage').hidden,
      showdownPlayers: document.querySelectorAll('#history-showdown-scene .showdown-player').length,
    }));
    assert.equal(details.page, 'hand');
    assert.equal(details.standalonePots, 0);
    const showdownCount = record.snapshot.showdown
      ? record.snapshot.players.filter((player) => !player.folded).length
      : 0;
    assert.equal(details.showdownVisible, showdownCount > 0);
    assert.equal(details.showdownPlayers, showdownCount);
    await app.screenshot('records-history-current-layout');
    await app.click('#history-pot-details-button');
    assert.equal(await app.evaluate(() => document.querySelector('#pot-dialog').open), true);
    const awards = await app.evaluate(() =>
      [...document.querySelectorAll('#pot-dialog .pot-award')].map((row) =>
        Number(row.dataset.awardPlayer),
      ),
    );
    assert.deepEqual(
      awards,
      record.snapshot.pots.flatMap((pot) => pot.awards.map((award) => award.id)),
    );
    await app.screenshot('records-history-current-pot-dialog');
    await app.click('#pot-dialog .icon-button.close-dialog');
    await app.back();
    await app.waitFor(
      () => app.evaluate(() => document.body.dataset.recordsPage === 'list'),
      10000,
      'Native Back returns to records',
    );
    await app.click('#records-back-button');
    await app.waitFor(
      () =>
        app.evaluate(
          () =>
            document.body.dataset.recordsPage === 'game' &&
            !document.querySelector('main.main').hidden,
        ),
      10000,
      'Return Game leaves the records visit',
    );
    assert.equal((await app.state()).hand, liveHand);
    return { attempt: record.id, details, awards, returnedToGame: true };
  });
  await check('game-records-pages-retry-and-resume', async () => {
    await app.click('#reset-button');
    await app.click('#confirm-reset');
    const finish = async () => {
      const turn = await app.waitFor(
        async () => {
          const current = await app.state();
          return current.phase === 'done' || current.legal.enabled ? current : null;
        },
        90000,
        'Real play must reach a hero decision or settlement',
      );
      if (turn.phase !== 'done') await app.click('#fold-button');
      const afterFold = await app.state();
      if (afterFold.phase !== 'done' && afterFold.canContinue) {
        try {
          // On a short viewport, nearest scrolling can leave the fast-finish
          // control underneath the fixed native header. Center the actual
          // control before the normal WebDriver click.
          await app.evaluate(() =>
            document.querySelector('#continue-deal-button').scrollIntoView({
              block: 'center',
              inline: 'nearest',
              behavior: 'instant',
            }),
          );
          await app.click('#continue-deal-button');
        } catch (error) {
          // Opponents may settle during the native click's scroll/locate
          // round trips. Accept that race only after proving real settlement.
          if (
            !/zero size|stale element|not interactable|element click intercepted/.test(
              error.message,
            ) ||
            (await app.state()).phase !== 'done'
          )
            throw error;
        }
      }
      return app.waitFor(
        async () => {
          const current = await app.state();
          return current.phase === 'done' ? current : null;
        },
        90000,
        'The actual installed game must finish before archiving',
      );
    };
    let settled, first;
    for (let attempt = 0; attempt < 6; attempt++) {
      settled = await finish();
      first = await app.evaluate(() => window.noir.getRecords()[0].attempts.at(-1));
      if (first.snapshot.decisions.length) break;
      await app.click('#reset-button');
      await app.click('#confirm-reset');
    }
    assert.ok(
      first.snapshot.decisions.length,
      'Historical review needs a real recorded hero decision',
    );
    assert.equal(first.status, 'completed');
    assert.equal(first.snapshot.deck, undefined);
    assert.equal(first.hand, settled.hand);
    await app.sleep(1000);
    await app.screenshot('game-records-live-settlement');
    const liveGeometry = await app.evaluate(readRecordTableGeometry, '#arena');
    await app.click('#restart-hand-button');
    const retried = await app.state();
    assert.equal(retried.replayAttempt, 1);
    assert.deepEqual(retried.hole, settled.hole);
    await finish();
    const attempts = await app.evaluate(() => window.noir.getRecords()[0].attempts);
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].superseded, true);
    assert.equal(attempts[1].superseded, false);
    await app.click('#next-button');
    await app.click('#rules-button');
    await app.click('#records-menu-item');
    assert.equal(await app.visible('#records-page'), true);
    await app.click(`[data-record-hand="${first.id}"]`);
    assert.equal(await app.visible('#history-page'), true);
    const archiveBefore = await app.evaluate(() => ({
      title: document.querySelector('#records-title').textContent,
      startedAt: document.querySelector('#records-hand-start').dateTime,
      table: document.querySelector('#history-table').textContent,
      heroCards: document.querySelectorAll('#history-table .hero-cards .playing-card').length,
      redundantHeading: Boolean(document.querySelector('.records-history-heading')),
      live: window.noir.getState(),
    }));
    assert.equal(archiveBefore.heroCards, 2);
    assert.equal(archiveBefore.startedAt, new Date(first.startedAt).toISOString());
    assert.doesNotMatch(archiveBefore.title, /首次|[·\s]$/);
    assert.equal(archiveBefore.redundantHeading, false);
    await app.sleep(1000);
    await app.screenshot('game-records-historical-settlement');
    const historyGeometry = await app.evaluate(readRecordTableGeometry, '#history-arena');
    assert.deepEqual(
      recordGeometryDifferences(historyGeometry, liveGeometry),
      [],
      'The historical settlement must keep the live table cards, seats and captions in the same layout',
    );
    for (const top of [180, 420, 0]) {
      await app.evaluate((top) => window.scrollTo(0, top), top);
      await app.sleep(250);
      assert.deepEqual(
        recordGeometryDifferences(
          await app.evaluate(readRecordTableGeometry, '#history-arena'),
          historyGeometry,
        ),
        [],
        'Scrolling a native history page must preserve its table height and all seat geometry',
      );
    }
    await app.click('#history-review-button');
    const review = await waitForNativeReview(app);
    await app.click('#review-dialog .close-dialog');
    assert.equal(
      await app.evaluate(() => document.querySelector('#history-table').textContent),
      archiveBefore.table,
    );
    await app.back();
    await app.waitFor(
      () => app.visible('#history-page').then((visible) => !visible),
      10000,
      'Native Back must pop the detail to its records parent',
    );
    await app.click(`[data-record-hand="${attempts[1].id}"]`);
    const retryArchive = await app.evaluate(() => ({
      title: document.querySelector('#records-title').textContent,
      redundantHeading: Boolean(document.querySelector('.records-history-heading')),
    }));
    assert.doesNotMatch(retryArchive.title, /重打/);
    assert.equal(retryArchive.redundantHeading, false);
    await app.sleep(1000);
    await app.screenshot('game-records-retry-history');
    await app.back();
    await app.waitFor(
      () => app.visible('#history-page').then((visible) => !visible),
      10000,
      'A retry detail must use the same native parent-page Back',
    );
    await app.sleep(1000);
    await app.screenshot('game-records-list');
    const list = await app.evaluate(() => ({
      cards: document.querySelectorAll('.record-session:first-child .record-cards .playing-card')
        .length,
      rows: [...document.querySelectorAll('.record-session:first-child .record-attempt')].map(
        (row) => [row.dataset.hand, row.dataset.attempt],
      ),
      expectedRows: window.noir
        .getRecords()[0]
        .attempts.slice()
        .reverse()
        .map((attempt) => [String(attempt.hand), String(attempt.attempt)]),
      heading: document.querySelector('.record-session-heading').textContent,
      text: document.querySelector('#records-page').textContent,
      firstCopy: [...document.querySelectorAll('.record-hand[data-attempt="0"]')].map(
        (row) => row.textContent,
      ),
      retry: document.querySelector('.record-retry')?.textContent,
      deltas: [...document.querySelectorAll('.record-hand-result strong')].map(
        (element) => element.textContent,
      ),
      neutralResults: [...document.querySelectorAll('.record-hand-result')]
        .filter((result) => /^[+-]0$/.test(result.querySelector('strong').textContent))
        .map((result) => result.textContent.trim()),
    }));
    assert.ok(list.cards >= 4);
    assert.deepEqual(list.rows, list.expectedRows);
    assert.deepEqual(list.rows.slice(-2), [
      [String(first.hand), '1'],
      [String(first.hand), '0'],
    ]);
    assert.doesNotMatch(list.heading, /已完成|手数/);
    assert.doesNotMatch(list.text, /已被重打替代/);
    list.firstCopy.forEach((text) => assert.doesNotMatch(text, /首次/));
    assert.equal(list.retry, '重打1');
    list.deltas.filter((value) => value !== '—').forEach((value) => assert.match(value, /^[+-]\d/));
    // A zero-change win reads "+0", a zero-change loss "-0".
    list.neutralResults.forEach((text) => assert.match(text, /^(?:\+0\s*赢|-0\s*输)$/));
    await app.click('#records-back-button');
    await app.waitFor(
      () => app.visible('#records-page').then((visible) => !visible),
      10000,
      'Return Game must pop the entire records visit',
    );
    const gameHash = await app.evaluate(() => location.hash);
    assert.equal(gameHash, '');
    await app.click('#rules-button');
    await app.click('#records-menu-item');
    await app.back();
    await app.waitFor(
      () => app.visible('#records-page').then((visible) => !visible),
      10000,
      'A fresh records visit must pop directly to game without an old detail underneath',
    );
    if ((await app.state()).phase === 'done') await app.click('#next-button');
    const leaving = await app.state();
    const countedBefore = await app.evaluate(
      () =>
        window.noir
          .getRecords()[0]
          .attempts.filter((attempt) => attempt.status === 'completed' && !attempt.superseded)
          .length,
    );
    const wealth = leaving.players.reduce((sum, p) => sum + p.stack, 0) + leaving.pot;
    await app.relaunch();
    // After a launch the table waits for the hero to take a seat.
    await enterNativeTable(app);
    const resumed = await app.state();
    assert.equal(resumed.sessionNumber, leaving.sessionNumber);
    assert.equal(resumed.hand, leaving.hand + 1);
    assert.equal(resumed.players.reduce((sum, p) => sum + p.stack, 0) + resumed.pot, wealth);
    const restored = await app.evaluate(() => window.noir.getRecords()[0]);
    assert.equal(
      restored.attempts.find((attempt) => attempt.hand === leaving.hand && !attempt.superseded)
        .status,
      'unfinished',
    );
    assert.equal(
      restored.attempts.filter((attempt) => attempt.status === 'completed' && !attempt.superseded)
        .length,
      countedBefore,
    );
    // Exercise the remaining native navigation boundaries after the hand and
    // chip assertions: privacy navigation starts a fresh document/next hand.
    const waitGamePage = () =>
      app.waitFor(
        async () =>
          (await app.evaluate(nativePageReady, 'game')) &&
          (await app.evaluate(
            () =>
              document.documentElement.dataset.appReady === 'true' &&
              document.body.dataset.recordsPage === 'game' &&
              location.hash === '',
          )) &&
          (await app.visible('main.main')),
        15000,
        'Native navigation must return to a ready game without an old records route',
      );
    const openSavedHand = async () => {
      await app.click('#rules-button');
      await app.click('#records-menu-item');
      await app.click(`[data-record-hand="${first.id}"]`);
      assert.equal(await app.visible('#history-page'), true);
    };
    await openSavedHand();
    await app.click('#history-review-button');
    await app.waitFor(
      () => app.visible('#review-dialog'),
      10000,
      'The historical review must still be open when native Back begins',
    );
    const reviewBeforeBack = await app.evaluate(() => ({
      title: document.querySelector('#review-dialog-title').textContent,
      open: document.querySelector('#review-dialog').open,
      page: document.body.dataset.recordsPage,
    }));
    assert.equal(reviewBeforeBack.open, true);
    assert.equal(reviewBeforeBack.page, 'hand');
    assert.ok(reviewBeforeBack.title.includes(`第 ${first.hand} 手`));
    await app.back();
    if (app.platform === 'android') {
      await app.waitFor(
        () =>
          app.evaluate(
            () =>
              document.body.dataset.recordsPage === 'hand' &&
              !document.querySelector('#review-dialog').open,
          ),
        10000,
        'Android Back must close the modal before popping its historical page',
      );
      await app.back();
    }
    const reviewBack = await app.waitFor(
      async () => {
        const result = await app.evaluate(() => ({
          page: document.body.dataset.recordsPage,
          hash: location.hash,
          reviewOpen: document.querySelector('#review-dialog').open,
          depth: history.state?.noirRecordsNavigation?.depth,
        }));
        return result.page === 'list' && !result.reviewOpen && result.hash === '#records'
          ? result
          : null;
      },
      10000,
      'Real native Back must leave the saved hand for its list and close historical review',
    );
    assert.equal(reviewBack.depth, 1);
    assert.equal(await app.visible('#records-page'), true);
    assert.equal(await app.visible('#history-page'), false);
    await app.sleep(1000);
    await app.screenshot('game-records-review-native-back');
    await app.click('#records-back-button');
    await waitGamePage();
    let returnGameBack;
    if (app.platform === 'android') {
      const beforeMinimize = await app.state();
      await app.preserveForegroundPage();
      await app.back();
      const nativeState = await app.waitFor(
        async () => {
          const value = await app.nativeState();
          return [2, 3].includes(value) ? value : null;
        },
        10000,
        'Back after Return Game must actually minimize Android instead of reopening records',
      );
      await app.activate();
      await waitGamePage();
      const afterActivate = await app.state();
      assert.equal(afterActivate.sessionNumber, beforeMinimize.sessionNumber);
      assert.equal(afterActivate.hand, beforeMinimize.hand);
      assert.equal(await app.visible('#records-page'), false);
      returnGameBack = {
        nativeState,
        session: afterActivate.sessionNumber,
        hand: afterActivate.hand,
      };
    } else {
      // Establish an observable parent through real links. Never fabricate
      // History API entries to make the edge gesture appear successful.
      await app.click('#native-about-button');
      await app.click('#native-about-dialog a[href="./app-privacy.html"]');
      await app.waitFor(
        () => app.evaluate(nativePageReady, 'privacy'),
        15000,
        'The visible privacy link must establish a ready predecessor page',
      );
      const readPrivacyPage = () => ({
        pathname: location.pathname,
        title: document.querySelector('article:not([hidden]) h1').textContent.trim(),
        locale: document.querySelector('#policy-language').value,
        returnLink: document
          .querySelector('article:not([hidden]) a[href="./"]')
          .getAttribute('href'),
        hasRecords: Boolean(document.querySelector('#records-page')),
      });
      const privacyParent = await app.evaluate(readPrivacyPage);
      await app.click('article:not([hidden]) a[href="./"]');
      await waitGamePage();
      await openSavedHand();
      await app.click('#records-back-button');
      await waitGamePage();
      await app.back({ expectedPage: 'privacy' });
      const privacy = await app.evaluate(readPrivacyPage);
      assert.ok(privacy.pathname.endsWith('/app-privacy.html'));
      assert.deepEqual(
        privacy,
        privacyParent,
        'Edge Back must return to the actual localized predecessor',
      );
      assert.equal(privacy.returnLink, './');
      assert.equal(privacy.hasRecords, false);
      await app.sleep(1000);
      await app.screenshot('game-records-return-game-edge-privacy');
      await app.click('article:not([hidden]) a[href="./"]');
      await waitGamePage();
      returnGameBack = privacy;
    }
    await app.sleep(1000);
    await app.screenshot('game-records-return-game-native-back');
    return {
      first: { hand: first.hand, profit: first.profit },
      liveGeometry,
      historyGeometry,
      attempts: attempts.map(({ hand, attempt, status, superseded }) => ({
        hand,
        attempt,
        status,
        superseded,
      })),
      list,
      review,
      resumed: { session: resumed.sessionNumber, hand: resumed.hand, wealth },
      nativeBack: { reviewBeforeBack, reviewBack, returnGameBack },
    };
  });
  const unknown = selectedScenarios?.filter((name) => !seenScenarios.has(name));
  if (unknown?.length)
    throw Error(`Unknown NOIR_NATIVE_SCENARIOS selection: ${unknown.join(', ')}`);
  return result;
}
