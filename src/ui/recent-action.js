// Seat captions describe completed actions, independently of whose turn it is.
// The engine resets checked at street boundaries, so a checked player must not
// become "waiting" just because a transient action label is empty.
export function visibleRecentAction(game, player) {
  if (game.phase === 'done' || player.folded || player.allin) return player.lastAction;
  if (player.checked) return { text: '过牌', street: game.street, bet: player.bet };
  return player.lastAction?.street === game.street ? player.lastAction : null;
}
