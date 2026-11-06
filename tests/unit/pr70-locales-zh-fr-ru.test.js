import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLocale, localizeText } from '../../src/i18n/index.js';
import { analyzeDecision } from '../../src/review/analysis.js';

afterEach(async () => loadLocale('zh-CN'));

const ranking = '牌型从强到弱：同花顺 → 四条 → 葫芦 → 同花 → 顺子 → 三条 → 两对 → 一对 → 高牌';
const sizing =
  '“最小、½ 底池、底池、全下”是尺度快捷项。无人下注时，半池 / 底池按当前底池计算；面对下注时，先补齐跟注，再按跟注后的底池计算加注增量。金额会取到当前面额的整枚筹码，并满足最小加注与剩余筹码限制；无限注允许超过底池下注。';
const sidepots =
  '全下后只能争夺自己有投入的部分。筹码多的人继续下注会形成边池，各池分别比较；弃牌者已投入的筹码仍留在池里，无法争夺。没有人跟上的超额投入会退还，不能把退款当作额外赢得的筹码。';
const replay =
  '“重打这手牌”保留原底牌、庄位、起始筹码和发牌顺序，从翻牌前重新选择。原结算与统计会撤回，采用最新一次结果；电脑会重新响应你的打法。你已经知道部分牌局，适合练习思路，不能用重打后的盈利证明长期收益。“下一手”则开始新的牌局。';
const cl =
  'chip leader 的缩写，指当前仍在桌上、筹码最多的玩家。CL 会随每手结算变化；决赛圈前，输光后每局最多可补码三次，每次补到当时 CL 筹码的一半；决赛圈不可补码。';
const hints =
  '牌桌提示提供当前阶段的简短练习提醒。宽屏在右侧提示卡上开关；窄屏在设置中开关，提醒出现在牌桌左上方，可左右滑动阅读，几秒后收起。声音也可在设置中开关。所有设置保存在此设备，重打保留原来的对手风格与情绪。';

test('French and Russian rankings retain all nine categories in the correct order', async () => {
  for (const [locale, expected] of Object.entries({
    fr: [
      'quinte flush',
      'carré',
      'full',
      'couleur',
      'quinte',
      'brelan',
      'double paire',
      'paire',
      'carte haute',
    ],
    ru: [
      'стрит-флеш',
      'каре',
      'фулл-хаус',
      'флеш',
      'стрит',
      'тройка',
      'две пары',
      'пара',
      'старшая карта',
    ],
  })) {
    await loadLocale(locale);
    const categories = localizeText(ranking).split(': ').at(-1).split(' → ');
    assert.deepEqual(categories, expected, locale);
  }
});

test('action and sizing guides distinguish free checks from calls and theoretical call sizing', async () => {
  for (const locale of ['zh-TW', 'fr', 'ru']) {
    await loadLocale(locale);
    const value = localizeText(sizing);
    assert.doesNotMatch(value, /\?\?|scale courte|нажмите звонок|25/);
    if (locale !== 'zh-TW') assert.doesNotMatch(value, /\p{Script=Han}/u);
    assert.doesNotMatch(value, /整枚 目前|scale courte|Неограниченная запись/);
    if (locale === 'zh-TW') {
      assert.match(value, /不必先按「跟注」/);
      assert.match(value, /目前籌碼面額的整數倍/);
    } else if (locale === 'fr') {
      assert.match(value, /call théorique/);
      assert.match(value, /ne faut pas cliquer sur « Suivre » d’abord/);
      assert.match(localizeText('无需补筹码时过牌，否则补齐当前下注。'), /aucun jeton à ajouter/);
      assert.equal(localizeText('过牌 / 跟注'), 'Checker / Suivre');
    } else {
      assert.match(value, /условный колл/);
      assert.match(value, /нажимать «Колл» не нужно/);
      assert.match(
        localizeText('无需补筹码时过牌，否则补齐当前下注。'),
        /добавлять фишки не нужно/,
      );
      assert.equal(localizeText('过牌 / 跟注'), 'Чек / Колл');
    }
  }
});

test('side-pot eligibility and refund copy never calls folded players filled players', async () => {
  for (const locale of ['fr', 'ru']) {
    await loadLocale(locale);
    const guide = localizeText(sidepots);
    const detail = localizeText('查看本池投入');
    const pending = localizeText('待跟注或退还');
    assert.doesNotMatch(
      guide + detail + pending,
      /remplies|посуд|бассейн|piscine|звонок|\p{Script=Han}/u,
    );
    if (locale === 'fr') {
      assert.match(guide, /couché.*restent.*ne peut plus/s);
      assert.match(guide, /remboursement n’est pas un gain/);
      assert.match(pending, /call.*remboursement/);
    } else {
      assert.match(guide, /сбросившего.*остаются.*больше не может/s);
      assert.match(guide, /возвращается.*не считается дополнительным выигрышем/s);
      assert.match(pending, /колла.*возврата/);
    }
  }
});

test('replay explains restored cards and retracted statistics, with accurate accessibility names', async () => {
  for (const locale of ['fr', 'ru']) {
    await loadLocale(locale);
    const value = localizeText(replay);
    const names = ['重打本手', '重打这手牌', '关闭设置', '关闭复盘', '查看底池明细'].map(
      localizeText,
    );
    assert.doesNotMatch(
      value + names.join(' '),
      /oreille|déchets|карты дыры|крышку|отслеживает|Ближайшие|Крайний обзор|посуд|\p{Script=Han}/u,
    );
    if (locale === 'fr') {
      assert.match(value, /cartes privatives/);
      assert.match(value, /statistiques.*annulés/s);
      assert.deepEqual(names.slice(0, 2), ['Rejouer', 'Rejouer cette main']);
      assert.equal(names[2], 'Fermer les réglages');
    } else {
      assert.match(value, /карманные карты/);
      assert.match(value, /статистика.*отменяются/s);
      assert.deepEqual(names.slice(0, 2), ['Переиграть', 'Переиграть раздачу']);
      assert.equal(names[2], 'Закрыть настройки');
    }
  }
});

test('review outcomes distinguish not winning a pot from an unavailable showdown', async () => {
  for (const locale of ['fr', 'ru']) {
    await loadLocale(locale);
    const loss = localizeText('本手摊牌未获得底池。');
    const generalLoss = localizeText('本手未获得底池');
    const win = localizeText('本手通过摊牌获得底池。');
    assert.notEqual(loss, win);
    assert.doesNotMatch(loss + generalLoss, /disponible|доступен|décerné|присуждается/);
    if (locale === 'fr') {
      assert.match(loss, /n’avez pas gagné.*abattage/);
      assert.match(generalLoss, /n’avez pas gagné/);
      assert.match(win, /avez gagné.*abattage/);
    } else {
      assert.match(loss, /не выиграли.*вскрытии/);
      assert.match(generalLoss, /не выиграли/);
      assert.match(win, /Вы выиграли.*вскрытии/);
      assert.equal(localizeText('公共牌有对子'), 'На доске есть пара');
      assert.equal(localizeText('+700 筹码'), '+700 фишек');
    }
    assert.doesNotMatch(localizeText('公共牌尚未发出'), /conseil|Совет/);
  }
});

test('whole hand-start and blind log messages preserve actors and amounts', async () => {
  for (const locale of ['fr', 'ru']) {
    await loadLocale(locale);
    const start = localizeText('第 12 手开始 · 庄家 River');
    const blinds = localizeText('River 小盲 100 · Mia 大盲 200');
    assert.match(start, /12/);
    assert.match(start, /River/);
    for (const fact of ['River', '100', 'Mia', '200'])
      assert.ok(blinds.includes(fact), `${locale}: ${fact}`);
    assert.doesNotMatch(start + blinds, /maison|дом|aveugle|слеп|\{\d+\}|\p{Script=Han}/u);
    assert.equal(localizeText('小盲'), locale === 'fr' ? 'Petite blinde' : 'Малый блайнд');
    assert.equal(localizeText('大盲'), locale === 'fr' ? 'Grosse blinde' : 'Большой блайнд');
  }
});

test('the active late-position ace branch preserves AA, AK and AQ in a complete real review reason', async () => {
  const fixture = JSON.parse(
    readFileSync(new URL('../fixtures/review-practice-focus.json', import.meta.url)),
  ).heroes['supported-open'];
  fixture.hole = [
    { rank: 14, suit: 3, symbol: '♦', key: '3-14' },
    { rank: 5, suit: 3, symbol: '♦', key: '3-5' },
  ];
  fixture.history = [];
  fixture.actionContext.enteredIds = [];
  const result = analyzeDecision(fixture, { trials: 20, rollouts: false });
  assert.equal(result.code, 'late-open');
  assert.match(result.reason, /AA、AK、AQ/);
  for (const locale of ['fr', 'ru']) {
    await loadLocale(locale);
    const value = localizeText(result.reason);
    for (const fact of ['AA', 'AK', 'AQ', 'A5', '40K', '2.0 BB', 'CO'])
      assert.ok(value.includes(fact), `${locale}: ${fact}`);
    assert.doesNotMatch(value, /\p{Script=Han}|\{\d+\}|\uE000|\uE001/u);
  }
});

test('active board-only plans describe a shared board hand rather than one card or financial capital', async () => {
  const plans = [
    '重打时比较能否向更弱成牌取值，公共牌单独成牌时，先考虑平分权益。',
    '遇到下注后按实际金额重算，若公共牌单独成牌，先考虑平分权益，不虚构底牌带来的优势。',
  ];
  for (const locale of ['fr', 'ru']) {
    await loadLocale(locale);
    for (const source of plans) {
      const value = localizeText(source);
      assert.doesNotMatch(value, /carte unique|акционер|одной карточкой|\p{Script=Han}/u);
      if (locale === 'fr')
        assert.match(value, /meilleure main.*entièrement sur le tableau.*partage/s);
      if (locale === 'ru')
        assert.match(value, /лучшая комбинация.*целиком лежит на доске.*дележе/s);
    }
  }
});

test('refill limits and new table hints remain localized with the correct visible locations', async () => {
  for (const locale of ['zh-TW', 'fr', 'ru']) {
    await loadLocale(locale);
    const refill = localizeText(cl);
    const hint = localizeText(hints);
    const countdown = localizeText('本手后再打 8 手涨盲');
    assert.notEqual(refill, cl);
    assert.match(refill, /CL/);
    assert.ok(countdown.includes('8'));
    assert.doesNotMatch(hint, /\?\?|clavier|клавиатур/);
    if (locale === 'zh-TW') {
      assert.match(refill, /三次.*一半.*決賽圈不可補碼/);
      assert.match(hint, /牌桌左上方/);
    } else if (locale === 'fr') {
      assert.match(refill, /trois fois.*moitié.*Aucune recharge.*table finale/s);
      assert.match(hint, /haut à gauche/);
      assert.match(countdown, /après celle-ci/);
    } else {
      assert.match(refill, /половины.*трёх раз.*За финальным столом пополнение недоступно/s);
      assert.match(hint, /левом верхнем углу/);
      assert.match(countdown, /после текущей/);
    }
    for (const source of ['下一手涨盲', '盲注已封顶', '关闭本手重打提示', '左右滑动查看完整参数']) {
      assert.notEqual(localizeText(source), source, `${locale}: ${source}`);
    }
  }
});

test('traditional Chinese uses 覆盤 consistently while retaining rejected equity-label designs', async () => {
  await loadLocale('zh-TW');
  for (const source of ['复盘', '复盘这一手', '关闭复盘', '第 12 手 · 决策复盘']) {
    assert.match(localizeText(source), /覆盤/);
    assert.doesNotMatch(localizeText(source), /複盤|復盤/);
  }
  assert.equal(localizeText('胜率'), '勝率');
  assert.equal(localizeText('获胜手数'), '獲勝手數');
  assert.equal(localizeText('翻前起手牌胜率表'), '翻前起手牌勝率表');
});

test('short-stack copy recommends comparison without claiming all-in or fold are the only actions', async () => {
  for (const locale of ['zh-TW', 'fr', 'ru']) {
    await loadLocale(locale);
    const title = localizeText('短筹码优先比较全下与弃牌');
    const detail = localizeText(
      '短筹码时，小额加注或平跟可能让后续难以弃牌；仍需结合位置、价格和合法动作比较。',
    );
    assert.notEqual(title, '短筹码优先比较全下与弃牌');
    assert.doesNotMatch(title + detail, /only|seulement|только|只能/);
    if (locale === 'fr') assert.match(detail, /position.*prix.*autorisées/);
    if (locale === 'ru') assert.match(detail, /позиции.*цены.*допустимых действий/);
    if (locale === 'zh-TW') assert.match(detail, /位置、價格和合法動作/);
  }
});
