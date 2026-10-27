import { bigBlindOf } from '../engine/stakes.js';
import { startingTier } from './context.js';
import { legalRaiseTo } from '../engine/bet-sizing.js';

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
    ? new Set(
        history
          .slice(history.indexOf(open) + 1)
          .filter((a) => a.action === 'call' && a.id !== 0 && a.id !== open.id)
          .map((a) => a.id),
      ).size
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
    openId: open?.id,
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

// Practice heuristics for realizing a speculative hand, not an EV solver.
// Use the raiser/callers' matched depth. An uninvested deep blind cannot make
// a short opener a deep opponent, and the hero's stack alone is insufficient.
export function positionedEntry(s, ctx, pre = preflopContext(s)) {
  const bb = bigBlindOf(s),
    [high, low] = s.hole.map((card) => card.rank).sort((a, b) => b - a),
    suited = s.hole[0].suit === s.hole[1].suit,
    shape =
      high === low && high <= 7
        ? 'small-pair'
        : suited && high === 14 && low <= 9
          ? 'suited-ace'
          : suited && high <= 11 && low >= 4 && high - low === 1
            ? 'connector'
            : suited && high <= 11 && low >= 5 && high - low === 2
              ? 'one-gap'
              : null;
  const others = s.players.filter((p) => p.id !== 0 && !p.folded),
    entered = others.filter(
      (p) =>
        p.id === pre.openId ||
        p.bet >= s.currentBet ||
        (p.allin &&
          (s.history || []).some((a) => a.street === 0 && a.id === p.id && a.action === 'call')),
    ),
    depths = entered.map((p) => Math.min(s.stack + s.bet, p.stack + p.bet)),
    effective = depths.length ? Math.min(...depths) : 0,
    waiting = s.pending.filter((id) => id !== 0 && !s.players[id]?.folded && !s.players[id]?.allin),
    waitingBlinds = waiting.every((id) => ['SB', 'BB'].includes(s.players[id]?.position)),
    costRatio = effective ? s.legal.callAmount / effective : 1;
  const eligible =
    !s.street &&
    !!shape &&
    ctx.inPosition &&
    ['CO', 'BTN'].includes(s.position) &&
    pre.raises === 1 &&
    pre.openId !== 0 &&
    entered.length >= 1 &&
    entered.length <= 3 &&
    entered.every((p) => !p.allin) &&
    waitingBlinds &&
    s.currentBet <= 3 * bb &&
    s.legal.callAmount > 0 &&
    s.legal.callAmount < s.stack &&
    effective >= 75 * bb &&
    costRatio <= (shape === 'one-gap' ? 0.025 : 0.03);
  const target = preflopRaiseTarget(s, ctx, pre),
    raiseTo = s.legal.canRaise ? legalRaiseTo(target, s.legal) : null;
  return {
    eligible,
    shape,
    effective,
    depthBB: effective / bb,
    costRatio,
    stackRatio: s.stack ? s.legal.callAmount / s.stack : 1,
    involved: entered.map((p) => p.id),
    waiting: waiting.length,
    callers: pre.callersAfterOpen,
    raiseTo:
      raiseTo && raiseTo < s.legal.maxRaiseTo && raiseTo - s.bet <= effective * 0.15
        ? raiseTo
        : null,
  };
}

export function preflopRaiseTarget(s, ctx, pre = preflopContext(s)) {
  const bb = bigBlindOf(s);
  if (s.currentBet <= bb) return (3 + pre.limpers) * bb;
  const callers = pre.raises === 1 ? pre.callersAfterOpen : 0;
  return s.currentBet * ((ctx.inPosition ? 3 : 4) + callers);
}
