import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadLocale, localizeText } from '../../src/i18n/index.js';

const locales = ['en', 'es', 'it', 'pt'];
afterEach(() => loadLocale('zh-CN'));

const ranking = '牌型从强到弱：同花顺 → 四条 → 葫芦 → 同花 → 顺子 → 三条 → 两对 → 一对 → 高牌';
const categories = ['同花顺', '四条', '葫芦', '同花', '顺子', '三条', '两对', '一对', '高牌'];
const sizing =
  '“最小、½ 底池、底池、全下”是尺度快捷项。无人下注时，半池 / 底池按当前底池计算；面对下注时，先补齐跟注，再按跟注后的底池计算加注增量。金额会取到当前面额的整枚筹码，并满足最小加注与剩余筹码限制；无限注允许超过底池下注。';
const parameters =
  '入池宽度影响起手牌范围；进攻与诈唬影响适合场景的加注概率；跟到底影响边缘跟注；强牌诱导只在安全牌面提高慢打倾向。位置、人数、牌力与合法动作优先于风格。';
const replay =
  '“重打这手牌”保留原底牌、庄位、起始筹码和发牌顺序，从翻牌前重新选择。原结算与统计会撤回，采用最新一次结果；电脑会重新响应你的打法。你已经知道部分牌局，适合练习思路，不能用重打后的盈利证明长期收益。“下一手”则开始新的牌局。';
const hints =
  '牌桌提示提供当前阶段的简短练习提醒。宽屏在右侧提示卡上开关；窄屏在设置中开关，提醒出现在牌桌左上方，可左右滑动阅读，几秒后收起。声音也可在设置中开关。所有设置保存在此设备，重打保留原来的对手风格与情绪。';

test('PR70 guide lists all nine engine categories in order, using the same terms as hand labels', async () => {
  for (const locale of locales) {
    await loadLocale(locale);
    const items = localizeText(ranking).split(': ')[1].split(' → ');
    assert.equal(items.length, 9, locale);
    assert.equal(new Set(items).size, 9, locale);
    assert.deepEqual(
      items,
      categories.map((source) => localizeText(source).toLocaleLowerCase(locale)),
      locale,
    );
  }
});

test('PR70 sizing describes a calculation, denomination and stack limits without requiring a prior Call', async () => {
  const meaning = {
    en: [
      /calculation first includes the call amount/,
      /do not need to press Call first/,
      /current denomination/,
      /minimum raise/,
      /remaining stack/,
      /may exceed the pot/,
    ],
    es: [
      /cálculo incluye primero/,
      /no tienes que pulsar Igualar antes/,
      /denominación actual/,
      /subida mínima/,
      /stack restante/,
      /más que el bote/,
    ],
    it: [
      /calcolo include prima il call/,
      /non devi premere Call prima/,
      /valore delle fiches/,
      /rilancio minimo/,
      /stack rimasto/,
      /più del piatto/,
    ],
    pt: [
      /cálculo inclui primeiro/,
      /não precisa apertar Pagar antes/,
      /denominação atual/,
      /aumento mínimo/,
      /stack restante/,
      /superar o pote/,
    ],
  };
  for (const locale of locales) {
    await loadLocale(locale);
    const text = localizeText(sizing);
    for (const condition of meaning[locale]) assert.match(text, condition, locale);
    assert.doesNotMatch(text, /25|scale short|articolo scale|nota il|Unlimited note/, locale);
  }
});

test('PR70 training help keeps the safe-board and rule-priority limits while removing swimming-pool terms', async () => {
  const boundaries = {
    en: [/only.*strong hands on safe boards/, /legal actions take priority/],
    es: [/solo.*boards seguros/, /acciones legales tienen prioridad/],
    it: [/soltanto su board sicuri/, /azioni legali hanno priorità/],
    pt: [/apenas em boards seguros/, /ações legais têm prioridade/],
  };
  for (const locale of locales) {
    await loadLocale(locale);
    const text = localizeText(parameters);
    assert.doesNotMatch(
      text,
      /swimming|piscina|risks of the scene|riesgos de la escena|rischi della scena|riscos da cena/,
      locale,
    );
    for (const boundary of boundaries[locale]) assert.match(text, boundary, locale);
  }
});

test('PR70 losing at showdown and undealt community cards have accurate states, not unavailable-feature messages', async () => {
  const states = {
    en: [
      'You did not win a pot at showdown in this hand.',
      'Community cards have not been dealt yet',
    ],
    es: [
      'No ganaste ningún bote en el showdown de esta mano.',
      'Aún no se han repartido las cartas comunitarias',
    ],
    it: [
      'Non hai vinto alcun piatto allo showdown di questa mano.',
      'Le carte comuni non sono ancora state distribuite',
    ],
    pt: [
      'Você não ganhou nenhum pote no showdown desta mão.',
      'As cartas comunitárias ainda não foram distribuídas',
    ],
  };
  for (const locale of locales) {
    await loadLocale(locale);
    assert.equal(localizeText('本手摊牌未获得底池。'), states[locale][0], locale);
    assert.equal(localizeText('公共牌尚未发出'), states[locale][1], locale);
    assert.doesNotMatch(localizeText('未获底池'), /puente|potato|poço|ponte/, locale);
  }
});

test('PR70 dynamic activity and result templates preserve names, units and amounts', async () => {
  const blinds = {
    en: 'Alex small blind 100 · Mia big blind 200',
    es: 'Alex ciega pequeña 100 · Mia ciega grande 200',
    it: 'Alex piccolo buio 100 · Mia grande buio 200',
    pt: 'Alex small blind 100 · Mia big blind 200',
  };
  for (const locale of locales) {
    await loadLocale(locale);
    const start = localizeText('第 17 手开始 · 庄家 Alex');
    assert.match(start, /17/);
    assert.match(start, /Alex/);
    assert.doesNotMatch(start, /second|secondo|segundo|house|casa|\p{Script=Han}/u, locale);
    assert.equal(localizeText('Alex 小盲 100 · Mia 大盲 200'), blinds[locale], locale);
    const mood = localizeText('Alex 模拟状态：收紧避险 · 单手净损失至少 25 BB');
    assert.match(mood, /Alex/);
    assert.match(mood, /25 BB/);
    assert.doesNotMatch(mood, /\p{Script=Han}|Perda neto|\{\d+\}/u, locale);
    for (const source of ['+4,3K 筹码', '-4,3K 筹码', 'Alex · 获得 400 筹码']) {
      const text = localizeText(source);
      assert.match(text, /4,3K|400/);
      assert.match(text, locale === 'en' ? /chips/ : locale === 'it' ? /fiches/ : /fichas/);
      assert.doesNotMatch(text, /Cichas|Chippole|Chipão|\{\d+\}/, locale);
    }
  }
});

test('PR70 short replay labels fit the mobile row and full instructions still distinguish a new deal', async () => {
  const result = {
    en: [
      'Replay',
      /original hole cards, button, starting stacks and deck order/,
      /previous payouts and statistics are undone/,
      /Next hand starts a new deal/,
    ],
    es: [
      'Repetir',
      /cartas de mano originales, el botón, los stacks iniciales y el orden de la baraja/,
      /anulan los pagos y las estadísticas anteriores/,
      /Siguiente mano inicia un reparto nuevo/,
    ],
    it: [
      'Rigioca',
      /carte coperte originali, il bottone, gli stack iniziali e l’ordine del mazzo/,
      /premi e le statistiche precedenti vengono annullati/,
      /Mano successiva avvia una nuova distribuzione/,
    ],
    pt: [
      'Rejogar',
      /cartas originais, o botão, as fichas iniciais e a ordem do baralho/,
      /prêmios e as estatísticas anteriores são anulados/,
      /Próxima mão inicia uma nova distribuição/,
    ],
  };
  for (const locale of locales) {
    await loadLocale(locale);
    const [label, ...meanings] = result[locale];
    assert.equal(localizeText('重打本手'), label, locale);
    assert.equal(localizeText('重打'), label, locale);
    assert.ok(label.length <= 8, locale);
    const text = localizeText(replay);
    for (const meaning of meanings) assert.match(text, meaning, locale);
    assert.doesNotMatch(text, /pistas de inicio|pedaços de início|cartoni di buco/, locale);
  }
});

test('PR70 accessible names and relocated hint instructions describe their actual controls and position', async () => {
  const close = {
    en: ['Close settings', 'Close hand review'],
    es: ['Cerrar ajustes', 'Cerrar análisis de la mano'],
    it: ['Chiudi impostazioni', 'Chiudi analisi della mano'],
    pt: ['Fechar configurações', 'Fechar análise da mão'],
  };
  const position = {
    en: /top left of the table/,
    es: /esquina superior izquierda de la mesa/,
    it: /in alto a sinistra sul tavolo/,
    pt: /canto superior esquerdo da mesa/,
  };
  for (const locale of locales) {
    await loadLocale(locale);
    assert.equal(localizeText('关闭设置'), close[locale][0]);
    assert.equal(localizeText('关闭复盘'), close[locale][1]);
    const text = localizeText(hints);
    assert.match(text, position[locale], locale);
    assert.doesNotMatch(text, /left-sweated|\?\?|⁇| ined|retrea|il ritiro/, locale);
  }
});

test('PR70 conditional review branches preserve split-pot meaning and eliminate the named player only', async () => {
  const split = {
    en: /share of a split pot/,
    es: /parte de un bote dividido/,
    it: /quota di un piatto diviso/,
    pt: /parte de um pote dividido/,
  };
  for (const locale of locales) {
    await loadLocale(locale);
    assert.match(
      localizeText('重打时比较能否向更弱成牌取值；公共牌单独成牌时，先考虑平分权益。'),
      split[locale],
      locale,
    );
    const opening = localizeText(
      '重打时比较另一开池尺度，记录盲位继续频率；隔离较黏的跛入者可用较大尺度。',
    );
    assert.match(opening, /limpers?|limper/i, locale);
    assert.doesNotMatch(opening, /blind-bit|fitted|inserzioni/, locale);
    for (const source of [
      '再淘汰一人就进入决赛圈，跟注全下输了Alex就会出局。',
      '决赛圈每多撑过一人名次就会提高，跟注全下输了Alex就会出局。',
    ]) {
      const text = localizeText(source);
      assert.match(text, /Alex/);
      assert.doesNotMatch(
        text,
        /game is over|fin de la partida|partita è finita|fim do jogo|\p{Script=Han}/u,
        locale,
      );
      assert.match(text, /elimin|queda fuera/, locale);
    }
    const count = localizeText('位置 SB，1 位未弃牌对手，无位置优势。');
    assert.match(count, /SB/);
    assert.match(count, /1/);
    assert.doesNotMatch(count, /1 avversari/, locale);
  }
});

test('PR70 new progress, replay dismissal and qualified short-stack copy localize at runtime', async () => {
  const afterCurrent = {
    en: /after this hand plus/,
    es: /tras esta mano y/,
    it: /dopo questa mano \+/,
    pt: /após esta mão e mais/,
  };
  const qualified = {
    en: [/may make it difficult/, /position, price and the legal actions/],
    es: [/puede dificultar/, /posición, el precio y las acciones legales/],
    it: [/possono rendere difficile/, /posizione, prezzo e azioni consentite/],
    pt: [/pode dificultar/, /posição, preço e ações permitidas/],
  };
  const shortStack =
    '短筹码时，小额加注或平跟可能让后续难以弃牌；仍需结合位置、价格和合法动作比较。';
  for (const locale of locales) {
    await loadLocale(locale);
    for (const count of [1, 7]) {
      const text = localizeText(`本手后再打 ${count} 手涨盲`);
      assert.match(text, afterCurrent[locale], locale);
      assert.ok(text.includes(String(count)), locale);
      assert.doesNotMatch(text, /\p{Script=Han}|\{\d+\}/u, locale);
    }
    for (const source of [
      '下一手涨盲',
      '盲注已封顶',
      '关闭本手重打提示',
      '左右滑动查看完整参数',
      '短筹码优先比较全下与弃牌',
    ]) {
      assert.doesNotMatch(localizeText(source), /\p{Script=Han}/u, locale);
    }
    for (const meaning of qualified[locale])
      assert.match(localizeText(shortStack), meaning, locale);
  }
});
