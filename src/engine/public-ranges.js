import { bigBlindOf } from './stakes.js';
import { allInContext } from './public-action-context.js';

const clamp = (value) => Math.max(0, Math.min(1, value));
const late = (position) => ['BTN', 'CO', 'SB', 'BB'].includes(position);
const tier = (pair) => {
  const [high, low] = pair.map((c) => c.rank).sort((a, b) => b - a),
    suited = pair[0].suit === pair[1].suit;
  if ((high === low && high >= 11) || (high === 14 && low === 13)) return 3;
  if (
    (high === low && high >= 8) ||
    (high === 14 && low >= 10) ||
    (suited && high >= 12 && low >= 10)
  )
    return 2;
  if (
    high === low ||
    (suited && high === 14) ||
    (high >= 11 && low >= 10) ||
    (suited && high - low <= 2 && low >= 5) ||
    (high === 14 && low >= 8)
  )
    return 1;
  return 0;
};

// Descriptors contain public actions, never another seat's cards or a final result.
// Both actor-relative bot views and before-action hero snapshots use this API.
export function preparePublicRanges(view) {
  const actorId = view.id ?? 0,
    bigBlind = bigBlindOf(view),
    history = (view.history || []).filter((a) => a.street <= view.street),
    opponents = (view.players || view.opponents || []).filter((p) => p.id !== actorId && !p.folded),
    preflop = history.filter((a) => a.street === 0),
    commitment =
      (!view.players && view.allIn) ||
      allInContext({
        history,
        opponents,
        street: view.street,
        bigBlind,
        stack: view.stack,
        total: view.total,
        legal: view.legal,
        currentBet: view.currentBet,
        actionContext: view.actionContext,
        bet: view.bet ?? 0,
      }),
    allInRanges = new Map((commitment?.ranges || []).map((r) => [r.id, r]));
  return opponents.map((opponent) => {
    const ownPreflop = preflop
        .map((action, index) => ({ action, index }))
        .filter(
          ({ action }) =>
            action.id === opponent.id &&
            (action.action === 'raise' || (action.action === 'call' && action.amount > 0)),
        )
        .at(-1),
      preflopRaises = ownPreflop
        ? preflop.slice(0, ownPreflop.index + 1).filter((a) => a.action === 'raise').length
        : 0,
      postAction = history
        .filter(
          (a) =>
            a.id === opponent.id && a.street > 0 && ['check', 'call', 'raise'].includes(a.action),
        )
        .at(-1),
      allIn = allInRanges.get(opponent.id),
      street = allIn?.street ?? postAction?.street ?? 0,
      board = street > 0 ? view.board.slice(0, street + 2) : [],
      total = opponent.total ?? opponent.bet ?? 0,
      depthBB =
        allIn?.depthBB ?? Math.min(view.stack ?? Infinity, opponent.stack + total) / bigBlind;
    return {
      id: opponent.id,
      position: opponent.position ?? null,
      role:
        allIn?.role ??
        (ownPreflop?.action.action === 'raise' ? 'raiser' : ownPreflop ? 'caller' : 'unentered'),
      line:
        allIn?.line ??
        (preflopRaises >= 3 ? 'multi-raise' : preflopRaises === 2 ? 'reraise' : 'open'),
      depthBB,
      allIn: !!allIn,
      actualAllIn: opponent.allin === true,
      street,
      board,
      preflop: {
        action: ownPreflop?.action.action ?? null,
        raises: preflopRaises,
        amountBB: (ownPreflop?.action.amount ?? bigBlind) / bigBlind,
      },
      postflop: postAction
        ? {
            street: postAction.street,
            action: postAction.action,
            ratio: postAction.amount / Math.max(bigBlind, view.pot - postAction.amount),
          }
        : null,
      // Legacy all-in ranges price the latest public aggressor's size.
      aggressionRatio: view.currentBet / Math.max(bigBlind, view.pot - view.currentBet),
    };
  });
}

function allInPreflopWeight(hole, range) {
  const [high, low] = hole.map((c) => c.rank).sort((a, b) => b - a),
    pair = high === low,
    suited = hole[0].suit === hole[1].suit;
  if (range.role === 'entered') {
    if ((pair && high >= 8) || (high >= 13 && low >= 10)) return 1;
    if (pair || (suited && high === 14) || (suited && high - low <= 2 && low >= 5)) return 0.4;
    return 0.08;
  }
  if (range.depthBB <= 15) {
    if (pair && high >= 5) return 1;
    if (high === 14 && (low >= 10 || (suited && low >= 8))) return 1;
    if (high === 13 && (low === 12 || (suited && low >= 10))) return 0.8;
    if (pair || (high === 14 && suited) || (suited && high >= 10 && low >= 9)) return 0.35;
    return 0.01;
  }
  if (range.depthBB <= 30) {
    if ((pair && high >= 8) || (high === 14 && low >= 12)) return 1;
    if ((high === 14 && suited && low >= 10) || (suited && high === 13 && low === 12)) return 0.6;
    if ((pair && high >= 5) || (suited && high === 14)) return 0.1;
    return 0.003;
  }
  if (range.role === 'caller' || range.line === 'multi-raise-shove') {
    if (pair && high >= 13) return 1;
    if (pair && high === 12) return range.role === 'caller' ? 0.7 : 0.35;
    if (high === 14 && low === 13) return range.role === 'caller' ? 0.8 : 0.55;
    if (pair && high === 11) return 0.08;
    if (suited && high === 14 && low === 12) return 0.05;
    return 0.001;
  }
  if (range.line === 'reraise-shove') {
    if ((pair && high >= 11) || (high === 14 && low === 13)) return 1;
    if ((pair && high === 10) || (suited && high === 14 && low === 12)) return 0.3;
    if (suited && high === 14 && low <= 5) return 0.035;
    return 0.002;
  }
  if ((pair && high >= 10) || (high === 14 && low >= 12)) return 1;
  if ((pair && high === 9) || (suited && high >= 13 && low >= 11)) return 0.3;
  if (suited && high === 14 && low <= 5) return 0.04;
  return 0.003;
}

function boardTraits(pair, board, score, features) {
  const high = Math.max(0, ...board.map((c) => c.rank)),
    own =
      features?.ownMade ??
      (score &&
        score[0] > 0 &&
        pair.some((c) =>
          score.slice(1, score[0] === 2 || score[0] === 6 ? 3 : 2).includes(c.rank),
        )),
    flushDraw =
      board.length < 5 &&
      [0, 1, 2, 3].some(
        (suit) =>
          [...pair, ...board].filter((c) => c.suit === suit).length === 4 &&
          pair.some((c) => c.suit === suit),
      ),
    ranks = new Set([...pair, ...board].map((c) => c.rank));
  if (ranks.has(14)) ranks.add(1);
  const straightDraw =
    board.length < 5 &&
    Array.from(
      { length: 10 },
      (_, i) =>
        Array.from({ length: 5 }, (_, j) => i + j + 1).filter((rank) => ranks.has(rank)).length ===
          4 && pair.some((c) => c.rank >= i + 1 && c.rank <= i + 5),
    ).some(Boolean);
  return {
    strong: features?.strongMade ?? (own && score?.[0] >= 3),
    own,
    pair:
      (features?.overpair ?? (pair[0].rank === pair[1].rank && pair[0].rank > high)) ||
      (score?.[0] === 1 && score[1] === high && pair.some((c) => c.rank === high)),
    draw: features?.draw ?? (flushDraw || straightDraw),
  };
}

export function publicComboWeight(
  pair,
  descriptor,
  {
    board = descriptor.board || [],
    score = null,
    features = null,
    boardScore = null,
    compare = null,
  } = {},
) {
  if (descriptor.allIn && descriptor.street === 0) {
    let weight = allInPreflopWeight(pair, descriptor);
    if (
      descriptor.position &&
      descriptor.role === 'shover' &&
      descriptor.depthBB > 30 &&
      tier(pair) < 3
    )
      weight *= late(descriptor.position) ? 1.35 : 0.7;
    return clamp(weight);
  }
  const handTier = tier(pair),
    preflop = descriptor.preflop || { action: null, raises: 0, amountBB: 1 },
    levels = preflop.raises,
    tables = !preflop.action
      ? [1, 1, 1, 1]
      : levels >= 3
        ? [0.015, 0.06, 0.3, 1]
        : levels === 2
          ? [0.05, 0.2, 0.6, 1]
          : preflop.action === 'raise'
            ? [0.2, 0.45, 0.8, 1]
            : [0.3, 0.6, 0.85, 1];
  let weight = tables[handTier];
  if (preflop.action && handTier < 3 && descriptor.position)
    weight *= late(descriptor.position) ? 1.15 : 0.8;
  if (preflop.action === 'raise' && preflop.amountBB > 4 && handTier < 3) weight *= 0.75;
  if (board.length < 3 || !score) return clamp(weight);
  const traits = boardTraits(pair, board, score, features);
  if (descriptor.allIn) {
    const shared = boardScore && compare && compare(score, boardScore) === 0,
      tight = descriptor.role === 'caller' || descriptor.aggressionRatio > 3;
    if (!shared && traits.strong) return 1;
    if (traits.pair) return tight ? 0.25 : 0.8;
    if (traits.draw) return descriptor.street === 1 ? (tight ? 0.18 : 0.5) : 0.12;
    if (!shared && traits.own) return tight ? 0.035 : 0.15;
    return tight ? 0.003 : 0.015;
  }
  const action = descriptor.postflop?.action;
  if (!action) return clamp(weight);
  if (action === 'check') return clamp(weight * (traits.strong ? 0.85 : traits.draw ? 0.8 : 1));
  const large = descriptor.postflop.ratio >= 1,
    madeWeight = traits.strong
      ? 1
      : traits.pair
        ? large
          ? 0.55
          : 0.85
        : traits.draw
          ? 0.5
          : traits.own
            ? 0.35
            : large
              ? 0.05
              : 0.2;
  return clamp(weight * madeWeight);
}
