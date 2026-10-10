import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUPPORTED_LOCALES } from '../src/i18n/index.js';
const root = new URL('../', import.meta.url);
execFileSync(process.execPath, [new URL('scripts/i18n-extract.mjs', root).pathname, '--check'], {
  stdio: 'inherit',
});
const messages = JSON.parse(readFileSync(new URL('src/i18n/messages.json', root), 'utf8'));
const overrides = JSON.parse(readFileSync(new URL('src/i18n/overrides.json', root), 'utf8'));
const slots = (s) => [...s.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();
for (const locale of SUPPORTED_LOCALES.filter((l) => l !== 'zh-CN')) {
  const catalog = {
    ...JSON.parse(readFileSync(new URL(`src/i18n/locales/${locale}.json`, root), 'utf8')),
    ...overrides[locale],
  };
  for (const source of messages) {
    const value = catalog[source];
    assert.ok(typeof value === 'string' && value.trim(), `${locale}: missing ${source}`);
    assert.deepEqual(slots(value), slots(source), `${locale}: dynamic value changed: ${source}`);
  }
}
const release = JSON.parse(readFileSync(new URL('mobile/store-readiness.json', root), 'utf8'));
assert.deepEqual(release.locales, SUPPORTED_LOCALES);
console.log(
  `11 locales verified: ${messages.length} messages, no missing entries or changed placeholders. Linguistic review is separate.`,
);
