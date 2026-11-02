import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDealGate, DEAL_PRESENTATION_MS } from '../../src/ui/deal-gate.js';
import {
  createMusicFade,
  MUSIC_ENTRY_FADE_MS,
  MUSIC_RESUME_FADE_MS,
} from '../../src/ui/music-fade.js';
import { createWechatController } from '../../src/platform/wechat-controller.js';
import { potSize } from '../../src/engine/poker.js';

function clock() {
  let time = 0,
    serial = 0;
  const jobs = new Map();
  return {
    jobs,
    now: () => time,
    schedule(fn, delay) {
      jobs.set(++serial, { fn, due: time + delay });
      return serial;
    },
    unschedule(id) {
      jobs.delete(id);
    },
    advance(ms) {
      const until = time + ms;
      for (let count = 0; count < 1000; count++) {
        const entry = [...jobs].sort((a, b) => a[1].due - b[1].due)[0];
        if (!entry || entry[1].due > until) break;
        time = entry[1].due;
        jobs.delete(entry[0]);
        entry[1].fn();
      }
      time = until;
    },
  };
}

test('deal presentation pauses in the background and stale callbacks cannot complete reset deals', () => {
  const timer = clock();
  let completions = 0;
  const gate = createDealGate({ ...timer, complete: () => completions++ });
  gate.begin();
  const stale = [...timer.jobs.values()][0].fn;
  timer.advance(400);
  gate.setActive(false);
  timer.advance(10000);
  stale();
  assert.equal(completions, 0);
  gate.setActive(true);
  timer.advance(DEAL_PRESENTATION_MS - 401);
  assert.equal(gate.pending, true);
  timer.advance(1);
  assert.equal(gate.pending, false);
  assert.equal(completions, 1);
  gate.begin();
  const cancelled = [...timer.jobs.values()][0].fn;
  gate.cancel();
  cancelled();
  assert.equal(completions, 1);
  assert.equal(timer.jobs.size, 0);
});

test('music fades only when started and cancels on pause before a shorter resume', () => {
  const timer = clock();
  let volume;
  const fade = createMusicFade({ ...timer, setVolume: (value) => (volume = value) });
  timer.advance(10000);
  assert.equal(volume, 0);
  assert.equal(timer.jobs.size, 0);
  fade.start();
  timer.advance(MUSIC_ENTRY_FADE_MS / 2);
  assert.equal(volume, 0.5);
  fade.start();
  assert.equal(volume, 0.5, 'Repeated playback requests do not restart the entry fade');
  timer.advance(MUSIC_ENTRY_FADE_MS / 2);
  assert.equal(volume, 1);
  fade.pause();
  assert.equal(volume, 0);
  fade.start();
  const stale = [...timer.jobs.values()][0].fn;
  fade.pause();
  stale();
  assert.equal(volume, 0);
  assert.equal(timer.jobs.size, 0);
  fade.start();
  timer.advance(MUSIC_RESUME_FADE_MS + 40);
  assert.equal(volume, 1);
});

for (const count of [5, 6, 7, 8, 9]) {
  test(`WeChat ${count} seats wait without chips or records, join once, then finish dealing before actions`, (t) => {
    const timer = clock();
    let view;
    const values = new Map([
      ['noir-wechat-settings-v1', JSON.stringify({ playerCount: count, hints: false })],
    ]);
    const controller = createWechatController({
      ...timer,
      storage: {
        getItem: (key) => values.get(key),
        setItem: (key, value) => values.set(key, value),
      },
      publish: (value) => (view = value),
    });
    t.after(() => controller.destroy());
    controller.start();
    const game = controller.getGame();
    const total = game.players.reduce((sum, player) => sum + player.stack, 0);
    timer.advance(10000);
    assert.equal(view.entryState, 'waiting');
    assert.equal(view.street, '等待入座，即将开始第 1 局第 1 手');
    assert.equal(game.phase, 'idle');
    assert.equal(game.hand, 0);
    assert.equal(potSize(game), 0);
    assert.equal(controller.getRecords().length, 0);
    assert.ok(game.players.every((player) => player.hole.length === 0 && player.total === 0));
    assert.equal(controller.action('call'), false);
    assert.equal(controller.join(), true);
    assert.equal(controller.join(), false);
    assert.equal(game.hand, 1);
    assert.equal(view.entryState, 'dealing');
    const history = game.history.length;
    timer.advance(DEAL_PRESENTATION_MS - 1);
    assert.equal(game.history.length, history);
    assert.equal(view.canAct, false);
    assert.equal(controller.action('call'), false);
    timer.advance(1);
    assert.equal(view.dealing, false);
    assert.equal(
      game.players.reduce((sum, player) => sum + player.stack, 0) + potSize(game),
      total,
    );
  });
}
