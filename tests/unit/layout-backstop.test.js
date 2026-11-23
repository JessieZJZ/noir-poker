import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLayoutBackstop } from '../../src/ui/layout-backstop.js';

function setup(active = true) {
  let time = 0,
    serial = 0,
    inputs = [768, 1024, 742, 674, true, 531, 148, 195, 230],
    ready = true,
    repairs = 0,
    reads = 0,
    succeeds = true;
  const jobs = new Map();
  const backstop = createLayoutBackstop({
    active,
    read: () => {
      reads++;
      return inputs;
    },
    canRepair: () => ready,
    repair: () => {
      repairs++;
      // A successful fit can itself change the board and hero footprints.
      if (succeeds) inputs = [...inputs.slice(0, 5), 426, 118, 186, 200];
      return succeeds;
    },
    schedule(callback, delay) {
      jobs.set(++serial, { callback, due: time + delay });
      return serial;
    },
    unschedule: (id) => jobs.delete(id),
  });
  return {
    backstop,
    jobs,
    get repairs() {
      return repairs;
    },
    get reads() {
      return reads;
    },
    change: () => (inputs = [1024, 768, 960, 452, false, ...inputs.slice(5)]),
    changeFootprint: () => (inputs = [...inputs.slice(0, 5), 506, 141, 151, 200]),
    setReady: (value) => (ready = value),
    setSucceeds: (value) => (succeeds = value),
    advance(ms) {
      const until = time + ms;
      while (true) {
        const next = [...jobs].sort((a, b) => a[1].due - b[1].due)[0];
        if (!next || next[1].due > until) break;
        time = next[1].due;
        jobs.delete(next[0]);
        next[1].callback();
      }
      time = until;
    },
  };
}

test('changed dimensions repair without any event, then fitted footprints stop repeat layouts', () => {
  const fixture = setup();
  fixture.backstop.record();
  fixture.change();
  fixture.advance(249);
  assert.equal(fixture.repairs, 0);
  fixture.advance(1);
  assert.equal(fixture.repairs, 1);
  fixture.advance(2000);
  assert.equal(fixture.repairs, 1, 'Fit output becomes the baseline, avoiding a feedback loop');
  fixture.backstop.destroy();
});

test('unchanged inputs and dimensions already repaired by normal events do not repeat layout', () => {
  const fixture = setup();
  fixture.backstop.record();
  fixture.advance(1000);
  assert.equal(fixture.repairs, 0);
  fixture.change();
  fixture.backstop.record();
  fixture.advance(1000);
  assert.equal(fixture.repairs, 0);
  fixture.backstop.destroy();
});

test('late board or hero footprints are repaired without a viewport change', () => {
  const fixture = setup();
  fixture.backstop.record();
  fixture.changeFootprint();
  fixture.advance(500);
  assert.equal(fixture.repairs, 1);
  fixture.backstop.destroy();
});

test('locked or zero-sized views do not consume pending geometry; unlocking repairs it', () => {
  const fixture = setup();
  fixture.backstop.record();
  fixture.setReady(false);
  fixture.change();
  const reads = fixture.reads;
  fixture.backstop.record();
  fixture.advance(1000);
  assert.equal(fixture.reads, reads);
  assert.equal(fixture.repairs, 0);
  fixture.setReady(true);
  fixture.advance(250);
  assert.equal(fixture.repairs, 1);
  fixture.backstop.destroy();
});

test('hidden or inactive views cancel timers and stale callbacks; resuming checks pending geometry', () => {
  const fixture = setup();
  fixture.backstop.record();
  const stale = [...fixture.jobs.values()][0].callback;
  fixture.backstop.setActive(false);
  const reads = fixture.reads;
  fixture.change();
  fixture.advance(1000);
  stale();
  assert.equal(fixture.jobs.size, 0);
  assert.equal(fixture.reads, reads);
  assert.equal(fixture.repairs, 0);
  fixture.backstop.setActive(true);
  fixture.backstop.setActive(true);
  assert.equal(fixture.jobs.size, 1);
  stale();
  assert.equal(fixture.jobs.size, 1, 'A callback from before the pause cannot rearm itself');
  fixture.advance(250);
  assert.equal(fixture.repairs, 1);
  fixture.backstop.destroy();
});

test('an unsuccessful fit is retried without accepting unrendered dimensions', () => {
  const fixture = setup();
  fixture.backstop.record();
  fixture.change();
  fixture.setSucceeds(false);
  fixture.advance(500);
  assert.equal(fixture.repairs, 2);
  fixture.setSucceeds(true);
  fixture.advance(500);
  assert.equal(fixture.repairs, 3);
  fixture.backstop.destroy();
});

test('an initially hidden view has no timer until it becomes active', () => {
  const fixture = setup(false);
  fixture.advance(1000);
  assert.equal(fixture.jobs.size, 0);
  assert.equal(fixture.reads, 0);
  fixture.backstop.setActive(true);
  fixture.advance(250);
  assert.equal(fixture.repairs, 1);
  fixture.backstop.destroy();
});

test('destroy cancels the timer and an already queued callback cannot repair or resurrect it', () => {
  const fixture = setup();
  const stale = [...fixture.jobs.values()][0].callback;
  fixture.backstop.destroy();
  fixture.change();
  fixture.backstop.setActive(true);
  fixture.backstop.record();
  stale();
  fixture.advance(1000);
  assert.equal(fixture.repairs, 0);
  assert.equal(fixture.reads, 0);
  assert.equal(fixture.jobs.size, 0);
});
