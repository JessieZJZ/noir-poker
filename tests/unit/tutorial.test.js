import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createTutorial,
  readingTime,
  TUTORIAL_LESSONS,
  TUTORIAL_TOTAL,
} from '../../src/engine/tutorial.js';
import { act, legalActions, potSize } from '../../src/engine/poker.js';
import { stakesFromSmallBlind } from '../../src/engine/stakes.js';

const chips = (game) => game.players.reduce((sum, p) => sum + p.stack + p.total, 0);

// Plays exactly as the page does: read, answer, tap the one live control.
function playLesson(tutorial, onStep = () => {}) {
  for (let guard = 0; tutorial.stage === 'lesson'; guard++) {
    assert.ok(guard < 100, 'A lesson must always reach its summary');
    const view = tutorial.view();
    onStep(view);
    if (tutorial.autoDelay() !== null) tutorial.runAuto();
    else if (view.options.length) {
      for (const option of view.options) if (tutorial.answer(option.index)) break;
      assert.equal(tutorial.next(), true);
    } else if (view.canContinue) assert.equal(tutorial.next(), true);
    else if (view.allowed.action === 'finish') assert.equal(tutorial.finishHand(), true);
    else {
      assert.equal(tutorial.game.actor, 0, `${view.title}: the script reaches the hero's turn`);
      const { action } = view.allowed,
        amount = view.raiseTarget ?? undefined;
      assert.equal(tutorial.allows(action, amount), true);
      act(tutorial.game, 0, action, amount);
      tutorial.heroActed();
    }
  }
}

for (const smallBlind of [25, 100, 2500, 50000])
  test(`every scripted hand is legal and conserves chips at small blind ${smallBlind}`, () => {
    const stakes = stakesFromSmallBlind(smallBlind),
      tutorial = createTutorial(stakes);
    assert.equal(tutorial.primary(), 'deal');
    for (const lesson of TUTORIAL_LESSONS) {
      const game = tutorial.game,
        total = chips(game);
      assert.deepEqual(game.stakes, stakes);
      assert.equal(new Set([...game.deck, ...game.players.flatMap((p) => p.hole)]).size, 52);
      playLesson(tutorial, () => {
        if (game.phase !== 'done') assert.equal(chips(game), total);
      });
      assert.equal(tutorial.stage, 'summary', lesson.title);
      assert.equal(game.phase, 'done', lesson.title);
      assert.equal(
        game.players.reduce((sum, p) => sum + p.stack, 0),
        total,
      );
      assert.ok(game.players.every((p) => p.stack % stakes.chipUnit === 0));
      assert.equal(tutorial.view().dialog.points.length, 3);
      assert.equal(tutorial.primary(), 'deal');
    }
    assert.equal(tutorial.stage, 'free');
  });

test('the buttons rotate one seat per lesson and the taught concepts really happen', () => {
  const tutorial = createTutorial(stakesFromSmallBlind(100));
  tutorial.primary();
  const results = [];
  for (let i = 0; i < TUTORIAL_LESSONS.length; i++) {
    const game = tutorial.game;
    assert.equal(game.dealer, i, 'BTN moves one seat clockwise between hands');
    playLesson(tutorial);
    results.push(game);
    tutorial.primary();
  }
  const [showdown, foldWin, folded, sidePot] = results;
  assert.equal(showdown.showdown, true);
  assert.equal(showdown.winners[0].id, 0);
  assert.equal(showdown.winners[0].label, '同花');
  assert.equal(foldWin.showdown, false);
  assert.deepEqual(foldWin.refunds, [{ id: 0, amount: 700 }]);
  assert.equal(folded.players[0].total, 0);
  assert.equal(folded.board.length, 0, 'The practice runout never enters settlement');
  assert.equal(folded.practiceBoard.length, 5);
  assert.deepEqual(
    sidePot.pots.map((pot) => [pot.awards[0].id, pot.amount]),
    [
      [1, 3700],
      [0, 4000],
    ],
  );
  assert.deepEqual(sidePot.refunds, [{ id: 0, amount: 3900 }]);
});

test('coach amounts come from the table, not from hard-coded default stakes', () => {
  const tutorial = createTutorial(stakesFromSmallBlind(175));
  tutorial.primary();
  const text = [];
  playLesson(tutorial, (view) => text.push(view.text));
  assert.ok(
    text.some((line) => /Mia 是 SB（小盲），投 175；Alex 是 BB（大盲），投 350/.test(line)),
  );
  assert.ok(text.every((line) => !/\b(?:100|200|20K)\b/.test(line)));
});

test('a coach message keeps its amounts while automatic beats run', () => {
  const tutorial = createTutorial(stakesFromSmallBlind(100));
  tutorial.primary();
  while (tutorial.view().allowed.action !== 'call') {
    if (tutorial.autoDelay() !== null) tutorial.runAuto();
    else tutorial.next();
  }
  const message = tutorial.view().text;
  assert.match(message, /这次要补 200/);
  act(tutorial.game, 0, 'call');
  tutorial.heroActed();
  assert.equal(tutorial.view().text, message);
});

test('the chip-unit steps explain the K or M actually on screen', () => {
  const lines = (smallBlind) => {
    const tutorial = createTutorial(stakesFromSmallBlind(smallBlind)),
      text = [];
    tutorial.primary();
    while (tutorial.view().canContinue && text.length < 4) {
      text.push(tutorial.view().text);
      tutorial.next();
    }
    return text;
  };
  const [, millions, kiloBlinds, units] = lines(10000);
  assert.match(millions, /你面前的 2M 是虚拟筹码，M 表示百万，也就是 2000000。/);
  assert.match(kiloBlinds, /投 10K；.*投 20K。这里的 K 表示千，20K 就是 20000。/);
  // The conversion line is fixed text, whatever the stakes.
  const conversion = '换算记一下：1K = 1000，1M = 1000K = 1000000，1.5M = 1500K = 1500000。';
  assert.equal(units, conversion);
  const [, thousands, plainBlinds, plainUnits] = lines(100);
  assert.match(thousands, /20K 是虚拟筹码，K 表示千，也就是 20000。/);
  assert.match(plainBlinds, /投 200。数字后面没有字母，就是实际的筹码数。/);
  assert.equal(plainUnits, conversion);
  assert.match(lines(500)[2], /投 1K。这里的 K 表示千，1K 就是 1000。/);
});

test('after the player acts, opponents and new cards wait for Continue on the same message', () => {
  const tutorial = createTutorial(stakesFromSmallBlind(100));
  tutorial.primary();
  const first = tutorial.view();
  tutorial.markShown(first, 1000);
  assert.equal(tutorial.readingHold(1000), readingTime(first));
  tutorial.markShown(first, 4000);
  assert.equal(
    tutorial.readingHold(4000),
    readingTime(first) - 3000,
    'Repainting the same message keeps its start time',
  );
  assert.equal(tutorial.next(), true);
  assert.equal(tutorial.readingHold(4000), 0, 'Continue means the message was read');
  while (tutorial.view().allowed.action !== 'call') {
    if (tutorial.autoDelay() !== null) tutorial.runAuto();
    else tutorial.next();
  }
  const turn = tutorial.view();
  assert.equal(turn.canContinue, false, 'The taught action, not Continue, moves this step');
  tutorial.markShown(turn, 10000);
  act(tutorial.game, 0, 'call');
  tutorial.heroActed();
  // The next beats are the opponents'; they wait however long the reader takes.
  const held = tutorial.view();
  assert.equal(tutorial.autoDelay(), null);
  assert.equal(held.canContinue, true);
  assert.equal(held.continueLabel, '继续');
  assert.deepEqual([held.title, held.text], [turn.title, turn.text]);
  assert.equal(held.allowed.action, 'none', 'Table controls stay locked while it waits');
  const actor = tutorial.game.actor;
  assert.equal(tutorial.next(), true);
  assert.equal(tutorial.game.actor, actor, 'Continue itself moves no chips');
  assert.notEqual(tutorial.autoDelay(), null);
  assert.equal(tutorial.readingHold(10000), 0);
  // The opponents then play on without stopping again until new copy appears.
  tutorial.runAuto();
  assert.equal(tutorial.view().canContinue, tutorial.view().text !== turn.text);
  assert.ok(readingTime({ title: '', text: '长'.repeat(500) }) <= 8000, 'Long copy is capped');
  assert.ok(readingTime({ title: '等待对手', text: '对手正在行动。' }) >= 1000);
});

test('only the taught action and amount stay live during a guided turn', () => {
  const tutorial = createTutorial(stakesFromSmallBlind(100));
  tutorial.primary();
  assert.equal(tutorial.allows('call'), false, 'Reading a step never lets the hand move on');
  assert.equal(tutorial.next(), true);
  while (tutorial.view().allowed.action !== 'call') {
    if (tutorial.autoDelay() !== null) tutorial.runAuto();
    else tutorial.next();
  }
  assert.equal(tutorial.allows('fold'), false);
  assert.equal(tutorial.allows('raise', 600), false);
  assert.equal(tutorial.allows('call'), true);
  assert.equal(tutorial.next(), false, 'Continue cannot skip a required action');
  tutorial.primary();
  const raising = createTutorial(stakesFromSmallBlind(100));
  raising.primary();
  playLesson(raising);
  raising.primary();
  while (raising.view().allowed.action !== 'raise') {
    if (raising.autoDelay() !== null) raising.runAuto();
    else raising.next();
  }
  const target = raising.view().raiseTarget;
  assert.equal(target, 3 * raising.game.bigBlind);
  assert.equal(raising.allows('raise', target + raising.game.bigBlind), false);
  assert.equal(raising.allows('raise', target), true);
  assert.equal(legalActions(raising.game, 0).enabled, true);
});

test('quizzes block progress until the right answer and then explain it', () => {
  const tutorial = createTutorial(stakesFromSmallBlind(100));
  tutorial.primary();
  while (!tutorial.view().options.length) {
    if (tutorial.autoDelay() !== null) tutorial.runAuto();
    else if (tutorial.view().canContinue) tutorial.next();
    else {
      act(tutorial.game, 0, tutorial.view().allowed.action);
      tutorial.heroActed();
    }
  }
  const question = tutorial.view();
  assert.deepEqual(
    question.options.map((option) => option.text),
    ['顺子', '同花', '一对'],
  );
  assert.equal(tutorial.next(), false);
  assert.equal(tutorial.answer(0), false);
  assert.equal(tutorial.view().options[0].wrong, true);
  assert.notEqual(tutorial.view().text, question.text);
  assert.equal(tutorial.view().canContinue, false);
  assert.equal(tutorial.answer(1), true);
  assert.deepEqual(tutorial.view().options, [], 'A solved quiz gives its space to the explanation');
  assert.equal(tutorial.view().canContinue, true);
  assert.match(tutorial.view().text, /同花顺、四条、葫芦、同花、顺子、三条、两对、一对、高牌/);
});

test('replaying a lesson deals the identical hand from a fresh table', () => {
  const tutorial = createTutorial(stakesFromSmallBlind(100));
  tutorial.primary();
  const first = tutorial.game,
    hole = JSON.stringify(first.players.map((p) => p.hole));
  playLesson(tutorial);
  assert.equal(tutorial.secondary(), 'deal');
  assert.notEqual(tutorial.game, first);
  assert.equal(tutorial.stage, 'lesson');
  assert.equal(JSON.stringify(tutorial.game.players.map((p) => p.hole)), hole);
  assert.equal(tutorial.game.stats.hands, 0);
  assert.equal(potSize(tutorial.game), 300);
});

test('the free hand is unscripted, explains the spot and leads to the finish card', () => {
  const tutorial = createTutorial(stakesFromSmallBlind(100));
  tutorial.primary();
  for (let i = 0; i < TUTORIAL_LESSONS.length; i++) {
    playLesson(tutorial);
    tutorial.primary();
  }
  const game = tutorial.game;
  assert.equal(tutorial.stage, 'free');
  assert.equal(tutorial.guided(), false);
  assert.equal(tutorial.allows('fold'), true);
  assert.equal(tutorial.view().allowed, null);
  assert.equal(game.difficulty, 'easy');
  assert.equal(
    tutorial.view().lessonLabel,
    `第 ${TUTORIAL_TOTAL} / ${TUTORIAL_TOTAL} 手 · 自己打一手`,
  );
  assert.equal(tutorial.next(), false, 'The hand must finish first');
  for (const id of [3, 4, 0, 1, 2]) {
    if (game.phase === 'done') break;
    if (game.actor === 0) {
      assert.match(tutorial.view().text, /你坐在 SB/);
      assert.match(tutorial.view().detail, /跟注要补/);
    }
    act(game, game.actor, id === 2 ? 'check' : 'fold');
  }
  assert.equal(game.phase, 'done');
  assert.equal(tutorial.view().canContinue, true);
  assert.equal(tutorial.next(), true);
  assert.equal(tutorial.stage, 'finish');
  assert.equal(tutorial.view().dialog.primary, '开始真实对局');
  assert.equal(tutorial.primary(), 'exit');
  assert.equal(tutorial.secondary(), 'deal');
  assert.equal(tutorial.stage, 'free');
  assert.notEqual(tutorial.game.dealer, game.dealer, 'Extra free hands keep the button moving');
});

test('the tutorial rule file adds no settlement or legality logic of its own', () => {
  const source = readFileSync(new URL('../../src/engine/tutorial.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.stack\s*[-+]=|\.total\s*[-+]=|\.bet\s*[-+]=|potAtShowdown\s*=/);
  assert.doesNotMatch(source, /\b(?:100|200|20000|600|800)\b(?!')/);
});
