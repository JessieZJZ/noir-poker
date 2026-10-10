import assert from 'node:assert/strict';
const documentLoginMarker = (text) => /sign in|log in|登录账号/i.test(text);

// These scenarios drive the installed production bundle. They read only the
// public state already exposed by the app and never install browser fixtures.
export async function nativeScenarios(app) {
  const result = [];
  const check = async (name, run) => {
    const started = Date.now();
    const evidence = await run();
    await app.screenshot(name);
    const entry = { name, status: 'passed', elapsedMs: Date.now() - started, evidence };
    result.push(entry);
    app.record(entry);
    app.log(`PASS ${name}`);
  };
  await check('local-launch-and-no-login', async () => {
    const info = await app.evaluate(() => ({
      href: location.href,
      native: document.documentElement.classList.contains('native-app'),
      fixtures: typeof window.qa,
      footer: document.querySelector('.practice-info')?.textContent,
      state: window.noir?.getState(),
    }));
    assert.ok(info.native, 'The installed app must use the native platform adapter');
    assert.equal(info.fixtures, 'undefined', 'Production app must not contain QA fixtures');
    assert.ok(
      /^(capacitor|https?):\/\/localhost(?:\/|$)/.test(info.href),
      'App must load bundled local code',
    );
    assert.ok(info.footer && !documentLoginMarker(info.footer));
    assert.ok(info.state && info.state.playerCount >= 5);
    return { origin: info.href, playerCount: info.state.playerCount };
  });
  await check('settings-autosave-and-local-portraits', async () => {
    await app.click('#opponents-button');
    await app.select('#language-select', 'zh-CN');
    await app.select('#player-count', '5');
    await app.select('#emotion-mode', 'lively');
    await app.select('[data-bot-seat="1"]', 'tan');
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
        return images.length >= 8 && images.every((image) => image.loaded && image.local)
          ? images
          : null;
      },
      15000,
      'All eight portraits must load from the installed bundle',
    );
    const images = await app.evaluate(() =>
      [...document.querySelectorAll('#profile-cards img')].map((image) => ({
        profile: image.dataset.portraitProfile,
        source: new URL(image.src).pathname,
        width: image.naturalWidth,
      })),
    );
    await app.click('#opponents-dialog .close-dialog');
    // Closing and relaunching exercises Capacitor Preferences, not just in-memory controls.
    await app.relaunch();
    await app.click('#opponents-button');
    const saved = await app.evaluate(() => ({
      players: document.querySelector('#player-count').value,
      emotion: document.querySelector('#emotion-mode').value,
      profile: document.querySelector('[data-bot-seat="1"]').value,
      sound: document.querySelector('#sound-button').getAttribute('aria-checked'),
    }));
    assert.deepEqual(saved, { players: '5', emotion: 'lively', profile: 'tan', sound: 'false' });
    await app.click('#opponents-dialog .close-dialog');
    return { saved, portraits: images };
  });
  await check('raise-call-fold-and-settlement', async () => {
    const coverage = { raise: null, call: null, fold: null };
    let settled;
    // Real random hands may end immediately after a raise. Continue with fresh
    // deals instead of assuming the opponent must call or of injecting cards.
    for (let deal = 0; deal < 10 && !coverage.fold; deal++) {
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
      const action =
        !coverage.raise && turn.legal.canRaise ? 'raise' : !coverage.call ? 'call' : 'fold';
      if (action === 'raise') await app.click('[data-preset="min"]');
      await app.click(`#${action}-button`);
      const acted = await app.state();
      if (action === 'fold') assert.ok(acted.players[0].folded);
      else if (action === 'raise') assert.ok(acted.players[0].lastAction);
      assert.equal(acted.stack % 25, 0);
      coverage[action] = {
        hand: acted.hand,
        street: acted.street,
        action: acted.players[0].lastAction,
        paid: turn.stack - acted.stack,
        callRequired: action === 'call' ? turn.legal.toCall : undefined,
      };
      if (action === 'fold' && (await app.visible('#continue-deal-button')))
        await app.click('#continue-deal-button');
      if (action !== 'fold' && acted.phase !== 'done') {
        const remaining = await app.waitFor(
          async () => {
            const game = await app.state();
            return game.phase === 'done' || game.legal.enabled ? game : null;
          },
          90000,
          'Game must progress to the next legal decision',
        );
        if (remaining.phase !== 'done') {
          if (!coverage.call) {
            await app.click('#call-button');
            const called = await app.state();
            coverage.call = {
              hand: called.hand,
              street: called.street,
              action: called.players[0].lastAction,
              paid: remaining.stack - called.stack,
              callRequired: remaining.legal.toCall,
            };
            const next = await app.waitFor(
              async () => {
                const game = await app.state();
                return game.phase === 'done' || game.legal.enabled ? game : null;
              },
              90000,
              'Game must continue after call',
            );
            if (next.phase === 'done') continue;
          }
          await app.click('#fold-button');
          const folded = await app.state();
          assert.ok(folded.players[0].folded);
          coverage.fold = { hand: folded.hand, street: folded.street };
          if (await app.visible('#continue-deal-button')) await app.click('#continue-deal-button');
        }
      }
      await app.waitFor(
        async () => (await app.state()).phase === 'done',
        60000,
        'Hand must settle after fold',
      );
      settled = await app.state();
    }
    assert.ok(
      Object.values(coverage).every(Boolean),
      'Ten real hands must exercise raise, call and fold',
    );
    settled ??= await app.state();
    assert.equal(settled.pot % 25, 0);
    assert.ok(settled.players.every((player) => player.stack % 25 === 0));
    assert.equal(
      settled.players.reduce((sum, player) => sum + player.stack, 0),
      25000,
      'Settlement must conserve chips',
    );
    return { coverage, pot: settled.pot };
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
    await app.waitHero();
    await app.click('#call-button');
    await app.background();
    const paused = await app.state();
    await app.sleep(6000);
    const stillPaused = await app.state();
    assert.deepEqual(
      stillPaused,
      paused,
      'Game must not advance while the native app is in the background',
    );
    await app.activate();
    await app.waitFor(
      async () => {
        const current = await app.state();
        return (
          current.actor === '你' ||
          current.phase === 'done' ||
          JSON.stringify(current) !== JSON.stringify(paused)
        );
      },
      45000,
      'Game should resume after native foreground event',
    );
    return { backgroundMs: 6000, pausedActor: paused.actor, pausedHand: paused.hand };
  });
  return result;
}
