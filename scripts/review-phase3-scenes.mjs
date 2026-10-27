// Offline-only, deliberately constructed legal review situations.
import assert from 'node:assert/strict';

export const PHASE3_STYLES = ['balanced', 'rook', 'jett', 'owen', 'vale', 'nico', 'mira', 'iris'];
export const PHASE3_REVIEWERS = [
  'expert-coach',
  'ordinary-player',
  'professional-player',
  'commentator',
];

export function phase3Reviewer(index) {
  const reviewer =
    index < 3200
      ? Math.floor(index / 4) % 4
      : (Math.floor((index - 3200) / 20) + Math.floor(((index - 3200) % 20) / 5)) % 4;
  return PHASE3_REVIEWERS[reviewer];
}
export const PHASE3_SCENES = [
  {
    id: 'set-three-hearts-turn',
    hole: '5c 5d',
    board: '4d Qh Ah 5h 2s',
    street: 2,
    action: 'check',
    keep: 3,
    position: 'CO',
    purpose: '暗三条面对三张红心，解释控池原因和可下注的后位',
  },
  {
    id: 'dry-set-flop',
    hole: '5c 5d',
    board: '5s Kh 2d 9c Ts',
    street: 1,
    action: 'check',
    purpose: '干燥面暗三条，过牌不能笼统称为害怕听牌',
  },
  {
    id: 'set-four-hearts-river',
    hole: '5c 5d',
    board: '5h Qh Ah 2h Tc',
    street: 3,
    action: 'check',
    purpose: '四张红心，暗三条会输给任何一张红心',
  },
  {
    id: 'full-house-flush-board',
    hole: '5c 5d',
    board: '5h Qh Ah Qs 2h',
    street: 3,
    action: 'check',
    purpose: '葫芦强于同花，不应因同花面一律避险',
  },
  {
    id: 'closing-check-turn',
    hole: 'As Kd',
    board: 'Ah 8c 2d 7s 3c',
    street: 2,
    action: 'check',
    position: 'BTN',
    purpose: '最后行动者过牌封口，不能说诱导本轮后位下注',
  },
  {
    id: 'pending-check-turn',
    hole: 'As Kd',
    board: 'Ah 8c 2d 7s 3c',
    street: 2,
    action: 'check',
    position: 'SB',
    keep: 3,
    purpose: '过牌后仍有人可下注，继续计划要有条件',
  },
  {
    id: 'nut-flush-draw-turn',
    hole: 'As Js',
    board: 'Kh 7s 2s 9d Qc',
    street: 2,
    action: 'call',
    bet: true,
    purpose: '坚果同花听牌，解释补牌、价格和脏补牌',
  },
  {
    id: 'combo-draw-flop',
    hole: '9s 8s',
    board: 'Ts 7s 2d 3c Kh',
    street: 1,
    action: 'raise',
    bet: true,
    purpose: '同花加两头顺听牌，说明半诈唬与被跟后的改善',
  },
  {
    id: 'missed-draw-river',
    hole: 'As Js',
    board: 'Ks 7s 2d 9c Qh',
    street: 3,
    action: 'raise',
    purpose: '河牌听牌落空，不能再说等待补牌',
  },
  {
    id: 'paired-board-top-pair',
    hole: 'Ah Kd',
    board: 'As 7c 7d 2h 9s',
    street: 3,
    action: 'call',
    bet: true,
    purpose: '公共对子组成两对，区别手中对子和公对',
  },
  {
    id: 'four-straight-river',
    hole: 'Kh Kd',
    board: '8s 9c Td Jh 2s',
    street: 3,
    action: 'check',
    purpose: '四连张面超对，明确一张Q或7可能成顺子',
  },
  {
    id: 'board-only-river',
    hole: '2c 3d',
    board: 'As Kd Qh Jc Ts',
    street: 3,
    action: 'call',
    bet: true,
    purpose: '公共牌成顺子，区分争取独赢和平分',
  },
  {
    id: 'multiway-top-pair',
    hole: 'As Kd',
    board: 'Ah Jc 8h 2s 7d',
    street: 1,
    action: 'raise',
    keep: 4,
    purpose: '多人顶对取值与继续范围，避免当作坚果',
  },
  {
    id: 'preflop-large-open',
    hole: 'Ks Qs',
    street: 0,
    pressure: 'open',
    purpose: '40BB非全下开池，高连接牌的价格和压制风险',
  },
  {
    id: 'preflop-four-bet',
    hole: 'As Kd',
    street: 0,
    pressure: 'four-bet',
    purpose: 'AK面对4-bet，解释行动范围、价格和有效筹码',
  },
  {
    id: 'preflop-five-bet',
    hole: 'Qs Qd',
    street: 0,
    pressure: 'five-bet',
    purpose: 'QQ面对5-bet，不能只凭起手强牌肯定继续',
  },
  {
    id: 'short-all-in-no-reopen',
    hole: 'As Ah',
    street: 0,
    pressure: 'short-reopen',
    purpose: '短全下未重开加注，不能建议不合法再加注',
  },
  {
    id: 'short-stack-side-pot',
    hole: 'As Ks',
    street: 0,
    pressure: 'side-pot',
    action: 'raise',
    purpose: '短筹码主池和边池，全下者不能被诈唬赶走',
  },
  {
    id: 'river-thin-value',
    hole: 'As 9c',
    board: 'Ah 2d 6s 7c 8h',
    street: 3,
    action: 'raise',
    purpose: '河牌薄价值，要明确哪些更弱牌可能付费',
  },
  {
    id: 'river-bluff-catcher',
    hole: 'Qd Qs',
    board: 'Ac 9h 5s 2d 8c',
    street: 3,
    action: 'call',
    bet: true,
    purpose: '河牌抓诈唬，说明价值范围、诈唬和赔率',
  },
];

export function phase3Configuration(index) {
  assert(Number.isInteger(index) && index >= 0 && index < 4000);
  const targeted = index >= 3200;
  const repeat = targeted ? Math.floor((index - 3200) / 20) : index;
  const scene = targeted ? PHASE3_SCENES[(index - 3200) % 20] : null;
  const players = 5 + ((targeted ? repeat : index) % 5);
  const depthKind = Math.floor(index / 45) % 10;
  const depths = [20, 40, 75, 100, 150, 250];
  const stacksBB = Array.from({ length: players }, (_, id) =>
    depthKind < 6
      ? depths[depthKind]
      : depthKind === 6
        ? [20, 50, 150][id % 3]
        : depthKind === 7
          ? id === 0
            ? 250
            : 40
          : depthKind === 8
            ? id === 0
              ? 20
              : 200
            : [10, 40, 100, 250][id % 4],
  );
  const focus =
    scene?.pressure === 'short-reopen' || scene?.pressure === 'side-pot' ? 0 : repeat % 2;
  if (scene) {
    stacksBB.fill(scene.street === 0 ? 150 : [40, 100, 250][repeat % 3]);
    if (scene.pressure === 'short-reopen') stacksBB[2] = 12;
    if (scene.pressure === 'side-pot') {
      stacksBB[0] = 150;
      stacksBB[1] = 20;
      stacksBB[2] = 80;
    }
  }
  return {
    index,
    players,
    difficulty: ['easy', 'normal', 'hard'][(targeted ? repeat : Math.floor(index / 5)) % 3],
    emotionMode: ['off', 'subtle', 'lively'][
      (targeted ? Math.floor(repeat / 3) : Math.floor(index / 15)) % 3
    ],
    smallBlind: [25, 100, 50000][
      (targeted ? Math.floor(repeat / 9) : Math.floor(index / 45) + Math.floor(index / 5)) % 3
    ],
    stacksBB,
    depthKind: targeted
      ? 'targeted-assigned'
      : depthKind < 6
        ? `uniform-${depths[depthKind]}BB`
        : `mixed-${depthKind}`,
    assignments: Object.fromEntries(
      Array.from({ length: players - 1 }, (_, i) => [
        i + 1,
        PHASE3_STYLES[((targeted ? repeat + ((index - 3200) % 20) : index) + i + 1) % 8],
      ]),
    ),
    moods: Array.from(
      { length: players },
      (_, id) =>
        ['steady', 'frustrated', 'cautious', 'confident', 'reactive'][
          (Math.floor(index / 135) + id) % 5
        ],
    ),
    heroPolicy: ['production', 'check-call', 'pressure', 'cautious'][index % 4],
    scene,
    repeat,
    focus,
  };
}

export function parseSceneCards(engine, text = '') {
  return text
    .split(' ')
    .filter(Boolean)
    .map((text) => {
      const card = engine
        .deckOfCards()
        .find(
          (c) =>
            c.rank === '23456789TJQKA'.indexOf(text[0]) + 2 && c.suit === 'shcd'.indexOf(text[1]),
        );
      assert(card, `Unknown card ${text}`);
      return card;
    });
}

// Rebuild the entire remaining deal. Burns are reserved explicitly, so the
// selected future board is only consumed by production advanceStreet().
export function arrangePhase3Cards(engine, game, configuration) {
  const { scene, focus } = configuration;
  const full = [...game.deck, ...game.players.flatMap((p) => p.hole)];
  assert.equal(full.length, 52);
  assert.equal(new Set(full.map((c) => c.key)).size, 52);
  if (!scene) return { forced: false };
  const hole = parseSceneCards(engine, scene.hole);
  const board = parseSceneCards(engine, scene.board);
  const requested = [...hole, ...board];
  assert.equal(new Set(requested.map((c) => c.key)).size, requested.length);
  const forced = new Set(requested.map((c) => c.key));
  const rest = full.filter((c) => !forced.has(c.key));
  game.players.forEach((p) => {
    p.hole = p.id === focus ? hole : rest.splice(0, 2);
  });
  const draws = [];
  if (board.length) {
    draws.push(rest.shift(), ...board.slice(0, 3), rest.shift(), board[3], rest.shift(), board[4]);
  }
  game.deck = [...rest, ...draws.reverse()];
  assert.equal(
    new Set([...game.deck, ...game.players.flatMap((p) => p.hole)].map((c) => c.key)).size,
    52,
  );
  assert.equal(game.deck.length + game.players.length * 2, 52);
  return {
    forced: true,
    focus,
    hole,
    intendedBoard: board,
    burns: [game.deck.at(-1), game.deck.at(-5), game.deck.at(-7)],
  };
}

export function phase3Dealer(configuration) {
  const { scene, focus, players, index } = configuration;
  if (!scene) return index % players;
  if (scene.pressure === 'short-reopen' || scene.pressure === 'side-pot')
    return (1 - 3 + players) % players;
  if (scene.pressure) {
    const first = scene.pressure === 'five-bet' ? focus : (focus + 1) % players;
    return (first - 3 + players) % players;
  }
  if (scene.position === 'SB') return (focus - 1 + players) % players;
  if (scene.position === 'CO') return (focus + 1) % players;
  return focus;
}

// A stateful legal prefix controller. It does not inspect hidden cards or
// future cards to choose an action; scene metadata is an explicit test script.
export function createPhase3Controller(configuration) {
  const { scene, focus, players } = configuration;
  if (!scene) return null;
  const other = (focus + 1) % players;
  const keep =
    scene.pressure === 'short-reopen' || scene.pressure === 'side-pot'
      ? [0, 1, 2]
      : scene.pressure
        ? [...new Set([focus, other, 0])]
        : Array.from({ length: scene.keep || 2 }, (_, i) => (focus + i) % players);
  // Always retain hero so both hero and opponent views remain available.
  if (!keep.includes(0)) keep[keep.length - 1] = 0;
  const sequence =
    scene.pressure === 'open'
      ? [[other, 'raise', 40]]
      : scene.pressure === 'four-bet'
        ? [
            [other, 'raise', 3],
            [focus, 'raise', 9],
            [other, 'raise', 25],
          ]
        : scene.pressure === 'five-bet'
          ? [
              [focus, 'raise', 3],
              [other, 'raise', 9],
              [focus, 'raise', 23],
              [other, 'raise', 50],
            ]
          : scene.pressure === 'short-reopen'
            ? [
                [1, 'raise', 3],
                [0, 'raise', 9],
                [1, 'call'],
                [2, 'raise', 12],
              ]
            : scene.pressure === 'side-pot'
              ? [
                  [1, 'raise', 20],
                  [2, 'call'],
                ]
              : [];
  let step = 0,
    targetReached = false,
    targetEvent = null,
    betMade = false;
  return {
    get status() {
      return { targetReached, targetEvent, prefixSteps: step, requiredSteps: sequence.length };
    },
    decide(game, legal) {
      const passive = () => ({
        action: legal.canCheck ? 'check' : 'call',
        source: 'scripted-prefix',
      });
      if (targetReached) {
        if (scene.pressure === 'side-pot' && game.street === 0 && keep.includes(game.actor))
          return passive();
        return null;
      }
      if (game.street === 0 && !keep.includes(game.actor))
        return { action: 'fold', source: 'scripted-prefix' };
      if (sequence.length && step < sequence.length) {
        const [id, action, bb] = sequence[step];
        if (game.actor !== id) return passive();
        step++;
        return {
          action,
          ...(action === 'raise' ? { amount: bb * game.bigBlind } : {}),
          source: 'scripted-prefix',
        };
      }
      if (game.street < scene.street) return passive();
      assert.equal(game.street, scene.street, `Missed target ${scene.id}`);
      if (scene.bet && !betMade && game.actor !== focus) {
        betMade = true;
        if (legal.canRaise)
          return {
            action: 'raise',
            amount: Math.max(
              legal.minRaiseTo,
              Math.min(
                legal.maxRaiseTo,
                Math.round((game.players.reduce((n, p) => n + p.total, 0) * 0.6) / game.chipUnit) *
                  game.chipUnit,
              ),
            ),
            source: 'scripted-prefix',
          };
      }
      if (game.actor !== focus) return passive();
      targetReached = true;
      targetEvent = {
        sequence: game.history.length + 1,
        street: game.street,
        actor: game.actor,
        board: structuredClone(game.board),
        legal: structuredClone(legal),
      };
      if (!scene.action) return null;
      let action = scene.action;
      if (action === 'check') assert(legal.canCheck, `Probe needs a free check: ${scene.id}`);
      if (action === 'call' && legal.canCheck) action = 'check';
      if (action === 'raise' && !legal.canRaise) action = legal.canCheck ? 'check' : 'call';
      return {
        action,
        ...(action === 'raise'
          ? { amount: scene.pressure === 'side-pot' ? 80 * game.bigBlind : legal.minRaiseTo }
          : {}),
        source: 'scripted-probe',
      };
    },
  };
}
