import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import babel from 'prettier/plugins/babel';
import { chromium } from '@playwright/test';
const root = new URL('../', import.meta.url);
const candidates = new Set();
const han = /\p{Script=Han}/u;
function expression(node) {
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral')
    return node.quasis
      .map((q, i) => q.value.cooked + (i < node.expressions.length ? `{${i}}` : ''))
      .join('');
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    let number = 0;
    const flatten = (n) =>
      n.type === 'BinaryExpression' && n.operator === '+'
        ? flatten(n.left) + flatten(n.right)
        : n.type === 'StringLiteral'
          ? n.value
          : `{${number++}}`;
    return flatten(node);
  }
  return '';
}
function walk(node) {
  if (!node || typeof node !== 'object') return;
  const value = expression(node);
  if (han.test(value)) candidates.add(value);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'comments', 'tokens'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') walk(value);
  }
}
// Structured research is displayed by the UI, so it must be checked along with
// literal strings. Traverse every Chinese string to cover future data fields.
function researchStrings(value) {
  if (typeof value === 'string') {
    if (han.test(value)) candidates.add(value);
  } else if (value && typeof value === 'object') Object.values(value).forEach(researchStrings);
}
researchStrings(JSON.parse(readFileSync(new URL('src/data/characters.json', root), 'utf8')));
for (const directory of ['ui', 'review', 'engine', 'platform'])
  for (const file of readdirSync(new URL(`src/${directory}/`, root)).filter(
    (p) => p.endsWith('.js') && !p.startsWith('wechat-'),
  ))
    walk(
      babel.parsers.babel.parse(readFileSync(new URL(`src/${directory}/${file}`, root), 'utf8')),
    );
candidates.add(readFileSync(new URL('index.html', root), 'utf8'));
Object.values(
  JSON.parse(readFileSync(new URL('src/i18n/privacy-source.json', root), 'utf8')),
).forEach((v) => candidates.add(v));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const messages = await page.evaluate(
    (sources) => {
      const messages = new Set();
      const add = (text) => {
        const value = text.trim().replace(/\s+/g, ' ');
        if (/\p{Script=Han}/u.test(value)) messages.add(value);
      };
      for (const source of sources) {
        if (!source.includes('<')) {
          add(source);
          continue;
        }
        const template = document.createElement('template');
        template.innerHTML = source;
        const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode())
          if (!node.parentElement?.closest('script, style, [translate="no"]')) add(node.nodeValue);
        for (const el of template.content.querySelectorAll('*'))
          if (!el.closest('[translate="no"]'))
            for (const name of [
              'aria-label',
              'title',
              'data-mobile-label',
              'placeholder',
              'content',
            ])
              if (el.hasAttribute(name)) add(el.getAttribute(name));
      }
      return [...messages].sort();
    },
    [...candidates],
  );
  const output = new URL('src/i18n/messages.json', root);
  if (process.argv.includes('--check')) {
    const inventory = JSON.parse(readFileSync(output, 'utf8'));
    const missing = messages.filter((message) => !inventory.includes(message));
    if (missing.length)
      throw new Error('New messages need extraction and translation: ' + missing.join(' | '));
    console.log(`Source inventory verified: ${messages.length} messages`);
  } else {
    writeFileSync(output, JSON.stringify(messages, null, 2) + '\n');
    console.log(`Extracted ${messages.length} presentation messages`);
  }
} finally {
  await browser.close();
}
