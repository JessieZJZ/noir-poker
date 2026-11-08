import {
  createMusicController,
  BACKGROUND_MUSIC_PATH,
  MOBILE_BACKGROUND_MUSIC_PATH,
  BACKGROUND_MUSIC_VOLUME,
  loopFor,
  loopPosition,
} from '../ui/background-music.js';
import {
  createMusicFade,
  MUSIC_ENTRY_FADE_MS,
  MUSIC_PAUSE_FADE_MS,
  MUSIC_RESUME_FADE_MS,
} from '../ui/music-fade.js';

const fetchBytes = (url) =>
  fetch(url).then((response) => {
    if (!response.ok) throw Error(`Music ${response.status}`);
    return response.arrayBuffer();
  });

// Ramp on the audio clock. A JS timer can stall as the app leaves the screen.
function ramp(context, param, to, ms, from) {
  const at = context.currentTime;
  const value = from ?? param.value;
  param.cancelScheduledValues?.(at);
  if (!param.linearRampToValueAtTime || !ms) {
    param.value = to;
    return;
  }
  param.setValueAtTime(value, at);
  param.linearRampToValueAtTime(to, at + ms / 1000);
}

export function createWebBackgroundMusic({
  enabled = true,
  active = true,
  document = globalThis.document,
  mobile = document.documentElement?.classList.contains('native-app') ||
    Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches),
  createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)(),
  sharedContext = false,
  getOutput = (context) => context.destination,
  loadData = fetchBytes,
  schedule = setTimeout,
  unschedule = clearTimeout,
} = {}) {
  return createMusicController({
    enabled,
    active,
    createPlayer() {
      const url = new URL(
        mobile ? MOBILE_BACKGROUND_MUSIC_PATH : BACKGROUND_MUSIC_PATH,
        document.baseURI,
      ).href;
      let context = null;
      try {
        context = createContext();
        if (!context?.createBufferSource || !context.decodeAudioData) context = null;
      } catch {
        context = null;
      }
      const options = { document, url, sharedContext, schedule, unschedule };
      return context
        ? bufferPlayer({ ...options, context, getOutput, loadData })
        : elementPlayer(options);
    },
  });
}

// Decode the local file once. One BufferSource loops the musical period on the
// audio clock after the intro, with no JS timer at the loop point.
function bufferPlayer({
  document,
  url,
  context,
  sharedContext,
  getOutput,
  loadData,
  schedule,
  unschedule,
}) {
  const marker = document.createElement('span');
  marker.hidden = true;
  marker.dataset.backgroundMusic = 'midnight-felt';
  marker.dataset.musicGain = '0';
  document.body.append(marker);
  const output = context.createGain();
  output.gain.value = BACKGROUND_MUSIC_VOLUME;
  output.connect(getOutput(context));
  let buffer = null,
    loop = null,
    loading = null,
    voice = null,
    backup = null,
    wanted = false,
    disposed = false,
    entered = false,
    offset = 0,
    suspendTimer = null,
    labelTimer = null;
  const voices = new Set();
  const label = (level, delay = 0) => {
    if (labelTimer !== null) unschedule(labelTimer);
    labelTimer = null;
    if (!delay) marker.dataset.musicGain = String(level);
    else
      labelTimer = schedule(() => {
        labelTimer = null;
        marker.dataset.musicGain = String(level);
      }, delay);
  };
  const position = () =>
    voice
      ? loopPosition(voice.offset + Math.max(0, context.currentTime - voice.started), loop)
      : offset;
  function release(item, at) {
    try {
      item.source.stop(at);
    } catch {}
  }
  function forget(item) {
    voices.delete(item);
    try {
      item.source.disconnect();
      item.level.disconnect();
    } catch {}
  }
  function cancelSuspend() {
    if (suspendTimer !== null) unschedule(suspendTimer);
    suspendTimer = null;
  }
  function start() {
    if (!wanted || disposed || backup || !buffer || voice || context.state !== 'running') return;
    cancelSuspend();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = loop.start;
    source.loopEnd = loop.end;
    const level = context.createGain();
    level.gain.value = 0;
    source.connect(level);
    level.connect(output);
    const ms = entered ? MUSIC_RESUME_FADE_MS : MUSIC_ENTRY_FADE_MS;
    entered = true;
    const started = context.currentTime;
    const item = { source, level, started, offset };
    source.onended = () => forget(item);
    voices.add(item);
    voice = item;
    source.start(started, offset);
    ramp(context, level.gain, 1, ms, 0);
    label(1, ms);
  }
  function fadeOut() {
    if (!voice) return;
    const item = voice;
    offset = position();
    voice = null;
    ramp(context, item.level.gain, 0, MUSIC_PAUSE_FADE_MS);
    release(item, context.currentTime + MUSIC_PAUSE_FADE_MS / 1000 + 0.02);
  }
  function useFallback() {
    if (disposed || backup) return;
    fadeOut();
    marker.remove();
    backup = elementPlayer({ document, url, sharedContext: true, schedule, unschedule });
    if (wanted) backup.play();
  }
  const api = {
    get paused() {
      return !voice || context.state !== 'running';
    },
    loop: true,
    get currentTime() {
      return position();
    },
    get duration() {
      return buffer ? buffer.duration : NaN;
    },
    get loopStart() {
      return loop?.start ?? NaN;
    },
    get loopEnd() {
      return loop?.end ?? NaN;
    },
    get ready() {
      return Boolean(buffer);
    },
    source: url,
    get gain() {
      return voice ? voice.level.gain.value : 0;
    },
    get voices() {
      return voices.size;
    },
    // Inspection surface for tests; playback itself never seeks.
    seek(time) {
      if (voice) {
        const item = voice;
        voice = null;
        ramp(context, item.level.gain, 0, 0);
        release(item);
      }
      offset = loopPosition(time, loop || undefined);
      start();
    },
  };
  marker.backgroundMusic = api;
  return {
    get playing() {
      return backup ? backup.playing : wanted && Boolean(voice) && context.state === 'running';
    },
    play() {
      if (disposed) return;
      wanted = true;
      if (backup) return backup.play();
      loading ||= Promise.resolve()
        .then(() => loadData(url))
        .then(
          (data) =>
            new Promise((resolve, reject) => {
              const decoded = context.decodeAudioData(data, resolve, reject);
              decoded?.then?.(resolve, reject);
            }),
        )
        .then((decoded) => {
          if (disposed) return;
          if (!decoded?.duration) throw Error('Empty music buffer');
          buffer = decoded;
          loop = loopFor(decoded.duration);
          return start();
        })
        .catch(useFallback);
      // Call resume() synchronously inside a trusted gesture, before awaiting.
      if (context.state !== 'running' && context.state !== 'closed')
        return Promise.resolve(context.resume())
          .then(start)
          .catch(() => {});
      return start();
    },
    pause() {
      wanted = false;
      if (backup) return backup.pause();
      fadeOut();
      label(0);
      cancelSuspend();
      if (!sharedContext && context.state === 'running')
        suspendTimer = schedule(() => {
          suspendTimer = null;
          if (!wanted && !disposed && context.state === 'running')
            void Promise.resolve(context.suspend()).catch(() => {});
        }, MUSIC_PAUSE_FADE_MS + 60);
    },
    dispose() {
      disposed = true;
      wanted = false;
      cancelSuspend();
      label(0);
      backup?.dispose();
      for (const item of voices) {
        release(item);
        forget(item);
      }
      voice = null;
      buffer = null;
      marker.remove();
      try {
        output.disconnect();
      } catch {}
      if (!sharedContext && context.state !== 'closed')
        void Promise.resolve(context.close()).catch(() => {});
    },
  };
}

// No Web Audio: a media element plays the same file. Its loop jump is not
// sample exact, but the file continues the period past the loop end, so a late
// jump back by one period still lands on the same music.
function elementPlayer({ document, url, schedule, unschedule }) {
  const audio = document.createElement('audio');
  audio.hidden = true;
  audio.dataset.backgroundMusic = 'midnight-felt';
  audio.src = url;
  audio.preload = 'auto';
  audio.loop = true;
  document.body.append(audio);
  let wanted = false;
  let disposed = false;
  const fade = createMusicFade({
    schedule,
    unschedule,
    setVolume(value) {
      audio.volume = value * BACKGROUND_MUSIC_VOLUME;
      audio.dataset.musicGain = String(value);
    },
  });
  const wrap = () => {
    const loop = loopFor(audio.duration);
    if (audio.currentTime >= loop.end && loop.start > 0)
      audio.currentTime = loopPosition(audio.currentTime, loop);
  };
  audio.addEventListener?.('timeupdate', wrap);
  audio.backgroundMusic = {
    get paused() {
      return audio.paused;
    },
    loop: true,
    get currentTime() {
      return audio.currentTime;
    },
    get duration() {
      return audio.duration;
    },
    get loopStart() {
      return loopFor(audio.duration).start;
    },
    get loopEnd() {
      return loopFor(audio.duration).end;
    },
    get ready() {
      return audio.readyState >= 2;
    },
    source: url,
    get gain() {
      return Number(audio.dataset.musicGain || 0);
    },
    get voices() {
      return audio.paused ? 0 : 1;
    },
    seek(time) {
      audio.currentTime = time;
    },
  };
  return {
    get playing() {
      return wanted && !audio.paused;
    },
    play() {
      if (disposed) return;
      wanted = true;
      if (!audio.paused) return;
      return Promise.resolve(audio.play()).then(() => {
        if (!wanted || disposed) audio.pause();
        else fade.start();
      });
    },
    pause() {
      wanted = false;
      fade.pause();
      audio.pause();
    },
    dispose() {
      disposed = true;
      wanted = false;
      fade.pause();
      audio.removeEventListener?.('timeupdate', wrap);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio.remove();
    },
  };
}
