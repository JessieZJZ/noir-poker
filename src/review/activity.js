import { compactActionAmounts } from '../engine/chip-format.js';
import { historyActionLabel } from '../engine/action-labels.js';

// Completed events are display-only. None are passed to analyzeDecision.
export function reviewActivity(game) {
  let sequence = 0;
  if (game.logs?.length)
    return [...game.logs]
      .reverse()
      .filter(
        (entry) =>
          !(
            typeof entry === 'object' &&
            entry.text?.startsWith('练习补牌 · 五张公共牌已展示，弃牌结算不变')
          ),
      )
      .map((entry, key) => {
        const log = typeof entry === 'string' ? { text: entry } : entry;
        const action = log.type === 'action' && Number.isInteger(log.player);
        return {
          key,
          text: compactActionAmounts(log.text),
          player: log.player ?? null,
          sequence: action ? ++sequence : null,
        };
      });
  return (game.history || []).map((event, key) => ({
    key,
    player: event.id,
    sequence: key + 1,
    text:
      (game.players?.find((p) => p.id === event.id)?.name || (event.id === 0 ? '你' : '对手')) +
      ' ' +
      historyActionLabel(game.history, key),
  }));
}

export function selectedActivity(input, actorId = 0, sequence = null) {
  // Old saved records may not contain full logs. Recover the longest known
  // public prefix without inventing missing later events.
  const events =
    input.activity ||
    reviewActivity({
      history: input.decisions?.at(-1)?.history || [],
      players: input.decisions?.at(-1)?.players || [],
    });
  return events.map((event) => ({
    ...event,
    emphasized: Number.isInteger(actorId) && event.player === actorId,
    current: Number.isInteger(actorId) && event.player === actorId && event.sequence === sequence,
  }));
}
