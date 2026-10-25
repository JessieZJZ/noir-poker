import { publicPostflopLine } from '../engine/public-story.js';
import { actorAtPosition } from '../engine/player-identity.js';
import { compactChips } from '../engine/chip-format.js';

// Public facts, not a claim that an archived bot had the current range model.
export function publicStoryNotes(s) {
  if (!s.street || !['call', 'fold'].includes(s.action)) return [];
  const last = (s.history || []).findLast(
    (a) => a.street === s.street && a.action === 'raise' && a.id !== 0,
  );
  if (!last) return [];
  const line = publicPostflopLine(s, last.id);
  if (new Set(line.map((a) => a.street)).size < 2) return [];
  if (
    !line.some((a) => a.action === 'check-raise') &&
    line.filter((a) => ['bet', 'raise'].includes(a.action)).length < 2
  )
    return [];
  const parts = [`${actorAtPosition(s, last.id)}此前的公开行动：`, ' '];
  const visible = line.filter(
    (a) =>
      a.action !== 'check' ||
      !line.some((b) => b.street === a.street && b.action === 'check-raise'),
  );
  visible.forEach((a, i) => {
    if (i) parts.push(' → ');
    parts.push(['', '翻牌', '转牌', '河牌'][a.street]);
    parts.push(' ');
    parts.push(
      a.action === 'check'
        ? '过牌'
        : a.action === 'check-raise'
          ? `过牌后加注至 ${compactChips(a.amount)}`
          : a.action === 'call'
            ? `跟注 ${compactChips(a.amount)}`
            : `${a.action === 'bet' ? '下注至' : '加注至'} ${compactChips(a.amount)}`,
    );
  });
  parts.push('。');
  if (line.some((a) => a.action === 'check-raise'))
    parts.push('过牌加注也可能来自强牌，不能仅凭前面的过牌排除价值牌。');
  if (s.street === 3) {
    const turn = s.board.slice(0, 4),
      suits = ['黑桃', '红桃', '梅花', '方块'];
    for (let suit = 0; suit < 4; suit++)
      if (
        turn.filter((c) => c.suit === suit).length === 2 &&
        s.board.filter((c) => c.suit === suit).length === 2
      )
        parts.push(`河牌没有补出第三张${suits[suit]}，此前的同花听牌仍可能转成诈唬。`);
  }
  return parts;
}
