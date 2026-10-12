import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('bundled CJK glyphs cover shipped copy and match the generated subset bytes', () => {
  const base = new URL('../../', import.meta.url);
  const coverage = JSON.parse(readFileSync(new URL('public/fonts/coverage.json', base), 'utf8'));
  const codepoints = new Set(coverage.codepoints);
  for (const [name, hash] of Object.entries(coverage.files)) {
    const bytes = readFileSync(new URL('public/fonts/' + name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, name);
  }
  const missing = new Set();
  function inspect(text) {
    for (const character of text) {
      const point = character.codePointAt(0);
      if (
        /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(
          character,
        ) &&
        !codepoints.has(point)
      )
        missing.add(character);
    }
  }
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) visit(child);
      else if (/\.(js|json|wxml)$/.test(entry.name)) inspect(readFileSync(child, 'utf8'));
    }
  }
  inspect(readFileSync(new URL('index.html', base), 'utf8'));
  inspect(readFileSync(new URL('public/app-privacy.html', base), 'utf8'));
  for (const directory of ['src/', 'miniprogram/']) visit(new URL(directory, base));
  assert.deepEqual(
    [...missing],
    [],
    'New CJK copy requires scripts/subset-fonts.py; see docs/interface-parity.md',
  );
});
