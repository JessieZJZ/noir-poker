import { boardTexture } from './hand-features.js';
import { checkedToPositionProbe, checkedToPairValue, safeStrongValue } from './bot-style.js';
import { isDonkLead } from './bot-deception.js';

// Authored training lines, evaluated from the acting seat's public view only.
// A line selects its action once. Price, legality and wager budgets remain
// independent vetoes, rather than another generic aggression lottery.
const checkedTo = (view) =>
  view.opponents?.length > 0 &&
  view.opponents.every(
    (p) =>
      !p.allin &&
      p.stack > 0 &&
      view.history.some((a) => a.id === p.id && a.street === view.street && a.action === 'check'),
  );

export function balancedPriceDefense(view, style, equity, required) {
  const f = view.features;
  return (
    style.lineStrategy === 'balanced' &&
    view.difficulty !== 'easy' &&
    view.street > 0 &&
    !view.allIn &&
    view.rivals === 1 &&
    (view.publicEquity?.assumedOpponentIds.length ?? 1) === 1 &&
    !view.opponents?.some((p) => p.allin) &&
    view.legal.callAmount > 0 &&
    view.legal.callAmount < view.stack &&
    view.legal.callAmount <= (view.stack + view.bet) * 0.08 &&
    f.ownMade &&
    !f.strongMade &&
    !f.draw &&
    !f.wet &&
    !view.playsBoard &&
    equity >= required + 0.03 &&
    equity <= 0.65 &&
    view.history.filter((a) => a.street === view.street && a.action === 'raise').length === 1
  );
}

export function postflopStyleLine(view, style, equity) {
  if (
    !style.lineStrategy ||
    view.difficulty === 'easy' ||
    view.street === 0 ||
    !view.legal.canCheck ||
    !view.legal.canRaise ||
    view.allIn ||
    view.playsBoard ||
    view.rivals > 2 ||
    (view.publicEquity?.assumedOpponentIds.length ?? 1) > 2 ||
    view.history.some((a) => a.street === view.street && a.action === 'raise')
  )
    return null;
  const f = view.features,
    texture = boardTexture(view.board),
    raises = view.history.filter((a) => a.action === 'raise'),
    preflop = raises.filter((a) => a.street === 0),
    flop = raises.filter((a) => a.street === 1),
    ownOpen = preflop.length === 1 && preflop[0].id === view.id,
    ownFlop = flop.length === 1 && flop[0].id === view.id,
    dry = !f.wet && texture.maxSuit < 3 && texture.connected < 4,
    headsUp = view.rivals === 1 && (view.publicEquity?.assumedOpponentIds.length ?? 1) === 1;

  if (style.lineStrategy === 'positional') {
    if (!view.inPosition || !checkedTo(view)) return null;
    if (safeStrongValue(view, equity) || checkedToPairValue(view, equity))
      return {
        kind: 'position-value',
        motive: 'value',
        rate: 0.9,
        fraction: f.strongMade ? 0.6 : 0.4,
      };
    // A float's continuation is tied to the visible flop call and actual
    // turn checks. No made showdown hand is automatically turned into a bluff.
    const floatTurn =
      headsUp &&
      view.street === 2 &&
      view.history.some((a) => a.street === 1 && a.id === view.id && a.action === 'call');
    if (dry && floatTurn && !f.ownMade && !f.draw && equity >= 0.15 && equity < 0.45)
      return {
        kind: 'position-delayed',
        motive: 'bluff',
        rate: style.delayedProbe,
        fraction: 0.45,
      };
    if (
      headsUp &&
      view.street === 2 &&
      ownFlop &&
      !texture.paired &&
      texture.maxSuit <= 2 &&
      texture.connected < 4
    ) {
      if (f.draw && f.drawOuts >= 8 && equity >= 0.25 && equity <= 0.65)
        return { kind: 'position-draw-barrel', motive: 'semi-bluff', rate: 0.82, fraction: 0.55 };
      const turn = view.board[3],
        flopHigh = Math.max(...view.board.slice(0, 3).map((c) => c.rank));
      if (
        ownOpen &&
        dry &&
        !f.ownMade &&
        !f.draw &&
        turn.rank >= 12 &&
        turn.rank > flopHigh &&
        Math.max(...view.hole.map((c) => c.rank)) >= 12 &&
        equity >= 0.15 &&
        equity < 0.45
      )
        return { kind: 'position-range-barrel', motive: 'bluff', rate: 0.62, fraction: 0.45 };
    }
    if (view.street === 2 && ownFlop && !f.ownMade && !f.draw)
      return { kind: 'position-reassess', motive: 'control', rate: 1 };
    if (
      view.street < 3 &&
      f.draw &&
      f.drawOuts >= 8 &&
      texture.maxSuit <= 2 &&
      texture.connected < 4 &&
      !texture.paired &&
      equity >= 0.25 &&
      equity <= 0.65
    )
      return {
        kind: 'position-draw-pressure',
        motive: 'semi-bluff',
        rate: headsUp ? 0.82 : 0.65,
        fraction: 0.45,
      };
    if (checkedToPositionProbe(view))
      return { kind: 'position-probe', motive: 'bluff', rate: style.positionProbe, fraction: 0.4 };
    const backdoorSuit = [0, 1, 2, 3].some(
      (suit) =>
        view.hole.some((c) => c.suit === suit) &&
        [...view.hole, ...view.board].filter((c) => c.suit === suit).length === 3,
    );
    if (
      headsUp &&
      view.street === 1 &&
      !f.ownMade &&
      !f.draw &&
      texture.maxSuit === 2 &&
      texture.connected < 3 &&
      !texture.paired &&
      backdoorSuit &&
      Math.max(...view.hole.map((c) => c.rank)) >= 12 &&
      equity >= 0.2 &&
      equity < 0.5
    )
      return { kind: 'position-backdoor', motive: 'bluff', rate: 0.55, fraction: 0.33 };
    return null;
  }

  if (style.lineStrategy === 'balanced' && headsUp && dry) {
    // The preflop aggressor can c-bet out of position as well. Requiring
    // everyone to check first would remove that ordinary opening action.
    if (isDonkLead(view)) return null;
    const boardHigh = Math.max(...view.board.map((c) => c.rank)),
      topPair = f.ownPair && view.hole.some((c) => c.rank === boardHigh),
      kicker = Math.max(0, ...view.hole.filter((c) => c.rank !== boardHigh).map((c) => c.rank));
    if (safeStrongValue(view, equity) || (topPair && kicker >= 10 && equity >= 0.62))
      return {
        kind: 'balanced-value',
        motive: 'value',
        rate: 0.9,
        fraction: f.strongMade ? 0.65 : 0.5,
      };
    if (f.ownMade && !f.strongMade && !f.draw && equity >= 0.3 && equity <= 0.6)
      if (
        view.street === 3 &&
        view.inPosition &&
        checkedTo(view) &&
        equity >= 0.55 &&
        view.opponents.every((p) =>
          view.history.some((a) => a.id === p.id && a.street === 2 && a.action === 'check'),
        )
      )
        return { kind: 'balanced-thin-value', motive: 'value', rate: 0.65, fraction: 0.25 };
    if (f.ownMade && !f.strongMade && !f.draw && equity >= 0.3 && equity <= 0.6)
      return { kind: 'balanced-showdown', motive: 'control', rate: 1 };
    if (
      view.street === 1 &&
      ownOpen &&
      boardHigh >= 11 &&
      !f.ownMade &&
      !f.draw &&
      equity >= 0.28 &&
      equity < 0.6
    )
      return { kind: 'balanced-cbet', motive: 'bluff', rate: 0.65, fraction: 0.5 };
  }
  return null;
}
