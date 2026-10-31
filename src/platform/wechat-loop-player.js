import { BACKGROUND_MUSIC_VOLUME } from '../ui/background-music.js';
import { createMusicFade } from '../ui/music-fade.js';

// Decode the local AAC once. BufferSource loops on the audio clock, without a
// JS timer, a second player or a fresh decoder at the end of each lap.
export function createWechatLoopPlayer(wx, { loadSource, schedule, unschedule, now, fallback }) {
  let context;
  try {
    if (!wx.createWebAudioContext || !wx.getFileSystemManager) return fallback();
    context = wx.createWebAudioContext();
  } catch {
    return fallback();
  }
  let gain, buffer, node, loading, backup;
  let wanted = false,
    disposed = false,
    closed = false,
    offset = 0,
    started = 0;
  const fade = createMusicFade({
    schedule,
    unschedule,
    now,
    setVolume(value) {
      if (gain && !closed) gain.gain.value = value * BACKGROUND_MUSIC_VOLUME;
    },
  });
  function stop() {
    if (!node) return;
    offset = (offset + Math.max(0, context.currentTime - started)) % buffer.duration;
    const previous = node;
    node = null;
    previous.onended = null;
    try {
      previous.stop();
    } catch {}
    try {
      previous.disconnect();
    } catch {}
  }
  function close() {
    if (closed) return;
    stop();
    fade.pause();
    try {
      gain?.disconnect();
    } catch {}
    closed = true;
    buffer = null;
    try {
      Promise.resolve(context.close()).catch(() => {});
    } catch {}
  }
  function useFallback() {
    if (disposed || backup) return;
    close();
    backup = fallback();
    if (wanted) backup.play();
  }
  async function start() {
    if (!wanted || disposed || closed || backup) return;
    try {
      // WeChat may leave resume() pending when no state change is needed.
      // Its native transition can also be synchronous before that Promise
      // settles. Use the observed state, without delaying a ready audio source.
      if (context.state !== 'running') {
        const resumed = context.resume();
        if (context.state !== 'running') await resumed;
        else Promise.resolve(resumed).catch(useFallback);
      }
      if (!wanted || disposed || closed || context.state !== 'running' || !buffer || node) return;
      const next = context.createBufferSource();
      next.buffer = buffer;
      next.loop = true;
      next.loopStart = 0;
      next.loopEnd = buffer.duration;
      next.connect(gain);
      next.onended = () => {
        if (node === next && wanted) useFallback();
      };
      node = next;
      started = context.currentTime;
      next.start(0, offset);
      fade.start();
    } catch {
      useFallback();
    }
  }
  try {
    gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(context.destination);
  } catch {
    useFallback();
  }
  return {
    get playing() {
      return backup ? backup.playing : !!node && !closed && context.state === 'running';
    },
    play() {
      if (disposed) return;
      wanted = true;
      if (backup) return backup.play();
      void start();
      if (!loading)
        loading = Promise.resolve()
          .then(loadSource)
          .then(
            (path) =>
              new Promise((resolve, reject) => {
                if (disposed || closed) return resolve(null);
                wx.getFileSystemManager().readFile({
                  filePath: path,
                  success: ({ data }) => resolve(data),
                  fail: reject,
                });
              }),
          )
          .then((data) => {
            if (!data || disposed || closed) return null;
            return new Promise((resolve, reject) => context.decodeAudioData(data, resolve, reject));
          })
          .then((decoded) => {
            if (disposed || closed) return;
            if (!decoded?.duration) throw Error('Empty music buffer');
            buffer = decoded;
            return start();
          })
          .catch(useFallback);
      return loading;
    },
    pause() {
      wanted = false;
      if (backup) return backup.pause();
      if (closed) return;
      stop();
      fade.pause();
      Promise.resolve(context.suspend()).catch(() => {});
    },
    dispose() {
      disposed = true;
      wanted = false;
      backup?.dispose();
      close();
    },
  };
}
