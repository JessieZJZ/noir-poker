import { handFeatures, boardTexture } from './hand-features.js';

// Facts and policy gates, not a solver or an invented account of intention.
// The caller supplies only the actor's own cards and before-action public state.
export function aggressionSupport(view) {
  const features = view.features || handFeatures(view.hole, view.board, view.score || [0]);
  const opponents =
    view.opponents || (view.players || []).filter((p) => p.id !== (view.id ?? 0) && !p.folded);
  const active = opponents.filter((p) => !p.allin && p.stack > 0);
  const raises = (view.history || []).filter(
    (a) => a.street === view.street && a.action === 'raise',
  );
  const multiway =
    (view.publicEquity?.assumedOpponentIds.length ?? view.rivals ?? opponents.length) > 1;
  // A medium made hand with substantial showdown equity need not become a
  // bluff that folds worse hands and gets called by better ones. Stronger
  // hands still enter the separate value branch; draws enter semi-bluffs.
  const bluffCandidate = !features.ownMade && !features.draw && (view.equity ?? 0) < 0.45;
  const valueThreshold = multiway ? 0.62 : 0.53;
  const equity = view.equity ?? 0;
  const valueCandidate = features.ownMade && !view.playsBoard && equity > valueThreshold;
  return {
    multiway,
    activeOpponents: active.length,
    bluffCandidate,
    valueCandidate,
    valueThreshold,
    raises: raises.length,
    mayBluff: active.length > 0 && !opponents.some((p) => p.allin),
    price: view.legal?.callAmount || 0,
    texture: boardTexture(view.board || []),
  };
}

export function decisionBasis(
  view,
  {
    action,
    reason,
    amount,
    value,
    semiBluff,
    pureBluff,
    drawContinue,
    pairContinue,
    structuredPriceContinue,
    exceptions = [],
  },
) {
  const support = aggressionSupport(view),
    history = view.history || [],
    opening = history.findIndex((a) => a.street === 0 && a.action === 'raise'),
    squeeze =
      !view.street &&
      action === 'raise' &&
      opening >= 0 &&
      history[opening].id !== view.id &&
      history.filter((event) => event.street === 0 && event.action === 'raise').length === 1 &&
      history
        .slice(opening + 1)
        .some((a) => a.street === 0 && a.action === 'call' && a.id !== view.id),
    shove = action === 'raise' && amount === view.legal.maxRaiseTo,
    cost = action === 'raise' ? amount - view.bet : action === 'call' ? view.legal.callAmount : 0;
  let motive =
    action === 'fold' ? 'price-fold' : action === 'check' ? 'free-check' : 'showdown-call';
  if (['trap', 'strong-trap'].includes(reason)) motive = 'trap';
  else if (action === 'raise')
    motive = value
      ? squeeze
        ? 'value-squeeze'
        : 'value'
      : semiBluff
        ? 'semi-bluff'
        : pureBluff
          ? 'bluff'
          : 'pressure';
  else if (action === 'call')
    motive = drawContinue
      ? 'draw-price'
      : pairContinue || structuredPriceContinue
        ? 'showdown-call'
        : reason;
  else if (reason === 'pot-control') motive = 'pot-control';
  return {
    version: 1,
    sequence: history.length + 1,
    street: view.street,
    source: 'executed-policy',
    reason,
    motive,
    action,
    ...(amount === undefined ? {} : { amount }),
    cost,
    shove,
    squeeze,
    multiway: support.multiway,
    price: support.price,
    activeOpponents: support.activeOpponents,
    equity: view.equity,
    required: view.callPrice?.odds ?? view.allIn?.odds,
    drawOuts: view.features?.drawOuts || 0,
    pendingResponses: view.actionContext?.pendingResponseCount ?? null,
    exceptions: [...exceptions],
  };
}
