import { boardTexture } from './hand-features.js';
import { hasBotSkill } from './bot-difficulty.js';
import { publicPostflopLine, hasPublicStory } from './public-story.js';
import { isDonkLead } from './bot-deception.js';

// Conditional training plans, derived again from public history on each
// decision. No private intent is persisted across retry/next-hand boundaries.
export function publicStrategyPlan(
  view,
  style,
  profile,
  { equity, required, tolerance = 0, roll },
) {
  const a = view.publicStrategy,
    f = view.features,
    legal = view.legal;
  if (!a || view.difficulty === 'easy' || view.playsBoard) return null;
  const amount = legal.callAmount,
    budget = Math.min(view.stack * 0.25, (view.stack + (view.total || 0)) * 0.2);
  const t = boardTexture(view.board),
    history = view.history || [];
  const current = history.filter((e) => e.street === view.street);
  const lastBet = current.findLast((e) => e.action === 'raise');
  const checked = current.some((e) => e.id === view.id && e.action === 'check');
  const ownPrior = history.filter((e) => e.street === view.street - 1 && e.id === view.id);
  const raisedPrior = ownPrior.some((e) => e.action === 'raise');
  const priorCheckRaise = raisedPrior && ownPrior[0]?.action === 'check';
  const active = view.opponents.filter((p) => !p.allin && p.stack > 0);
  const wrap = (kind, action, motive, rate, option = null) => ({
    kind,
    action,
    motive,
    rate,
    ...(option ? { amount: option.amount, option } : {}),
    source: 'public-response-model',
    nextStreet: view.street < 3 ? 'reassess-board-and-price' : 'none',
  });
  const select = (plan) => (roll('strategy-' + plan.kind, plan.rate) < plan.rate ? plan : null);
  if (
    amount > 0 &&
    a.call.eligible &&
    !view.allIn &&
    a.call.impliedValue > 0 &&
    a.call.directCallValue < 0 &&
    a.call.estimatedValue > amount * 0.1 &&
    amount <= (view.stack + view.bet) * 0.06 &&
    amount < view.stack &&
    (a.draw.nutFlushDraw || a.draw.comboDraw || a.call.pairMining) &&
    a.call.reverseImpliedDiscount < 0.5 &&
    a.call.price <= 0.28
  )
    return select(wrap('implied-continue', 'call', 'implied-odds', 0.65));
  if (view.street === 0 || view.allIn) return null;
  if (
    amount > 0 &&
    view.street === 3 &&
    f.ownMade &&
    !f.strongMade &&
    lastBet &&
    hasPublicStory(publicPostflopLine(view, lastBet.id)) &&
    equity + tolerance >= required &&
    a.call.directCallValue >= 0
  )
    return select(wrap('story-continue', 'call', 'bluff-catch', 0.6 + profile.axes[3] / 250));
  if (!legal.canRaise || !active.length) return null;
  if (isDonkLead(view) && !hasBotSkill(view.difficulty, 'donk')) return null;
  const choices = a.options.filter(
    (o) =>
      o.amount >= legal.minRaiseTo &&
      o.amount <= legal.maxRaiseTo &&
      o.extra <= budget &&
      o.amount < legal.maxRaiseTo,
  );
  const best = (options) => options.sort((x, y) => y.estimatedValue - x.estimatedValue)[0];
  const paid = (o) => o.worseMadeCallMass + (view.street < 3 ? o.drawCallMass : 0);
  const value = best(
    choices.filter(
      (o) =>
        f.ownMade &&
        o.calledEquity >= (f.strongMade ? 0.55 : 0.6) &&
        paid(o) >= (view.rivals > 1 ? 0.14 : 0.1) &&
        o.estimatedValue > view.pot * 0.03 &&
        (f.strongMade || (legal.canCheck && o.fraction <= 0.5)) &&
        (t.maxSuit < 3 || f.madeCategory >= 5) &&
        (t.connected < 4 || f.madeCategory >= 4),
    ),
  );
  if (value) {
    const thin = !f.strongMade && value.calledEquity < 0.68;
    if (!thin || hasBotSkill(view.difficulty, 'thin-value') || style.lineStrategy === 'balanced') {
      // Preserve a deliberate check/raise alternative before the aggressor
      // acts; wet vulnerable value hands more often charge immediately.
      const priorAggressor = history.findLast(
        (e) => e.street === view.street - 1 && e.action === 'raise',
      );
      if (
        legal.canCheck &&
        f.strongMade &&
        !f.wet &&
        !view.inPosition &&
        view.rivals === 1 &&
        priorAggressor &&
        priorAggressor.id !== view.id &&
        !current.some((e) => e.id === priorAggressor.id) &&
        roll('check-for-raise', 0.15 + (style.trapRate ?? profile.axes[4] / 100) * 0.35) <
          0.15 + (style.trapRate ?? profile.axes[4] / 100) * 0.35
      )
        return wrap('check-for-raise', 'check', 'value', 1);
      const kind =
        checked && amount > 0 ? 'check-raise-value' : thin ? 'thin-paid-value' : 'paid-value';
      return select(
        wrap(
          kind,
          'raise',
          'value',
          thin
            ? Math.min(0.85, 0.35 + (style.thinValue || 0))
            : Math.max(0.7, style.valueAttack || 0),
          value,
        ),
      );
    }
  }
  const draw = view.street < 3 && (a.draw.nutFlushDraw || a.draw.comboDraw || f.drawOuts >= 8);
  const pressure = best(
    choices.filter(
      (o) =>
        o.estimatedValue > Math.max(0, a.call.directCallValue) + view.pot * 0.015 &&
        o.raiseProbability <= 0.25 &&
        o.fraction <= (draw ? 0.9 : 0.6),
    ),
  );
  if (
    draw &&
    pressure &&
    hasBotSkill(view.difficulty, 'semi-bluff') &&
    view.rivals <= 2 &&
    (legal.canCheck || pressure.calledEquity >= 0.25 || a.call.price <= 0.28) &&
    !t.trips
  ) {
    const kind =
      checked && amount > 0
        ? 'check-raise-draw'
        : raisedPrior
          ? 'draw-barrel'
          : 'nut-draw-pressure';
    return select(
      wrap(
        kind,
        'raise',
        'semi-bluff',
        Math.min(
          0.95,
          (style.semiBluff ?? 0.3 + profile.axes[2] / 200) + (a.draw.nutFlushDraw ? 0.1 : 0),
        ),
        pressure,
      ),
    );
  }
  const rangeEdge =
    a.range.advantage > Math.max(0.06, a.range.uncertainty * 0.6) &&
    a.range.actorTopMass >= a.range.opponentTopMass;
  if (
    pressure &&
    legal.canCheck &&
    !f.ownMade &&
    !f.draw &&
    view.rivals <= 2 &&
    !f.wet &&
    pressure.foldProbability >= 0.4 &&
    (rangeEdge || (priorCheckRaise && view.street === 3)) &&
    (hasBotSkill(view.difficulty, 'blocker-bluff') || style.lineStrategy === 'balanced')
  )
    return select(
      wrap(
        priorCheckRaise ? 'checkraise-followthrough' : 'range-bet',
        'raise',
        'bluff',
        Math.min(0.65, 0.15 + profile.axes[2] / 200),
        pressure,
      ),
    );
  return null;
}
