import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHeroTurnCue } from '../../src/ui/hero-turn.js';
import { soundSamples, SOUND_SAMPLE_RATE, SOUND_CUES } from '../../src/ui/sound-cues.js';
test('hero vibration occurs once per available decision, never on disabled/background rerenders', () => {
  const events = [];
  const cue = createHeroTurnCue(() => events.push(1));
  const state = { key: '1:0:0:3', enabled: true, active: true };
  cue.update({ ...state, enabled: false });
  cue.update({ ...state, active: false });
  assert.equal(events.length, 0);
  assert.equal(cue.update(state), true);
  cue.update(state);
  cue.update({ ...state, active: false });
  cue.update(state);
  assert.equal(events.length, 1);
  cue.update({ ...state, key: '1:0:1:9' });
  assert.equal(events.length, 2);
  cue.reset();
  cue.update(state);
  assert.equal(events.length, 3);
  const unavailable = createHeroTurnCue(() => {
    throw Error('No vibrator');
  });
  assert.doesNotThrow(() => unavailable.update(state));
});
test('sound samples have bounded peaks, reproducible PCM and louder fold/chip envelopes', () => {
  for (const name of SOUND_CUES) {
    const samples = soundSamples(name);
    assert.deepEqual(samples, soundSamples(name));
    assert.ok(samples.every((n) => Number.isFinite(n) && Math.abs(n) < 1));
    assert.ok(samples.length >= 0.18 * SOUND_SAMPLE_RATE);
  }
  assert.deepEqual(soundSamples('raise'), soundSamples('call'));
  const peak = (name) => Math.max(...soundSamples(name).map(Math.abs));
  assert.ok(peak('fold') > 0.24 && peak('chip') > 0.3);
  const check = soundSamples('check');
  const energy = (start, end) =>
    check.slice(start * SOUND_SAMPLE_RATE, end * SOUND_SAMPLE_RATE).reduce((s, v) => s + v * v, 0);
  assert.ok(energy(0, 0.08) > energy(0.14, 0.22));
  assert.ok(energy(0.14, 0.22) > 0.01);
  assert.throws(() => soundSamples('missing'), RangeError);
});
