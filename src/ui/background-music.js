export const BACKGROUND_MUSIC_PATH = 'audio/background-music.m4a';
export const MOBILE_BACKGROUND_MUSIC_PATH = 'audio/background-music-mobile.m4a';
// Both masters include their own peak headroom for action cues.
export const BACKGROUND_MUSIC_VOLUME = 1;
// Both files open with a two-bar intro that plays once. Afterwards playback
// loops this span, which `audio-studio/.../game-loop.py` renders as an exact
// musical period, so the jump joins two identical continuations.
export const BACKGROUND_MUSIC_LOOP = Object.freeze({
  start: 561952 / 48000,
  end: 5057562 / 48000,
});

// Position in the file after `position` seconds of uninterrupted playback.
export function loopPosition(position, loop = BACKGROUND_MUSIC_LOOP) {
  if (!(position >= loop.end)) return Math.max(0, position || 0);
  return loop.start + ((position - loop.start) % (loop.end - loop.start));
}

// Loop points that also fit a shorter decoded buffer.
export function loopFor(duration, loop = BACKGROUND_MUSIC_LOOP) {
  return duration > loop.end ? loop : { start: 0, end: duration };
}

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
