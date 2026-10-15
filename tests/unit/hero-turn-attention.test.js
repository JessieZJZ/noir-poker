import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHeroTurnAttention } from '../../src/ui/hero-turn.js';

function setup() {
  let now = 0;
  let serial = 0;
  const jobs = new Map();
  const phases = [];
  const cue = createHeroTurnAttention({
    publish: (phase) => phases.push(phase),
    schedule(fn, delay) {
      jobs.set(++serial, { fn, due: now + delay });
      return serial;
    },
    unschedule: (id) => jobs.delete(id),
  });
  const advance = (ms) => {
    const target = now + ms;
    for (;;) {
      const next = [...jobs].sort((a, b) => a[1].due - b[1].due)[0];
      if (!next || next[1].due > target) break;
      jobs.delete(next[0]);
      now = next[1].due;
      next[1].fn();
    }
    now = target;
  };
  return { cue, phases, jobs, advance };
}
const turn = { key: 'hand:1:preflop:3', enabled: true, active: true };

test('entry settles, reminds once at 8 seconds, and rerenders do not restart either cue', () => {
  const { cue, phases, advance, jobs } = setup();
  cue.update(turn);
  advance(3199);
  assert.equal(cue.phase, 'enter');
  cue.update(turn);
  advance(1);
  assert.equal(cue.phase, 'waiting');
  advance(4799);
  assert.equal(cue.phase, 'waiting');
  cue.update(turn);
  advance(1);
  assert.equal(cue.phase, 'reminder');
  advance(2199);
  assert.equal(cue.phase, 'reminder');
  advance(1);
  assert.equal(cue.phase, 'waiting');
  advance(60000);
  assert.deepEqual(phases, ['enter', 'waiting', 'reminder', 'waiting']);
  assert.equal(jobs.size, 0);
});

test('using sizing controls cancels the reminder for this decision only', () => {
  const { cue, phases, jobs, advance } = setup();
  cue.update(turn);
  advance(1200);
  cue.engage();
  assert.equal(cue.phase, 'waiting', 'Sizing keeps both card outlines and rail pulses running');
  assert.equal(jobs.size, 0, 'Persistent CSS pulses must not require a reminder timer');
  advance(9000);
  cue.update(turn);
  assert.equal(jobs.size, 0);
  assert.deepEqual(phases, ['enter', 'waiting']);
  cue.update({ ...turn, key: 'hand:1:flop:10' });
  advance(8000);
  assert.equal(cue.phase, 'reminder');
});

test('background cancels pending work; foreground never replays the entry or a delivered reminder', () => {
  const { cue, phases, jobs, advance } = setup();
  cue.update(turn);
  const stale = [...jobs.values()].map((job) => job.fn);
  advance(500);
  cue.update({ ...turn, active: false });
  stale.forEach((fn) => fn());
  advance(20000);
  assert.equal(cue.phase, '');
  assert.equal(jobs.size, 0);
  cue.update(turn);
  assert.equal(cue.phase, 'waiting');
  advance(7999);
  assert.equal(cue.phase, 'waiting');
  advance(1);
  assert.equal(cue.phase, 'reminder');
  cue.update({ ...turn, active: false });
  cue.update(turn);
  advance(20000);
  assert.equal(cue.phase, 'waiting');
  assert.equal(phases.filter((phase) => phase === 'enter').length, 1);
  assert.equal(phases.filter((phase) => phase === 'reminder').length, 1);
});

test('action, settlement, retry, reset and a new decision invalidate even queued stale callbacks', () => {
  for (const transition of ['disabled', 'reset', 'new-key']) {
    const { cue, jobs, advance } = setup();
    cue.update(turn);
    const stale = [...jobs.values()].map((job) => job.fn);
    if (transition === 'disabled') cue.update({ ...turn, enabled: false });
    else if (transition === 'reset') cue.reset();
    else cue.update({ ...turn, key: 'hand:2:preflop:3' });
    const before = cue.phase;
    stale.forEach((fn) => fn());
    assert.equal(cue.phase, before);
    if (transition !== 'new-key') {
      advance(9000);
      assert.equal(cue.phase, '');
      cue.update(turn);
      assert.equal(cue.phase, 'enter');
    }
  }
});

test('a decision first reached in the background alerts only when it becomes visible', () => {
  const { cue, jobs } = setup();
  cue.update({ ...turn, active: false });
  assert.equal(cue.phase, '');
  assert.equal(jobs.size, 0);
  cue.update(turn);
  assert.equal(cue.phase, 'enter');
  cue.reset();
});
