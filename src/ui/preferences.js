import { preferenceStorage } from '../platform/storage.js';

const STORAGE_KEY = 'noir-table-v1';

function tablePreferences(value) {
  return {
    playerCount:
      Number.isInteger(value?.playerCount) && value.playerCount >= 5 && value.playerCount <= 9
        ? value.playerCount
        : 5,
    difficulty: ['easy', 'normal', 'hard'].includes(value?.difficulty)
      ? value.difficulty
      : 'normal',
  };
}

export function loadTablePreferences(storage) {
  try {
    return tablePreferences(JSON.parse((storage ?? preferenceStorage).getItem(STORAGE_KEY)));
  } catch {
    return tablePreferences();
  }
}

export function saveTablePreferences(value, storage) {
  try {
    (storage ?? preferenceStorage).setItem(STORAGE_KEY, JSON.stringify(tablePreferences(value)));
  } catch {
    // Storage can be unavailable; the current table can still use the selection.
  }
}
