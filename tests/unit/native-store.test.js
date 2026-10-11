import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import babel from 'prettier/plugins/babel';
import { storeProfileSource, storeIndexSource } from '../../scripts/native-store.mjs';
import { BOT_PROFILES } from '../../src/engine/bot-profiles.js';
import { STORE_PROFILE_NAMES } from '../../src/engine/store-profiles.js';

test('native original profiles preserve every numeric strategy control and stable saved identifier', () => {
  const output = storeProfileSource(
    readFileSync(new URL('../../src/engine/bot-profiles.js', import.meta.url), 'utf8'),
  );
  const ast = babel.parsers.babel.parse(output);
  const declaration = ast.program.body.find(
    (n) =>
      n.type === 'ExportNamedDeclaration' &&
      n.declaration?.declarations?.[0]?.id.name === 'BOT_PROFILES',
  );
  const array = declaration.declaration.declarations[0].init;
  const profiles = Function('return (' + output.slice(array.start, array.end) + ')')();
  for (const [i, profile] of profiles.entries()) {
    const original = BOT_PROFILES[i];
    assert.equal(profile.id, original.id);
    assert.deepEqual(profile.axes, original.axes);
    assert.deepEqual(profile.sizing, original.sizing);
    assert.deepEqual(profile.policy, original.policy);
    if (original.research) assert.equal(profile.research, null);
    assert.equal(profile.name, STORE_PROFILE_NAMES[profile.id]);
    assert.equal(profile.short, STORE_PROFILE_NAMES[profile.id]);
    assert.deepEqual(profile.sources, []);
    assert.equal(profile.description, original.description);
  }
  assert.doesNotMatch(
    output,
    /Tan Xuan|ST Wang|Aaron Zang|Viktor Blom|Tom Dwan|Daniel Cates|https:\/\/triton/,
  );
});

test('native guide drops named-person references while retaining gameplay and controls', () => {
  const index = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const output = storeIndexSource(index);
  assert.doesNotMatch(output, /kpclive\.com|tritonpokerseries\.com|具名/);
  assert.match(output, /原创训练原型/);
  for (const id of ['language-select', 'restart-hand-button', 'review-hand-button', 'player-count'])
    assert.ok(output.includes(`id="${id}"`));
});
