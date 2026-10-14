import { bigBlindOf } from '../engine/stakes.js';
import { startingTier } from './context.js';

export function preflopContext(s) {
  const bigBlind = bigBlindOf(s);
  const history = s.history.filter((a) => a.street === 0);
  const raises = history.filter((a) => a.action === 'raise' && a.amount > bigBlind);
  const firstRaise = history.findIndex((a) => a.action === 'raise' && a.amount > bigBlind);
  const limpers = new Set(
    history
      .slice(0, firstRaise < 0 ? undefined : firstRaise)
      .filter((a) => a.action === 'call' && a.id !== 0)
      .map((a) => a.id),
  ).size;
  const open = raises[0],
    last = raises.at(-1);
  const callersAfterOpen = open
    ? history
        .slice(history.indexOf(open) + 1)
        .filter((a) => a.action === 'call' && a.id !== 0 && a.id !== open.id).length
    : 0;
  const ranks = s.hole.map((c) => c.rank).sort((a, b) => b - a);
  const suited = s.hole[0].suit === s.hole[1].suit;
  const late = ['BTN', 'CO'].includes(s.position);
  const unopened = !raises.length && s.currentBet <= bigBlind;
  return {
    raises: raises.length,
    limpers,
    callersAfterOpen,
    late,
    unopened,
    ace: ranks[0] === 14,
    kicker: ranks[1],
    suited,
    weakAce: ranks[0] === 14 && ranks[1] <= 9 && ranks[0] !== ranks[1],
    ownOpen: open?.id === 0,
    lastRaiser: last?.id,
    openTo: open?.amount || bigBlind,
    ratio: last ? last.amount / (raises.at(-2)?.amount || bigBlind) : 1,
    openingCandidate:
      startingTier(s.hole) >= 1 || (late && (ranks[0] === 14 || (ranks[0] >= 13 && ranks[1] >= 7))),
    label: !raises.length
      ? limpers
        ? '未加注，已有跛入'
        : '无人主动入池'
      : raises.length === 1
        ? callersAfterOpen
          ? '开池后已有平跟'
          : '面对开池'
        : raises.length === 2
          ? '面对 3-bet'
          : '面对 4-bet 或更多次加注',
  };
}
