// Sound effects, background music and vibration are independent switches,
// each on until turned off.
export function loadFeedbackPreferences(storage) {
  const on = (key) => {
    try {
      return storage.getItem(key) !== 'false';
    } catch {
      return true;
    }
  };
  return { sound: on('noir-sound'), music: on('noir-music'), vibration: on('noir-vibration') };
}
