import { getBotProfile } from './bot-profiles.js';
import { seatPosition } from './poker.js';

// Public, hand-scoped identity only. Never read cards or current settings here.
export function gameIdentities(game) {
  if (Array.isArray(game))
    return game.map(({ id, name, botProfile, position }) => ({ id, name, botProfile, position }));
  return (game.players || []).map(({ id, name, botProfile, position }) => ({
    id,
    name,
    botProfile,
    position: position || (Number.isInteger(game.dealer) ? seatPosition(game, id) : ''),
  }));
}

export function actorIdentity(snapshot, id) {
  const player = [
    ...(snapshot.players || snapshot.opponents || []),
    ...(snapshot.identities || []),
  ].find((p) => p.id === id);
  const self = id === snapshot.id;
  const name =
    player?.name || (self ? snapshot.actorName || snapshot.name : '') || (id === 0 ? '你' : '对手');
  const profile = getBotProfile(player?.botProfile || (self ? snapshot.botProfile : 'balanced'));
  return {
    id,
    name,
    profile: profile.research && name !== '你' ? profile.short : '',
    position:
      player?.position ||
      (self || (id === 0 && snapshot.id === undefined) ? snapshot.position : '') ||
      '',
  };
}

export function actorName(snapshot, id) {
  const actor = actorIdentity(snapshot, id);
  return actor.name + (actor.profile ? `（${actor.profile}）` : '');
}

export function actorAtPosition(snapshot, id) {
  const actor = actorIdentity(snapshot, id),
    name = actorName(snapshot, id);
  return actor.position ? `${name}在 ${actor.position} 位` : name;
}
