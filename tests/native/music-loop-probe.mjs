// Runs inside the installed WebView. Keep the evidence between slow driver polls.
// The intro plays once; afterwards playback must return to the loop start, not 0.
export function watchNativeMusicLoop() {
  const music = document.querySelector('[data-background-music]').backgroundMusic;
  const probe = {
    sawTail: false,
    wrapped: false,
    tailTime: null,
    wrapTime: null,
    loopStart: music.loopStart,
    loopEnd: music.loopEnd,
  };
  const observe = () => {
    if (music.paused) return;
    const time = music.currentTime;
    if (time >= music.loopEnd - 0.6) {
      probe.sawTail = true;
      probe.tailTime = time;
    } else if (probe.sawTail && time >= music.loopStart && time < music.loopStart + 5) {
      probe.wrapped = true;
      probe.wrapTime ??= time;
    }
  };
  const timer = setInterval(observe, 50);
  window.__nativeMusicLoop = probe;
  window.__stopNativeMusicLoopProbe = () => {
    clearInterval(timer);
    delete window.__nativeMusicLoop;
    delete window.__stopNativeMusicLoopProbe;
  };
  music.seek(music.loopEnd - 0.2);
  observe();
}
