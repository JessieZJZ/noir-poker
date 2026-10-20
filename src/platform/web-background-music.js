import {
  createMusicController,
  BACKGROUND_MUSIC_PATH,
  MOBILE_BACKGROUND_MUSIC_PATH,
  BACKGROUND_MUSIC_VOLUME,
} from '../ui/background-music.js';
import { createMusicFade } from '../ui/music-fade.js';

export function createWebBackgroundMusic({
  enabled = true,
  active = true,
  document = globalThis.document,
  mobile = document.documentElement?.classList.contains('native-app') ||
    Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches),
  createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)(),
  sharedContext = false,
  getOutput = (context) => context.destination,
} = {}) {
  return createMusicController({
    enabled,
    active,
    createPlayer() {
      const audio = document.createElement('audio');
      audio.hidden = true;
      audio.dataset.backgroundMusic = 'midnight-felt';
      audio.src = new URL(
        mobile ? MOBILE_BACKGROUND_MUSIC_PATH : BACKGROUND_MUSIC_PATH,
        document.baseURI,
      ).href;
      audio.preload = 'auto';
      audio.loop = true;
      document.body.append(audio);
      let context = null;
      let output = null;
      let source = null;
      let wanted = false;
      let disposed = false;
      try {
        context = createContext();
        source = context.createMediaElementSource(audio);
        output = context.createGain();
        output.gain.value = BACKGROUND_MUSIC_VOLUME;
        source.connect(output).connect(getOutput(context));
      } catch {
        // GainNode also supports iOS, where HTMLMediaElement.volume is ignored.
        audio.volume = BACKGROUND_MUSIC_VOLUME;
        context = null;
      }
      const fade = createMusicFade({
        setVolume(value) {
          if (output) output.gain.value = value * BACKGROUND_MUSIC_VOLUME;
          else audio.volume = value * BACKGROUND_MUSIC_VOLUME;
          audio.dataset.musicGain = String(value);
        },
      });
      function start() {
        if (!wanted || disposed || (context && context.state !== 'running')) return;
        if (!audio.paused) return;
        return Promise.resolve(audio.play()).then(() => {
          if (!wanted || disposed) audio.pause();
          else fade.start();
        });
      }
      return {
        get playing() {
          return wanted && !audio.paused && (!context || context.state === 'running');
        },
        play() {
          if (disposed) return;
          wanted = true;
          // Call both APIs synchronously in a trusted gesture, before awaiting.
          if (context && context.state !== 'running' && context.state !== 'closed')
            return Promise.resolve(context.resume())
              .then(start)
              .catch(() => {});
          return start();
        },
        pause() {
          wanted = false;
          fade.pause();
          audio.pause();
          if (!sharedContext && context?.state === 'running')
            void context.suspend().catch(() => {});
        },
        dispose() {
          disposed = true;
          wanted = false;
          fade.pause();
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
          audio.remove();
          source?.disconnect();
          output?.disconnect();
          if (!sharedContext && context?.state !== 'closed') void context?.close().catch(() => {});
        },
      };
    },
  });
}
