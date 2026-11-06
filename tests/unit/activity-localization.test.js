import test from 'node:test';
import assert from 'node:assert/strict';
import { renderActivityParts } from '../../src/ui/activity.js';
import { loadLocale, localizeText } from '../../src/i18n/index.js';
import { renderReviewParagraphs } from '../../src/ui/review-matchups.js';

test('actor badges do not split the full hand-start and blind translation templates', async () => {
  await loadLocale('en');
  const start = renderActivityParts([
    { text: '第 10 手开始 · 庄家 ' },
    { actor: true, name: 'River', profile: 'Phil Ivey', position: 'BTN' },
  ]);
  assert.match(start, /Hand 10 starts · Button: River/);
  assert.match(start, /class="activity-persona">（Phil Ivey）/);
  assert.match(start, /class="position activity-position">BTN/);
  const blinds = renderActivityParts([
    { actor: true, name: 'Mia', position: 'SB' },
    { text: ' 小盲 100 · ' },
    { actor: true, name: 'River', position: 'BB' },
    { text: ' 大盲 200' },
  ]);
  assert.match(blinds, /small blind 100/);
  assert.match(blinds, /big blind 200/);
  assert.doesNotMatch(blinds, /\p{Script=Han}/u);
  await loadLocale('zh-CN');
});

test('adjacent translated sentences have spaces without touching decimals or URLs', async () => {
  await loadLocale('en');
  const value = localizeText(
    '跟注占可争夺底池约 40%。随机范围与行动加权范围下，底池权益分别约 50% / 47%。',
  );
  assert.match(value, /pot\. Pot equity/);
  assert.equal(localizeText('https://www.pokerstars.com/1.25'), 'https://www.pokerstars.com/1.25');
  await loadLocale('zh-CN');
});

test('review sentence spacing survives separate fact spans', async () => {
  const parts = [
    '跟注占可争夺底池约 40%。',
    '随机范围与行动加权范围下，底池权益分别约 50% / 47%。',
  ];
  await loadLocale('en');
  const html = renderReviewParagraphs([parts.join('')], null, 0, [parts]);
  assert.match(html, /pot\.<\/span> <span>Pot equity/);
  assert.match(html, /40%/);
  assert.match(html, /50% \/ 47%/);
  await loadLocale('zh-CN');
  assert.doesNotMatch(
    renderReviewParagraphs([parts.join('')], null, 0, [parts]),
    /。<\/span> <span>/,
  );
});
