import { compactChips } from '../engine/chip-format.js';
import overrides from './overrides.json' with { type: 'json' };
import timezoneLocales from './timezone-locales.json' with { type: 'json' };
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
export function resolveLocale(saved, languages = [], timeZone) {
  if (SUPPORTED_LOCALES.includes(saved)) return saved;
  // Time zones identify a region, not a person's language. Use the regional
  // default only for a first visit; an explicit saved selection always wins.
  let regional = Object.hasOwn(timezoneLocales, timeZone) ? timezoneLocales[timeZone] : null;
  if (!regional && timeZone) {
    try {
      regional =
        timezoneLocales[new Intl.DateTimeFormat('en', { timeZone }).resolvedOptions().timeZone];
    } catch {}
  }
  if (regional) return regional;
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
function translateCore(text, depth = 0) {
  const source = normalized(text);
  if (Object.hasOwn(messages, source)) return messages[source];
  // Texture labels are lists of exact catalog facts, not sentence templates.
  // Resolve every list item before a broad "公共牌{0}" template can consume it.
  const list = source.split('、');
  if (list.length > 1 && list.every((part) => Object.hasOwn(messages, part)))
    return list.map((part) => messages[part]).join(' / ');
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
function translate(text, depth = 0) {
  // A public actor label is one value. Its "在 ... 位" must not be mistaken
  // for the following sentence's board/position delimiter by a parent template.
  const actors = [];
  const masked = text.replace(
    /(?:你|对手|[A-Za-z][A-Za-z0-9_-]*)(?:（[^（）]+）)?在 (?:BTN|SB|BB|UTG(?:\+\d+)?|MP|LJ|HJ|CO) 位/g,
    (actor) => {
      actors.push(actor);
      return `\uE000${actors.length - 1}\uE001`;
    },
  );
  const translated = translateCore(masked, depth);
  return actors.length
    ? translated.replace(/\uE000(\d+)\uE001/g, (token, index) =>
        actors[index] === undefined ? token : translateCore(actors[index], 0),
      )
    : translated;
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
  return compactChips(value, locale === 'en' ? 'en-US' : locale);
}
const attributes = ['aria-label', 'title', 'data-mobile-label', 'placeholder'];
// Remember source text on the actual DOM nodes. Language changes only replace
// presentation values; controls, listeners, focus and game objects stay alive.
const textSources = new WeakMap();
const attributeSources = new WeakMap();
function translatedValue(records, target, key, current) {
  let record = records.get(target);
  if (!record) records.set(target, (record = new Map()));
  const previous = record.get(key);
  const source = previous?.output === current ? previous.source : current;
  const output = localizeText(source);
  record.set(key, { source, output });
  return output;
}
export function localizeDocument(root) {
  const document = root.ownerDocument ?? root;
  const walker = document.createTreeWalker(root, 4);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('script, style, [translate="no"]')) continue;
    const initial = node.parentElement?.getAttribute('data-i18n-initial');
    const output = initial
      ? localizeText(initial).slice(0, 1)
      : translatedValue(textSources, node, 'text', node.nodeValue);
    if (node.nodeValue !== output) node.nodeValue = output;
  }
  const elements = [...(root.nodeType === 1 ? [root] : []), ...root.querySelectorAll('*')];
  for (const el of elements) {
    if (el.closest('[translate="no"]')) continue;
    const names = el.matches('meta[name="description"]') ? [...attributes, 'content'] : attributes;
    for (const name of names) {
      if (!el.hasAttribute(name)) continue;
      const current = el.getAttribute(name);
      const output = translatedValue(attributeSources, el, name, current);
      if (current !== output) el.setAttribute(name, output);
    }
  }
}
export function setLocalizedText(element, source) {
  element.textContent = String(source ?? '');
  localizeDocument(element);
}
export function copyLocalizedText(element, sourceElement) {
  const source = [...sourceElement.childNodes]
    .map((node) => textSources.get(node)?.get('text')?.source ?? node.textContent)
    .join('');
  setLocalizedText(element, source);
}
export function setLocalizedHTML(element, source) {
  element.innerHTML = String(source ?? '');
  localizeDocument(element);
}
export function setLocalizedAttribute(element, name, source) {
  attributeSources.get(element)?.delete(name);
  const output = translatedValue(attributeSources, element, name, String(source ?? ''));
  element.setAttribute(name, output);
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
  let timeZone;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {}
  await loadLocale(resolveLocale(saved, globalThis.navigator?.languages ?? [], timeZone));
  document.documentElement.lang = locale;
  document.documentElement.dir = 'ltr';
  localizeDocument(document);
  const select = document.querySelector('#language-select');
  select.value = locale;
  // Serialize catalog loading so rapid selections cannot finish out of order.
  // Do not touch game timers, Workers, settings drafts or hand lifecycle here.
  let pending = Promise.resolve();
  select.addEventListener('change', () => {
    const requested = select.value;
    setLocale(requested);
    pending = pending.then(async () => {
      await loadLocale(requested);
      document.documentElement.lang = requested;
      localizeDocument(document);
      document.dispatchEvent(new CustomEvent('noir:locale-changed'));
    });
    void preferenceStorage.flush();
  });
}
