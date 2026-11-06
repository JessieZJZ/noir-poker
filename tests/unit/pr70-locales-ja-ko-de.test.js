import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLocale, localizeText } from '../../src/i18n/index.js';
import { act, newGame, startHand } from '../../src/engine/poker.js';
import { compareCandidateActions } from '../../src/review/counterfactual.js';

const locales = ['ja', 'ko', 'de'];
const rankKeys = ['同花顺', '四条', '葫芦', '同花', '顺子', '三条', '两对', '一对', '高牌'];
const ranking = '牌型从强到弱：' + rankKeys.join(' → ');
const catalog = (locale) =>
  JSON.parse(readFileSync(new URL(`../../src/i18n/locales/${locale}.json`, import.meta.url)));
const expectTerms = (value, terms, locale) => {
  for (const term of terms)
    assert.ok(value.includes(term), `${locale}: missing ${term} in ${value}`);
  assert.doesNotMatch(value, /\{\d+\}/, locale);
};

test('PR70 ranking teaches all nine categories in the same order as the example cards', async () => {
  for (const locale of locales) {
    await loadLocale(locale);
    const value = localizeText(ranking);
    const ranks = rankKeys.map((key) => localizeText(key));
    assert.equal(new Set(ranks).size, 9, `${locale}: distinct categories`);
    assert.equal(value.split('→').length, 9, `${locale}: no category omitted`);
    let position = -1;
    for (const rank of ranks) {
      const next = value.indexOf(rank, position + 1);
      assert.ok(next > position, `${locale}: missing or reordered ${rank}`);
      position = next;
    }
    assert.doesNotMatch(value, /直流|完全な家|직선 플래시|전체 집|rechte Flush|volles Haus/);
  }
  await loadLocale('zh-CN');
});

test('PR70 action and pot explanations retain check conditions, folded-player exclusion and refunds', async () => {
  const sidepot =
    '全下后只能争夺自己有投入的部分。筹码多的人继续下注会形成边池，各池分别比较；弃牌者已投入的筹码仍留在池里，无法争夺。没有人跟上的超额投入会退还，不能把退款当作额外赢得的筹码。';
  const terms = {
    ja: {
      action: ['チェック', 'コール'],
      condition: ['追加のチップが不要'],
      pot: [
        'フォールドしたプレイヤー',
        '争えません',
        '超過分は返却',
        '勝ち取ったチップには数えません',
      ],
    },
    ko: {
      action: ['체크', '콜'],
      condition: ['추가로 낼 칩이 없으면'],
      pot: [
        '폴드한 플레이어',
        '팟을 받을 수 없습니다',
        '초과 베팅은 돌려받으며',
        '추가로 딴 칩이 아닙니다',
      ],
    },
    de: {
      action: ['Check', 'Call'],
      condition: ['keine Chips nachzahlen'],
      pot: [
        'gefoldeter Spieler',
        'nicht mehr gewinnen',
        'Überschüsse werden zurückgezahlt',
        'nicht als zusätzlich gewonnene Chips',
      ],
    },
  };
  for (const locale of locales) {
    await loadLocale(locale);
    expectTerms(localizeText('过牌 / 跟注'), terms[locale].action, locale);
    expectTerms(
      localizeText('无需补筹码时过牌，否则补齐当前下注。'),
      terms[locale].condition,
      locale,
    );
    expectTerms(localizeText(sidepot), terms[locale].pot, locale);
    assert.doesNotMatch(localizeText(sidepot), /電話|通話|냄비|전화|Anruf|Pool/);
    expectTerms(localizeText('你可争夺 · 5 人'), ['5'], locale);
    assert.doesNotMatch(localizeText('你可争夺 · 5 人'), /民間人/);
  }
  await loadLocale('zh-CN');
});

test('PR70 replay guide restores the original deal, retracts old results and disclaims long-term proof', async () => {
  const source =
    '“重打这手牌”保留原底牌、庄位、起始筹码和发牌顺序，从翻牌前重新选择。原结算与统计会撤回，采用最新一次结果；电脑会重新响应你的打法。你已经知道部分牌局，适合练习思路，不能用重打后的盈利证明长期收益。“下一手”则开始新的牌局。';
  const terms = {
    ja: [
      '配札順',
      '精算と統計は取り消され',
      '最新の結果',
      '一部のカードを知って',
      '長期的な収益性は証明できません',
      '新しく配り直します',
    ],
    ko: [
      '덱 순서',
      '정산과 통계는 취소',
      '가장 최근 결과',
      '이미 일부 카드를 알고',
      '장기 수익을 증명할 수는 없습니다',
      '새로운 딜',
    ],
    de: [
      'Kartenreihenfolge',
      'Statistiken werden zurückgenommen',
      'neueste Ergebnis',
      'bereits einen Teil der Karten kennst',
      'keine langfristige Profitabilität',
      'neu ausgeteilte Hand',
    ],
  };
  for (const locale of locales) {
    await loadLocale(locale);
    expectTerms(localizeText(source), terms[locale], locale);
    assert.doesNotMatch(localizeText('重打本手'), /手で返す|손을 재생/);
  }
  await loadLocale('zh-CN');
});

test('PR70 real rollout note retains eight samples, sunk costs and non-GTO model limits', async () => {
  const game = newGame(6, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  game.dealer = 2;
  startHand(game, () => 0.42);
  act(game, 0, 'call');
  const before = JSON.stringify(game);
  const note = compareCandidateActions(game.decisions[0], [], { trials: 2 }).note;
  const terms = {
    ja: ['8', '埋没費用', '分割', '返却', 'レンジ／戦略モデルの誤りは含みません', 'GTO', '最適 EV'],
    ko: ['8', '매몰비용', '팟 분배', '반환', '모델의 오류는 포함하지 않습니다', 'GTO', '최적 EV'],
    de: [
      '8',
      'versunkene Kosten',
      'Potteilungen',
      'Rückzahlungen',
      'keine Fehler im Range- oder Strategiemodell',
      'GTO',
      'optimale EV',
    ],
  };
  for (const locale of locales) {
    await loadLocale(locale);
    expectTerms(localizeText(note), terms[locale], locale);
    assert.doesNotMatch(localizeText(note), /잔디|暗黒カード/);
  }
  assert.equal(JSON.stringify(game), before);
  await loadLocale('zh-CN');
});

test('PR70 conditional review keeps blocker, outs and expensive-call direction intact', async () => {
  const blocker = 'A 底牌阻断部分 AA、AK、AQ 组合，后位允许比早位更宽的开池范围。';
  const outs = '当前直接成牌候选 9 张，下一张约 19%，并非保证获胜。';
  const terms = {
    ja: {
      blocker: ['手札の A', '一部減ります', 'レイトポジション'],
      outs: ['9 枚', '19%', '完成しても勝てるとは限りません'],
      stop: ['追加投入をやめて', 'フォールド'],
    },
    ko: {
      blocker: ['홀 카드의 A', '조합 수를 줄여', '레이트 포지션'],
      outs: ['9장', '19%', '완성해도 승리가 보장되지는 않습니다'],
      stop: ['더 투자하지 않고', '폴드'],
    },
    de: {
      blocker: ['Ass', 'reduziert', 'später Position'],
      outs: ['9 Karten', '19%', 'Auch dann ist ein Sieg nicht garantiert'],
      stop: ['eher folden', 'keine weiteren Chips investieren'],
    },
  };
  for (const locale of locales) {
    await loadLocale(locale);
    const value = localizeText(blocker);
    expectTerms(value, ['AA', 'AK', 'AQ', ...terms[locale].blocker], locale);
    assert.doesNotMatch(value, /뒷구멍|구멍 카드|穴カード|Lochkarte|軸/);
    expectTerms(localizeText(outs), terms[locale].outs, locale);
    expectTerms(
      localizeText('在这两种假设下，跟注价格高于估计权益，倾向停止投入。'),
      terms[locale].stop,
      locale,
    );
  }
  await loadLocale('zh-CN');
});

test('PR70 result summaries describe completed outcomes and keep public-only review limits', async () => {
  const terms = {
    ja: {
      won: ['獲得しました'],
      lost: ['獲得できませんでした'],
      public: ['ハンド終了後', '当時の公開情報だけ'],
    },
    ko: {
      won: ['가져왔습니다'],
      lost: ['얻지 못했습니다'],
      public: ['핸드가 끝난 후에만', '당시 공개 정보만'],
    },
    de: {
      won: ['hast den Pot', 'gewonnen'],
      lost: ['keinen Pot gewonnen'],
      public: ['erst nach dem Ende', 'nur die damals öffentlichen Informationen'],
    },
  };
  const source =
    '逐步查看它当时如何判断。底牌在本手结束后才进入这个面板；你的决策评级仍只使用当时公开信息。';
  for (const locale of locales) {
    await loadLocale(locale);
    expectTerms(localizeText('本手通过摊牌获得底池。'), terms[locale].won, locale);
    expectTerms(localizeText('本手摊牌未获得底池。'), terms[locale].lost, locale);
    expectTerms(localizeText(source), terms[locale].public, locale);
    assert.doesNotMatch(
      localizeText('本手摊牌未获得底池。'),
      /利用できません|사용할 수 없습니다|nicht verfügbar/,
    );
  }
  await loadLocale('zh-CN');
});

test('PR70 dynamic logs preserve actors, hand numbers, blind amounts and translated status', async () => {
  const terms = {
    ja: ['ハンド 12', 'ボタン'],
    ko: ['12번째 핸드', '버튼'],
    de: ['Hand 12', 'Button'],
  };
  for (const locale of locales) {
    await loadLocale(locale);
    expectTerms(localizeText('第 12 手开始 · 庄家 Alex'), [...terms[locale], 'Alex'], locale);
    assert.equal(localizeText('Alex 小盲 100 · Mia 大盲 200'), 'Alex SB 100 · Mia BB 200');
    const mood = localizeText('Alex 模拟状态：谨慎 · 大额亏损');
    expectTerms(mood, ['Alex'], locale);
    assert.doesNotMatch(mood, /模拟状态|Simulationstaat/);
  }
  await loadLocale('zh-CN');
});

test('PR70 new countdown, local saving and close names identify the intended object', async () => {
  const cl =
    'chip leader 的缩写，指当前仍在桌上、筹码最多的玩家。CL 会随每手结算变化；决赛圈前，输光后每局最多可补码三次，每次补到当时 CL 筹码的一半；决赛圈不可补码。';
  const terms = {
    ja: {
      count: ['このハンド終了後', 'さらに 4 ハンド'],
      close: ['設定を閉じる'],
      save: ['自動保存', '次のハンド', '元の設定'],
      cl: ['すべてのチップを失った', '3 回', '半分', 'ファイナルテーブルでは補充できません'],
    },
    ko: {
      count: ['이번 핸드 종료 후', '4핸드를 더'],
      close: ['설정 닫기'],
      save: ['자동 저장', '다음 핸드', '원래 설정'],
      cl: ['칩을 모두 잃었을 때', '3번', '절반', '파이널 테이블에서는 보충할 수 없습니다'],
    },
    de: {
      count: ['Nach dieser Hand', 'noch 4 Hände'],
      close: ['Einstellungen schließen'],
      save: ['automatisch gespeichert', 'nächsten Hand', 'ursprünglichen Einstellungen'],
      cl: ['Verlust aller Chips', 'dreimal', 'Hälfte', 'Am Finaltisch ist kein Auffüllen möglich'],
    },
  };
  for (const locale of locales) {
    await loadLocale(locale);
    expectTerms(localizeText('本手后再打 4 手涨盲'), terms[locale].count, locale);
    expectTerms(localizeText('关闭设置'), terms[locale].close, locale);
    expectTerms(
      localizeText('设置自动保存。难度立即生效；风格与情绪下一手生效，当前手与重打保持原设置。'),
      terms[locale].save,
      locale,
    );
    expectTerms(localizeText(cl), ['chip leader', 'CL', ...terms[locale].cl], locale);
    assert.notEqual(localizeText('关闭本手重打提示'), localizeText('关闭设置'));
    const d = catalog(locale);
    for (const key of [
      '下一手涨盲',
      '盲注已封顶',
      '关闭本手重打提示',
      '左右滑动查看完整参数',
      '短筹码优先比较全下与弃牌',
    ]) {
      assert.equal(localizeText(key), d[key], `${locale}: overridden new shared message`);
    }
  }
  await loadLocale('zh-CN');
});
