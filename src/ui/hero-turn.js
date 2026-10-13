// Render-independent, once-per-decision notification. No private game data.
export function createHeroTurnCue(notify) {
  let notified = null;
  return {
    reset() {
      notified = null;
    },
    update({ key, enabled, active }) {
      if (!enabled || !active || key === notified) return false;
      notified = key;
      try {
        Promise.resolve(notify()).catch(() => {});
      } catch {}
      return true;
    },
  };
}
