// Official DevTools UI checks. Decision fixtures stay in this external test,
// never in the mini-program or an installed native app.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  bottomPairReview,
  topPairCheckReview,
  aceFourPreflopReview,
} from '../fixtures/bottom-pair-review.js';
import { deckOfCards } from '../../src/engine/poker.js';
import { seatAtTable } from './seat.mjs';
import { getBotProfile } from '../../src/engine/bot-profiles.js';
import {
  causalReraiseGame,
  heroValueGame,
  weakSuitedShove,
  pocketTensRecords,
} from '../fixtures/review-spots.js';
import {
  turnBluffReview,
  turnStraightCallRecord,
  suitedBroadwayFiveBetFold,
  pocketNinesCheckedBoard,
  reportedKeyInfoCall,
  reportedGutshotCall,
  reportedLowConnectorCall,
  reportedFivesAllIn,
} from '../fixtures/review-summary.js';
const root = new URL('../../', import.meta.url).pathname;
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const automator = require('miniprogram-automator');
const output = path.resolve(process.argv[3] || path.join(root, '.artifacts/wechat-review'));
const assignedProfileName = getBotProfile('rook').name;
fs.mkdirSync(output, { recursive: true });
const report = {
  status: 'running',
  platform: 'WeChat DevTools simulator',
  checks: [],
  exceptions: [],
};
const mini = await automator.connect({ wsEndpoint: process.argv[2] || 'ws://127.0.0.1:9461' });
mini.on('exception', (error) => report.exceptions.push(error));
const send = mini.connection.send.bind(mini.connection);
mini.connection.send = async (method, params) => {
  const started = Date.now();
  try {
    return await send(method, params);
  } catch (error) {
    report.failedCommand ||= { method, elapsedMs: Date.now() - started, stage: report.stage };
    throw error;
  }
};
let page;
const stage = (name) => {
  report.stage = name;
  console.log('[wechat-review]', name);
};
const invoke = async (name, arg) => {
  stage(name);
  return mini.evaluate((name, arg) => getCurrentPages().at(-1)[name](arg), name, arg);
};
const wait = async (predicate) => {
  const start = Date.now();
  while (!predicate(await page.data())) {
    if (Date.now() - start > 45000) throw Error('Review UI did not reach expected state');
    await page.waitFor(100);
  }
};
const painted = async (selector) => {
  const started = Date.now();
  let element;
  while (!(element = await page.$(selector))) {
    if (Date.now() - started > 45000) throw Error('Control did not paint: ' + selector);
    await page.waitFor(100);
  }
  return element;
};
const tap = async (selector) => {
  stage('tap ' + selector);
  await (await painted(selector)).tap();
};
const capture = async (name) => {
  await page.waitFor(1450);
  await mini.screenshot({ path: path.join(output, name + '.png') });
};
let savedDecisions;
let savedBotDecisions;
let savedHistory;
let savedLogs;
try {
  stage('initial-page-ready');
  const initialDeadline = Date.now() + 45000;
  // CLI auto can expose its socket before the first page is registered.
  // reLaunch reads that page's metadata, so require a real controller first.
  while (!(await mini.evaluate(() => Boolean(getCurrentPages().slice(-1)[0]?._controller)))) {
    if (Date.now() >= initialDeadline) throw Error('Initial table controller did not become ready');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await mini.reLaunch('/pages/table/table');
  page = await mini.currentPage();
  report.build = JSON.parse(fs.readFileSync(path.join(root, '.artifacts/wechat/build-info.json')));
  assert.equal((await page.data()).guideExpanded[1], true);
  page = await seatAtTable(mini);
  await invoke('closeReview');
  // Settings apply to the next hand; never try to replace an active deal.
  while (!(await page.data()).done) {
    const phase = await mini.evaluate(() => {
      const g = getCurrentPages().at(-1)._controller.getGame();
      return { phase: g.phase, actor: g.actor };
    });
    if (phase.phase === 'playing' && phase.actor === 0)
      await invoke('act', { currentTarget: { dataset: { action: 'fold' } } });
    await invoke('finishHand');
    await wait((data) => data.done || data.canAct);
  }
  const profiles = (await page.data()).profiles;
  await invoke('changeSeat', {
    currentTarget: { dataset: { id: 1 } },
    detail: { value: profiles.findIndex((p) => p.id === 'rook') },
  });
  await invoke('nextHand');
  const start = Date.now();
  while (!(await mini.evaluate(() => getCurrentPages().at(-1)._controller.getGame().actor === 0))) {
    if (Date.now() - start > 45000) throw Error('Real hand did not reach hero');
    await page.waitFor(100);
  }
  await invoke('act', { currentTarget: { dataset: { action: 'fold' } } });
  await invoke('finishHand');
  await wait((data) => data.done);
  // The controller reports settlement before the simulator has finished its
  // card/layout animation. Tap the painted button after that lifecycle settles.
  await page.waitFor(1450);
  stage('real-review-open');
  await tap('.review-button');
  await wait((data) => !data.reviewData.loading && data.selectedReviewStep);
  stage('real-opponent-open');
  await tap('[data-value="opponent"]');
  await wait((data) => data.reviewPerspective === 'opponent' && data.selectedReviewStep?.reason);
  let data = await page.data();
  assert.ok(
    data.opponentOptions.some(
      (name) => name.startsWith('Mia') && name.includes(assignedProfileName),
    ),
  );
  report.checks.push({ name: 'real-assigned-player-name', options: data.opponentOptions });
  for (const index of [
    ...new Set([0, Math.floor(data.reviewSteps.length / 2), data.reviewSteps.length - 1]),
  ]) {
    await tap(`.review-step[data-index="${index}"]`);
    await wait((data) => data.reviewIndex === index);
    data = await page.data();
    assert.ok(data.selectedReviewStep.reason);
    assert.equal(data.selectedReviewStep.metrics, undefined);
    assert.equal(await page.$('.opponent-metrics'), null);
    assert.doesNotMatch(data.selectedReviewStep.reason, /它|EV|模型|模拟器|抽样|价格门槛/);
    assert.equal(await page.$('.review-choice'), null);
    assert.equal(await page.$('.review-detail-header .review-label'), null);
    report.checks.push({ name: 'real-opponent-step-' + index, selected: data.selectedReviewStep });
  }
  await tap('#select-opponent');
  await wait((data) => data.selection?.field === 'opponent');
  assert.ok(
    (await page.data()).selection.options.some(
      (name) => name.startsWith('Mia') && name.includes(assignedProfileName),
    ),
  );
  await capture('assigned-player-options');
  await invoke('closeSelect');
  await invoke('changeOpponentFilter', { detail: { value: '1' } });
  await wait((data) => data.opponentFilter === 1);
  data = await page.data();
  assert.ok(data.reviewSteps.every((step) => data.opponentOptions[1].startsWith(step.name)));
  await capture('opponent');
  assert.equal(
    await (await painted('.review-matchups .module-title')).style('color'),
    'rgb(228, 206, 160)',
  );
  assert.equal(
    await (await painted('.review-analysis-heading')).style('color'),
    'rgb(228, 206, 160)',
  );
  await invoke('closeReview');
  savedDecisions = await mini.evaluate(
    () => getCurrentPages().at(-1)._controller.getGame().decisions,
  );
  savedBotDecisions = await mini.evaluate(
    () => getCurrentPages().at(-1)._controller.getGame().botDecisions,
  );
  savedHistory = await mini.evaluate(() => getCurrentPages().at(-1)._controller.getGame().history);
  savedLogs = await mini.evaluate(() => getCurrentPages().at(-1)._controller.getGame().logs);
  const cards = (text) =>
    text
      .split(' ')
      .map((v) =>
        deckOfCards().find(
          (c) => c.rank === '23456789TJQKA'.indexOf(v[0]) + 2 && c.suit === 'shcd'.indexOf(v[1]),
        ),
      );
  const players = (
    await mini.evaluate(() => getCurrentPages().at(-1)._controller.getGame().players)
  ).map((p) => ({
    id: p.id,
    name: p.name,
    position: p.id === 0 ? 'BTN' : 'BB',
    stack: p.id === 0 ? 4600 : 4475,
    folded: p.id > 1,
    allin: false,
    bet: p.id === 1 ? 125 : 0,
    total: p.id === 0 ? 400 : p.id === 1 ? 525 : p.id === 2 ? 75 : 0,
  }));
  const snapshot = {
    index: 0,
    hand: 1,
    hole: cards('Qd 8h'),
    board: cards('9h 7d 3d Ts'),
    street: 2,
    position: 'BTN',
    stack: 4600,
    total: 400,
    bet: 0,
    pot: 1000,
    currentBet: 125,
    action: 'call',
    amount: 125,
    pending: [0],
    players,
    history: [
      { id: 1, street: 1, action: 'check', amount: 0 },
      { id: 0, street: 1, action: 'check', amount: 0 },
      { id: 1, street: 2, action: 'raise', amount: 125 },
    ],
    legal: {
      enabled: true,
      canCheck: false,
      canRaise: true,
      callAmount: 125,
      toCall: 125,
      minRaiseTo: 250,
      maxRaiseTo: 4600,
    },
  };
  const fixture = async (name, decision, verify) => {
    await invoke('closeReview');
    await mini.evaluate((decision) => {
      const game = getCurrentPages().at(-1)._controller.getGame();
      game.decisions = [decision];
      game.history = [];
    }, decision);
    await invoke('openReview');
    await wait((data) => !data.reviewData.loading && data.selectedReviewStep);
    const step = (await page.data()).selectedReviewStep;
    verify(step);
    assert.equal(await page.$('.review-comparison'), null);
    assert.ok(step.evidence.length >= 4 && (await page.data()).reviewActivity.length > 0);
    assert.equal(Boolean(await page.$('.review-practice-focus')), !step.keep);
    assert.doesNotMatch(step.reason, /EV|模型|模拟器|抽样|新增投入/);
    assert.doesNotMatch(step.evidence.join(''), /有效剩余|新增投入/);
    assert.equal(step.publicResponses, undefined);
    report.checks.push({
      name,
      fixture: 'before-action public snapshot; not an actual deal',
      selected: step,
    });
    await capture(name);
  };
  await fixture('draw-context', snapshot, (step) => {
    assert.equal(step.keep, true);
    assert.match(step.reason, /两头顺听牌/);
    assert.match(step.reason, /125/);
    assert.match(step.reason, /翻牌.*过牌/);
    assert.match(step.reason, /河牌.*诈唬/);
  });
  await fixture('fold-no-future-bluff', { ...snapshot, action: 'fold', amount: 0 }, (step) => {
    assert.doesNotMatch(step.reason, /(?:可以|考虑|比较|再|才).{0,12}(?:转诈唬|河牌诈唬)/);
  });
  const weak = structuredClone(snapshot);
  Object.assign(weak, {
    street: 0,
    hole: cards('4h Td'),
    board: [],
    bet: 300,
    total: 300,
    currentBet: 1325,
    amount: 1025,
    pot: 2125,
    stack: 4700,
  });
  Object.assign(weak.legal, { callAmount: 1025, toCall: 1025, minRaiseTo: 2350, maxRaiseTo: 5000 });
  weak.players.forEach((p) => {
    p.total = p.id === 0 ? 300 : p.id === 1 ? 1325 : p.id === 2 ? 500 : 0;
    p.bet = p.id === 0 ? 300 : p.id === 1 ? 1325 : 0;
  });
  weak.history = [
    { id: 0, street: 0, action: 'raise', amount: 300 },
    { id: 1, street: 0, action: 'raise', amount: 1325 },
  ];
  await fixture('yellow-fold-advice', weak, (step) => {
    assert.equal(step.keep, false);
    assert.equal(step.label, '弃牌');
  });
  const focus = await page.$('.review-practice-focus');
  report.yellowStyle = {
    background: await focus.style('background-color'),
    border: await focus.style('border-left-color'),
  };
  const gold = 'rgb(228, 206, 160)';
  assert.equal(await (await page.$('.review-practice-focus .module-title')).style('color'), gold);
  assert.equal(await (await page.$('.review-analysis-heading')).style('color'), gold);
  assert.equal(await (await page.$('.review-evidence .module-title')).style('color'), gold);
  assert.equal(
    await (await page.$('.review-evidence')).style('background-color'),
    'rgb(22, 39, 43)',
  );
  assert.equal(await (await page.$('.review-sheet')).style('left'), '10px');
  const reviewScroll = await page.$('.review-sheet .sheet-scroll');
  const focusOffset = await focus.offset(),
    scrollOffset = await reviewScroll.offset();
  await reviewScroll.scrollTo(
    0,
    (await reviewScroll.property('scrollTop')) + focusOffset.top - scrollOffset.top - 20,
  );
  await capture('practice-focus-and-evidence-style');

  await fixture('clear-call-information-and-suited-ace', reportedKeyInfoCall(), (step) => {
    assert.match(step.evidence.join(''), /跟注前底池 460K.*底池赔率约 3.29:1/);
    assert.match(step.evidence.join(''), /23.3% 的胜率，风险和收益才能持平/);
    assert.match(step.reason, /你若再加注.*你若只跟注/);
    assert.match(step.reason, /坚果同花听牌.*击中 A.*较弱 Ax/);
    assert.doesNotMatch(step.reason + step.evidence.join(''), /；/);
  });
  await fixture('gutshot-label-and-reason-agree', reportedGutshotCall(), (step) => {
    assert.equal(step.keep, false);
    assert.equal(step.label, '需要比较');
    assert.match(step.reason, /这手需要比较跟注与弃牌/);
    assert.doesNotMatch(step.reason, /这手建议跟注|；/);
  });
  await fixture('reported-low-connector', reportedLowConnectorCall(), (step) => {
    assert.match(step.reason, /同花连接牌.*37.0%.*点数仍偏低.*更高同花.*他们若再加注.*建议弃牌/);
    assert.doesNotMatch(step.reason, /被强 A.*压制|；/);
  });
  await fixture('reported-fives-all-in', reportedFivesAllIn(), (step) => {
    assert.equal(step.label, '值得保留');
    assert.match(step.reason, /全下跟注.*27.0%.*看完剩余公共牌.*值得保留的依据/);
    assert.doesNotMatch(step.reason, /还留.*0|你在翻后有位置|你需要重新决定/);
    const own = step.commentary.filter((part) => part.text).at(-1).text;
    assert.equal((own.match(/1.62M/g) || []).length, 1);
    const matchup = step.commentary.find((part) => part.matchups).matchups;
    assert.equal(matchup.title, '当前牌面');
    assert.equal(matchup.strengthTitle, '当前牌力');
  });
  await fixture('summary-turn-bluff', turnBluffReview(), (step) => {
    assert.match(step.reason, /尝试诈唬.*更好的牌弃掉/);
    assert.doesNotMatch(step.reason, /不能只按成牌标签|此前在翻牌前|相同牌力/);
  });
  await fixture('summary-KQs-five-bet-fold', suitedBroadwayFiveBetFold(), (step) => {
    assert.match(step.reason, /再补 8.3K.*弃牌可以保留.*19K/);
    assert.doesNotMatch(step.reason, /不必只因|是在回应|是在决定/);
    assert.equal(step.commentary.find((part) => part.matchups).matchups.rangeNotes.length, 0);
  });
  await fixture('summary-nines-protection', pocketNinesCheckedBoard(), (step) => {
    assert.match(step.reason, /过牌后.*更小对子.*高张付费/);
    assert.match(step.reason, /高张若弃牌.*免费.*反超/);
  });
  await invoke('closeReview');
  await mini.evaluate((record) => {
    getCurrentPages().at(-1)._controller.getGame().botDecisions = [record];
  }, turnStraightCallRecord());
  await invoke('openReview');
  await wait((data) => !data.reviewData.loading);
  await tap('[data-value="opponent"]');
  await wait((data) => data.reviewPerspective === 'opponent' && data.selectedReviewStep?.reason);
  const straightCall = (await page.data()).selectedReviewStep;
  assert.match(straightCall.reason, /选择跟注 6.3K，当前主要依靠听牌改善争取获胜/);
  assert.match(straightCall.reason, /8 张牌可能补成顺子/);
  assert.doesNotMatch(straightCall.reason, /补成顺子[／或]同花|相同牌力/);
  report.checks.push({ name: 'summary-straight-call', selected: straightCall });
  await capture('summary-straight-call');

  await fixture('reported-52s-shove', weakSuitedShove(), (step) => {
    assert.equal(step.keep, false);
    assert.equal(step.label, '弃牌');
    assert.match(step.reason, /100\s*BB/);
    assert.match(step.reason, /5K/);
    assert.match(step.reason, /225/);
    assert.match(step.reason, /UTG/);
    assert.doesNotMatch(step.reason, /一对|非坚果听牌|先前跟注|单看一张高牌/);
    assert.doesNotMatch(step.evidence.join(''), /40(?:\.0)?%/);
  });
  await fixture('consumer-preflop-ranges', aceFourPreflopReview(), (step) => {
    const section = step.commentary.find((part) => part.matchups).matchups;
    assert.equal(section.groups.length, 1);
    assert.equal(section.groups[0].label, '对手可能牌组');
    assert.deepEqual(section.rangeNotes, []);
    assert.match(step.reason, /Luna在 UTG\+1 位开池到 4K/);
    assert.deepEqual(section.rangeNotes, []);
    assert.match(step.reason, /Jade在 LJ 位跟注了这笔加注/);
    assert.doesNotMatch(step.reason, /结构上较|不代表获胜概率|依据当时记录|旧记录/);
  });
  await fixture('reported-bottom-pair', bottomPairReview(), (step) => {
    const groups = step.commentary.find((paragraph) => paragraph.matchups).matchups.groups;
    assert.equal(groups[0].examples.length, 1);
    assert.equal(groups[1].examples.length, 4);
    assert.match(groups[0].examples[0].label, /同花听牌.*两头顺听牌/);
    assert.ok(groups[1].examples.some((example) => /A.*J/.test(example.text)));
  });
  await invoke('closeReview');
  await mini.evaluate((record) => {
    getCurrentPages().at(-1)._controller.getGame().botDecisions = [record];
  }, topPairCheckReview());
  await invoke('openReview');
  await wait((data) => !data.reviewData.loading);
  await tap('[data-value="opponent"]');
  await wait((data) => data.reviewPerspective === 'opponent' && data.selectedReviewStep?.reason);
  const topPair = (await page.data()).selectedReviewStep;
  assert.match(topPair.reason, /较弱的一对或听牌取值/);
  assert.match(topPair.reason, /过牌也可能是在等后位先下注/);
  assert.match(topPair.reason, /免费看下一张/);
  report.checks.push({ name: 'reported-top-pair-check', selected: topPair });
  await capture('reported-top-pair-check');
  await invoke('closeReview');
  await mini.evaluate((records) => {
    const game = getCurrentPages().at(-1)._controller.getGame();
    game.botDecisions = records;
  }, pocketTensRecords());
  await invoke('openReview');
  await wait((data) => !data.reviewData.loading && data.selectedReviewStep);
  await tap('[data-value="opponent"]');
  await wait((data) => data.reviewPerspective === 'opponent' && data.reviewSteps.length === 2);
  await tap('.review-step[data-index="1"]');
  await wait((data) => data.reviewIndex === 1);
  const tens = (await page.data()).selectedReviewStep;
  const tensText = tens.reason;
  assert.match(tensText, /4.65K/);
  assert.match(tensText, /Kai/);
  assert.equal(tens.metrics, undefined);
  assert.equal(await page.$('.opponent-metrics'), null);
  assert.match(tens.reason, /大对|JJ|QQ|KK|AA/);
  assert.match(tens.reason, /两高张|AK|AQ/);
  assert.doesNotMatch(tensText, /它|EV|模型|模拟器|抽样|价格门槛|71\.7%|48\.1%/);
  report.checks.push({ name: 'reported-TT-call', selected: tens });
  await capture('reported-TT-call');
  await invoke('closeReview');
  const causal = causalReraiseGame();
  await mini.evaluate(
    (fixture) => {
      const game = getCurrentPages().at(-1)._controller.getGame();
      // The external scripted history belongs to this review attempt. Keep
      // the before-action hand IDs aligned without changing the live deal.
      game.decisions = fixture.decisions.map((decision) => ({ ...decision, hand: game.hand }));
      game.botDecisions = fixture.botDecisions;
      game.history = fixture.history;
      game.logs = fixture.logs;
    },
    {
      decisions: causal.decisions,
      botDecisions: causal.botDecisions,
      history: causal.history,
      logs: causal.logs,
    },
  );
  await invoke('openReview');
  await wait((data) => !data.reviewData.loading && data.selectedReviewStep);
  await tap('.review-step[data-index="0"]');
  await wait((data) => data.reviewIndex === 0);
  const hero = (await page.data()).selectedReviewStep;
  assert.match(hero.reason, /350/);
  assert.match(hero.reason, /200/);
  assert.match(hero.reason, /Luna|CO/);
  assert.doesNotMatch(hero.reason, /A[♦♥♣♠]|Q[♦♥♣♠]|EV|模型|模拟器|抽样|新增投入/);
  const responses = (await page.data()).reviewActivity.map((event) => event.text).join('');
  assert.match(responses, /Mia.*1K/);
  assert.match(responses, /Alex.*弃牌/);
  assert.match(responses, /River.*950/);
  assert.match(responses, /Luna.*800/);
  assert.equal(hero.publicResponses, undefined);
  assert.equal((await page.data()).reviewActivityOpen, false);
  await invoke('toggleReviewActivity');
  assert.ok((await page.data()).reviewActivity.some((event) => event.emphasized && event.current));
  const currentActivity = await painted('.review-activity-current');
  assert.match(await currentActivity.style('background-color'), /102,\s*203,\s*177/);
  assert.match(await currentActivity.style('box-shadow'), /3px/);
  const actorRows = await page.$$('.review-activity-emphasis');
  let plainActor;
  for (const row of actorRows)
    if (!(await row.attribute('class')).includes('review-activity-current')) {
      plainActor = row;
      break;
    }
  assert.ok(plainActor);
  assert.match(await plainActor.style('background-color'), /^rgba\(0,\s*0,\s*0,\s*0\)$/);
  assert.ok((await page.$$('.review-activity .activity-position')).length > 0);

  assert.doesNotMatch(hero.evidence.join(''), /有效剩余|新增投入|赔率|权益.*%/);
  report.checks.push({
    name: '69o-actual-public-responses',
    fixture: 'scripted legal engine hand',
    selected: hero,
  });
  await capture('69o-actual-public-responses');
  await tap('[data-value="opponent"]');
  await wait((data) => data.reviewPerspective === 'opponent' && data.reviewSteps.length === 1);
  const mia = (await page.data()).selectedReviewStep;
  assert.match(mia.reason, /Mia/);
  assert.match(mia.reason, /350/);
  assert.match(mia.reason, /1K/);
  assert.match(mia.reason, /975/);
  assert.equal(mia.metrics, undefined);
  assert.doesNotMatch(mia.reason, /它|EV|模型|模拟器|抽样|0\s*人(?:尚可|尚未|还可)行动/);
  assert.equal(await page.$('.opponent-metrics'), null);
  report.checks.push({ name: 'AQo-facing-real-3bet', selected: mia });
  await capture('AQo-facing-real-3bet');
  for (const [kind, index] of [
    ['set-shove', 1],
    ['aa-flat', 0],
  ]) {
    await invoke('closeReview');
    const fixture = heroValueGame(kind);
    await mini.evaluate(
      (fixture) => {
        const game = getCurrentPages().at(-1)._controller.getGame();
        game.decisions = fixture.decisions.map((decision) => ({ ...decision, hand: game.hand }));
        game.botDecisions = [];
        game.history = fixture.history;
        game.logs = fixture.logs;
      },
      { decisions: fixture.decisions, history: fixture.history, logs: fixture.logs },
    );
    await invoke('openReview');
    await wait((data) => !data.reviewData.loading && data.selectedReviewStep);
    await tap(`.review-step[data-index="${index}"]`);
    await wait((data) => data.reviewIndex === index);
    const step = (await page.data()).selectedReviewStep;
    assert.equal(step.keep, true);
    if (kind === 'set-shove') {
      assert.match(step.reason, /暗三条\s*5/);
      assert.match(step.reason, /全下/);
      assert.match(step.reason, /价值|取值/);
      assert.match(step.reason, /能赢.*(?:两对|一对|对子)/);
      assert.match(step.reason, /输给.*三条/);
      assert.match(
        (await page.data()).reviewActivity.map((event) => event.text).join(''),
        /Luna.*全下\s*1K/,
      );
    } else {
      assert.match(step.reason, /埋牌|藏在平跟/);
      assert.match(step.reason, /150/);
      assert.match(step.reason, /领先/);
      assert.match(
        (await page.data()).reviewActivity.map((event) => event.text).join(''),
        /Mia.*弃牌/,
      );
      assert.match(
        (await page.data()).reviewActivity.map((event) => event.text).join(''),
        /Alex.*弃牌/,
      );
    }
    assert.equal(step.ev, undefined);
    assert.doesNotMatch(step.reason, /EV|模型|模拟器|抽样|最终赢家|已经摊牌/);
    assert.equal(step.publicResponses, undefined);
    const rendered = await Promise.all(
      (await page.$$('.review-coaching text')).map((element) => element.text()),
    );
    assert.ok(rendered.join('').includes('复盘分析总结'));
    assert.equal(await page.$('.opponent-metrics'), null);
    report.checks.push({
      name: 'common-hero-' + kind,
      fixture: 'scripted legal engine hand',
      selected: step,
    });
    await capture('common-hero-' + kind);
  }
  await invoke('closeReview');
  const underpair = turnStraightCallRecord();
  underpair.action = 'fold';
  underpair.amount = 0;
  underpair.trace.reason = 'outside-range';
  underpair.trace.view.hole = cards('5c 5s');
  underpair.trace.view.board = cards('Ad Kc 7h 2s');
  await mini.evaluate((record) => {
    getCurrentPages().at(-1)._controller.getGame().botDecisions = [record];
  }, underpair);
  await invoke('openReview');
  await wait((data) => !data.reviewData.loading);
  await tap('[data-value="opponent"]');
  await wait((data) => data.reviewPerspective === 'opponent' && data.selectedReviewStep?.reason);
  const noun = (await page.data()).selectedReviewStep.reason;
  assert.match(noun, /口袋 5，公共牌有更高点数/);
  assert.doesNotMatch(noun, /用口袋 5，公共牌/);
  report.checks.push({ name: 'underpair-noun-and-full-board-description', reason: noun });
  await capture('underpair-clear-noun');
  await invoke('closeReview');
  await invoke('showGuide', 'review-glossary');
  const glossary = await painted('#review-glossary');
  assert.equal((await page.$$('#review-glossary .guide-b')).length, 29);
  const glossaryText = await glossary.text();
  assert.match(glossaryText, /底池赔率／保本胜率/);
  assert.match(glossaryText, /全下只会结束自己的下注选择/);
  assert.match(glossaryText, /主动权／范围优势/);
  assert.match(glossaryText, /胜率／权益／弃牌权益/);
  report.checks.push({ name: 'guide-review-glossary', entries: 29 });
  await capture('guide-review-glossary');
  await invoke('closeGuide');
  assert.equal(report.exceptions.length, 0);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failedStage = report.stage;
  report.error = error.stack;
  throw error;
} finally {
  if (savedDecisions) {
    await invoke('closeReview');
    await mini.evaluate((decisions) => {
      getCurrentPages().at(-1)._controller.getGame().decisions = decisions;
    }, savedDecisions);
    await mini.evaluate((records) => {
      getCurrentPages().at(-1)._controller.getGame().botDecisions = records;
    }, savedBotDecisions);
    await mini.evaluate((history) => {
      getCurrentPages().at(-1)._controller.getGame().history = history;
    }, savedHistory);
    await mini.evaluate((logs) => {
      getCurrentPages().at(-1)._controller.getGame().logs = logs;
    }, savedLogs);
  }
  report.completedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  mini.disconnect();
}
console.log('WeChat contextual review passed:', report.checks.length, 'checks');
