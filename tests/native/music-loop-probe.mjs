// Runs inside the installed WebView. Keep the evidence between slow driver polls.
export function watchNativeMusicLoop() {
  const audio = document.querySelector('audio[data-background-music]');
  const probe = { sawTail: false, wrapped: false, tailTime: null, wrapTime: null };
  const observe = () => {
    if (audio.seeking || audio.paused) return;
    const time = audio.currentTime;
    if (time >= audio.duration - 0.6) {
      probe.sawTail = true;
      probe.tailTime = time;
    } else if (probe.sawTail && time < audio.duration / 2) {
      probe.wrapped = true;
      probe.wrapTime ??= time;
    }
  };
  window.__nativeMusicLoop = probe;
  window.__stopNativeMusicLoopProbe = () => {
    audio.removeEventListener('seeked', observe);
    audio.removeEventListener('timeupdate', observe);
    delete window.__nativeMusicLoop;
    delete window.__stopNativeMusicLoopProbe;
  };
  audio.addEventListener('seeked', observe);
  audio.addEventListener('timeupdate', observe);
  audio.currentTime = audio.duration - 0.2;
}
