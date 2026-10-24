import { createMusicController, BACKGROUND_MUSIC_VOLUME } from '../ui/background-music.js';
import { createMusicFade } from '../ui/music-fade.js';

export function createWechatBackgroundMusic(
  wx,
  {
    enabled = true,
    active = true,
    loadSource,
    schedule = setTimeout,
    unschedule = clearTimeout,
    now = Date.now,
  } = {},
) {
  return createMusicController({
    enabled,
    active,
    createPlayer() {
      let audio = null;
      let loading = null;
      let loaded = false;
      let wanted = false;
      let disposed = false;
      let playing = false;
      let source = '';
      const fade = createMusicFade({
        schedule,
        unschedule,
        now,
        setVolume(value) {
          if (audio) audio.volume = value * BACKGROUND_MUSIC_VOLUME;
        },
      });
      function start() {
        if (!wanted || disposed || !loaded || !wx.createInnerAudioContext) return;
        if (!audio) {
          audio = wx.createInnerAudioContext();
          audio.loop = true;
          audio.volume = 0;
          audio.obeyMuteSwitch = false;
          audio.onPlay?.(() => {
            if (disposed) return;
            playing = wanted && !disposed;
            if (!playing) audio.pause();
            else fade.start();
          });
          audio.onPause?.(() => (playing = false));
          audio.onStop?.(() => (playing = false));
          audio.onError?.(() => (playing = false));
          audio.onCanplay?.(() => {
            if (wanted && !disposed && !playing) audio.play();
          });
          audio.src = source;
        }
        if (!playing) audio.play();
      }
      return {
        get playing() {
          return playing;
        },
        play() {
          if (disposed) return;
          wanted = true;
          if (loaded) return start();
          if (!loading)
            loading = Promise.resolve()
              .then(() => loadSource())
              .then((value) => {
                source = value;
                loaded = true;
                start();
              })
              .catch(() => {
                loading = null;
              });
          return loading;
        },
        pause() {
          wanted = false;
          playing = false;
          fade.pause();
          audio?.pause();
        },
        dispose() {
          disposed = true;
          wanted = false;
          playing = false;
          fade.pause();
          audio?.stop();
          audio?.destroy();
        },
      };
    },
  });
}
