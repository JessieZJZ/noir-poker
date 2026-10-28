import { bigBlindOf } from './stakes.js';
import { allInContext } from './public-action-context.js';
import {
  publicPostflopLine,
  publicStoryWeight,
  hasPublicActionLine,
  hasPublicStory,
} from './public-story.js';
import { startingPercentile } from './starting-range.js';
import {
  sanitizePublicRead,
  observedRangeModel,
  observedRangeWeight,
  observedAggressiveLikelihood,
  PUBLIC_LARGE_PREFLOP_BB,
} from './public-observations.js';

const clamp = (value) => Math.max(0, Math.min(1, value));
const late = (position) => ['BTN', 'CO', 'SB', 'BB'].includes(position);
const tier = (pair) => {
  const high = Math.max(pair[0].rank, pair[1].rank),
    low = Math.min(pair[0].rank, pair[1].rank),
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
    const descriptor = {
      id: opponent.id,
      publicStyle: opponent.botProfile ?? null,
      publicAxes: opponent.publicAxes ?? null,
      position: opponent.position ?? null,
      role:
        allIn?.role ??
        (ownPreflop?.action.action === 'raise' ? 'raiser' : ownPreflop ? 'caller' : 'unentered'),
      line:
        allIn?.line ??
        (preflopRaises >= 3 ? 'multi-raise' : preflopRaises === 2 ? 'reraise' : 'open'),
      depthBB,
      seatedCount:
        view.count ??
        (view.players ? view.players.filter((p) => !p.out).length : opponents.length + 1),
      committedCount: commitment?.committedIds?.length ?? 0,
      opponentCount: opponents.length,
      waitingCount: commitment?.waitingIds?.length ?? 0,
      allIn: !!allIn,
      actualAllIn: opponent.allin === true,
      postflopLine: publicPostflopLine(view, opponent.id, street),
      street,
      board,
      preflop: {
        action: ownPreflop?.action.action ?? null,
        raises: preflopRaises,
        amountBB: (ownPreflop?.action.amount ?? bigBlind) / bigBlind,
        facedBB: ownPreflop
          ? Math.max(
              bigBlind,
              ...preflop
                .slice(0, ownPreflop.index)
                .filter((a) => a.action === 'raise')
                .map((a) => a.amount),
            ) / bigBlind
          : 1,
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
    const read = sanitizePublicRead(opponent.publicRead);
    if (read) {
      descriptor.publicRead = read;
      descriptor.rangeObservation = observedRangeModel(read, {
        action: descriptor.preflop.action,
        // Historical size buckets describe the wager actually made preflop.
        // A later shove must not turn an earlier small call/open into a large one.
        allIn: descriptor.preflop.amountBB >= PUBLIC_LARGE_PREFLOP_BB,
        role: descriptor.role,
      });
    }
    return descriptor;
  });
}

// Observer priors from visible style and position, not access to its private
// policy roll, hole cards or a measured human chart. Keep every legal class
// possible and <=1 to retain the rejection sampler's proposal bound.
function visibleStylePrior(pair, descriptor) {
  if (!descriptor.publicStyle || !descriptor.preflop?.action) return null;
  const width = Math.max(0, Math.min(1, (descriptor.publicAxes?.[0] ?? 50) / 100));
  const pre = descriptor.preflop,
    raising = pre.action === 'raise';
  let target =
    pre.raises >= 3
      ? 0.035 + width * 0.04
      : pre.raises === 2
        ? raising
          ? 0.05 + width * 0.08
          : 0.12 + width * 0.16
        : raising
          ? (0.14 + width * 0.5) * (late(descriptor.position) ? 1.18 : 0.78)
          : pre.raises
            ? 0.22 + width * 0.3
            : 0.38 + width * 0.4;
  if (!raising && pre.facedBB > 8) target *= 0.75;
  target = Math.max(0.035, Math.min(0.85, target));
  const percentile = startingPercentile(pair),
    [high, low] = pair.map((c) => c.rank).sort((a, b) => b - a);
  const suited = pair[0].suit === pair[1].suit;
  const speculative = high === low || (suited && (high === 14 || high - low <= 2));
  const tail =
    suited && high === 14 ? 0.08 : speculative && descriptor.depthBB >= 40 ? 0.035 : 0.008;
  return percentile <= target
    ? Math.min(1, 0.65 + ((target - percentile) / target) * 0.35)
    : Math.max(tail, 0.15 * Math.exp(-(percentile - target) / 0.06));
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
  const singleLate =
    range.role === 'shover' &&
    range.committedCount === 1 &&
    (range.seatedCount <= 3 || late(range.position));
  if (singleLate && range.line === 'cold-shove' && range.depthBB <= 25) {
    if (pair || (high === 14 && (suited || low >= 5))) return 1;
    if ((high === 13 && low >= 10) || (high === 12 && low >= 10)) return suited ? 1 : 0.75;
    if (suited && high >= 9 && high - low <= 2) return 0.55;
    if (high === 14 || (suited && high === 13)) return 0.3;
    return 0.01;
  }
  if (singleLate && range.line === 'cold-shove' && range.depthBB <= 60) {
    if ((pair && high >= 6) || (high === 14 && low >= 10)) return 1;
    if (high >= 12 && low >= 11) return suited ? 1 : 0.5;
    if (pair || (suited && high === 14)) return 0.4;
    return 0.004;
  }
  if (singleLate && range.line === 'cold-shove' && range.depthBB <= 120) {
    if ((pair && high >= 9) || (high === 14 && low >= 12)) return 1;
    if (suited && high === 13 && low === 12) return 0.8;
    if (pair && high >= 7) return high === 8 ? 0.45 : 0.15;
    if (suited && high === 14 && low >= 10) return 0.5;
    if (suited && high === 14 && low <= 5) return 0.12;
    return 0.003;
  }
  if (singleLate && range.line === 'reraise-shove' && range.depthBB > 30 && range.depthBB <= 110) {
    if ((pair && high >= 11) || (high === 14 && low === 13)) return 1;
    if (pair && high === 10) return 0.8;
    if (high === 14 && low === 12) return suited ? 1 : 0.55;
    if ((pair && high === 9) || (suited && high === 14 && low === 11)) return 0.35;
    if (suited && high === 13 && low === 12) return 0.3;
    if (suited && high === 14 && low <= 5) return 0.12;
    return 0.003;
  }
  if (
    range.role === 'shover' &&
    range.committedCount === 1 &&
    (singleLate || (range.opponentCount === 1 && range.waitingCount === 0)) &&
    range.line === 'multi-raise-shove' &&
    range.depthBB > 30 &&
    range.depthBB <= 110 &&
    range.preflop?.raises === 3
  ) {
    if ((pair && high >= 11) || (high === 14 && low === 13)) return 1;
    if (pair && high === 10) return 0.5;
    if (high === 14 && low === 12) return suited ? 0.75 : 0.25;
    if (suited && high === 14 && low <= 5) return 0.2;
    return 0.002;
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
  // A medium-depth first-in shove has not survived a 3/4-bet exchange.
  // Keep medium pairs and strong broadways in this synthetic prior; treating
  // every 31–60 BB open shove like a deep premium-only stack-off overfolds AK.
  // This is a training heuristic, not a measured opponent or solver chart.
  if (range.line === 'cold-shove' && range.depthBB <= 60) {
    if ((pair && high >= 10) || (high === 14 && low >= 12)) return 1;
    if (pair && high >= 7) return 1;
    if (high === 14 && low >= 10) return suited ? 0.8 : low === 11 ? 0.7 : 0.25;
    if (suited && high === 13 && low >= 11) return low === 12 ? 0.8 : 0.4;
    if (pair) return 0.3;
    if (suited && high === 14) return 0.15;
    return 0.005;
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
    knownDraw = features?.draw;
  let draw = knownDraw;
  if (draw === undefined || draw === null) {
    const flushDraw =
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
          Array.from({ length: 5 }, (_, j) => i + j + 1).filter((rank) => ranks.has(rank))
            .length === 4 && pair.some((c) => c.rank >= i + 1 && c.rank <= i + 5),
      ).some(Boolean);
    draw = flushDraw || straightDraw;
  }
  return {
    strong: features?.strongMade ?? (own && score?.[0] >= 3),
    own,
    pair:
      (features?.overpair ?? (pair[0].rank === pair[1].rank && pair[0].rank > high)) ||
      (score?.[0] === 1 && score[1] === high && pair.some((c) => c.rank === high)),
    draw,
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
    handData = null,
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
      weight *=
        descriptor.line === 'cold-shove' && descriptor.depthBB <= 60
          ? late(descriptor.position)
            ? 1.15
            : 0.9
          : late(descriptor.position)
            ? 1.35
            : 0.7;
    return observedRangeWeight(
      startingPercentile(pair),
      clamp(weight),
      descriptor.rangeObservation,
    );
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
  const stylePrior = visibleStylePrior(pair, descriptor);
  let weight = stylePrior ?? tables[handTier];
  if (stylePrior === null && preflop.action && handTier < 3 && descriptor.position)
    weight *= late(descriptor.position) ? 1.15 : 0.8;
  if (preflop.action === 'raise' && preflop.amountBB > 4 && handTier < 3) weight *= 0.75;
  weight = observedRangeWeight(startingPercentile(pair), weight, descriptor.rangeObservation);
  if (board.length < 3 || !score) return clamp(weight);
  if (
    handData &&
    (hasPublicStory(descriptor.postflopLine) ||
      (!descriptor.allIn && hasPublicActionLine(descriptor.postflopLine)))
  )
    return clamp(
      weight * publicStoryWeight(pair, descriptor.postflopLine, handData, descriptor.publicRead),
    );
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
  return clamp(weight * Math.max(madeWeight, observedAggressiveLikelihood(descriptor.publicRead)));
}
