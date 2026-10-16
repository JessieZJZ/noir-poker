const KEYS = [
  'noir-table-v1',
  'noir-opponents-v1',
  'noir-sound',
  'noir-vibration',
  'noir-hints',
  'noir-locale',
  'noir-game-records-v1',
];

// The UI stays synchronous; hydrate native preferences before importing it.
// Writes keep their order, including two quick changes to the same setting.
export function createPreferenceStorage(webStorage = () => globalThis.localStorage) {
  let adapter = null;
  let pending = Promise.resolve();
  const cache = new Map();
  const errors = new Map();
  const storage = {
    async connect(nativePreferences) {
      const values = await Promise.all(
        KEYS.map(async (key) => [key, (await nativePreferences.get({ key })).value]),
      );
      for (const [key, value] of values) {
        let saved = value;
        if (saved === null) {
          try {
            saved = webStorage().getItem(key);
          } catch {}
          if (saved !== null) await nativePreferences.set({ key, value: saved });
        }
        if (saved !== null) cache.set(key, saved);
      }
      adapter = nativePreferences;
    },
    getItem(key) {
      if (adapter && cache.has(key)) return cache.get(key);
      try {
        return webStorage().getItem(key);
      } catch (error) {
        errors.set(key, error);
        return null;
      }
    },
    setItem(key, value) {
      const text = String(value);
      cache.set(key, text);
      try {
        webStorage().setItem(key, text);
        errors.delete(key);
      } catch (error) {
        errors.set(key, error);
      }
      if (adapter)
        pending = pending
          .then(async () => {
            await adapter.set({ key, value: text });
            errors.delete(key);
          })
          .catch((error) => errors.set(key, error));
    },
    flush: () => pending,
    error: (key) => errors.get(key) || null,
  };
  return storage;
}

export const preferenceStorage = createPreferenceStorage();
