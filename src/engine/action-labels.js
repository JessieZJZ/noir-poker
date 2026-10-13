import { bigBlindOf } from './stakes.js';
import { compactChips } from './chip-format.js';
const number = compactChips;

// This is an action ordinal, not a test of whether betting has reopened.
// The big blind is the first bet preflop; every later street starts at zero.
export function nextBetLevel({ street, history = [] }) {
  return (
    (street === 0 ? 1 : 0) +
    history.filter((a) => a.street === street && a.action === 'raise').length +
    1
  );
}

export function raiseCaption(step, amount) {
  const level = nextBetLevel(step);
  const allin = amount === step.legal?.maxRaiseTo;
  const fullRaiseTo =
    step.legal?.fullRaiseTo ??
    (step.currentBet === 0
      ? bigBlindOf(step)
      : step.currentBet + (step.minRaise ?? bigBlindOf(step)));
  const verb =
    allin && amount < fullRaiseTo
      ? '短全下至'
      : allin
        ? '全下至'
        : level === 1
          ? '加注至'
          : step.currentBet === 0
            ? '下注至'
            : step.street === 0 && level === 2
              ? '开池至'
              : '加注至';
  return level === 1 ? verb : `${level}-bet ${verb}`;
}

export function actionLabel(step, action = step.action, amount = step.amount) {
  if (action === 'raise') return raiseCaption(step, amount) + ' ' + number(amount);
  if (action === 'call')
    return (
      (step.legal.callAmount === step.stack ? '全下跟注 ' : '跟注 ') + number(step.legal.callAmount)
    );
  return action === 'fold' ? '弃牌' : '过牌';
}

export function historyActionLabel(history, index) {
  const a = history[index];
  if (a.action !== 'raise')
    return a.action === 'call' ? '跟注 ' + number(a.amount) : a.action === 'fold' ? '弃牌' : '过牌';
  if (a.betLabel) return a.betLabel + ' ' + number(a.amount);
  const before = history.slice(0, index);
  const previous = before.findLast(
    (entry) => entry.street === a.street && entry.action === 'raise',
  );
  return actionLabel({
    ...a,
    history: before,
    currentBet: previous?.amount ?? (a.street === 0 ? bigBlindOf(a) : 0),
  });
}
