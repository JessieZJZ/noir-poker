import { readFile, writeFile } from 'node:fs/promises';
const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const part = source.split('<section id="review-glossary">')[1].split('</section>')[0];
const plain = (s) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const glossary = [
  ...part.matchAll(/<div>\s*<b>([\s\S]*?)<\/b\s*>\s*<span\s*>([\s\S]*?)<\/span\s*>\s*<\/div>/g),
].map((m) => ({ term: plain(m[1]), description: plain(m[2]) }));
if (glossary.length !== 35)
  throw Error('Expected 35 baseline glossary terms, got ' + glossary.length);
const privacy = (await readFile(new URL('../../public/app-privacy.html', import.meta.url), 'utf8'))
  .split('<article lang="zh-CN" data-locale="zh-CN" hidden>')[1]
  .split('</article>')[0]
  .replace(/<a href="\.\/">[\s\S]*?<\/a>/, '')
  .replace(/<h1>[\s\S]*?<\/h1>/, '');
await writeFile(
  new URL('./content.mjs', import.meta.url),
  '// Chinese copy copied from the frozen PR64 baseline, not a new privacy policy.\nexport const glossary = ' +
    JSON.stringify(glossary, null, 2) +
    ';\nexport const privacyHtml = ' +
    JSON.stringify(privacy) +
    ';\n',
);
console.log(
  'Copied ' + glossary.length + ' glossary definitions and the existing Chinese privacy policy.',
);
