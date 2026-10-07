import { getBotProfile } from '../engine/bot-profiles.js';

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const escapePattern = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function createActivityFormatter(players) {
  const personas = new Map(
    players
      .filter((p) => p.id !== 0)
      .map((p) => [p.name, getBotProfile(p.botProfile)])
      .filter(([, profile]) => profile.id !== 'balanced'),
  );
  if (!personas.size) return escapeHtml;
  const names = new RegExp(
    `\\b(${[...personas.keys()].map(escapePattern).join('|')})\\b(?![（(])`,
    'g',
  );
  return (text) =>
    escapeHtml(text).replace(
      names,
      (name) =>
        `${escapeHtml(name)}<span class="activity-persona">（${escapeHtml(personas.get(name).short)}）</span>`,
    );
}
