import { compactActionAmounts } from '../engine/chip-format.js';
import { gameIdentities, actorIdentity } from '../engine/player-identity.js';

const escapePattern = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function createActivityParts(game) {
  const identities = gameIdentities(game);
  const actors = identities.map((p) => actorIdentity({ players: identities }, p.id));
  const names = actors.map((p) => escapePattern(p.name)).sort((a, b) => b.length - a.length);
  const pattern = names.length
    ? new RegExp(`(^|[^A-Za-z])(${names.join('|')})(?![A-Za-z])`, 'g')
    : null;
  return (entry) => {
    const text = compactActionAmounts(typeof entry === 'string' ? entry : entry.text || '');
    if (!pattern) return [{ text }];
    const parts = [];
    let end = 0;
    for (const match of text.matchAll(pattern)) {
      const start = match.index + match[1].length;
      if (start > end) parts.push({ text: text.slice(end, start) });
      const actor = actors.find((p) => p.name === match[2]);
      const suffix = actor.profile ? `（${actor.profile}）` : '';
      const alreadyNamed = suffix && text.slice(start + match[2].length).startsWith(suffix);
      parts.push({ ...actor, actor: true, key: parts.length });
      end = start + match[2].length + (alreadyNamed ? suffix.length : 0);
    }
    if (end < text.length) parts.push({ text: text.slice(end) });
    return parts.length ? parts : [{ text }];
  };
}
