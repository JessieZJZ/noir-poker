const {
  ceremonyWav,
  CEREMONY_CUES,
  SYNTHESIZED_CEREMONY_CUES,
  CEREMONY_SOUND_VERSION,
} = require('../../shared/ui/ceremony-sounds.js');
const { premiumSparks, confettiPieces } = require('../../shared/ui/effect-layouts.js');
const {
  synthSamples,
  soundWav,
  SYNTHESIZED_SOUND_CUES,
  SOUND_SYNTH_VERSION,
} = require('../../shared/ui/sound-synth.js');

// Settled-hand snapshots live in the user data folder, one file per hand. The
// folder holds far more than wx storage's 1 MB key limit; reads are synchronous.
const RECORDS_DIR = 'noir-records';
// WeChat allows 200 MB of user files; leave room for sounds and other data.
const WECHAT_RECORDS_BUDGET = 60000000;
function createSnapshotFiles() {
  const fs = wx.getFileSystemManager?.(),
    root = wx.env?.USER_DATA_PATH;
  if (!fs || !root) return null;
  const dir = `${root}/${RECORDS_DIR}`,
    file = (id) => `${dir}/${encodeURIComponent(id)}.json`;
  try {
    fs.accessSync(dir);
  } catch {
    try {
      fs.mkdirSync(dir, true);
    } catch {}
  }
  return {
    keys() {
      try {
        return fs
          .readdirSync(dir)
          .filter((name) => name.endsWith('.json'))
          .map((name) => decodeURIComponent(name.slice(0, -5)));
      } catch {
        return [];
      }
    },
    get(id) {
      try {
        return fs.readFileSync(file(id), 'utf8');
      } catch {
        return null;
      }
    },
    set(id, text) {
      fs.writeFileSync(file(id), text, 'utf8');
    },
    remove(id) {
      try {
        fs.unlinkSync(file(id));
      } catch {}
    },
  };
}
// The synthesized ceremony cues (farewell and the table notices) are written
// once into user files named by the sound version, so a changed cue (or one
// that became a recording) replaces or removes the old file.
function ceremonySoundFiles() {
  // The cheers themselves come from the sounds subpackage (sounds/source.js).
  const files = {};
  const fs = wx.getFileSystemManager?.(),
    root = wx.env?.USER_DATA_PATH;
  if (!fs || !root) return files;
  const current = (name) => `noir-${name}-v${CEREMONY_SOUND_VERSION}.wav`;
  try {
    for (const entry of fs.readdirSync(root)) {
      const match = /^noir-(\w+)-v\d+\.wav$/.exec(entry);
      if (
        match &&
        CEREMONY_CUES.includes(match[1]) &&
        (!SYNTHESIZED_CEREMONY_CUES.includes(match[1]) || entry !== current(match[1]))
      )
        fs.unlinkSync(`${root}/${entry}`);
    }
  } catch {}
  for (const name of SYNTHESIZED_CEREMONY_CUES) {
    const path = `${root}/${current(name)}`;
    try {
      fs.accessSync(path);
    } catch {
      try {
        fs.writeFileSync(path, ceremonyWav(name));
      } catch {
        continue;
      }
    }
    files[name] = path;
  }
  return files;
}
// The recorded chip stack is packaged; the other table cues are synthesized
// once into user files named by the synth version, replacing stale copies.
// Without a file system those cues stay silent rather than adding package size.
function tableSoundFiles() {
  const files = {};
  const fs = wx.getFileSystemManager?.(),
    root = wx.env?.USER_DATA_PATH;
  if (!fs || !root) return files;
  const current = (name) => `noir-sfx-${name}-v${SOUND_SYNTH_VERSION}.wav`;
  try {
    for (const entry of fs.readdirSync(root)) {
      const match = /^noir-sfx-(\w+)-v\d+\.wav$/.exec(entry);
      if (match && entry !== current(match[1])) fs.unlinkSync(`${root}/${entry}`);
    }
  } catch {}
  for (const name of SYNTHESIZED_SOUND_CUES) {
    const path = `${root}/${current(name)}`;
    try {
      fs.accessSync(path);
    } catch {
      try {
        fs.writeFileSync(path, soundWav(synthSamples(name)));
      } catch {
        continue;
      }
    }
    files[name] = path;
  }
  return files;
}
module.exports = {
  tableSoundFiles,
  WECHAT_RECORDS_BUDGET,
  createSnapshotFiles,
  ceremonySoundFiles,
  PREMIUM_SPARKS: premiumSparks(),
  CONFETTI_PIECES: confettiPieces(),
};
