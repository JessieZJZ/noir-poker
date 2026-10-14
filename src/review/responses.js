import { actionLabel, historyActionLabel } from '../engine/action-labels.js';

const publicAction = (a) =>
  a &&
  Number.isInteger(a.id) &&
  Number.isInteger(a.street) &&
  ['fold', 'check', 'call', 'raise'].includes(a.action) &&
  Number.isInteger(a.amount) &&
  a.amount >= 0;
const sameAction = (a, b) =>
  publicAction(a) &&
  publicAction(b) &&
  a.id === b.id &&
  a.street === b.street &&
  a.action === b.action &&
  a.amount === b.amount &&
  (a.betLabel ?? null) === (b.betLabel ?? null);

// Completed public history is a process replay only. Never pass these later
// responses into decision analysis or read cards, runout or settlement here.
export function collectPublicResponses(decisions = [], history = [], players = [], hand) {
  return decisions.map((s) => {
    const before = s.history;
    if (hand !== undefined && s.hand !== undefined && hand !== s.hand) return [];
    if (!Array.isArray(before) || !Array.isArray(history)) return [];
    if (!before.every((a, i) => sameAction(a, history[i]))) return [];
    const own = history[before.length];
    if (
      !publicAction(own) ||
      own.id !== 0 ||
      own.street !== s.street ||
      own.action !== s.action ||
      own.amount !== s.amount
    )
      return [];
    const responses = [];
    for (let i = before.length + 1; i < history.length; i++) {
      const a = history[i];
      if (!publicAction(a) || a.id === 0 || a.street !== s.street) break;
      const name =
        s.players?.find((p) => p.id === a.id)?.name || players.find((p) => p.id === a.id)?.name;
      if (!name) return [];
      responses.push(
        responses.length
          ? `随后，${name}选择${historyActionLabel(history, i)}。`
          : `你${actionLabel(s)}后，${name}选择${historyActionLabel(history, i)}。`,
      );
    }
    return responses;
  });
}
