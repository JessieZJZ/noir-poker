export function loadFeedbackPreferences(storage) {
  let sound = true;
  let vibration = true;
  try {
    sound = storage.getItem('noir-sound') !== 'false';
    const saved = storage.getItem('noir-vibration');
    // An old combined mute also disabled vibration. Preserve that choice once;
    // an explicit new vibration preference is independent of subsequent mutes.
    vibration = saved === null ? sound : saved !== 'false';
    if (saved === null) storage.setItem?.('noir-vibration', String(vibration));
  } catch {}
  return { sound, vibration };
}
