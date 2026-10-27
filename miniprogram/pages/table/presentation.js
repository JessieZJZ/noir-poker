const { compactChips } = require('../../shared/engine/chip-format.js');
const { renderCardArtwork } = require('../../shared/ui/cards.js');
const { evaluate, rankText } = require('../../shared/engine/poker.js');

// Match src/ui/cards.js. These vectors are presentation, never card/rule state.
const suitShapes = [
  'M10 0C7 5 0 8 0 14C0 19 7 21 10 16C13 21 20 19 20 14C20 8 13 5 10 0ZM9 16L6 22H14L11 16Z',
  'M10 22C7 18 0 12 0 6C0 -1 8 -2 10 4C12 -2 20 -1 20 6C20 12 13 18 10 22Z',
  'M10 0C3 0 3 8 6 10C-2 7 -2 19 5 19C7 19 9 18 10 15C11 18 13 19 15 19C22 19 22 7 14 10C17 8 17 0 10 0ZM9 15L6 22H14L11 15Z',
  'M10 0L20 11L10 22L0 11Z',
];
function presentCard(card) {
  const suit = typeof card.suit === 'number' ? card.suit : ['♠', '♥', '♣', '♦'].indexOf(card.suit);
  const red = suit === 1 || suit === 3;
  return {
    ...card,
    rank: typeof card.rank === 'number' ? rankText(card.rank) : card.rank,
    suit: typeof card.suit === 'number' ? card.symbol : card.suit,
    red,
    artStyle: `background-image:url("data:image/svg+xml,${encodeURIComponent(
      renderCardArtwork(
        {
          ...card,
          rank:
            typeof card.rank === 'number'
              ? card.rank
              : '23456789TJQKA'.indexOf(card.rank === '10' ? 'T' : card.rank) + 2,
          suit,
        },
        { compact: true },
      )
        .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
        .replaceAll('currentColor', red ? '#c74760' : '#223447'),
    )}");`,
    smallArtStyle: `background-image:url("data:image/svg+xml,${encodeURIComponent(
      renderCardArtwork(
        {
          ...card,
          rank:
            typeof card.rank === 'number'
              ? card.rank
              : '23456789TJQKA'.indexOf(card.rank === '10' ? 'T' : card.rank) + 2,
          suit,
        },
        { small: true },
      )
        .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
        .replaceAll('currentColor', red ? '#c74760' : '#223447'),
    )}");`,
    suitStyle: `background-image:url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 22"><path d="${suitShapes[suit]}" fill="${red ? '#c74760' : '#223447'}"/></svg>`)}");`,
  };
}
function showdownPresentation(game, profiles) {
  if (game.phase !== 'done' || !game.showdown || game.board.length !== 5) return [];
  return game.players
    .filter((player) => !player.folded)
    .map((player) => {
      const rank = evaluate([...player.hole, ...game.board]);
      const counts = new Map();
      rank.cards.forEach((card) => counts.set(card.rank, (counts.get(card.rank) || 0) + 1));
      const category = rank.score[0];
      const cards = [...rank.cards].sort((a, b) =>
        category === 4 || category === 8
          ? (rank.score[1] === 5 && a.rank === 14 ? 1 : a.rank) -
            (rank.score[1] === 5 && b.rank === 14 ? 1 : b.rank)
          : counts.get(b.rank) - counts.get(a.rank) || b.rank - a.rank,
      );
      const awards = game.pots.flatMap((pot) =>
        pot.awards
          .filter((award) => award.id === player.id)
          .map((award) => ({ ...award, pot: pot.label, split: pot.awards.length > 1 })),
      );
      const profile = profiles.find((profile) => profile.id === player.botProfile);
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
                        : rank.score[1] === 14
                          ? '同花色的 10 · J · Q · K · A'
                          : `${cards[0].symbol} 同花顺 · ${rankText(rank.score[1])} 高`;
      const amount = awards.reduce((sum, award) => sum + award.amount, 0);
      return {
        id: player.id,
        name:
          player.id && profile && profile.id !== 'balanced'
            ? `${player.name}（${profile.short}）`
            : player.name,
        label: rank.label,
        explanation,
        winner: awards.length > 0,
        result: awards.length ? `获胜 +${compactChips(amount)}` : '未获底池',
        awards: awards.length
          ? awards
              .map(
                (award) =>
                  `${award.pot}${award.split ? ' · 平分' : ''} +${compactChips(award.amount)}`,
              )
              .join(' · ')
          : '最佳五张牌',
        cards: cards.map((card) => ({
          ...presentCard(card),
          highlight:
            category === 0
              ? card.rank === rank.score[1]
              : [1, 2, 3, 7].includes(category)
                ? counts.get(card.rank) > 1
                : true,
        })),
      };
    });
}
// Patch stable list items at their leaves so unrelated WXML nodes retain motion
// and measured caption offsets. Structural changes replace only that list.
function presentationPatch(previous, next) {
  const patch = {};
  function visit(before, after, key) {
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    if (
      Array.isArray(before) &&
      Array.isArray(after) &&
      // A leaf append does not invalidate WXML's array.length dependencies.
      // Replace structural changes so wx:if, classes and wx:for all update.
      before.length === after.length &&
      before.every(
        (item, i) =>
          (item?.dealKey ?? item?.id ?? item?.key) ===
          (after[i]?.dealKey ?? after[i]?.id ?? after[i]?.key),
      )
    ) {
      after.forEach((item, i) => visit(before[i], item, `${key}[${i}]`));
    } else if (
      before &&
      after &&
      !Array.isArray(before) &&
      !Array.isArray(after) &&
      typeof before === 'object' &&
      typeof after === 'object' &&
      Object.keys(before).every((k) => Object.hasOwn(after, k))
    ) {
      for (const [field, value] of Object.entries(after))
        visit(before[field], value, `${key}.${field}`);
    } else patch[key] = after;
  }
  for (const [key, value] of Object.entries(next)) visit(previous[key], value, key);
  return patch;
}
module.exports = { presentCard, showdownPresentation, presentationPatch };
