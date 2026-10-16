import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { nativeBackPage, nativePageReady } from '../../scripts/native-back.mjs';

const privacySource = readFileSync(
  new URL('../../public/app-privacy.html', import.meta.url),
  'utf8',
);
function fixture(locale = 'zh-CN') {
  const article = privacySource.match(
    new RegExp(`<article lang="${locale}"[^>]*>([\\s\\S]*?)</article>`),
  )[1];
  const heading = {
      textContent: article.match(/<h1>([^<]+)<\/h1>/)[1],
      getClientRects: () => [{}],
    },
    link = {
      textContent: article.match(/<a href="\.\/">([^<]+)<\/a>/)[1],
      getAttribute: () => './',
      getClientRects: () => [{}],
    },
    elements = new Map([
      ['#policy-language', { value: locale }],
      ['article:not([hidden]) h1', heading],
      ['article:not([hidden]) a[href="./"]', link],
    ]),
    document = {
      readyState: 'complete',
      // The real privacy show() assigns the active article's h1 to title.
      title: heading.textContent,
      querySelector: (selector) => elements.get(selector) ?? null,
    },
    window = { location: { pathname: '/app-privacy.html' } };
  // Execute the same serialized predicate sent to the installed WebView.
  // Its readiness cannot accidentally depend on a local module binding.
  const ready = vm.runInNewContext(`(${nativePageReady.toString()})`, { window, document });
  return { ready, window, document, heading, link, elements };
}

test('native Back accepts only explicit game/privacy destinations', () => {
  assert.equal(nativeBackPage(), 'game');
  assert.equal(nativeBackPage('game'), 'game');
  assert.equal(nativeBackPage('privacy'), 'privacy');
  for (const value of [null, '', 'records', 'anything', {}, []]) {
    assert.throws(() => nativeBackPage(value), /expectedPage must be game or privacy/);
    assert.throws(() => fixture().ready(value), /expectedPage must be game or privacy/);
  }
});

test('normal native attachment still requires the initialized game, never a privacy page', () => {
  const page = fixture();
  assert.equal(page.ready(), false);
  assert.equal(page.ready('game'), false);
  assert.equal(page.ready('privacy'), true);
  page.window.noir = { getState: () => null };
  assert.equal(page.ready('game'), false);
  page.window.noir.getState = () => ({ hand: 1 });
  assert.equal(page.ready(), true);
});

test('privacy attachment requires its actual ready document, visible title and return link', () => {
  for (const damage of [
    (page) => (page.document.readyState = 'loading'),
    (page) => (page.window.location.pathname = '/'),
    (page) => (page.document.title = 'NOIR Poker'),
    (page) => page.elements.delete('#policy-language'),
    (page) => page.elements.delete('article:not([hidden]) h1'),
    (page) => (page.heading.textContent = '   '),
    (page) => (page.heading.getClientRects = () => []),
    (page) => page.elements.delete('article:not([hidden]) a[href="./"]'),
    (page) => (page.link.textContent = ''),
    (page) => (page.link.getAttribute = () => '#records'),
    (page) => (page.link.getClientRects = () => []),
  ]) {
    const page = fixture();
    assert.equal(page.ready('privacy'), true);
    damage(page);
    assert.equal(page.ready('privacy'), false);
  }
});

test('real Chinese, English and Korean privacy titles must match their visible heading', () => {
  for (const [locale, expected] of Object.entries({
    'zh-CN': 'NOIR Poker 隐私政策',
    en: 'NOIR Poker Privacy Policy',
    ko: '노어 포커 개인 정보 보호 정책',
  })) {
    const page = fixture(locale);
    assert.equal(page.heading.textContent, expected);
    assert.equal(page.document.title, expected);
    assert.equal(page.ready('privacy'), true);
    page.document.title = locale === 'en' ? 'NOIR Poker 隐私政策' : 'NOIR Poker Privacy Policy';
    assert.equal(page.ready('privacy'), false, `${locale}: mismatched active title`);
    page.document.title = '';
    assert.equal(page.ready('privacy'), false, `${locale}: blank title`);
  }
});
