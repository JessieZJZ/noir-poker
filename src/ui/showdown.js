import { formatChips, setLocalizedHTML, setLocalizedText } from '../i18n/index.js';
import { evaluate, rankText } from '../engine/poker.js';
import { createActivityFormatter } from './activity.js';
export const HAND_MOTIONS = [
  'high',
  'pair',
  'two-pair',
  'trips',
  'straight',
  'flush',
  'full-house',
  'quads',
  'straight-flush',
];
function handScene(g, p) {
  const rank = evaluate([...p.hole, ...g.board]),
    category = rank.score[0],
    royal = category === 8 && rank.score[1] === 14;
  const counts = new Map();
  rank.cards.forEach((c) => counts.set(c.rank, (counts.get(c.rank) || 0) + 1));
  const cards = [...rank.cards].sort((a, b) =>
    category === 4 || category === 8
      ? (rank.score[1] === 5 && a.rank === 14 ? 1 : a.rank) -
        (rank.score[1] === 5 && b.rank === 14 ? 1 : b.rank)
      : counts.get(b.rank) - counts.get(a.rank) || b.rank - a.rank,
  );
  const highlights = cards.map((c) =>
    category === 0
      ? c.rank === rank.score[1]
      : [1, 2, 3, 7].includes(category)
        ? counts.get(c.rank) > 1
        : true,
  );
  const explanation =
    category === 0
      ? `${rankText(rank.score[1])} 高牌 · 踢脚依次比较`
      : category === 1
        ? `一对 ${rankText(rank.score[1])}`
        : category === 2
          ? `${rankText(rank.score[1])} 与 ${rankText(rank.score[2])} 两对`
          : category === 3
            ? `三张 ${rankText(rank.score[1])}`
            : category === 4
              ? `${rankText(rank.score[1])} 高顺子`
              : category === 5
                ? `${cards[0].symbol} 同花 · ${rankText(rank.score[1])} 高`
                : category === 6
                  ? `三张 ${rankText(rank.score[1])} + 一对 ${rankText(rank.score[2])}`
                  : category === 7
                    ? `四张 ${rankText(rank.score[1])}`
                    : royal
                      ? '同花色的 10 · J · Q · K · A'
                      : `${cards[0].symbol} 同花顺 · ${rankText(rank.score[1])} 高`;
  return {
    id: p.id,
    name: p.name,
    label: rank.label,
    motion: royal ? 'royal' : HAND_MOTIONS[category],
    cards,
    highlights,
    explanation,
  };
}
export function winningScenes(g) {
  if (g.phase !== 'done' || !g.showdown || g.board.length !== 5) return [];
  return g.pots.flatMap((pot) =>
    pot.awards.map((award) => ({
      ...handScene(g, g.players[award.id]),
      pot: pot.label,
      amount: award.amount,
      split: pot.awards.length > 1,
    })),
  );
}
export function showdownScenes(g) {
  if (g.phase !== 'done' || !g.showdown || g.board.length !== 5) return [];
  return g.players
    .filter((p) => !p.folded)
    .map((p) => {
      const awards = g.pots.flatMap((pot) =>
        pot.awards
          .filter((a) => a.id === p.id)
          .map((a) => ({ pot: pot.label, amount: a.amount, split: pot.awards.length > 1 })),
      );
      return { ...handScene(g, p), awards, amount: awards.reduce((sum, a) => sum + a.amount, 0) };
    });
}
export function createShowdownController({ card }) {
  const $ = (s) => document.querySelector(s),
    format = (n) => formatChips(n);
  let key = null;
  function reset() {
    key = null;
    $('#showdown-stage').hidden = true;
    setLocalizedHTML($('#showdown-scene'), '');
  }
  return {
    update(g, epoch) {
      const nextKey = epoch + ':' + g.hand;
      if (g.phase !== 'done' || !g.showdown) {
        reset();
        return;
      }
      if (key === nextKey) return;
      key = nextKey;
      const scenes = showdownScenes(g);
      const playerName = createActivityFormatter(g.players);
      $('#showdown-stage').hidden = !scenes.length;
      setLocalizedText(
        $('#showdown-context'),
        `${scenes.length} 人参与摊牌${g.pots.length > 1 ? ' · 主池与边池分别结算' : ''}`,
      );
      setLocalizedHTML(
        $('#showdown-scene'),
        scenes
          .map(
            (s) =>
              `<article class="showdown-player ${s.awards.length ? 'showdown-winner' : ''}" data-player="${s.id}" aria-label="${s.name} · ${s.label}"><div class="showdown-player-heading"><strong>${playerName(s.name)}</strong><span>${s.awards.length ? '获胜 +' + format(s.amount) : '未获底池'}</span></div><div class="winning-title"><strong>${s.label}</strong><span>${s.explanation}</span></div><div class="winning-cards ${s.awards.length ? 'motion-' + s.motion : ''}" data-motion="${s.motion}">${s.cards.map((c, i) => `<div class="winning-card ${s.highlights[i] ? 'rank-match' : 'kicker'}" style="--i:${i}" data-card="${c.key}">${card(c)}</div>`).join('')}</div>${s.awards.length ? `<p class="showdown-awards">${s.awards.map((a) => `${a.pot}${a.split ? ' · 平分' : ''} +${format(a.amount)}`).join(' · ')}</p>` : '<p class="showdown-awards">最佳五张牌</p>'}</article>`,
          )
          .join(''),
      );
    },
    reset,
  };
}
