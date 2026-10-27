import { createMusicController, BACKGROUND_MUSIC_VOLUME } from '../ui/background-music.js';
import { createMusicFade } from '../ui/music-fade.js';

const RECOVERY_DELAY_MS = 300;
const RECOVERY_INTERVAL_MS = 2000;

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
      let recovery = null;
      let recoveredAt = -Infinity;
      const fade = createMusicFade({
        schedule,
        unschedule,
        now,
        setVolume(value) {
          if (audio) audio.volume = value * BACKGROUND_MUSIC_VOLUME;
        },
      });
      // WeChat can pause this track itself, for example while pages create and
      // destroy their sound-effect players during navigation. A pause or stop
      // this player did not request is resumed in place, at most every 2s so a
      // system that keeps refusing playback cannot cause a loop.
      function recover() {
        playing = false;
        if (!wanted || disposed || recovery !== null) return;
        const delay = Math.max(RECOVERY_DELAY_MS, recoveredAt + RECOVERY_INTERVAL_MS - now());
        recovery = schedule(() => {
          recovery = null;
          if (!wanted || disposed || playing) return;
          recoveredAt = now();
          audio?.play();
        }, delay);
      }
      function cancelRecovery() {
        if (recovery !== null) unschedule(recovery);
        recovery = null;
      }
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
          audio.onPause?.(recover);
          audio.onStop?.(recover);
          audio.onError?.(recover);
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
          cancelRecovery();
          fade.pause();
          audio?.pause();
        },
        dispose() {
          disposed = true;
          wanted = false;
          playing = false;
          cancelRecovery();
          fade.pause();
          audio?.stop();
          audio?.destroy();
        },
      };
    },
  });
}
