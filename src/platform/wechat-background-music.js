import {
  createMusicController,
  BACKGROUND_MUSIC_VOLUME,
  BACKGROUND_MUSIC_DUCK_VOLUME,
} from '../ui/background-music.js';

export function createWechatBackgroundMusic(
  wx,
  {
    enabled = true,
    active = true,
    loadSource,
    schedule = setTimeout,
    unschedule = clearTimeout,
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
      let ducked = false;
      let duckTimer = null;
      let duckToken = 0;
      function restoreVolume() {
        duckToken++;
        if (duckTimer !== null) unschedule(duckTimer);
        duckTimer = null;
        ducked = false;
        if (audio) audio.volume = BACKGROUND_MUSIC_VOLUME;
      }
      function start() {
        if (!wanted || disposed || !loaded || !wx.createInnerAudioContext) return;
        if (!audio) {
          audio = wx.createInnerAudioContext();
          audio.loop = true;
          audio.volume = ducked ? BACKGROUND_MUSIC_DUCK_VOLUME : BACKGROUND_MUSIC_VOLUME;
          audio.obeyMuteSwitch = false;
          audio.onPlay?.(() => {
            if (disposed) return;
            playing = wanted && !disposed;
            if (!playing) audio.pause();
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
          restoreVolume();
          wanted = false;
          playing = false;
          audio?.pause();
        },
        dispose() {
          restoreVolume();
          disposed = true;
          wanted = false;
          playing = false;
          audio?.stop();
          audio?.destroy();
        },
        duck() {
          if (!wanted || disposed) return;
          restoreVolume();
          ducked = true;
          if (audio) audio.volume = BACKGROUND_MUSIC_DUCK_VOLUME;
          const token = ++duckToken;
          // Longest local cue is 600 ms; allow 50 ms for its native start.
          duckTimer = schedule(() => {
            if (token === duckToken && !disposed) restoreVolume();
          }, 650);
        },
      };
    },
  });
}
