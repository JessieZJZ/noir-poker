import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeScenarios } from '../native/scenarios.mjs';

test('native diagnostic selection rejects empty and unknown names instead of reporting a zero-test pass', async () => {
  const previous = process.env.NOIR_NATIVE_SCENARIOS;
  try {
    for (const value of ['', ',', 'configured-stakes-and-shared-icon,']) {
      process.env.NOIR_NATIVE_SCENARIOS = value;
      await assert.rejects(() => nativeScenarios({}), /nonempty scenario names/);
    }
    process.env.NOIR_NATIVE_SCENARIOS = 'misspelled-native-scenario';
    const recorded = [];
    await assert.rejects(
      () =>
        nativeScenarios({
          record: (entry) => recorded.push(entry),
          log() {},
          comparePage() {
            throw Error('A skipped scenario must not drive a page');
          },
        }),
      /Unknown NOIR_NATIVE_SCENARIOS selection: misspelled-native-scenario/,
    );
    assert.equal(recorded.length, 28);
    assert.ok(recorded.some((entry) => entry.name === 'review-overflow-and-activity-size'));
    assert.ok(recorded.some((entry) => entry.name === 'hand-rankings-shortcut'));
    assert.ok(recorded.some((entry) => entry.name === 'guide-sticky-header'));
    assert.ok(recorded.some((entry) => entry.name === 'completed-check-persists'));
    assert.ok(recorded.some((entry) => entry.name === 'practice-reset-in-card-heading'));
    assert.ok(
      recorded.every(
        (entry) => entry.status === 'skipped' && /NOIR_NATIVE_SCENARIOS/.test(entry.reason),
      ),
    );
  } finally {
    if (previous === undefined) delete process.env.NOIR_NATIVE_SCENARIOS;
    else process.env.NOIR_NATIVE_SCENARIOS = previous;
  }
});

test('native diagnostic reports retain explicit skips beside the selected pass', async () => {
  const previous = process.env.NOIR_NATIVE_SCENARIOS;
  try {
    process.env.NOIR_NATIVE_SCENARIOS = 'configured-stakes-and-shared-icon';
    const recorded = [];
    const screenshots = [];
    const results = await nativeScenarios({
      record: (entry) => recorded.push(entry),
      log() {},
      comparePage() {
        throw Error('Unselected comparison scenarios must not run');
      },
      state: async () => ({
        stakes: { smallBlind: 100, bigBlind: 200, startingStack: 20000, chipUnit: 100 },
        legal: { enabled: true },
        chipUnit: 100,
        players: [{ stack: 20000 }],
      }),
      evaluate: async () => ({
        src: './app-icon.png',
        loaded: true,
        blinds: '100 / 200',
        step: '100',
      }),
      screenshot: async (name) => screenshots.push(name),
    });
    assert.equal(results.length, 28);
    assert.deepEqual(results, recorded);
    assert.deepEqual(screenshots, ['configured-stakes-and-shared-icon']);
    assert.deepEqual(
      results.filter((entry) => entry.status === 'passed').map((entry) => entry.name),
      ['configured-stakes-and-shared-icon'],
    );
    assert.equal(results.filter((entry) => entry.status === 'skipped').length, 27);
  } finally {
    if (previous === undefined) delete process.env.NOIR_NATIVE_SCENARIOS;
    else process.env.NOIR_NATIVE_SCENARIOS = previous;
  }
});
