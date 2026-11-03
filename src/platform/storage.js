import { sanitizePlayerObservationProfile } from '../engine/public-observations.js';
import { PLAYER_OBSERVATIONS_KEY, PLAYER_OBSERVATIONS_BYTES } from './player-observations-store.js';

const KEYS = [
  'noir-table-v1',
  'noir-opponents-v1',
  'noir-sound',
  'noir-music',
  'noir-vibration',
  'noir-hints',
  'noir-locale',
  'noir-game-records-v1',
  'noir-player-observations-v1',
];

// The UI stays synchronous; hydrate native preferences before importing it.
// Writes keep their order, including two quick changes to the same setting.
export function createPreferenceStorage(webStorage = () => globalThis.localStorage) {
  let adapter = null;
  let pending = Promise.resolve();
  const cache = new Map();
  const errors = new Map();
  let observationWebError = null,
    observationNativeError = null,
    observationSchemaError = null;
  const observationError = () => {
    const error = observationSchemaError || observationNativeError || observationWebError;
    if (error) errors.set(PLAYER_OBSERVATIONS_KEY, error);
    else errors.delete(PLAYER_OBSERVATIONS_KEY);
  };
  const observationProfile = (value) => {
    if (typeof value !== 'string' || value.length * 3 > PLAYER_OBSERVATIONS_BYTES) return null;
    try {
      return sanitizePlayerObservationProfile(JSON.parse(value));
    } catch {
      return null;
    }
  };
  const storage = {
    async connect(nativePreferences) {
      const values = await Promise.all(
        KEYS.map(async (key) => [key, (await nativePreferences.get({ key })).value]),
      );
      for (const [key, value] of values) {
        if (key === PLAYER_OBSERVATIONS_KEY) {
          let webValue = null;
          try {
            webValue = webStorage().getItem(key);
            observationWebError = null;
          } catch (error) {
            observationWebError = error;
          }
          const nativeProfile = observationProfile(value),
            webProfile = observationProfile(webValue);
          // Failed asynchronous Native writes can leave a newer valid WebView
          // copy. Only this revisioned profile uses newest-copy hydration.
          // Equal-revision conflicts retain Native priority; never merge hands.
          const chosen =
            nativeProfile && (!webProfile || nativeProfile.revision >= webProfile.revision)
              ? nativeProfile
              : webProfile;
          const saved = chosen ? JSON.stringify(chosen) : null;
          // Cache an explicit absence too, so malformed WebView JSON cannot
          // become a fallback after both copies failed schema validation.
          cache.set(key, saved);
          if (saved !== null) {
            if (webValue !== saved) {
              try {
                webStorage().setItem(key, saved);
                observationWebError = null;
              } catch (error) {
                observationWebError = error;
              }
            }
            if (value !== saved) {
              try {
                await nativePreferences.set({ key, value: saved });
                observationNativeError = null;
              } catch (error) {
                observationNativeError = error;
              }
            }
          }
          observationError();
          continue;
        }
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
      let text = String(value);
      if (key === PLAYER_OBSERVATIONS_KEY) {
        const profile = observationProfile(text);
        if (!profile) {
          observationSchemaError = Error('Invalid local player-observation profile');
          observationError();
          return;
        }
        observationSchemaError = null;
        text = JSON.stringify(profile);
        cache.set(key, text);
        try {
          webStorage().setItem(key, text);
          observationWebError = null;
        } catch (error) {
          observationWebError = error;
        }
        observationError();
        if (adapter)
          pending = pending
            .then(async () => {
              await adapter.set({ key, value: text });
              observationNativeError = null;
              observationError();
            })
            .catch((error) => {
              observationNativeError = error;
              observationError();
            });
        return;
      }
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
