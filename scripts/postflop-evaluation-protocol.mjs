import { LEARNING_PROFILES } from './player-learning-protocol.mjs';

export const POSTFLOP_EVALUATION_CASES = Object.freeze({
  'top-pair-wet': { category: 'protection-positive', primary: true },
  'overpair-wet': { category: 'protection-positive', primary: true },
  'nut-draw-checked': { category: 'semi-bluff-positive', primary: true },
  'combo-draw-checked': { category: 'semi-bluff-positive', primary: true },
  'turn-value-improved': { category: 'made-nut-value-support', primary: false },
  'turn-flush-completed': { category: 'danger-control', primary: false },
  'strong-turn-response': { category: 'danger-control', primary: false },
  'middle-pair-danger': { category: 'danger-control', primary: false },
  'prior-checkthrough-draw-lead': {
    category: 'prior-checkthrough-semi-bluff-positive',
    primary: true,
  },
  'prior-checkthrough-paired-turn': {
    category: 'prior-checkthrough-danger-control',
    primary: false,
  },
  'prior-checkthrough-flush-turn': {
    category: 'prior-checkthrough-danger-control',
    primary: false,
  },
  'prior-checkthrough-four-connected': {
    category: 'prior-checkthrough-danger-control',
    primary: false,
  },
  'prior-checkthrough-strong-response': {
    category: 'prior-checkthrough-danger-control',
    primary: false,
  },
});

export function postflopEvaluationDesign(smoke = false) {
  const cases = Object.keys(POSTFLOP_EVALUATION_CASES),
    profiles = smoke ? ['balanced'] : [...LEARNING_PROFILES],
    seeds = smoke ? 1 : 32;
  return {
    version: 1,
    seed: smoke ? 28101610 : 28101611,
    smoke,
    cases,
    profiles,
    seeds,
    players: 9,
    liveOpponents: 3,
    difficulty: 'normal',
    emotions: 'off',
    decisions: cases.length * profiles.length * seeds * 2,
    hiddenInformationChecks: smoke ? 0 : cases.length * 2,
    casesByRole: POSTFLOP_EVALUATION_CASES,
    pairing:
      'Each public fixture, actor style and seeded policy/timing stream is identical across frozen old/new engines. Seed is the paired cluster across eight fixed actor styles.',
    primaryOutcome:
      'Real legal bet/raise action rate in five positive families. At least ten percentage points increase with a pointwise paired 95 percent lower difference bound above zero is clear improvement for that named family.',
    controls:
      'Neither checked-value-protection nor the checked/prior-checkthrough pressure marker may trigger on the seven declared dangerous controls. Total betting/calling changes are displayed, not forced to zero. Made-nut turn value is supporting preservation evidence.',
    scope:
      'Constructed before-action decisions, not natural full hands, human play or global exploitability evidence. Fixed budget, no optional continuation to significance; independent hidden-card/deck contamination checks are counted separately.',
  };
}
