import { compactActionAmounts } from '../engine/chip-format.js';
import { createActivityParts } from './activity-parts.js';
import { localizeText } from '../i18n/index.js';

const escapeHtml = (value) =>
  compactActionAmounts(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
export function renderActivityParts(parts) {
  // Translate the complete sentence before adding actor markup. Splitting a
  // blind/mood log into text nodes hides its whole-sentence catalog template.
  const actors = [];
  const source = parts
    .map((part) => {
      if (!part.actor) return part.text;
      actors.push(part);
      return `\uE200${actors.length - 1}\uE201`;
    })
    .join('');
  return escapeHtml(localizeText(source)).replace(/\uE200(\d+)\uE201/g, (_, index) => {
    const part = actors[index];
    return `${escapeHtml(localizeText(part.name))}${part.profile ? `<span class="activity-persona">（${escapeHtml(localizeText(part.profile))}）</span>` : ''}${part.position ? ` <span class="position activity-position">${escapeHtml(part.position)}</span> ` : ''}`;
  });
}

export function createActivityFormatter(game) {
  const parts = createActivityParts(game);
  return (entry) => renderActivityParts(parts(entry));
}
