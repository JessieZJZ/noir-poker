import { cards } from './deceptive-decisions.js';

// Public estimator snapshots isolate range boards, side-pot eligibility and
// river guarantees. No actual opponent cards or future deck enter a case.
export function allInCacheCases() {
  const create = (name, hole, board, streets) => {
    const community = cards(board);
    const street = community.length ? community.length - 2 : 0;
    const ranges = streets.map((rangeStreet, id) => ({
      id,
      role: id === 1 ? 'caller' : 'shover',
      street: rangeStreet,
      line: rangeStreet ? 'postflop-shove' : 'reraise-shove',
      depthBB: id === 3 ? 20 : 100,
    }));
    const view = {
      id: 4,
      smallBlind: 300,
      bigBlind: 600,
      chipUnit: 300,
      street,
      hole: cards(hole),
      board: community,
      pot: 6000,
      currentBet: 1200,
      contestable: 6000,
      opponents: ranges.map(({ id }) => ({ id, bet: 1200, allin: true })),
      allIn: { aggressorId: 0 },
      callPots: [
        { amount: 3900, eligible: [0, 1, 2, 3, 4] },
        { amount: 2100, eligible: [0, 1, 4] },
      ],
    };
    return { name, view, context: { ranges, committedIds: ranges.map(({ id }) => id) } };
  };
  return [
    create('preflop', 'Qs Qd', '', [0, 0, 0, 0]),
    create('flop', 'Qs Qd', 'Js 7h 2c', [1, 1, 1, 1]),
    create('turn-locked-preflop', 'Qs Qd', 'Js 7h 2c 4d', [0, 1, 2, 2]),
    create('river-shared-royal', '2c 3d', 'As Ks Qs Js Ts', [0, 1, 3, 3]),
    create('river-private-nuts', 'Ts 9s', 'As Ks Qs Js 2d', [0, 1, 3, 3]),
    create('river-beatable', 'Qs Qd', 'Js 7h 2c 4d 9s', [0, 1, 3, 3]),
  ];
}
