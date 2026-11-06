// Review copy mixes Chinese with positions, amounts, cards and action labels
// built from separate pieces. Chinese typography here keeps one space between
// a Chinese character and a Latin letter, digit or card suit ("补 750",
// "在 BTN 位 2-bet 开池"), however the pieces were joined. Translation lookup
// ignores these spaces, so every locale keeps matching the same catalog keys.
// Built from code points: the UTF-8 WeChat bundle would otherwise write the
// range ends as raw characters, which the bundled font subset lacks.
export const HAN = [
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xf900, 0xfaff],
]
  .map(([from, to]) => String.fromCodePoint(from) + '-' + String.fromCodePoint(to))
  .join('');
const before = new RegExp(`([${HAN}])(?=[A-Za-z0-9♠♥♣♦])`, 'gu');
const after = new RegExp(`([A-Za-z0-9♠♥♣♦%])(?=[${HAN}])`, 'gu');

export function spaceCjk(text) {
  return typeof text === 'string' ? text.replace(before, '$1 ').replace(after, '$1 ') : text;
}

// A copy of plain review data with every string spaced. Codes, ids and card
// keys contain no Chinese and come back unchanged; shared references and
// cycles are copied once.
export function spaceDeep(value, seen = new WeakMap()) {
  if (typeof value === 'string') return spaceCjk(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const out = [];
    seen.set(value, out);
    for (const item of value) out.push(spaceDeep(item, seen));
    return out;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  const out = {};
  seen.set(value, out);
  for (const [key, item] of Object.entries(value)) out[key] = spaceDeep(item, seen);
  return out;
}

const sentences = (text) => text.match(/[^。！？]+[。！？]+|[^。！？]+$/gu) || [];
// A sentence the review already said is dropped: a repeat inside one
// paragraph, and a replay tip line that only restates the summary.
export function withoutRepeats(coaching) {
  const said = new Set();
  const paragraphParts = coaching.paragraphParts?.map((parts) => parts);
  const paragraphs = coaching.paragraphs.map((text, index) => {
    const parts = coaching.paragraphParts?.[index];
    if (parts) {
      // Parts are translated one by one: drop a part that repeats a whole
      // sentence, keeping the paragraph equal to its parts.
      if (!Array.isArray(parts) || parts.join('') !== text) {
        sentences(text).forEach((s) => said.add(s.trim()));
        return text;
      }
      const kept = parts.filter((part) => {
        const key = typeof part === 'string' ? part.trim() : '';
        const whole = key.length > 8 && /[。！？]$/.test(key) && sentences(key).length === 1;
        if (whole && said.has(key)) return false;
        if (typeof part === 'string') sentences(part).forEach((s) => said.add(s.trim()));
        return true;
      });
      paragraphParts[index] = kept;
      return kept.join('');
    }
    const kept = sentences(text).filter((s) => {
      const key = s.trim();
      if (key.length > 8 && said.has(key)) return false;
      said.add(key);
      return true;
    });
    return kept.join('');
  });
  const followUp =
    typeof coaching.followUp === 'string'
      ? sentences(coaching.followUp)
          .filter((s) => !(s.trim().length > 8 && said.has(s.trim())))
          .join('')
      : coaching.followUp;
  return { ...coaching, paragraphs, ...(paragraphParts ? { paragraphParts } : {}), followUp };
}

const escapeName = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A seat's training style is shown with its first mention in one review, as
// in "River（跟注诱导）". Later mentions use the bare name.
export function styleTagOnce(texts, names, seen = new Set()) {
  const list = [...new Set(names.filter((name) => typeof name === 'string' && name))];
  if (!list.length) return texts;
  const pattern = new RegExp(`(${list.map(escapeName).join('|')})（[^（）]+）`, 'gu');
  return texts.map((text) =>
    typeof text !== 'string'
      ? text
      : text.replace(pattern, (tagged, name) => {
          if (seen.has(name)) return name;
          seen.add(name);
          return tagged;
        }),
  );
}

// The same pass over paragraphs and their separately translated parts.
// A paragraph equal to `keep` (the matchup block, found by exact text) stays.
export function styleTagOnceInReview(
  paragraphs,
  paragraphParts,
  names,
  seen = new Set(),
  keep = null,
) {
  const outParagraphs = [],
    outParts = paragraphParts ? [] : undefined;
  paragraphs.forEach((text, index) => {
    if (keep !== null && text === keep) {
      outParagraphs.push(text);
      if (outParts) outParts.push(paragraphParts[index]);
      return;
    }
    const before = new Set(seen);
    outParagraphs.push(styleTagOnce([text], names, seen)[0]);
    if (outParts)
      outParts.push(
        Array.isArray(paragraphParts[index])
          ? styleTagOnce(paragraphParts[index], names, before)
          : paragraphParts[index],
      );
  });
  return { paragraphs: outParagraphs, paragraphParts: outParts };
}
