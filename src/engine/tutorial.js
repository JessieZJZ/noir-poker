import {
  newGame,
  startHand,
  act,
  advanceStreet,
  completeBoardForPractice,
  legalActions,
  potSize,
  currentPots,
  seatPosition,
  deckOfCards,
  evaluate,
} from './poker.js';
import { fractionRaiseTo, legalRaiseTo } from './bet-sizing.js';
import { compactChips } from './chip-format.js';

// Guided hands run on the real engine: every chip moves through act(),
// advanceStreet() and settle(). The script only fixes the deck and the bots'
// choices, so nothing here can change rules, records or the player's live game.
// Amounts are written in big blinds and read from the table, never as literals.
const read = (title, text, focus = []) => ({ type: 'read', title, text, focus });
const quiz = (title, text, { options, answer, right, wrong, focus = [] }) => ({
  type: 'quiz',
  title,
  text,
  options,
  answer,
  right,
  wrong,
  focus,
});
const bot = (action, amount) => ({ type: 'bot', action, amount });
const deal = () => ({ type: 'deal' });
const hero = (action, title, text, focus, details = {}) => ({
  type: 'hero',
  action,
  title,
  text,
  focus,
  ...details,
});
const blinds = (count) => (game) => count * game.bigBlind;
// Matches compactChips: the letter the table shows for this amount.
const unitOf = (amount) => (amount >= 1000000 ? 'M' : amount >= 1000 ? 'K' : '');
const allIn = (game) => legalActions(game).maxRaiseTo;
const halfPot = (game) => {
  const legal = legalActions(game, 0);
  return legalRaiseTo(
    fractionRaiseTo(
      {
        currentBet: game.currentBet,
        pot: potSize(game),
        callAmount: legal.callAmount,
        chipUnit: legal.chipUnit,
      },
      0.5,
    ),
    legal,
  );
};

export const TUTORIAL_LESSONS = [
  {
    title: '走完一手牌',
    doneTitle: '第一手完成',
    goal: '底牌、盲注、位置，四轮下注到摊牌',
    dealer: 0,
    holes: [
      ['Th', '9h'],
      ['7c', '4d'],
      ['Ks', '7s'],
      ['Jd', '2c'],
      ['Qc', 'Js'],
    ],
    board: ['Kc', '8h', '3h', '5c', 'Qh'],
    beats: [
      read(
        '底牌',
        () =>
          '这两张是你的底牌，只有你看得见。桌子中央之后会发出五张公共牌，大家共用。目标只有一个：用这七张牌里最好的五张去赢。',
        ['hero-cards'],
      ),
      // Stakes decide whether the stack reads in K or M and whether the blinds
      // carry a unit at all, so each beat explains the unit actually on screen.
      read(
        '底池',
        (c) =>
          c.stackUnit === 'M'
            ? `中间的数字是底池，所有人投入的筹码都在这里。赢下它有两种办法：让其他人全部弃牌，或者打到最后亮牌比大小。你面前的 ${c.stack} 是虚拟筹码，M 表示百万，也就是 ${c.stackPlain}。`
            : `中间的数字是底池，所有人投入的筹码都在这里。赢下它有两种办法：让其他人全部弃牌，或者打到最后亮牌比大小。你面前的 ${c.stack} 是虚拟筹码，K 表示千，也就是 ${c.stackPlain}。`,
        ['pot', 'stack'],
      ),
      read(
        '盲注',
        (c) =>
          c.bbUnit === 'K'
            ? `还没看牌就有人先投钱，这叫盲注，是强制的。Mia 是 SB（小盲），投 ${c.sb}；Alex 是 BB（大盲），投 ${c.bb}。这里的 K 表示千，${c.bb} 就是 ${c.bbPlain}。有了盲注，每手牌才有东西可争。`
            : `还没看牌就有人先投钱，这叫盲注，是强制的。Mia 是 SB（小盲），投 ${c.sb}；Alex 是 BB（大盲），投 ${c.bb}。数字后面没有字母，就是实际的筹码数。有了盲注，每手牌才有东西可争。`,
        ['seat:1', 'seat:2', 'pot'],
      ),
      read(
        '筹码单位',
        (c) =>
          `换算记一下：${c.oneK} = 1000，${c.oneM} = 1000K = 1000000。不带 K 或 M 的整数就是实际筹码数，所以 ${c.stack} 和 ${c.stackPlain} 一样多。带小数也照算，${c.sample} 就是 ${c.samplePlain}。`,
        ['stack', 'seat:2'],
      ),
      read(
        '位置',
        () =>
          '你名字旁的 BTN 是按钮位，也叫庄位。顺时针下一位是 SB，再下一位是 BB。翻牌后 BTN 最后行动，能先看别人怎么做，所以它是最好的位置。',
        ['position'],
      ),
      read(
        '行动顺序',
        () => '翻牌前从大盲后面的人开始，顺时针轮流行动。先看 River 和 Kai 怎么选。',
        ['seat:3', 'seat:4'],
      ),
      bot('fold'),
      bot('call'),
      hero(
        'call',
        '跟注',
        (c) =>
          `River 弃牌退出，Kai 跟注。轮到你了：想继续，就要补齐当前下注，这次要补 ${c.toCall}。10♥ 9♥ 同花又相连，价格便宜、位置又好，值得看翻牌。点【跟注】。`,
        ['call'],
      ),
      bot('fold'),
      bot('check'),
      read(
        '一轮结束',
        (c) =>
          `Mia 弃牌，已投的 ${c.sb} 留在底池。Alex 已经投了大盲，不用再补，所以过牌。还在牌局里的人下注一样多，这一轮就结束了。`,
        ['pot'],
      ),
      deal(),
      read(
        '翻牌',
        () =>
          '这三张是翻牌，所有人都能用。你现在有四张红桃，再来一张红桃就是同花。这叫听牌：还没成，但有希望。',
        ['board', 'hero-cards'],
      ),
      bot('check'),
      bot('check'),
      hero(
        'check',
        '过牌',
        () =>
          '翻牌后从庄位左边还在牌局里的人开始行动，你在 BTN，最后说话。前面都过牌，没人下注，你不用投钱也能继续。还没成牌，免费看下一张最划算。点【过牌】。',
        ['call'],
      ),
      deal(),
      bot('raise', blinds(2)),
      bot('fold'),
      hero(
        'call',
        '面对下注',
        (c) =>
          `转牌是第四张公共牌。Alex 下注 ${c.currentBet}，Kai 弃牌。有人下注后就不能过牌了：要么补齐，要么弃牌，要么加注。投 ${c.toCall} 去争 ${c.pot} 的底池，再搏一张红桃，价格合适。点【跟注】。`,
        ['call', 'pot'],
      ),
      deal(),
      quiz('河牌', () => '河牌是最后一张公共牌。看看你能组成的最好五张牌，这是什么牌型？', {
        options: () => ['顺子', '同花', '一对'],
        answer: 1,
        right: () =>
          '对！五张红桃就是同花：Q♥ 10♥ 9♥ 8♥ 3♥。只算最好的五张，另外两张不用。牌型从大到小：同花顺、四条、葫芦、同花、顺子、三条、两对、一对、高牌。',
        wrong: () => '再看看：你手里的两张和公共牌里，有几张是红桃？',
        focus: ['board', 'hero-cards'],
      }),
      read('牌力表', () => '牌型大小记不住也没关系，打牌时随时点【牌力表】就能查。', ['rankings']),
      bot('check'),
      hero(
        'raise',
        '价值下注',
        (c) =>
          `Alex 过牌。你的牌很强，应该主动下注，让比你小的牌付钱。点【½ 底池】选好金额，再点加注按钮投入 ${c.target}。`,
        ['half', 'raise'],
        { amount: halfPot, preset: 'half' },
      ),
      bot('call'),
      deal(),
      read(
        '摊牌',
        (c) =>
          `河牌下注结束后还有两人，就要摊牌。Alex 是一对 K，你是同花，同花更大。你赢下了 ${c.won} 的底池！如果这时牌力相同，底池就平分。`,
        ['board', 'pot'],
      ),
    ],
    recap: [
      '一手牌有四轮下注：翻牌前、翻牌、转牌、河牌。',
      '没人下注可以过牌；有人下注就要跟注、加注或弃牌。',
      '摊牌时用七张牌里最好的五张比大小。',
    ],
  },
  {
    title: '主动加注',
    doneTitle: '第二手完成',
    goal: '加注金额怎么算，不摊牌也能赢',
    dealer: 1,
    holes: [
      ['As', 'Kd'],
      ['8c', '3d'],
      ['Jh', '4s'],
      ['Qd', 'Ts'],
      ['6h', '2d'],
    ],
    board: ['Ad', '7c', '2s', '9h', '4c'],
    beats: [
      read(
        '庄位移动',
        () =>
          '每打完一手，庄位顺时针移动一席。现在 Mia 是 BTN，你坐到了 CO（关煞位），也就是庄位的前一席。盲注也跟着换了人，轮流付，很公平。',
        ['position', 'seat:1'],
      ),
      read(
        '好牌主动打',
        () =>
          'A♠ K♦ 是很强的起手牌。好牌不要只是跟注，应该主动加注：牌力领先时把底池做大，还可能让别人直接放弃。',
        ['hero-cards'],
      ),
      bot('fold'),
      hero(
        'raise',
        '加注',
        (c) =>
          `Kai 弃牌。现在的下注是大盲 ${c.bb}，常见做法是加到大盲的三倍左右，金额已经调到 ${c.target}。注意：加注按钮上的数字是这一轮的累计总额，不是再多加这么多。点加注按钮。`,
        ['raise'],
        { amount: blinds(3) },
      ),
      bot('fold'),
      bot('fold'),
      quiz(
        '算一算',
        (c) =>
          `River 在大盲位已经投了 ${c.bb}，你加注到 ${c.heroBet}。River 想跟注，这次要补多少？`,
        {
          options: (c) => [c.heroBet, c.riverCall, c.heroBetPlusBlind],
          answer: 1,
          right: (c) =>
            `对！跟注只补差额：${c.heroBet} 减去已投的 ${c.bb}，等于 ${c.riverCall}。记住：跟注旁的数字是这次要补多少，加注旁的数字是这一轮累计多少。`,
          wrong: () => 'River 已经投进去的筹码不用重复付，只需要补到和你一样多。',
          focus: ['seat:3'],
        },
      ),
      bot('call'),
      deal(),
      read(
        '踢脚',
        () =>
          '翻牌出了 A，你组成一对 A，还带着 K。如果对手也是一对 A，就比剩下的牌，这张牌叫踢脚。你的 K 是最好的踢脚之一。',
        ['board', 'hero-cards'],
      ),
      bot('check'),
      hero(
        'raise',
        '持续下注',
        (c) =>
          `River 过牌。没人下注时，第一个投钱就是下注。你继续施压，让对手为看下一张牌付费。点【½ 底池】，再点加注按钮投入 ${c.target}。`,
        ['half', 'raise'],
        { amount: halfPot, preset: 'half' },
      ),
      bot('fold'),
      read(
        '不摊牌也能赢',
        (c) =>
          `River 弃牌，其他人都退出了，你直接赢下底池，不用亮牌，也不用发完公共牌。你最后那注 ${c.refund} 没人跟，会原数退还。所以下注本身就是一种武器。`,
        ['pot'],
      ),
    ],
    recap: [
      '好牌主动加注，底池更大，也更容易赶走对手。',
      '加注看累计总额，跟注看这次要补多少。',
      '其他人都弃牌时，你不用亮牌就能赢。',
    ],
  },
  {
    title: '果断弃牌',
    doneTitle: '第三手完成',
    goal: '烂牌不入池，好决策不看结果',
    dealer: 2,
    holes: [
      ['9c', '4d'],
      ['As', 'Ks'],
      ['8s', '3c'],
      ['6d', '2h'],
      ['Td', '5s'],
    ],
    board: ['9h', 'Kc', '3s', '4h', 'Jd'],
    beats: [
      hero(
        'fold',
        '学会弃牌',
        () =>
          '这手你是 UTG（枪口位）：大盲后第一个行动，后面所有人都还没说话，是最难打的位置。9♣ 4♦ 不同花、不相连，也没有大牌。新手最常见的错误就是每手都想玩。这手弃牌不花一分钱，点【弃牌】。',
        ['position', 'fold'],
      ),
      hero(
        'finish',
        '看完这手',
        () => '弃牌后你就是观众了，可以看别人打完。想快一点，就点【立刻发完】。',
        ['finish'],
      ),
      bot('raise', blinds(3)),
      bot('fold'),
      bot('fold'),
      bot('fold'),
      read(
        '结果不等于决策',
        () =>
          'Mia 加注，其他人都放弃了。这五张是练习补牌，只给你看，不影响结算。就算它们让你的 9 和 4 组成两对，弃牌依然正确：好决策只看当时能看到的信息，不看后面发什么牌。',
        ['board'],
      ),
      read(
        '已投入的筹码',
        () =>
          '这手你没投钱，所以弃牌没有损失。如果弃牌前已经投了筹码，比如盲注或跟注，那些筹码会留在底池里拿不回来。别因为舍不得已投入的钱，就继续往里加。',
        ['pot'],
      ),
    ],
    recap: [
      '大多数手牌都该弃掉，位置越靠前越要挑牌。',
      '弃牌后已投入的筹码留在底池，不要为它继续追。',
      '好决策看当时的信息，不看后面发出的牌。',
    ],
  },
  {
    title: '全下与边池',
    doneTitle: '第四手完成',
    goal: '筹码不够怎么办，底池怎么分',
    dealer: 3,
    stacks: { 1: 6 },
    holes: [
      ['Qs', 'Qd'],
      ['Ah', 'Ac'],
      ['Kh', 'Th'],
      ['9d', '6c'],
      ['7d', '4c'],
    ],
    board: ['8s', '5d', '2c', 'Jc', '3h'],
    beats: [
      read(
        '筹码不一样多',
        (c) =>
          `这手 Mia 只剩 ${c.miaStack} 筹码，其他人都是 ${c.stack}。你在大盲位，已经投了 ${c.bb}。`,
        ['seat:1', 'position'],
      ),
      bot('raise', allIn),
      read(
        '全下',
        () =>
          'Mia 全下了：把剩下的筹码全部押上。全下后不用再行动，直接等摊牌。筹码不够跟注时，你也可以用全部筹码跟注，不会被赶出这手牌。',
        ['seat:1'],
      ),
      bot('call'),
      bot('fold'),
      bot('fold'),
      hero(
        'raise',
        '再加注',
        (c) =>
          `Alex 跟注了。Q♠ Q♦ 是很强的口袋对子，再加注能赶走 Alex，或者让 Alex 付更多。金额已经调到 ${c.target}，点加注按钮。`,
        ['hero-cards', 'raise'],
        { amount: blinds(16) },
      ),
      bot('call'),
      read(
        '边池',
        () =>
          '你和 Alex 都比 Mia 投得多。Mia 没有跟上的这部分筹码，要单独放进边池，只有你和 Alex 能争。点底池旁的【明细】随时能看。',
        ['pot', 'details'],
      ),
      quiz('想一想', () => '如果 Mia 的牌最大，能赢走什么？', {
        options: () => ['全部底池', '只有主池', '什么都赢不到'],
        answer: 1,
        right: () =>
          '对！全下的人只能赢自己投入过的那部分。投了多少，就能从每个对手那里赢回多少；超出的部分碰不到。',
        wrong: () => 'Mia 没有为边池投入筹码，再想想 Mia 到底有资格争哪一部分。',
        focus: ['pot', 'seat:1'],
      }),
      deal(),
      hero(
        'raise',
        '继续下注',
        (c) =>
          `翻牌没有比 Q 大的牌。Mia 已经全下不能再行动，这一轮只有你和 Alex 下注。点【½ 底池】，再点加注按钮投入 ${c.target}。`,
        ['half', 'raise'],
        { amount: halfPot, preset: 'half' },
      ),
      bot('fold'),
      read(
        '亮牌',
        () => 'Alex 弃牌，只剩你和全下的 Mia。没有人还能下注了，双方直接亮牌，把剩下的公共牌发完。',
        ['seat:1', 'hero-cards'],
      ),
      deal(),
      deal(),
      deal(),
      read(
        '分开结算',
        (c) =>
          `Mia 的一对 A 赢了你的一对 Q，拿走主池 ${c.main}。但边池 ${c.side} Mia 没有资格争，Alex 又弃牌了，所以归你。你翻牌那注 ${c.refund} 没人跟，也原数退还。`,
        ['pot', 'seat:1'],
      ),
    ],
    recap: [
      '全下就是押上全部筹码，之后只等摊牌。',
      '全下的人只能赢自己投入过的部分。',
      '多出来的筹码进边池，分开结算；没人跟的部分退还。',
    ],
  },
];

// A beginner reads about ten Chinese characters a second. Automatic beats wait
// that long after a message appears, capped so a quick tap never stalls the table.
const READING_BASE_MS = 500,
  READING_CHARS_PER_SECOND = 10,
  READING_MAX_MS = 8000;
export function readingTime({ title = '', text = '', detail = '' }) {
  const length = (title + text + (detail || '')).replace(/\s/g, '').length;
  return Math.min(READING_MAX_MS, READING_BASE_MS + (length * 1000) / READING_CHARS_PER_SECOND);
}

const FREE_TITLE = '自己打一手';
const FREE_GOAL = '没有剧本，教练只讲局面';
export const TUTORIAL_TOTAL = TUTORIAL_LESSONS.length + 1;

function rigDeck(game, lesson) {
  const cards = deckOfCards();
  const take = (code) => {
    const rank = '23456789TJQKA'.indexOf(code[0]) + 2,
      suit = 'shcd'.indexOf(code[1]),
      index = cards.findIndex((card) => card.rank === rank && card.suit === suit);
    if (index < 0) throw Error(`教学牌组重复：${code}`);
    return cards.splice(index, 1)[0];
  };
  game.players.forEach((player) => (player.hole = lesson.holes[player.id].map(take)));
  const [flop1, flop2, flop3, turn, river] = lesson.board.map(take),
    burns = [cards.pop(), cards.pop(), cards.pop()];
  // Cards leave from the end of the deck; each street burns one first.
  game.deck = [...cards, river, burns[2], turn, burns[1], flop3, flop2, flop1, burns[0]];
}

function tableFor(stakes, index) {
  const game = newGame(5, stakes);
  game.difficulty = 'easy';
  game.emotionMode = 'off';
  game.hand = index;
  return game;
}

// One scripted or free hand plus the coach's position in it. Platform
// controllers own timers and rendering; they drive this through the same calls.
export function createTutorial(stakes) {
  let stage = 'intro',
    lessonIndex = 0,
    beatIndex = 0,
    game = null,
    wrongAnswer = null,
    solved = false,
    freeHands = 0,
    lastCoach = { title: '', text: '' },
    shown = { key: null, at: 0, ms: 0 };

  const lesson = () => TUTORIAL_LESSONS[lessonIndex];
  const beat = () => (stage === 'lesson' ? lesson().beats[beatIndex] : null);

  function begin(index) {
    const script = TUTORIAL_LESSONS[index];
    lessonIndex = index;
    beatIndex = 0;
    wrongAnswer = null;
    solved = false;
    lastCoach = { title: '', text: '' };
    stage = 'lesson';
    game = tableFor(stakes, index);
    game.dealer = (script.dealer + game.players.length - 1) % game.players.length;
    for (const [id, count] of Object.entries(script.stacks || {}))
      game.players[id].stack = count * game.bigBlind;
    startHand(game);
    rigDeck(game, script);
  }
  function beginFree() {
    lessonIndex = TUTORIAL_LESSONS.length;
    stage = 'free';
    game = tableFor(stakes, lessonIndex + freeHands);
    game.dealer = (lessonIndex - 1 + freeHands) % game.players.length;
    freeHands++;
    startHand(game);
  }
  function advanceBeat() {
    beatIndex++;
    wrongAnswer = null;
    solved = false;
    if (beatIndex >= lesson().beats.length) stage = 'summary';
  }
  function context(format) {
    const legal = legalActions(game, 0),
      hero = game.players[0],
      current = beat(),
      river = legalActions(game, 3),
      refund = game.refunds.find((entry) => entry.id === 0)?.amount ?? 0;
    return {
      sb: format(game.smallBlind),
      bb: format(game.bigBlind),
      stack: format(game.stakes.startingStack),
      stackPlain: String(game.stakes.startingStack),
      stackUnit: unitOf(game.stakes.startingStack),
      bbPlain: String(game.bigBlind),
      bbUnit: unitOf(game.bigBlind),
      oneK: format(1000),
      oneM: format(1000000),
      sample: format(1500),
      samplePlain: '1500',
      miaStack: format(game.players[1].stack + game.players[1].total),
      pot: format(game.phase === 'done' ? game.potAtShowdown : potSize(game)),
      toCall: format(legal.callAmount ?? 0),
      currentBet: format(game.currentBet),
      heroBet: format(hero.bet),
      riverCall: format(river.callAmount ?? 0),
      heroBetPlusBlind: format(hero.bet + game.bigBlind),
      target: current?.amount && legal.enabled ? format(current.amount(game)) : '',
      won: format(game.winners.find((entry) => entry.id === 0)?.amount ?? 0),
      refund: format(refund),
      main: format(game.pots[0]?.amount ?? 0),
      side: format(game.pots[1]?.amount ?? 0),
    };
  }
  function freeCoach(format) {
    const hero = game.players[0],
      legal = legalActions(game, 0),
      winner = game.winners[0];
    if (game.phase === 'done') {
      const mine = game.winners.find((entry) => entry.id === 0);
      if (hero.folded && !mine)
        return {
          title: '本手结束',
          text: '这手你弃牌了。弃牌不是输：省下来的筹码，同样是下一手的本钱。',
        };
      if (mine)
        return {
          title: '本手结束',
          text: `你赢下 ${format(mine.amount)} 筹码（${mine.label}）。记住：赢了也要问自己，每一步当时为什么这样选。`,
        };
      return {
        title: '本手结束',
        text: `这手 ${winner?.name} 获胜（${winner?.label}）。输一手很正常，关键是每一步都按当时的信息做决定。`,
      };
    }
    if (hero.folded)
      return {
        title: '你已弃牌',
        text: '这手你已经退出，可以看对手打完，也可以点【立刻发完】。',
      };
    if (!legal.enabled)
      return {
        title: '等待对手',
        text: hero.allin
          ? '你已全下，不用再行动，等公共牌发完后比牌。'
          : '对手正在行动。趁这个时间看看公共牌，想想你接下来怎么选。',
      };
    const rank = evaluate([...hero.hole, ...game.board]),
      text = game.board.length
        ? `你现在的牌：${rank.label}。`
        : `你坐在 ${seatPosition(game, 0)}。`,
      detail = legal.canCheck
        ? '现在不用投钱，可以过牌，也可以主动下注。'
        : legal.canRaise
          ? `跟注要补 ${format(legal.callAmount)}，底池现在是 ${format(potSize(game))}。也可以弃牌，或者加注到至少 ${format(legal.minRaiseTo)}。`
          : `跟注要补 ${format(legal.callAmount)}，底池现在是 ${format(potSize(game))}。这时不能加注，只能跟注或弃牌。`;
    return { title: '轮到你决定', text, detail };
  }
  function dialog() {
    if (stage === 'intro')
      return {
        eyebrow: 'BEGINNER GUIDE',
        title: '新手引导',
        lead: '跟着教练打几手真实牌局，边打边学规则。全程使用虚拟筹码，大约五分钟。',
        steps: [
          ...TUTORIAL_LESSONS.map(({ title, goal }) => ({ title, text: goal })),
          { title: FREE_TITLE, text: FREE_GOAL },
        ],
        note: '当前牌局已暂停，退出后原样继续；引导中的牌局不计入对局记录。',
        primary: '开始第一手',
        secondary: '返回牌桌',
      };
    if (stage === 'summary')
      return {
        eyebrow: 'LESSON COMPLETE',
        title: lesson().doneTitle,
        lead: '这一手学到的：',
        points: lesson().recap,
        primary: lessonIndex + 1 < TUTORIAL_LESSONS.length ? '下一手' : '最后一手：自己打',
        secondary: '再打一遍',
      };
    if (stage === 'finish')
      return {
        eyebrow: 'READY TO PLAY',
        title: '你可以上桌了',
        lead: '上桌时记住这几件事：',
        points: [
          '先看位置和底牌：牌不好就弃，好牌主动加注。',
          '轮到你时看清数字：跟注是这次补多少，加注是这一轮累计多少。',
          '记不住牌型就点【牌力表】，看不懂底池就点【明细】。',
          '打完点【复盘这一手】，按当时的信息看决策，而不是只看输赢。',
          '刚开始可以在设置里把对手难度调到“轻松”。',
        ],
        primary: '开始真实对局',
        secondary: '再打一手',
      };
    return null;
  }
  function coach(format) {
    if (stage === 'free') return freeCoach(format);
    const current = beat();
    // Automatic beats keep the last message on screen while the table moves;
    // amounts must stay as they were when that message was written.
    if (!current?.text) return lastCoach;
    const c = context(format);
    lastCoach = {
      title: current.title,
      text:
        current.type !== 'quiz'
          ? current.text(c)
          : solved
            ? current.right(c)
            : wrongAnswer !== null
              ? current.wrong(c)
              : current.text(c),
    };
    return lastCoach;
  }
  function autoDelay() {
    const current = beat();
    if (current?.type === 'bot') return 950;
    if (current?.type === 'deal') return 1100;
    return null;
  }
  // Runs one bot or dealer beat through the engine and reports what happened.
  function runAuto() {
    const current = beat();
    if (current.type === 'deal') {
      advanceStreet(game);
      advanceBeat();
      return { kind: game.phase === 'done' ? 'win' : 'deal' };
    }
    const id = game.actor,
      canCheck = legalActions(game, id).canCheck;
    act(game, id, current.action, current.amount?.(game));
    advanceBeat();
    return {
      kind: 'bot',
      id,
      action: current.action === 'call' && canCheck ? 'check' : current.action,
      win: game.phase === 'done',
    };
  }
  function raiseTarget() {
    const current = beat();
    return current?.type === 'hero' && current.action === 'raise' ? current.amount(game) : null;
  }
  function allowedAction() {
    if (stage === 'free') return null;
    const current = beat();
    return current?.type === 'hero'
      ? { action: current.action, preset: current.preset || null }
      : { action: 'none', preset: null };
  }

  return {
    get stage() {
      return stage;
    },
    get game() {
      return game;
    },
    // The intro still shows the paused live table; a hand is dealt afterwards.
    playing: () => stage !== 'intro',
    guided: () => stage === 'lesson',
    allowedAction,
    autoDelay,
    runAuto,
    // Only the taught action and amount are live during a guided hero beat.
    allows(action, amount) {
      if (stage === 'free') return true;
      const current = beat();
      if (current?.type !== 'hero') return false;
      if (action === 'finish') return current.action === 'finish';
      const legal = legalActions(game, 0);
      if (!legal.enabled) return false;
      const normalized = action === 'call' && legal.canCheck ? 'check' : action;
      if (normalized !== current.action) return false;
      return action !== 'raise' || amount === current.amount(game);
    },
    heroActed() {
      if (stage === 'lesson') advanceBeat();
    },
    // The script's remaining bets finish instantly, like the table's fast finish.
    finishHand() {
      if (beat()?.action !== 'finish') return false;
      advanceBeat();
      while (autoDelay() !== null) runAuto();
      if (game.phase === 'done' && game.board.length < 5) completeBoardForPractice(game);
      return true;
    },
    answer(index) {
      const current = beat();
      if (current?.type !== 'quiz' || solved) return false;
      solved = index === current.answer;
      wrongAnswer = solved ? null : index;
      return solved;
    },
    // Platforms report each coach paint; a new message starts its reading time.
    markShown(view, now) {
      const key = [view.stage, view.title, view.text, view.detail || ''].join('\n');
      if (key !== shown.key) shown = { key, at: now, ms: readingTime(view) };
    },
    // How much longer automatic beats and bots wait so the message can be read.
    readingHold(now) {
      return Math.max(0, shown.at + shown.ms - now);
    },
    // Continue on a read beat, a solved quiz or the end of the free hand.
    next() {
      const current = beat();
      if (stage === 'free') {
        if (game.phase !== 'done') return false;
        stage = 'finish';
        return true;
      }
      if (current?.type === 'read' || (current?.type === 'quiz' && solved)) {
        advanceBeat();
        // Tapping Continue says the message has been read.
        shown.ms = 0;
        return true;
      }
      return false;
    },
    // The dialog's buttons either deal a new table or leave the tutorial.
    primary() {
      if (stage === 'intro') {
        begin(0);
        return 'deal';
      }
      if (stage === 'summary') {
        if (lessonIndex + 1 < TUTORIAL_LESSONS.length) begin(lessonIndex + 1);
        else beginFree();
        return 'deal';
      }
      return 'exit';
    },
    secondary() {
      if (stage === 'summary') {
        begin(lessonIndex);
        return 'deal';
      }
      if (stage === 'finish') {
        beginFree();
        return 'deal';
      }
      return 'exit';
    },
    view(format = compactChips) {
      const current = beat(),
        c = stage === 'lesson' ? context(format) : null,
        done = stage === 'free' && game.phase === 'done',
        lessonNumber = Math.min(lessonIndex + 1, TUTORIAL_TOTAL),
        beats = stage === 'lesson' ? lesson().beats.length : 1;
      return {
        stage,
        dialog: dialog(),
        lessonLabel: `第 ${lessonNumber} / ${TUTORIAL_TOTAL} 手 · ${stage === 'free' ? FREE_TITLE : TUTORIAL_LESSONS[Math.min(lessonIndex, TUTORIAL_LESSONS.length - 1)].title}`,
        progress:
          stage === 'lesson'
            ? (lessonIndex + beatIndex / beats) / TUTORIAL_TOTAL
            : stage === 'free'
              ? (TUTORIAL_TOTAL - 1) / TUTORIAL_TOTAL
              : (lessonIndex + 1) / TUTORIAL_TOTAL,
        ...(['lesson', 'free'].includes(stage) ? coach(format) : { title: '', text: '' }),
        focus: stage === 'lesson' ? (current?.focus ?? []) : [],
        // A solved quiz gives its space to the explanation.
        options:
          current?.type === 'quiz' && !solved
            ? current.options(c).map((text, index) => ({
                text,
                index,
                wrong: wrongAnswer === index,
              }))
            : [],
        canContinue: done || current?.type === 'read' || (current?.type === 'quiz' && solved),
        continueLabel: done ? '看看学到了什么' : '继续',
        // A settled hand moves Continue into the empty action dock.
        settled: ['lesson', 'free'].includes(stage) && game.phase === 'done',
        allowed: allowedAction(),
        raiseTarget: raiseTarget(),
      };
    },
  };
}
