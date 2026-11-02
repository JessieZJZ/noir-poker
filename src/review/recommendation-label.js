import { actionLabel } from '../engine/action-labels.js';

// The engine owns legal action names and amounts. A compact recommendation
// omits the bet ordinal; detailed reasoning still distinguishes isolation.
export function recommendationLabel(snapshot, action, detailedLabel) {
  const actionText = (detailedLabel || actionLabel(snapshot, action.action, action.amount))
    .replace(/^\d+-bet\s+/, '')
    .replace(/^(?:开池至|隔离加注至)/, '加注至');
  return { actionText, label: `建议${actionText}` };
}
