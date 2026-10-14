import { rankText } from '../engine/poker.js';
import { historyActionLabel } from '../engine/action-labels.js';

const suits = ['♠', '♥', '♣', '♦'];
export const cardText = (cards = []) =>
  cards.map((card) => rankText(card.rank) + suits[card.suit]).join(' ');

// Descriptive facts only: prices, eligibility and refunds remain engine-owned.
// Read the actor's cards and public actions, never another player's hole cards.
export function spotFacts(s, c, actorId = 0) {
  const history = s.history || [],
    players = s.players || s.opponents || [],
    activeOpponents = players.filter((p) => p.id !== actorId && !p.folded),
    pendingOpponents = activeOpponents.filter((p) => !p.allin && (s.pending || []).includes(p.id));
  const describe = (entry, index) => {
    const player = players.find((p) => p.id === entry.id);
    return {
      ...entry,
      name: player?.name || (entry.id === 0 ? '你' : '对手'),
      position: player?.position || '',
      label: historyActionLabel(history, index),
      index,
    };
  };
  const aggression = history.map(describe).filter((a) => a.id !== actorId && a.action === 'raise');
  const last = aggression.at(-1);
  const lastAggression = last
    ? {
        ...last,
        priorChecks: [
          ...new Set(
            history
              .slice(0, last.index)
              .filter((a) => a.id === last.id && a.action === 'check' && a.street < last.street)
              .map((a) => a.street),
          ),
        ],
        line: aggression.filter((a) => a.id === last.id),
      }
    : null;
  const investment = c.extra ?? 0;
  return {
    holeText: cardText(s.hole),
    boardText: cardText(s.board),
    lastCardText: cardText(s.board?.slice(-1)),
    investment,
    shove: s.action === 'raise' && s.amount === s.legal.maxRaiseTo,
    potRatio: s.pot ? investment / s.pot : 0,
    activeOpponents,
    pendingOpponents,
    allOpponentsAllIn: activeOpponents.length > 0 && activeOpponents.every((p) => p.allin),
    lastAggression,
    ownPreviousActions: history.map(describe).filter((a) => a.id === actorId),
  };
}
