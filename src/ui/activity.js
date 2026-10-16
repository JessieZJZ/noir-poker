import { compactActionAmounts } from '../engine/chip-format.js';
import { createActivityParts } from './activity-parts.js';

const escapeHtml = (value) =>
  compactActionAmounts(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
export function renderActivityParts(parts) {
  return parts
    .map((part) =>
      part.actor
        ? `${escapeHtml(part.name)}${part.profile ? `<span class="activity-persona">（${escapeHtml(part.profile)}）</span>` : ''}${part.position ? ` <span class="position activity-position">${escapeHtml(part.position)}</span> ` : ''}`
        : escapeHtml(part.text),
    )
    .join('');
}

export function createActivityFormatter(game) {
  const parts = createActivityParts(game);
  return (entry) => renderActivityParts(parts(entry));
}
