// Postflop bets and raises chosen by estimated value. The public response
// model (public-strategy.js) estimates, for each size, how often the live
// opponents fold, call or raise and what the wager is then worth. Checking is
// worth this actor's share of the current pot, discounted for position;
// calling uses the same model's call value. The bot weighs the options with a
// softmax, so clearly better choices win most of the time, near-ties mix, and
// style shifts the weights. Fixed rules only remain as safety limits: no
// all-in here, bounded one-pair commitment and size, no re-raise war, one-pair
// raises only heads-up and no raise with air. Only public state and this actor's own cards are read.

import { isDonkLead } from './bot-deception.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
// Softmax temperature as a share of the pot: lower mixes less.
export const EV_TEMPERATURE = { normal: 0.09, hard: 0.05 };
// Share of the pot a position realizes when it checks and gives a free card.
export const CHECK_REALIZATION = { inPosition: 0.95, outOfPosition: 0.85, multiway: 0.95 };
// Largest share of the pot that counts as a probe bet.
export const PROBE_FRACTION = 0.34;
// Share of the modelled folds treated as calls. The fold model reads public
// ranges only and a player may call wider than it; without this margin every
// stab looks profitable and the bots would bet almost every checked pot.
// A bettor who is raised folds less often than an unbet field.
export const FOLD_SHRINK = { unbet: 0.35, facing: 0.55 };
// Before the river a called wager also sizes the later streets: a hand ahead
// of the calling range gains from the larger pot, a hand behind loses.
export const LATER_STREETS = 0.25;

function realization(view) {
  const base = view.inPosition ? CHECK_REALIZATION.inPosition : CHECK_REALIZATION.outOfPosition;
  return base * (view.rivals > 1 ? CHECK_REALIZATION.multiway : 1);
}

// The model's value of a wager: once called before the river it takes part of
// the check baseline's position discount, and part of its folds become calls.
export function adjustedOptionValue(view, option, pot) {
  const r = view.street < 3 ? realization(view) : 1;
  const called =
    option.estimatedValue - option.foldProbability * pot + option.raiseProbability * option.extra;
  let perCall = option.callProbability > 0 ? called / option.callProbability : -option.extra;
  if (view.street < 3) {
    const grown = pot + 2 * option.extra;
    // The bettor keeps the initiative, so half the check's position discount.
    perCall -= (1 - r) * 0.5 * option.calledEquity * grown;
    perCall += LATER_STREETS * (2 * option.calledEquity - 1) * 2 * option.extra;
  }
  const shrink = view.legal.callAmount > 0 ? FOLD_SHRINK.facing : FOLD_SHRINK.unbet;
  const shifted = option.foldProbability * shrink;
  return (
    (option.foldProbability - shifted) * pot +
    (option.callProbability + shifted) * perCall -
    option.raiseProbability * option.extra
  );
}

// Largest one-pair wager, as a share of the pot, by the players still in:
// several opponents make a large one-pair bet a loss against better hands.
export const ONE_PAIR_FRACTION = { 1: 0.75, 2: 0.5, many: 0.25 };
// Largest raise over a bet, as a share of the pot after calling: about three
// to five times the bet. Larger raises only isolate the bettor's best hands.
export const RAISE_FRACTION = 0.75;

function safeOptions(view, a, f) {
  const legal = view.legal;
  const total = view.total || 0;
  const raises = view.history.filter((e) => e.street === view.street && e.action === 'raise');
  const facing = legal.callAmount > 0;
  const onePairBudget = Math.min(view.stack * 0.25, (view.stack + total) * 0.2);
  const onePairFraction = ONE_PAIR_FRACTION[view.rivals] ?? ONE_PAIR_FRACTION.many;
  const strongDraw = f.draw && (f.drawOuts ?? 0) >= 8 && view.street < 3;
  return a.options.filter((o) => {
    if (o.amount < legal.minRaiseTo || o.amount >= legal.maxRaiseTo) return false;
    if (facing && o.fraction > RAISE_FRACTION) return false;
    if (f.strongMade) return true;
    if (o.extra > onePairBudget) return false;
    if (f.ownMade && o.fraction > onePairFraction) return false;
    if (!facing) return true;
    // Facing a bet: no re-raise war, a one-pair raise only heads-up and a
    // semi-bluff raise only with a real draw and at most two opponents.
    if (raises.length >= 2) return false;
    if (f.ownMade) return view.rivals === 1;
    return strongDraw && view.rivals <= 2;
  });
}

function motive(view, f, option) {
  if (f.strongMade || (f.ownMade && option.calledEquity >= 0.5)) return 'value';
  if (f.draw && view.street < 3) return 'semi-bluff';
  if (f.ownMade) return 'value';
  return 'bluff';
}

export function evActionPlan(view, profile, axes, random) {
  const a = view.publicStrategy;
  const f = view.features;
  const legal = view.legal;
  if (!a || view.street === 0 || view.allIn || !legal.canRaise || view.playsBoard) return null;
  if (!EV_TEMPERATURE[view.difficulty]) return null;
  if (!view.opponents?.some((p) => !p.allin && p.stack > 0)) return null;
  const pot = Math.max(view.bigBlind, view.pot);
  const [, attack, bluff, , trap] = axes.map((n) => n / 100);
  const facing = legal.callAmount > 0;
  const checkedThisStreet = view.history.some(
    (e) => e.street === view.street && e.id === view.id && e.action === 'check',
  );
  // The baseline: check (free) or call (the model's call value). Folding is
  // left to the existing price checks, which run after this step.
  const baseValue = facing
    ? a.call.equity * realization(view) * (a.call.cost + pot) - a.call.cost + a.call.impliedValue
    : a.call.equity * realization(view) * pot;
  const options = safeOptions(view, a, f).map((option) => {
    const kind = motive(view, f, option);
    // Style tilts the weights a little; it never creates a new action.
    let bonus = (attack - 0.5) * 0.06 + (attack - 0.5) * 0.04 * (option.fraction - 0.5);
    if (kind === 'bluff' || kind === 'semi-bluff') bonus += (bluff - 0.5) * 0.05;
    if (f.strongMade && !facing) bonus -= trap * 0.05;
    const value = adjustedOptionValue(view, option, pot);
    return { option, kind, value, score: value + bonus * pot };
  });
  if (!options.length) return null;
  const temperature = EV_TEMPERATURE[view.difficulty] * pot;
  const candidates = [
    { option: null, kind: facing ? 'call' : 'check', score: baseValue },
    ...options,
  ];
  const top = Math.max(...candidates.map((c) => c.score));
  const weights = candidates.map((c) => Math.exp(clamp((c.score - top) / temperature, -40, 0)));
  const sum = weights.reduce((s, w) => s + w, 0);
  let target = random() * sum,
    chosen = candidates.at(-1);
  for (let i = 0; i < candidates.length; i++)
    if ((target -= weights[i]) <= 0) {
      chosen = candidates[i];
      break;
    }
  const summary = {
    kind: 'ev-choice',
    baseline: { action: facing ? 'call' : 'check', value: baseValue },
    options: options.map(({ option, kind, value, score }) => ({
      fraction: option.fraction,
      amount: option.amount,
      modelValue: option.estimatedValue,
      value,
      score,
      kind,
    })),
    temperature,
  };
  if (!chosen.option) {
    // Facing a bet the existing price checks may still fold; checking is final.
    if (facing) return { ...summary, action: 'call' };
    return { ...summary, action: 'check', reason: f.strongMade ? 'strong-trap' : 'free-check' };
  }
  const { option, kind } = chosen;
  // A probe is a small first-to-act bet with a pair below top pair: it sets
  // the price and asks the later seats whether they have more.
  const boardHigh = Math.max(0, ...view.board.map((c) => c.rank));
  const belowTop = f.ownPair && !f.overpair && !view.hole.some((c) => c.rank === boardHigh);
  const named =
    kind === 'value' ? 'value-raise' : kind === 'semi-bluff' ? 'semi-bluff' : 'pure-bluff';
  const reason = facing
    ? checkedThisStreet
      ? 'check-raise'
      : named
    : belowTop && !view.inPosition && option.fraction <= PROBE_FRACTION
      ? 'probe-bet'
      : isDonkLead(view)
        ? 'donk-lead'
        : named;
  // Review notes key on the established check-raise plan kinds.
  const line =
    reason === 'check-raise'
      ? kind === 'semi-bluff'
        ? 'check-raise-draw'
        : 'check-raise-value'
      : 'ev-choice';
  return {
    ...summary,
    kind: line,
    action: 'raise',
    amount: option.amount,
    motive: kind,
    reason,
    option,
  };
}
