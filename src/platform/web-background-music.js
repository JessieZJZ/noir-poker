import {
  createMusicController,
  BACKGROUND_MUSIC_PATH,
  BACKGROUND_MUSIC_VOLUME,
} from '../ui/background-music.js';

export function createWebBackgroundMusic({
  enabled = true,
  active = true,
  document = globalThis.document,
  createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)(),
  sharedContext = false,
} = {}) {
  return createMusicController({
    enabled,
    active,
    createPlayer() {
      const audio = document.createElement('audio');
      audio.hidden = true;
      audio.dataset.backgroundMusic = 'midnight-felt';
      audio.src = new URL(BACKGROUND_MUSIC_PATH, document.baseURI).href;
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
        source.connect(output).connect(context.destination);
      } catch {
        // GainNode also supports iOS, where HTMLMediaElement.volume is ignored.
        audio.volume = BACKGROUND_MUSIC_VOLUME;
        context = null;
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
            void context.resume().catch(() => {});
          if (!audio.paused) return;
          return Promise.resolve(audio.play()).then(() => {
            if (!wanted || disposed) audio.pause();
          });
        },
        pause() {
          wanted = false;
          audio.pause();
          if (!sharedContext && context?.state === 'running')
            void context.suspend().catch(() => {});
        },
        dispose() {
          disposed = true;
          wanted = false;
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
