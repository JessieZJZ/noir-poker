import { chipRecording } from './chip-recording.js';
import { synthSamples } from './sound-synth.js';
export {
  SOUND_SAMPLE_RATE,
  SOUND_TARGET_RMS,
  SOUND_PEAK_CEILING,
  SYNTHESIZED_SOUND_CUES,
  limitSoundMix,
  createSoundOutput,
  soundWav,
} from './sound-synth.js';

// One deterministic PCM definition for Web, native WebViews and WeChat WAVs.
// Unit gain is already mastered; platform adapters must not boost it again.
export const SOUND_CUES = ['fold', 'check', 'chip', 'deal', 'win'];
export function soundSamples(name) {
  const kind = ['bet', 'raise', 'call'].includes(name) ? 'chip' : name;
  if (!SOUND_CUES.includes(kind)) throw new RangeError('Unknown sound cue');
  // The approved audition already contains its final gain and edge fades.
  // Re-mastering it would flatten the chip contacts and change the chosen sound.
  if (kind === 'chip') return chipRecording();
  return synthSamples(kind);
}
