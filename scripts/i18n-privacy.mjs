import { readFileSync, writeFileSync } from 'node:fs';
import { SUPPORTED_LOCALES } from '../src/i18n/index.js';
const root = new URL('../', import.meta.url);
const source = JSON.parse(readFileSync(new URL('src/i18n/privacy-source.json', root), 'utf8'));
const overrides = JSON.parse(readFileSync(new URL('src/i18n/overrides.json', root), 'utf8'));
const labels = [
  '简体中文',
  'English',
  '繁體中文',
  '日本語',
  '한국어',
  'Español',
  'Italiano',
  'Português',
  'Deutsch',
  'Français',
  'Русский',
];
const esc = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const sections = SUPPORTED_LOCALES.map((locale) => {
  const messages =
    locale === 'zh-CN'
      ? {}
      : {
          ...JSON.parse(readFileSync(new URL(`src/i18n/locales/${locale}.json`, root), 'utf8')),
          ...overrides[locale],
        };
  const text = (id) => esc(messages[source[id]] ?? source[id]);
  return `<article lang="${locale}" data-locale="${locale}" ${locale === 'en' ? '' : 'hidden'}>
<a href="./">${esc(messages['返回牌桌'] ?? '返回牌桌')}</a>
<h1>${text('title')}</h1><p>${text('date')}</p>
<h2>${text('publisher')}</h2><p>${text('identity')}</p><a href="mailto:958182284@qq.com">958182284@qq.com</a>
${[
  ['localHeading', 'local'],
  ['dataHeading', 'data'],
  ['purchaseHeading', 'purchase'],
  ['supportHeading', 'support'],
  ['personaHeading', 'persona'],
  [null, 'review'],
  ['changesHeading', 'changes'],
]
  .map(
    ([h, p]) =>
      `${h ? `<h2${h === 'personaHeading' ? ' id="persona-notice-' + locale + '"' : ''}>${text(h)}</h2>` : ''}<p>${text(p)}</p>`,
  )
  .join('\n')}
</article>`;
}).join('\n');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>NOIR Poker Privacy Policy</title>
<style>
@font-face{font-family:Manrope;src:url('./fonts/manrope.woff2') format('woff2');font-style:normal;font-weight:200 800;font-display:swap}
@font-face{font-family:'Noto Sans SC';src:url('./fonts/noto-sans-sc.woff2') format('woff2');font-style:normal;font-weight:100 900;font-display:swap}
@font-face{font-family:'Noto Sans KR';src:url('./fonts/noto-sans-kr.woff2') format('woff2');font-style:normal;font-weight:100 900;font-display:swap}
body{margin:0;background:#0b1017;color:#edf3f6;font:16px/1.8 Manrope,'Noto Sans SC',sans-serif}
html[lang=ko] body{font-family:Manrope,'Noto Sans KR','Noto Sans SC',sans-serif}
main{max-width:760px;margin:auto;padding:32px 24px}h1{font-size:28px}h2{font-size:20px;margin-top:28px}a{color:#6ee7c5}select{max-width:100%;padding:8px;font:inherit}[hidden]{display:none!important}</style>
</head><body><main><label for="policy-language">Language</label> <select id="policy-language" aria-label="Language">${SUPPORTED_LOCALES.map((l, i) => `<option value="${l}">${labels[i]}</option>`).join('')}</select>${sections}</main>
<script>
const select=document.querySelector('#policy-language');
const supported=${JSON.stringify(SUPPORTED_LOCALES)};
let saved;try{saved=localStorage.getItem('noir-locale')}catch{}
const query=new URLSearchParams(location.search).get('lang');
const detected=(navigator.languages||[]).map(l=>/^zh(?:-|$)/i.test(l)?(!/Hans/i.test(l)&&/(?:TW|HK|MO|Hant)/i.test(l)?'zh-TW':'zh-CN'):l.toLowerCase().split('-')[0]).find(l=>supported.includes(l));
select.value=[query,saved,detected,'en'].find(l=>supported.includes(l));
function show(){document.documentElement.lang=select.value;document.querySelectorAll('[data-locale]').forEach(el=>el.hidden=el.dataset.locale!==select.value);document.title=document.querySelector('[data-locale="'+select.value+'"] h1').textContent}
select.addEventListener('change',show);show();
if(location.hash==='#persona-notice')document.querySelector('article:not([hidden]) h2[id]')?.scrollIntoView();
</script></body></html>\n`;
writeFileSync(new URL('public/app-privacy.html', root), html);
console.log('Wrote offline privacy policy in 11 languages');
