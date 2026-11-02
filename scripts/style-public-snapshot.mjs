// Public event arrays continue growing during a hand. Archive the response
// now so later actions cannot alter the before-action evidence.
export function appendPublicSnapshot(transcript, state) {
  const snapshot = structuredClone(state);
  transcript.push(snapshot);
  return snapshot;
}

// The product permits inspecting every seat only after the hand ends.
// This optional assessment view never exposes those cards during a decision.
export function completedCardInspection(game, enabled, who, cards) {
  if (!enabled || game.phase !== 'done') return null;
  return game.players.map((player) => ({ actor: who(player.id), hole: cards(player.hole) }));
}
