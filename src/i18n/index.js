import overrides from './overrides.json' with { type: 'json' };
import { preferenceStorage } from '../platform/storage.js';
export const SUPPORTED_LOCALES = [
  'zh-CN',
  'en',
  'zh-TW',
  'ja',
  'ko',
  'es',
  'it',
  'pt',
  'de',
  'fr',
  'ru',
];
export const LOCALE_KEY = 'noir-locale';
export function resolveLocale(saved, languages = []) {
  if (SUPPORTED_LOCALES.includes(saved)) return saved;
  for (const language of languages) {
    if (/^zh(?:-|$)/i.test(language))
      return !/Hans/i.test(language) && /(?:TW|HK|MO|Hant)/i.test(language) ? 'zh-TW' : 'zh-CN';
    const base = language.toLowerCase().split('-')[0];
    if (SUPPORTED_LOCALES.includes(base)) return base;
  }
  return 'en';
}
let locale = 'zh-CN',
  messages = {},
  templates = [],
  phrases = null;
const cache = new Map();
export const getLocale = () => locale;
const normalized = (s) => s.trim().replace(/\s+/g, ' ');
const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
export function setLocale(value) {
  if (!SUPPORTED_LOCALES.includes(value)) throw new RangeError('Unsupported locale');
  preferenceStorage.setItem(LOCALE_KEY, value);
}
export async function loadLocale(value) {
  if (!SUPPORTED_LOCALES.includes(value)) throw new RangeError('Unsupported locale');
  const next =
    value === 'zh-CN'
      ? {}
      : (await import(`./locales/${value}.json`, { with: { type: 'json' } })).default;
  locale = value;
  messages = { ...next, ...overrides[value] };
  cache.clear();
  templates = [];
  const literals = [];
  for (const [key, translation] of Object.entries(messages)) {
    if (!/\{\d+\}/.test(key)) {
      literals.push(key);
      continue;
    }
    const parts = key.split(/(\{\d+\})/);
    const slots = [];
    const expression = parts
      .map((part, index) => {
        if (!/^\{\d+\}$/.test(part)) return escaped(part);
        slots.push(part);
        // A value cannot consume another complete sentence. Otherwise a short
        // amount template can accidentally swallow the following review text.
        return index === parts.length - 2 && !parts.at(-1) && parts[index - 1]?.endsWith('。')
          ? '(.*?)'
          : '([^。]*?)';
      })
      .join('');
    templates.push({
      pattern: new RegExp('^' + expression + '$', 'u'),
      fragment:
        !/^\{\d+\}|\{\d+\}$|\{\d+\}\{\d+\}/.test(key) &&
        slots.length <= 4 &&
        key.length <= 400 &&
        key.replace(/\{\d+\}/g, '').length >= 8
          ? new RegExp(expression, 'gu')
          : null,
      slots,
      translation,
      specificity: key.replace(/\{\d+\}/g, '').length,
    });
  }
  templates.sort((a, b) => b.specificity - a.specificity);
  literals.sort((a, b) => b.length - a.length);
  phrases = literals.length ? new RegExp(literals.map(escaped).join('|'), 'gu') : null;
}
function translate(text, depth = 0) {
  const source = normalized(text);
  if (Object.hasOwn(messages, source)) return messages[source];
  if (depth < 3)
    for (const entry of templates) {
      const match = entry.pattern.exec(source);
      if (!match) continue;
      const values = new Map(
        entry.slots.map((slot, i) => [slot, translate(match[i + 1], depth + 1)]),
      );
      return entry.translation.replace(/\{\d+\}/g, (slot) => values.get(slot) ?? slot);
    }
  let output = text;
  if (depth < 3)
    for (const entry of templates) {
      if (!entry.fragment) continue;
      output = output.replace(entry.fragment, (...args) => {
        const values = new Map(
          entry.slots.map((slot, i) => [slot, translate(args[i + 1], depth + 1)]),
        );
        return entry.translation.replace(/\{\d+\}/g, (slot) => values.get(slot) ?? slot);
      });
    }
  return phrases
    ? output.replace(phrases, (match) => messages[normalized(match)] ?? match)
    : output;
}
export function localizeText(value) {
  const text = String(value ?? '');
  if (locale === 'zh-CN' || !text.trim()) return text;
  if (cache.has(text)) return cache.get(text);
  const result = translate(text);
  // Preserve whitespace separating adjacent inline nodes and dynamic values.
  const output = (text.match(/^\s*/)?.[0] ?? '') + result.trim() + (text.match(/\s*$/)?.[0] ?? '');
  if (cache.size >= 2048) cache.clear();
  cache.set(text, output);
  return output;
}
export function formatChips(value) {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : locale, {
    maximumFractionDigits: 0,
  }).format(value);
}
const attributes = ['aria-label', 'title', 'data-mobile-label', 'placeholder'];
export function localizeDocument(root) {
  const document = root.ownerDocument ?? root;
  const walker = document.createTreeWalker(root, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('script, style, [translate="no"]')) continue;
    node.nodeValue = localizeText(node.nodeValue);
  }
  for (const el of root.querySelectorAll('*')) {
    if (el.closest('[translate="no"]')) continue;
    for (const name of attributes)
      if (el.hasAttribute(name)) el.setAttribute(name, localizeText(el.getAttribute(name)));
  }
}
export function localizeHTML(value) {
  const text = String(value ?? '');
  if (locale === 'zh-CN') return text;
  // Translate text nodes and display attributes only. Never translate selectors,
  // URLs, dataset identifiers, rule snapshots or serialized Worker messages.
  const template = document.createElement('template');
  template.innerHTML = text;
  localizeDocument(template.content);
  return template.innerHTML;
}
export async function prepareLocale() {
  let saved;
  try {
    saved = preferenceStorage.getItem(LOCALE_KEY);
  } catch {}
  await loadLocale(resolveLocale(saved, globalThis.navigator?.languages ?? []));
  document.documentElement.lang = locale;
  document.documentElement.dir = 'ltr';
  localizeDocument(document);
  document.title = localizeText(document.title);
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.content = localizeText(meta.content);
  const select = document.querySelector('#language-select');
  select.value = locale;
  select.addEventListener('change', () => {
    setLocale(select.value);
    // Reload terminates old timers and Workers together, hydrates native
    // preferences and starts a fresh hand with the saved table configuration.
    void preferenceStorage.flush().finally(() => location.reload());
  });
}
