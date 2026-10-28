export const PLAYER_OBSERVATIONS_KEY = 'noir-player-observations-v1';
export const PLAYER_OBSERVATIONS_BYTES = 64 * 1024;

// The engine owns the profile schema and its reversible hand transactions.
// This adapter only hydrates and stores its public-action-only representation.
export function createPlayerObservationStore({
  storage,
  sanitizeProfile,
  importProfile,
  exportProfile,
  maxBytes = PLAYER_OBSERVATIONS_BYTES,
}) {
  let loaded = false;
  let profile = null;
  let persisted = null;
  let lastError = null;
  const bound = new WeakSet();
  const target = () => (typeof storage === 'function' ? storage() : storage);
  const size = (text) => text.length * 3;

  function load(refresh = false) {
    if (loaded && !refresh) return profile;
    loaded = true;
    try {
      const text = target()?.getItem(PLAYER_OBSERVATIONS_KEY);
      if (typeof text !== 'string' || size(text) > maxBytes) return null;
      const restored = sanitizeProfile(JSON.parse(text));
      if (!restored) return null;
      if (!profile || restored.revision > profile.revision) profile = restored;
      const normalized = JSON.stringify(restored);
      if (normalized === JSON.stringify(profile)) persisted = text;
      return restored;
    } catch (error) {
      lastError = error;
      return null;
    }
  }

  return {
    restore(game) {
      load(true);
      const current = sanitizeProfile(exportProfile(game));
      const latest = !profile || current?.revision > profile.revision ? current : profile;
      importProfile(game, latest);
      bound.add(game);
      return game;
    },
    capture(game) {
      if (!bound.has(game)) return false;
      const next = sanitizeProfile(exportProfile(game));
      if (!next) return false;
      const text = JSON.stringify(next);
      if (size(text) > maxBytes) return false;
      if (
        profile &&
        (next.revision < profile.revision ||
          (next.revision === profile.revision && JSON.stringify(profile) !== text))
      )
        return false;
      try {
        const adapter = target();
        if (text === persisted && !adapter?.error?.(PLAYER_OBSERVATIONS_KEY)) return false;
        // A second live table may have persisted a newer revision. Refresh
        // only when a candidate changed, not on each display-only render.
        const stored = load(true);
        if (
          stored &&
          (next.revision < stored.revision ||
            (next.revision === stored.revision && JSON.stringify(stored) !== text))
        ) {
          if (!profile || stored.revision >= profile.revision) profile = stored;
          return false;
        }
        // Keep useful observations for this run even in private mode or when
        // a device quota rejects persistence. New tables can still use it.
        profile = JSON.parse(text);
        if (!adapter?.setItem) return false;
        adapter?.setItem(PLAYER_OBSERVATIONS_KEY, text);
        lastError = adapter?.error?.(PLAYER_OBSERVATIONS_KEY) || null;
        if (!lastError) persisted = text;
        return !lastError;
      } catch (error) {
        if (!profile || next.revision > profile.revision) profile = JSON.parse(text);
        lastError = error;
        return false;
      }
    },
    flush() {
      try {
        const adapter = target();
        return Promise.resolve(adapter?.flush?.()).then(
          () => {
            // Native preference writes report per-key failures after their
            // queue settles rather than rejecting the whole lifecycle flush.
            if (adapter?.error) {
              try {
                lastError = adapter.error(PLAYER_OBSERVATIONS_KEY) || null;
              } catch (error) {
                lastError = error;
              }
            }
          },
          (error) => {
            lastError = error;
          },
        );
      } catch (error) {
        lastError = error;
        return Promise.resolve();
      }
    },
    error() {
      try {
        return target()?.error?.(PLAYER_OBSERVATIONS_KEY) || lastError;
      } catch (error) {
        return error;
      }
    },
  };
}
