export const BACKGROUND_MUSIC_PATH = 'audio/background-music.m4a';
// The phone-speaker master reserves its own peak headroom for action cues.
export const BACKGROUND_MUSIC_VOLUME = 0.8;

// The sound preference owns music too. Hand changes never recreate this player.
export function createMusicController({ createPlayer, enabled = true, active = true }) {
  let player = null;
  let disposed = false;
  function sync() {
    if (disposed) return;
    if (!enabled || !active) {
      player?.pause();
      return;
    }
    try {
      player ||= createPlayer();
      Promise.resolve(player.play()).catch(() => {});
    } catch {
      // An unavailable audio API must not interrupt local practice.
    }
  }
  const controller = {
    setEnabled(value) {
      enabled = Boolean(value);
      sync();
    },
    setActive(value) {
      active = Boolean(value);
      sync();
    },
    unlock: sync,
    dispose() {
      if (disposed) return;
      disposed = true;
      player?.dispose();
      player = null;
    },
    getState: () => ({ enabled, active, disposed, playing: Boolean(player?.playing) }),
  };
  sync();
  return controller;
}
