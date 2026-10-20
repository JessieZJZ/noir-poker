import { canonicalProfileId } from './profile-id.js';
import { getBotProfile } from './bot-profiles.js';
export function migrateCharacterState(value) {
  if (Array.isArray(value)) {
    value.forEach(migrateCharacterState);
    return value;
  }
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) migrateCharacterState(child);
  for (const key of ['botProfile', 'profile'])
    if (typeof value[key] === 'string') value[key] = canonicalProfileId(value[key]);
  if (value.assignments && typeof value.assignments === 'object')
    for (const key of Object.keys(value.assignments))
      value.assignments[key] = canonicalProfileId(value.assignments[key]);
  if (typeof value.profileName === 'string' && typeof value.profile === 'string')
    value.profileName = getBotProfile(value.profile).name;
  return value;
}
