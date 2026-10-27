export const MUSIC_ENTRY_FADE_MS = 2400;
export const MUSIC_RESUME_FADE_MS = 700;

// Fade the audible player, not a loading or gesture-blocked playback request.
export function createMusicFade({
  setVolume,
  schedule = setTimeout,
  unschedule = clearTimeout,
  now = Date.now,
}) {
  let timer = null;
  let epoch = 0;
  let started = false;
  let running = false;
  let level = 0;
  const apply = () => setVolume(level);
  function cancel() {
    epoch++;
    if (timer !== null) unschedule(timer);
    timer = null;
  }
  apply();
  return {
    start() {
      if (running) return;
      cancel();
      running = true;
      level = 0;
      apply();
      const duration = started ? MUSIC_RESUME_FADE_MS : MUSIC_ENTRY_FADE_MS;
      started = true;
      const start = now();
      const ticket = epoch;
      const tick = () => {
        if (ticket !== epoch || !running) return;
        const progress = Math.min(1, Math.max(0, (now() - start) / duration));
        level = progress * progress * (3 - 2 * progress);
        apply();
        timer = progress < 1 ? schedule(tick, 40) : null;
      };
      timer = schedule(tick, 40);
    },
    pause() {
      cancel();
      running = false;
      level = 0;
      apply();
    },
  };
}
