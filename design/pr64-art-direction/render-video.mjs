import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import path from 'node:path';
import { themes, devices, base, edition } from './manifest.mjs';
import { soundSamples, SOUND_SAMPLE_RATE, limitSoundMix } from '../../src/ui/sound-cues.js';
import {
  ceremonySamples,
  ceremonyWav,
  CEREMONY_SAMPLE_RATE,
} from '../../src/ui/ceremony-sounds.js';
import { premiumSparks, confettiPieces, refillCountValues } from '../../src/ui/effect-layouts.js';
import {
  newGame,
  startHand,
  act,
  advanceStreet,
  evaluate,
  deckOfCards,
  potSize,
  rankText,
  legalActions,
} from '../../src/engine/poker.js';

// Isolated design capture. The production app, source assets and V1 outputs are never written.
const args = new Set(process.argv.slice(2));
const artifactRoot = path.resolve('.artifacts/art-direction-pr64/green-v2');
const out = path.join(artifactRoot, 'videos');
const fps = 24,
  duration = 36;
const host = process.env.NOIR_DESIGN_URL || 'http://127.0.0.1:4394';
const sha = (value) => createHash('sha256').update(value).digest('hex');
const motion = (theme) => ({
  wager: Math.min(0.42, theme.duration / 1000),
  collect: Math.min(0.46, theme.duration / 1000 + 0.04),
  award: Math.min(0.5, theme.duration / 1000 + 0.07),
  flip: theme.id === 'salon' ? 0.3 : theme.id === 'polar' ? 0.22 : 0.26,
});
const chapters = [
  { id: 'core', at: 0, until: 22, screen: 'table9', label: '九人桌 · 发牌与单手结算' },
  { id: 'strong', at: 22, until: 25, screen: 'strong-hand', label: '强起手牌' },
  { id: 'emotion', at: 25, until: 27, screen: 'emotion', label: '四类情绪' },
  { id: 'rebuy', at: 27, until: 29, screen: 'rebuy', label: '补充虚拟筹码' },
  { id: 'champion', at: 29, until: 33, screen: 'champion', label: '本局冠军' },
  { id: 'farewell', at: 33, until: 36, screen: 'eliminated', label: '本局出局' },
];
const timeline = [
  {
    at: 0,
    until: 3,
    label: '发两轮底牌',
    action: '真实座位锚点与240ms卡牌飞行，60ms错开',
    sound: 'deal',
    soundAt: [0.08, 0.62],
  },
  {
    at: 3,
    until: 6,
    label: '公共牌翻面',
    action: '牌背、薄侧边、正面；保留象牙卡面与绿色材质',
    sound: 'deal',
    soundAt: [3.12, 4.18, 4.88],
  },
  {
    at: 6,
    until: 9,
    label: '本人行动',
    action: '价格与稳定绿边，不移动按钮',
    sound: null,
    soundAt: [],
  },
  {
    at: 9,
    until: 12,
    label: '下注到桌内',
    action: '本人下注、对手跟注；筹码先停在各自下注区',
    sound: 'chip',
    soundAt: [],
  },
  {
    at: 12,
    until: 15,
    label: '街末收池',
    action: '两个下注区的筹码实际汇聚至中央底池',
    sound: 'chip',
    soundAt: [],
  },
  {
    at: 15,
    until: 18,
    label: '摊牌翻面',
    action: '仅示例摊牌参与者亮牌，其他对手保持牌背',
    sound: 'deal',
    soundAt: [15.12],
  },
  {
    at: 18,
    until: 20,
    label: '最佳五张与牌型',
    action: '引擎判定的五张牌薄绿金边；A一对与Q踢脚',
    sound: 'win',
    soundAt: [18.12],
  },
  {
    at: 20,
    until: 22,
    label: '筹码发给赢家',
    action: '中心筹码沿本人牌外侧收至余额锚点，整筹码计数守恒',
    sound: 'chip',
    soundAt: [],
  },
  {
    at: 22,
    until: 25,
    label: '强起手牌',
    action: '原2.6秒紫色牌缘与稀疏火花',
    sound: null,
    soundAt: [],
  },
  { at: 25, until: 27, label: '情绪', action: '现有四类图标与头像环', sound: null, soundAt: [] },
  {
    at: 27,
    until: 29,
    label: '补码',
    action: '1.3秒补码，原共享十阶计数',
    sound: null,
    soundAt: [],
  },
  {
    at: 29,
    until: 33,
    label: '冠军',
    action: '2.3秒金冠、3.8秒双侧撒花',
    sound: 'champion',
    soundAt: [29],
  },
  { at: 33, until: 36, label: '出局', action: '2.8秒灰卡与淡环', sound: 'farewell', soundAt: [33] },
];
const keyframes = [
  [0.65, 'deal-flight'],
  [1.4, 'deal-landed'],
  [3.22, 'flip-edge'],
  [6.5, 'turn'],
  [9.25, 'wager-flight'],
  [10.75, 'wagers-on-table'],
  [12.3, 'collect-flight'],
  [13, 'pot-collected'],
  [15.23, 'showdown-flip'],
  [15.7, 'showdown-open'],
  [18.6, 'winner-best-five'],
  [18.9, 'winner-rays-peak'],
  [20.22, 'award-flight'],
  [21.1, 'award-landed'],
  [22.8, 'strong'],
  [25.65, 'emotion'],
  [27.5, 'rebuy'],
  [30.1, 'champion'],
  [32, 'crowned'],
  [34.1, 'farewell'],
];
const sourcePaths = [
  'screen.mjs',
  'screen.css',
  'green-art.css',
  'scene-layout.mjs',
  'art/room-jade-v2.webp',
  'art/room-salon-v2.webp',
  'art/room-polar-v2.webp',
  'art/felt-emerald-v2.webp',
  'art/leather-rail-v2.webp',
];
const frozenSources = Object.fromEntries(
  await Promise.all(
    sourcePaths.map(async (file) => {
      const data = await readFile(path.join('design/pr64-art-direction', file));
      return ['/' + file, { file, sha256: sha(data), bytes: data.length }];
    }),
  ),
);
const sourceFingerprints = Object.values(frozenSources);
await mkdir(out, { recursive: true });

function wav(samples) {
  const pcm = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) =>
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(0.999969, v)) * 32768), i * 2),
  );
  const h = Buffer.alloc(44);
  h.write('RIFF');
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SOUND_SAMPLE_RATE, 24);
  h.writeUInt32LE(SOUND_SAMPLE_RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
function cueSamples(kind) {
  if (!['champion', 'farewell'].includes(kind)) return soundSamples(kind);
  const source = ceremonySamples(kind),
    ratio = SOUND_SAMPLE_RATE / CEREMONY_SAMPLE_RATE,
    result = new Float32Array(Math.round(source.length * ratio));
  for (let i = 0; i < result.length; i++) {
    const p = i / ratio,
      a = Math.floor(p),
      f = p - a;
    result[i] = source[a] * (1 - f) + (source[Math.min(a + 1, source.length - 1)] || 0) * f;
  }
  return result;
}
const sourceCues = {};
for (const kind of ['deal', 'chip', 'check', 'win', 'champion', 'farewell']) {
  const ceremony = ['champion', 'farewell'].includes(kind),
    data = cueSamples(kind),
    bytes = ceremony ? Buffer.from(ceremonyWav(kind)) : wav(data);
  await writeFile(path.join(out, `source-${kind}.wav`), bytes);
  sourceCues[kind] = {
    module: ceremony ? 'src/ui/ceremony-sounds.js' : 'src/ui/sound-cues.js',
    duration: data.length / SOUND_SAMPLE_RATE,
    sourceSampleRate: ceremony ? CEREMONY_SAMPLE_RATE : SOUND_SAMPLE_RATE,
    gain: 1,
    wavSha256: sha(bytes),
  };
}
function themeTimeline(theme) {
  const m = motion(theme);
  return timeline.map((event) =>
    event.at === 9
      ? { ...event, soundAt: [9.1 + m.wager, 10.1 + m.wager] }
      : event.at === 12
        ? { ...event, soundAt: [12.1 + m.collect] }
        : event.at === 20
          ? { ...event, soundAt: [20 + m.award] }
          : event,
  );
}
async function soundtrack(theme, device) {
  const source = `public/audio/background-music${device === 'ios' ? '-mobile' : ''}.m4a`,
    events = themeTimeline(theme);
  const decoded = execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      source,
      '-t',
      String(duration),
      '-f',
      'f32le',
      '-ac',
      '1',
      '-ar',
      String(SOUND_SAMPLE_RATE),
      'pipe:1',
    ],
    { maxBuffer: 12 * 1024 * 1024 },
  );
  const mixed = new Float32Array(SOUND_SAMPLE_RATE * duration);
  for (let i = 0; i < mixed.length; i++) {
    const t = i / SOUND_SAMPLE_RATE,
      fade = Math.min(1, t / 2.4) * Math.min(1, Math.max(0, (duration - t) / 0.45));
    mixed[i] = i * 4 + 4 <= decoded.length ? decoded.readFloatLE(i * 4) * fade : 0;
  }
  for (const event of events)
    if (event.sound) {
      const cue = cueSamples(event.sound);
      for (const time of event.soundAt) {
        const offset = Math.round(time * SOUND_SAMPLE_RATE);
        for (let i = 0; i < cue.length && i + offset < mixed.length; i++)
          mixed[i + offset] += cue[i];
      }
    }
  let peak = 0;
  for (let i = 0; i < mixed.length; i++) {
    mixed[i] = limitSoundMix(mixed[i]);
    peak = Math.max(peak, Math.abs(mixed[i]));
  }
  const file = path.join(out, `${theme.id}-${device}-soundtrack.wav`);
  await writeFile(file, wav(mixed));
  return {
    file,
    timeline: events,
    bgmSource: source,
    bgmSha256: sha(await readFile(source)),
    backgroundGain: 1,
    fadeInSeconds: 2.4,
    actionDucking: false,
    peak,
  };
}
const audio = {};
for (const theme of themes) {
  audio[theme.id] = {};
  for (const device of ['desktop', 'ios'])
    audio[theme.id][device] = await soundtrack(theme, device);
}

// Amounts, legal actions, winners and the best five come from the existing engine.
// This fixed design example is not a production fixture or a natural complete hand replay.
function coreFixture(count, visible) {
  const deck = deckOfCards(),
    parse = (c) => {
      const rank = { A: 14, K: 13, Q: 12, J: 11, T: 10 }[c.rank] || Number(c.rank);
      const card = deck.find((x) => x.rank === rank && x.symbol === c.suit);
      if (!card) throw Error('Invalid visual card');
      return { ...card };
    };
  const hole = visible.hole.map(parse),
    board = visible.board.map(parse),
    villain = [
      { rank: 'K', suit: '♠' },
      { rank: 'J', suit: '♦' },
    ].map(parse);
  if (new Set([...hole, ...board, ...villain].map((c) => c.key)).size !== 9)
    throw Error('Duplicated cards in design showdown');
  const blindGame = newGame(count);
  startHand(blindGame);
  const snapshot = (g) => ({
    stacks: g.players.map((p) => p.stack),
    pot: potSize(g),
    phase: g.phase,
    actor: g.actor,
  });
  const blind = snapshot(blindGame),
    g = newGame(count),
    unit = g.chipUnit,
    amount = g.bigBlind * 3;
  g.dealer = 0;
  g.street = 3;
  g.phase = 'playing';
  g.hand = 12;
  g.board = board;
  g.actor = 0;
  g.pending = [0];
  for (const p of g.players) {
    p.folded = ![0, 2].includes(p.id);
    p.total = [0, 2].includes(p.id) ? amount : 0;
    p.stack = g.stakes.startingStack - p.total;
    p.hole = p.id === 0 ? hole : p.id === 2 ? villain : [];
  }
  g.players[2].checked = true;
  g.players[2].actedTo = 0;
  const before = snapshot(g),
    legalBefore = legalActions(g);
  act(g, 0, 'raise', amount);
  const afterHero = snapshot(g);
  act(g, 2, 'call');
  const afterCall = snapshot(g);
  advanceStreet(g);
  const paid = { stacks: g.players.map((p) => p.stack), pot: 0, phase: g.phase, actor: g.actor };
  const total = g.stakes.startingStack * count;
  for (const state of [blind, before, afterHero, afterCall, paid]) {
    if (state.stacks.reduce((s, n) => s + n, 0) + state.pot !== total)
      throw Error('Design fixture does not conserve chips');
    if ([...state.stacks, state.pot].some((n) => n % unit))
      throw Error('Design fixture has fractional chips');
  }
  const best = evaluate([...hole, ...board]),
    award = g.payouts[0];
  if (best.score[0] !== 1 || !g.winners.some((w) => w.id === 0))
    throw Error('Current design must be the verified one-pair winner example');
  return {
    count,
    unit,
    startingStack: g.stakes.startingStack,
    total,
    amount,
    legalBefore,
    blind,
    before,
    afterHero,
    afterCall,
    paid,
    award,
    hole,
    board,
    villain,
    bestFive: best.cards.map((c) => c.key),
    bestLabel: `${rankText(best.score[1])} ${best.label}`,
    kicker: `${rankText(best.score[2])} 踢脚`,
    engine: 'src/engine/poker.js · act / advanceStreet / evaluate',
    legalActionsVerified: true,
    chipConservationVerified: true,
  };
}

function installCoreMotion({ fixture, motion: m }) {
  const arena = document.querySelector('.felt-area'),
    ar = arena.getBoundingClientRect(),
    small = innerWidth <= 600;
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: r.x - ar.x,
      y: r.y - ar.y,
      width: r.width,
      height: r.height,
      cx: r.x - ar.x + r.width / 2,
      cy: r.y - ar.y + r.height / 2,
    };
  };
  const clamp = (n) => Math.max(0, Math.min(1, n)),
    ease = (p) => 1 - Math.pow(1 - clamp(p), 3),
    lerp = (a, b, p) => a + (b - a) * p;
  const point = (a, b, c, p) => ({
    x: (1 - p) ** 2 * a.x + 2 * (1 - p) * p * b.x + p * p * c.x,
    y: (1 - p) ** 2 * a.y + 2 * (1 - p) * p * b.y + p * p * c.y,
  });
  const layer = document.createElement('div');
  layer.className = 'motion-object-layer';
  arena.append(layer);
  const originalBoard = [...arena.querySelectorAll('.board>.card')],
    heroCards = [...arena.querySelectorAll('.hero-cards>.card')],
    seats = [...arena.querySelectorAll('.seat')],
    seatCards = seats.map((s) => [...s.querySelectorAll('.opponent-cards>.card')]);
  const heroRect = rect(arena.querySelector('.hero-cards')),
    heroLabel = rect(arena.querySelector('.hero-label')),
    boardRect = rect(arena.querySelector('.board')),
    potRect = rect(arena.querySelector('.pot')),
    poolOriginal = arena.querySelector('.pot-chips'),
    poolRect = poolOriginal ? rect(poolOriginal) : null;
  const players = seats.map((s) => rect(s.querySelector('.player'))),
    critical = [
      ...arena.querySelectorAll(
        '.player,.seat-action,.hero-cards,.hero-label,.board>.card,.pot,.table-caption',
      ),
    ].map(rect);
  const chipSize = small ? 22 : 32,
    poolWidth = small ? 72 : 104,
    poolHeight = small ? 30 : 44;
  const candidates = [
    ...(poolRect && poolRect.width > 0 && poolRect.height > 0
      ? [{ x: poolRect.cx, y: poolRect.cy }]
      : []),
    { x: boardRect.cx, y: boardRect.y + boardRect.height + 34 },
    { x: potRect.x - 30, y: potRect.cy },
    { x: potRect.x + potRect.width + 30, y: potRect.cy },
    { x: potRect.cx, y: potRect.y - 24 },
  ];
  const overlap = (a, b) =>
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const score = (p) => {
    const box = {
      x: p.x - poolWidth / 2,
      y: p.y - poolHeight / 2,
      width: poolWidth,
      height: poolHeight,
    };
    return (
      critical.reduce((s, r) => s + overlap(box, r), 0) * 10 +
      (box.x < 0 || box.y < 0 || box.x + box.width > ar.width || box.y + box.height > ar.height
        ? 1e6
        : 0) +
      Math.abs(p.y - (poolRect?.cy || boardRect.y + boardRect.height + 32))
    );
  };
  const pool = candidates.sort((a, b) => score(a) - score(b))[0];
  const deckPoint = { x: ar.width / 2, y: Math.max(26, ar.height * 0.09) };
  const sourceBack = arena.querySelector('.opponent-cards>.back'),
    sourceFace = heroCards[0],
    sourceChip = arena.querySelector('.chip');
  const tokens = (amount) => {
    const out = [];
    while (amount > 0) {
      const value = amount >= fixture.unit * 5 ? fixture.unit * 5 : fixture.unit;
      out.push(value);
      amount -= value;
    }
    return out;
  };
  function makePile(amount, size = chipSize, columns = 4) {
    const el = document.createElement('div');
    el.className = 'motion-chip-pile';
    layer.append(el);
    const values = tokens(amount),
      step = size * 0.75,
      width = Math.min(columns, values.length) * step;
    values.forEach((value, i) => {
      const c = sourceChip.cloneNode(true);
      c.className = 'chip';
      c.style.cssText = `position:absolute;left:${(i % columns) * step - width / 2}px;top:${-size / 2 - Math.floor(i / columns) * 3}px;width:${size}px;height:${size}px;margin:0`;
      const inner = c.querySelector('i');
      inner.textContent = value;
      inner.style.cssText = `width:${size * 0.7}px;height:${size * 0.7}px;font-size:${Math.max(5, size * 0.24)}px`;
      el.append(c);
    });
    return el;
  }
  function placePile(el, p, scale = 1, opacity = 1) {
    el.style.transform = `translate(${p.x}px,${p.y}px) scale(${scale})`;
    el.style.opacity = opacity;
  }
  function normalizeFace(node, w, h) {
    // Filters may flatten a 3D subtree. Choose the displayed face explicitly
    // instead of relying on browser-specific backface culling.
    node.style.cssText = `position:absolute;inset:0;width:${w}px!important;height:${h}px!important;margin:0;transform:none;backface-visibility:visible`;
    if (!node.classList.contains('back')) {
      for (const [s, styles] of Object.entries({
        b: `font-size:${w * 0.36}px;left:${w * 0.11}px;top:${w * 0.08}px`,
        i: `font-size:${w * 0.25}px;left:${w * 0.12}px;top:${w * 0.48}px`,
        em: `font-size:${w * 0.59}px;right:${w * 0.12}px;bottom:${w * 0.17}px`,
        small: `font-size:${w * 0.16}px`,
      }))
        node.querySelector(s).style.cssText = styles;
    }
    return node;
  }
  function objectCard(original, frontCard = null) {
    const r = rect(original),
      w = original.offsetWidth,
      h = original.offsetHeight,
      computed =
        getComputedStyle(original).transform === 'none'
          ? new DOMMatrix()
          : new DOMMatrix(getComputedStyle(original).transform),
      angle = (Math.atan2(computed.b, computed.a) * 180) / Math.PI;
    const el = document.createElement('div');
    el.className = 'motion-card-object';
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    const back = normalizeFace(sourceBack.cloneNode(true), w, h);
    back.style.transform = 'translateZ(1px)';
    el.append(back);
    let face = null;
    if (!original.classList.contains('back') || frontCard) {
      face = normalizeFace(
        (original.classList.contains('back') ? sourceFace : original).cloneNode(true),
        w,
        h,
      );
      face.classList.remove('back');
      if (frontCard) {
        face.classList.toggle('red', ['♥', '♦'].includes(frontCard.symbol));
        face.querySelector('b').textContent = rankTextBrowser(frontCard.rank);
        face.querySelector('small').textContent = rankTextBrowser(frontCard.rank);
        face.querySelector('i').textContent = frontCard.symbol;
        face.querySelector('em').textContent = frontCard.symbol;
      }
      face.style.transform = 'rotateY(180deg) translateZ(1px)';
      el.append(face);
    }
    layer.append(el);
    return { el, original, r, w, h, angle, face, back };
  }
  function rankTextBrowser(rank) {
    return { 14: 'A', 13: 'K', 12: 'Q', 11: 'J' }[rank] || String(rank);
  }
  function placeCard(o, p, flip = 0, angle = o.angle, lift = 0) {
    o.back.style.display = o.face && flip >= 90 ? 'none' : 'block';
    if (o.face) o.face.style.display = flip >= 90 ? 'block' : 'none';
    o.el.dataset.flipDegrees = flip;
    o.el.style.transform = `translate(${p.x - o.w / 2}px,${p.y - o.h / 2 - lift}px) perspective(700px) rotateZ(${angle}deg) rotateY(${flip}deg)`;
    o.el.style.filter = `drop-shadow(0 ${3 + lift * 0.2}px ${4 + lift * 0.35}px #0008)`;
  }
  const deal = [];
  for (let round = 0; round < 2; round++) {
    for (const cards of seatCards) deal.push(objectCard(cards[round]));
    deal.push(objectCard(heroCards[round]));
  }
  const flips = originalBoard.map((c) => objectCard(c)),
    villain = seatCards[1].map((c, i) => objectCard(c, fixture.villain[i]));
  const defenderPlayer = seats[1].querySelector('.player'),
    defenderRect = rect(defenderPlayer);
  const nameNode = seats[1].querySelector('.identity>strong'),
    stackNode = seats[1].querySelector('.identity>b');
  const originalHudFonts = {
    name: getComputedStyle(nameNode).fontSize,
    stack: getComputedStyle(stackNode).fontSize,
  };
  const fanBand = {
    left: Math.min(...villain.map((o) => o.r.x)),
    right: Math.max(...villain.map((o) => o.r.x + o.r.width)),
  };
  const upperHudRects = [...arena.querySelectorAll('.player,.seat-action')]
    .map(rect)
    .filter(
      (r) =>
        r.y + r.height <= defenderRect.y && r.x < fanBand.right && r.x + r.width > fanBand.left,
    );
  const upperLimit = Math.max(0, ...upperHudRects.map((r) => r.y + r.height));
  const revealLayer = document.createElement('div');
  revealLayer.className = 'motion-opponent-reveal-layer';
  arena.insertBefore(revealLayer, layer);
  villain.forEach((o) => {
    o.el.dataset.role = 'showdown-opponent';
    revealLayer.append(o.el);
    const radians = (Math.abs(o.angle) * Math.PI) / 180,
      ratio = o.w / o.h;
    const available = defenderRect.y - 4 - upperLimit - 2;
    const height = Math.min(
      small ? 28 : o.h,
      available / (Math.cos(radians) + ratio * Math.sin(radians)),
    );
    o.h = height;
    o.w = height * ratio;
    o.el.style.width = o.w + 'px';
    o.el.style.height = o.h + 'px';
    normalizeFace(o.back, o.w, o.h);
    o.back.style.transform = 'translateZ(1px)';
    normalizeFace(o.face, o.w, o.h);
    o.face.style.transform = 'rotateY(180deg) translateZ(1px)';
    o.face.querySelector('b').style.fontSize = '9px';
    o.face.querySelector('i').style.fontSize = '7px';
    const boundsHeight = o.h * Math.cos(radians) + o.w * Math.sin(radians);
    o.fanTarget = { x: o.r.cx, y: defenderRect.y - 4 - boundsHeight / 2 };
  });
  function hudReadability() {
    const textRects = (node) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT),
        out = [];
      let text;
      while ((text = walker.nextNode()))
        if (text.textContent.trim()) {
          const range = document.createRange();
          range.selectNodeContents(text);
          for (const r of range.getClientRects())
            out.push({ x: r.x - ar.x, y: r.y - ar.y, width: r.width, height: r.height });
        }
      return out;
    };
    const ranges = { name: textRects(nameNode), stack: textRects(stackNode) },
      cards = villain.map((o) => rect(o.el));
    const hits = Object.values(ranges)
      .flat()
      .every((r) => {
        const el = document.elementFromPoint(ar.x + r.x + r.width / 2, ar.y + r.y + r.height / 2);
        return el && defenderPlayer.contains(el);
      });
    return {
      nameText: nameNode.textContent,
      stackText: stackNode.textContent,
      textRanges: ranges,
      cardRects: cards,
      playerRect: defenderRect,
      upperHudRects,
      nameAndStackClear: Object.values(ranges)
        .flat()
        .every((r) => cards.every((c) => overlap(r, c) === 0)),
      upperHudClear: cards.every((c) => upperHudRects.every((r) => overlap(c, r) === 0)),
      elementHitPass: hits,
      fontsUnchanged:
        getComputedStyle(nameNode).fontSize === originalHudFonts.name &&
        getComputedStyle(stackNode).fontSize === originalHudFonts.stack,
      fonts: originalHudFonts,
    };
  }
  const blindPile = makePile(fixture.blind.pot),
    basePile = makePile(fixture.before.pot),
    fullPile = makePile(fixture.afterCall.pot),
    awardPile = makePile(fixture.afterCall.pot);
  const heroWager = makePile(fixture.amount, small ? 18 : 28, 2),
    villainWager = makePile(fixture.amount, small ? 18 : 28, 2);
  if (poolOriginal) poolOriginal.style.opacity = '0';
  const rightPlayers = players.filter(
      (r) => r.x > heroRect.cx && r.y + r.height > heroRect.y && r.y < heroRect.y + heroRect.height,
    ),
    rightLimit = rightPlayers.length ? Math.min(...rightPlayers.map((r) => r.x)) : ar.width - 14;
  const corridorX = Math.max(
    heroRect.x + heroRect.width + 15,
    Math.min(rightLimit - 16, (heroRect.x + heroRect.width + rightLimit) / 2),
  );
  const heroStart = { x: heroLabel.x + heroLabel.width + 8, y: heroLabel.cy },
    heroBet = { x: corridorX, y: heroRect.y - 17 };
  const vr = players[1],
    vc = { x: vr.cx, y: vr.cy },
    direction = { x: ar.width / 2 - vc.x, y: ar.height * 0.49 - vc.y },
    length = Math.hypot(direction.x, direction.y) || 1;
  const villainStart = { x: vr.cx, y: vr.y + vr.height * 0.73 },
    villainBet = {
      x: vc.x + (direction.x / length) * (vr.width * 0.53 + 14),
      y: vc.y + (direction.y / length) * (vr.width * 0.53 + 14),
    };
  const awardEnd = { x: heroLabel.x + heroLabel.width + 8, y: heroLabel.cy },
    awardControl = { x: corridorX + ar.width * 0.1, y: pool.y - 10 };
  const end = document.createElement('div');
  end.className = 'motion-end-row';
  end.innerHTML =
    '<button class="primary">查看复盘</button><button class="secondary">再练这一手</button><button class="secondary">下一手 →</button>';
  arena.closest('.table-wrap').querySelector('.action-area').append(end);
  const deckVisual = document.createElement('div');
  deckVisual.className = 'motion-deck';
  deckVisual.innerHTML = sourceBack.outerHTML;
  layer.append(deckVisual);
  deckVisual.style.left = deckPoint.x - 12 + 'px';
  deckVisual.style.top = deckPoint.y - 17 + 'px';
  const signature = (c) => {
    const rank =
        { A: 14, K: 13, Q: 12, J: 11, T: 10 }[c.querySelector('b')?.textContent] ||
        Number(c.querySelector('b')?.textContent),
      symbol = c.querySelector('i')?.textContent;
    return fixture.hole.concat(fixture.board).find((x) => x.rank === rank && x.symbol === symbol)
      ?.key;
  };
  const selected = new Set(fixture.bestFive),
    allFace = heroCards.concat(originalBoard);
  const rays = document.createElement('div');
  rays.className = 'motion-winner-rays';
  arena.insertBefore(rays, layer);
  const rayOrigins = allFace
    .filter((card) => selected.has(signature(card)))
    .map((card) => {
      const r = rect(card);
      return { x: r.cx, y: r.y + r.height * 0.08, hero: heroCards.includes(card) };
    });
  const gradients = [],
    bundles = [];
  rayOrigins.forEach((origin, index) => {
    const length = origin.hero ? (small ? 175 : 260) : small ? 78 : 125;
    const angles = origin.hero ? [-130, -116, -102, -88, -74, -60] : [-110, -94, -78];
    const paths = angles
      .map((angle, beam) => {
        const a = (angle * Math.PI) / 180,
          b = ((angle + (origin.hero ? 5 : 4)) * Math.PI) / 180;
        const end = {
          x: origin.x + Math.cos((a + b) / 2) * length,
          y: origin.y + Math.sin((a + b) / 2) * length,
        };
        const id = `winner-ray-${index}-${beam}`;
        const tint = beam % 3 === 0 ? '#e8d58b' : '#9ee6a6';
        gradients.push(
          `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${origin.x}" y1="${origin.y}" x2="${end.x}" y2="${end.y}"><stop stop-color="#def9ba" stop-opacity=".82"/><stop offset=".3" stop-color="${tint}" stop-opacity=".63"/><stop offset=".76" stop-color="${tint}" stop-opacity=".24"/><stop offset="1" stop-color="${tint}" stop-opacity="0"/></linearGradient>`,
        );
        return `<path d="M${origin.x} ${origin.y}L${origin.x + Math.cos(a) * length} ${origin.y + Math.sin(a) * length}L${origin.x + Math.cos(b) * length} ${origin.y + Math.sin(b) * length}Z" fill="url(#${id})"/>`;
      })
      .join('');
    bundles.push(
      `<g class="motion-ray-bundle" data-x="${origin.x}" data-y="${origin.y}">${paths}</g>`,
    );
  });
  rays.innerHTML = `<svg viewBox="0 0 ${ar.width} ${ar.height}" width="100%" height="100%" aria-hidden="true"><defs>${gradients.join('')}</defs>${bundles.join('')}</svg>`;
  const winnerTitle = document.createElement('div');
  winnerTitle.className = 'motion-floating-title';
  winnerTitle.textContent = fixture.bestLabel + ' · ' + fixture.kicker;
  winnerTitle.style.left = pool.x + 'px';
  winnerTitle.style.top = Math.max(pool.y + poolHeight / 2 + 11, heroRect.y - 16) + 'px';
  layer.append(winnerTitle);
  const stageLabels = (t) =>
    t < 3
      ? ['正在发牌', '完成后再开始行动']
      : t < 6
        ? ['公共牌展开', '留意牌面变化']
        : t < 9
          ? ['轮到你行动', `可以过牌或下注 ${fixture.amount.toLocaleString('en-US')}`]
          : t < 10.1
            ? ['你下注', fixture.amount.toLocaleString('en-US') + ' 筹码']
            : t < 12
              ? ['Knox 跟注', fixture.amount.toLocaleString('en-US') + ' 筹码']
              : t < 15
                ? ['本轮下注结束', '筹码收入底池']
                : t < 18
                  ? ['摊牌', '比较最佳五张牌']
                  : t < 20
                    ? ['你赢得本手', fixture.bestLabel + ' · ' + fixture.kicker]
                    : ['底池分配', '+' + fixture.award.toLocaleString('en-US') + ' 筹码'];
  const moneyNodes = [
      arena.querySelector('.hero-label>b'),
      ...seats.map((s) => s.querySelector('.identity>b')),
    ],
    potValue = arena.querySelector('.pot>strong'),
    potLabel = arena.querySelector('.pot>span'),
    caption = arena.querySelector('.table-caption'),
    turn = arena.closest('.table-wrap').querySelector('.turn-line');
  const defaultCaption = caption.textContent,
    chipCounters = [],
    faceChecks = [];
  const draw = (t) => {
    let state =
      t < 3
        ? fixture.blind
        : t < 9.1
          ? fixture.before
          : t < 10.1
            ? fixture.afterHero
            : fixture.afterCall;
    const paidProgress = clamp((t - 20 - m.award) / 0.22),
      displayAward = Math.min(
        fixture.award,
        Math.round((fixture.award * paidProgress) / fixture.unit) * fixture.unit,
      );
    const stacks = [...state.stacks];
    let pot = state.pot;
    if (t >= 20) {
      stacks[0] += displayAward;
      pot -= displayAward;
    }
    moneyNodes.forEach((n, i) => (n.textContent = stacks[i].toLocaleString('en-US')));
    potValue.textContent = pot.toLocaleString('en-US');
    potLabel.textContent =
      t >= 20 + m.award + 0.22 ? '已分配' : t >= 20 + m.award ? '分配中' : '底池';
    if (
      stacks.reduce((s, n) => s + n, 0) + pot !== fixture.total ||
      [...stacks, pot].some((n) => n % fixture.unit)
    )
      throw Error('Motion counter violates chip conservation');
    const sessionValue = document.querySelector('.session-value>strong');
    if (sessionValue)
      sessionValue.innerHTML = `${stacks[0].toLocaleString('en-US')} <small>CHIPS</small>`;
    const delta = document.querySelector('.session-value>b');
    if (delta)
      delta.textContent =
        (stacks[0] >= fixture.startingStack ? '+' : '') +
        (stacks[0] - fixture.startingStack).toLocaleString('en-US');
    arena.querySelector('.hero').classList.toggle('your-turn', t >= 6 && t < 9.1);
    const [heading, detail] = stageLabels(t);
    turn.innerHTML = `<strong>${heading}</strong><span>${detail}</span>`;
    arena.closest('.table-wrap').querySelector('.table-top>span').innerHTML =
      `第 03 局 · 第 12 手 <i>·</i> ${t < 3 ? '发牌展示' : t < 6 ? '公共牌展示' : t < 15 ? '河牌' : t < 20 ? '摊牌' : '已结算'}`;
    const betTitle = arena.closest('.table-wrap').querySelector('.bet-title');
    betTitle.querySelector('span').textContent = '下注';
    betTitle.querySelector('strong').textContent = fixture.amount.toLocaleString('en-US');
    const slider = arena.closest('.table-wrap').querySelector('.bet-control input');
    slider.min = fixture.legalBefore.minRaiseTo;
    slider.max = fixture.legalBefore.maxRaiseTo;
    slider.step = fixture.unit;
    slider.value = fixture.amount;
    const raise = arena.closest('.table-wrap').querySelector('.raise');
    raise.innerHTML = `下注 <strong>${fixture.amount.toLocaleString('en-US')}</strong>`;
    arena.closest('.table-wrap').querySelector('.call').textContent = '过牌';
    arena
      .closest('.table-wrap')
      .querySelectorAll('.action-buttons>button,.bet-control input')
      .forEach((el) => (el.disabled = !(t >= 6 && t < 9.1)));
    arena
      .closest('.table-wrap')
      .querySelectorAll('.bet-control,.action-buttons')
      .forEach((el) => (el.style.visibility = t >= 20 + m.award ? 'hidden' : 'visible'));
    end.style.opacity = t >= 20 + m.award ? 1 : 0;
    seats.forEach(
      (s, i) =>
        (s.querySelector('.seat-action').textContent =
          t < 3
            ? i === 0
              ? '小盲 ' + blindAmount(1)
              : i === 1
                ? '大盲 ' + blindAmount(2)
                : '等待行动'
            : i === 1
              ? t < 10.1
                ? '过牌'
                : t < 15
                  ? '跟注 ' + fixture.amount.toLocaleString('en-US')
                  : t < 18
                    ? '摊牌'
                    : 'J 一对'
              : '已弃牌'),
    );
    // Cards move; the layout slots and text do not.
    deal.forEach((o, i) => {
      const p = clamp((t - i * 0.06) / 0.24),
        e = ease(p);
      o.original.style.visibility = t < 3 && p < 1 ? 'hidden' : 'visible';
      o.el.style.opacity = t < 3 && p > 0 && p < 1 ? 1 : 0;
      const control = {
        x: deckPoint.x + (o.r.cx - deckPoint.x) * 0.2 + (o.r.cx >= deckPoint.x ? 18 : -18),
        y: deckPoint.y + (o.r.cy - deckPoint.y) * 0.25,
      };
      placeCard(
        o,
        point(deckPoint, control, { x: o.r.cx, y: o.r.cy }, e),
        o.face ? clamp((p - 0.62) / 0.38) * 180 : 0,
        lerp(-12, o.angle, e),
        Math.sin(p * Math.PI) * 9,
      );
    });
    deckVisual.style.opacity = t < 1.3 ? 0.85 : 0;
    const starts = [3.05, 3.12, 3.19, 4.15, 4.85];
    flips.forEach((o, i) => {
      const p = clamp((t - starts[i]) / m.flip);
      o.original.style.visibility = p >= 1 ? 'visible' : 'hidden';
      o.el.style.opacity = t >= 3 && p < 1 ? 1 : 0;
      placeCard(o, { x: o.r.cx, y: o.r.cy }, ease(p) * 180, o.angle, Math.sin(p * Math.PI) * 2);
    });
    villain.forEach((o, i) => {
      const p = clamp((t - 15.1 - i * 0.12) / m.flip);
      o.original.style.visibility = t >= 15.1 ? 'hidden' : 'visible';
      o.el.style.opacity = t >= 15.1 ? 1 : 0;
      placeCard(
        o,
        { x: lerp(o.r.cx, o.fanTarget.x, ease(p)), y: lerp(o.r.cy, o.fanTarget.y, ease(p)) },
        ease(p) * 180,
        o.angle,
        Math.sin(p * Math.PI) * 2,
      );
    });
    if (
      t >= 15.22 + m.flip &&
      villain.some((o) => o.back.style.display !== 'none' || o.face.style.display !== 'block')
    )
      throw Error('Shown opponent cards reverted to their backs');
    const hp = clamp((t - 9.1) / m.wager),
      vp = clamp((t - 10.1) / m.wager),
      cp = clamp((t - 12.1) / m.collect);
    const betPos = (start, target, p) => point(start, { x: target.x, y: start.y }, target, ease(p));
    const collectPos = (target) => point(target, { x: target.x, y: pool.y }, pool, ease(cp));
    placePile(
      heroWager,
      cp > 0 ? collectPos(heroBet) : betPos(heroStart, heroBet, hp),
      1,
      t >= 9.1 && cp < 1 ? 1 : 0,
    );
    placePile(
      villainWager,
      cp > 0 ? collectPos(villainBet) : betPos(villainStart, villainBet, vp),
      1,
      t >= 10.1 && cp < 1 ? 1 : 0,
    );
    placePile(blindPile, pool, 1, t < 3 ? 1 : 0);
    placePile(basePile, pool, 1, t >= 3 && cp < 1 ? 1 : 0);
    placePile(fullPile, pool, 1, cp >= 1 && t < 20 ? 1 : 0);
    const ap = clamp((t - 20) / m.award),
      awardPos = point(pool, awardControl, awardEnd, ease(ap)),
      scale = 1 - 0.58 * ease(clamp(ap / 0.45));
    placePile(awardPile, awardPos, scale, t >= 20 && ap < 1 ? 1 : 0);
    allFace.forEach((c) => {
      const chosen = selected.has(signature(c));
      c.classList.toggle('motion-winner-card', t >= 18 && chosen);
      c.classList.toggle('motion-unselected-card', t >= 18 && !chosen);
    });
    caption.textContent = defaultCaption;
    caption.style.opacity = t >= 18 ? '0' : '1';
    const titleIn = clamp((t - 18) / 0.18);
    winnerTitle.style.opacity = titleIn;
    winnerTitle.style.transform = `translate(-50%,-50%) translateY(${(1 - titleIn) * 5}px)`;
    const winTime = t - 18;
    const rayPeak =
      winTime < 0
        ? 0
        : winTime < 0.9
          ? ease(winTime / 0.9)
          : winTime < 1.35
            ? 1 - ((winTime - 0.9) / 0.45) * 0.3
            : winTime < 2.15
              ? 0.7 * (1 - (winTime - 1.35) / 0.8)
              : 0;
    rays.style.opacity = rayPeak;
    rays.querySelectorAll('.motion-ray-bundle').forEach((bundle) => {
      const x = bundle.dataset.x,
        y = bundle.dataset.y,
        scale = 0.82 + rayPeak * 0.18;
      bundle.setAttribute(
        'transform',
        `translate(${x} ${y}) scale(${scale}) translate(${-x} ${-y})`,
      );
    });
    if (
      chipCounters.length < 30 &&
      [0.65, 9.25, 10.75, 12.3, 18.6, 20.22, 21.1].some((x) => Math.abs(t - x) < 0.025)
    )
      chipCounters.push({ time: t, pot, stacks: [...stacks], total: fixture.total });
    if ([15.7, 18.9, 21.1].some((time) => Math.abs(t - time) < 0.021)) {
      const state = window.__greenMotion.inspectFaces();
      if (
        !state.foldedOpponentCardsRemainBacks ||
        !state.hudReadability.nameAndStackClear ||
        !state.hudReadability.upperHudClear ||
        !state.hudReadability.elementHitPass ||
        !state.hudReadability.fontsUnchanged ||
        state.opponent.some(
          (card, index) =>
            card.frontDisplay !== 'block' ||
            card.backDisplay !== 'none' ||
            card.rank !== rankTextBrowser(fixture.villain[index].rank) ||
            card.suit !== fixture.villain[index].symbol ||
            card.flipDegrees !== 180,
        )
      )
        throw Error('Showdown face persistence assertion failed');
      faceChecks.push({ time: t, ...state });
    }
  };
  function blindAmount(id) {
    return (fixture.startingStack - fixture.blind.stacks[id]).toLocaleString('en-US');
  }
  window.__greenMotion = {
    draw,
    geometry: {
      arena: ar.toJSON(),
      pool,
      heroRect,
      heroLabel,
      heroStart,
      heroBet,
      villainStart,
      villainBet,
      awardEnd,
      awardControl,
      seatCount: seats.length + 1,
      poolCandidateOverlapScore: score(pool),
      criticalRects: critical,
      winnerRayOrigins: rayOrigins,
      winnerRaysPeakAt: 18.9,
    },
    chipCounters,
    faceChecks,
    inspectFaces: () => ({
      hudReadability: hudReadability(),
      opponent: villain.map((o) => ({
        rank: o.face.querySelector('b').textContent,
        suit: o.face.querySelector('i').textContent,
        frontDisplay: o.face.style.display,
        backDisplay: o.back.style.display,
        flipDegrees: Number(o.el.dataset.flipDegrees),
      })),
      foldedOpponentCardsRemainBacks: seatCards
        .filter((_, index) => index !== 1)
        .every((cards) =>
          cards.every(
            (card) => card.classList.contains('back') && card.style.visibility === 'visible',
          ),
        ),
    }),
  };
}

const browser = await chromium.launch({ headless: true }),
  records = [],
  renderStarted = Date.now();
const selectedThemes = themes.filter(
  (t) => !process.env.NOIR_VIDEO_THEME || t.id === process.env.NOIR_VIDEO_THEME,
);
const selectedDevices = devices.filter(
  (d) =>
    ['desktop', 'ios'].includes(d.id) &&
    (!process.env.NOIR_VIDEO_DEVICE || d.id === process.env.NOIR_VIDEO_DEVICE),
);
const renderingVersion = 'green-v2-front-fan-clear-hud-2026-10-27';
const reusedCaptureKeys = new Set(),
  reusedCaptures = [];
if (args.has('--reuse-correct') && !args.has('--keyframes') && !args.has('--preview')) {
  const previous = JSON.parse(await readFile(path.join(out, 'media-audit.json'), 'utf8'));
  if (
    previous.sourceFingerprints.length !== sourceFingerprints.length ||
    sourceFingerprints.some(
      (source) =>
        previous.sourceFingerprints.find((old) => old.file === source.file)?.sha256 !==
        source.sha256,
    )
  )
    throw Error('Cannot reuse a capture with different scene source fingerprints');
  for (const record of previous.recordings.filter(
    (record) =>
      !record.kind &&
      selectedThemes.some((theme) => theme.id === record.theme) &&
      selectedDevices.some((device) => device.id === record.device),
  )) {
    const checks = record.scenes?.core?.faceChecks || [];
    const facesVerified = [15.7, 18.9, 21.1].every((time) =>
      checks.some(
        (check) =>
          Math.abs(check.time - time) < 0.03 &&
          check.foldedOpponentCardsRemainBacks &&
          check.hudReadability?.nameAndStackClear &&
          check.hudReadability?.upperHudClear &&
          check.hudReadability?.elementHitPass &&
          check.hudReadability?.fontsUnchanged &&
          check.opponent[0].rank === 'K' &&
          check.opponent[0].suit === '♠' &&
          check.opponent[1].rank === 'J' &&
          check.opponent[1].suit === '♦' &&
          check.opponent.every(
            (card) =>
              card.frontDisplay === 'block' &&
              card.backDisplay === 'none' &&
              card.flipDegrees === 180,
          ),
      ),
    );
    if (
      record.duration !== duration ||
      !facesVerified ||
      record.scenes.core.geometry.core.seatCount !== 9 ||
      sha(await readFile(path.join(artifactRoot, record.path))) !== record.sha256
    )
      throw Error('Existing media is not a validated corrected capture');
    records.push({ ...record, renderingVersion, reusedValidatedCapture: true });
    reusedCaptureKeys.add(record.theme + '-' + record.device);
    reusedCaptures.push({
      path: record.path,
      sha256: record.sha256,
      originalRenderSeconds: record.renderSeconds,
    });
  }
}
async function prepareScene(page, theme, device, chapter) {
  const observations = {},
    checks = [];
  const listener = (response) => {
    const pathname = new URL(response.url()).pathname,
      expected = frozenSources[pathname];
    if (!expected) return;
    checks.push(
      response.body().then((bytes) => {
        const actual = sha(bytes);
        if (actual !== expected.sha256)
          throw Error('Scene source changed while capturing: ' + expected.file);
        observations[expected.file] = { sha256: actual, status: response.status() };
      }),
    );
  };
  page.on('response', listener);
  const errors = [];
  const onError = (e) => errors.push(e.message);
  page.on('pageerror', onError);
  try {
    await page.goto(
      `${host}/screen.html?theme=${theme.id}&device=${device.id}&screen=${chapter.screen}`,
      { waitUntil: 'networkidle' },
    );
    await page.waitForFunction(
      () =>
        document.body.dataset.ready === 'true' &&
        document.querySelector('.table-wrap')?.textContent.length > 20,
    );
    await page.evaluate(async () => {
      await window.designReady;
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    await page.waitForFunction(() => {
      const a = document.querySelector('.felt-area');
      return (
        a &&
        parseFloat(a.style.getPropertyValue('--profile-width')) > 0 &&
        parseFloat(a.style.getPropertyValue('--hero-y')) > 0 &&
        [...a.querySelectorAll('.seat')].every((s) =>
          s.style.getPropertyValue('--x').endsWith('px'),
        )
      );
    });
    const stable = await page.evaluate(async () => {
      const box = () =>
        [...document.querySelectorAll('.seat,.hero,.center-board')].map((e) => {
          const r = e.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height];
        });
      const a = box();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const b = box();
      return a.every((r, i) => r.every((v, j) => Math.abs(v - b[i][j]) < 0.2));
    });
    if (!stable) throw Error('Scene layout is not stable');
    await Promise.all(checks);
    if (errors.length) throw Error(errors.join('; '));
    for (const file of [
      'screen.mjs',
      'screen.css',
      'green-art.css',
      'scene-layout.mjs',
      'art/felt-emerald-v2.webp',
      'art/leather-rail-v2.webp',
      `art/room-${theme.id}-v2.webp`,
    ])
      if (!observations[file]) throw Error('Required scene source was not observed: ' + file);
  } finally {
    page.off('response', listener);
    page.off('pageerror', onError);
  }
  if (chapter.id !== 'core') {
    await page.addStyleTag({ url: host + '/runtime/styles/game-effects.css' });
    await page.addStyleTag({ url: host + '/runtime/styles/emotion-effects.css' });
  }
  await page.addStyleTag({
    content: `
    body{overflow:hidden!important}.home-indicator{z-index:100!important}
    .video-label{position:fixed;top:${device.id === 'desktop' ? 2 : 40}px;left:50%;transform:translateX(-50%);z-index:100;white-space:nowrap;background:#04130bd9;border:1px solid #a2c99745;border-radius:4px;padding:2px 8px;font:${device.id === 'desktop' ? 9 : 8}px Manrope,Noto,sans-serif;color:#d1e1c8;letter-spacing:.015em}.video-label b{color:#a8dfab;font-weight:550}
    .motion-object-layer{position:absolute;inset:0;z-index:18;pointer-events:none;overflow:visible}.motion-opponent-reveal-layer{position:absolute;inset:0;z-index:4;pointer-events:none;overflow:visible}.motion-card-object{position:absolute;left:0;top:0;transform-style:preserve-3d;pointer-events:none}.motion-card-object>.card{backface-visibility:visible;transform-style:preserve-3d}.motion-chip-pile{position:absolute;left:0;top:0;pointer-events:none;filter:drop-shadow(0 5px 4px #0007)}.motion-deck{position:absolute;filter:drop-shadow(0 3px 3px #0008);pointer-events:none}
    [data-art=green-v2] .motion-winner-card{outline:1px solid #c5d58e;outline-offset:1px;box-shadow:0 2px 0 #ded7ac,0 4px 0 #6e7753,0 0 0 2px #80d890,0 0 13px 3px #60bd6c65,0 7px 10px #0008!important}
    [data-art=green-v2] .motion-unselected-card{filter:saturate(.7) brightness(.88)}
    .motion-winner-rays{position:absolute;inset:0;z-index:2;pointer-events:none;mix-blend-mode:screen;opacity:0;filter:drop-shadow(0 0 3px #a7e0a033)}.motion-winner-rays svg{overflow:visible}
    .motion-floating-title{position:absolute;z-index:5;color:#e6edb0;font-size:${device.id === 'desktop' ? 20 : 14}px;font-weight:700;letter-spacing:0;line-height:1.35;white-space:nowrap;text-shadow:0 1px 0 #183613,0 3px 7px #000b;opacity:0;transform:translate(-50%,-50%)}
    .motion-end-row{position:absolute;left:12px;right:12px;bottom:14px;display:flex;gap:8px;opacity:0;pointer-events:none}.motion-end-row button{flex:1;min-height:49px;padding:10px;font-size:11px;white-space:nowrap}.settlement-actions>button{min-width:90px;white-space:nowrap}
    .video-extra-strong .premium-sparks{inset:-3px}.video-extra-rebuy .rebuy-cue{animation:rebuy-burst 1.3s cubic-bezier(.2,.8,.3,1) both}.video-extra-champion .design-confetti{display:none}.video-extra-champion .result-overlay{opacity:0}.video-extra-champion .hero-label{position:relative}.video-extra-champion .champion-crown{left:-18px;top:-14px;opacity:0}.video-extra-farewell .result-overlay{display:none}.farewell-stage{top:-2%}
  `,
  });
  await page.evaluate(
    ({ title, chapter, sparks, pieces }) => {
      document.body.classList.add('video-extra-' + chapter.id);
      const label = document.createElement('div');
      label.className = 'video-label';
      label.innerHTML = `<b>${title} · ${chapter.label}</b> · 动效样片`;
      document.body.append(label);
      if (chapter.id === 'strong') {
        const cards = document.querySelector('.hero-cards');
        cards.classList.remove('strong-start');
        const shadows = [...cards.querySelectorAll('.card')].map(
          (c) => getComputedStyle(c).boxShadow,
        );
        cards.classList.add('strong-start', 'premium-start');
        cards.querySelectorAll('.card').forEach((c, i) => {
          c.classList.add('playing-card');
          c.style.boxShadow = shadows[i];
        });
        cards.querySelector('.premium-sparks').innerHTML = sparks
          .map((p) => `<i class="premium-spark" style="${p.style}"></i>`)
          .join('');
      }
      if (chapter.id === 'emotion')
        document.querySelectorAll('.avatar-wrap').forEach((w) => {
          const mood = [...w.classList].find((c) => c.startsWith('mood-'));
          if (!mood) return;
          w.querySelector('.avatar').classList.add(mood);
          const badge = w.querySelector('.mood-icon');
          if (badge) {
            badge.textContent = '';
            badge.classList.add('mood-badge', 'mood-live', mood);
          }
        });
      if (chapter.id === 'rebuy') {
        document.querySelector('.hero-label>b').classList.add('stack-refill');
        document.querySelector('.hero-label>b').style.setProperty('--refill-width', '5.6em');
      }
      if (chapter.id === 'champion') {
        const confetti = document.createElement('div');
        confetti.className = 'confetti-layer';
        confetti.innerHTML = pieces
          .map((p) => `<i class="confetti-piece" style="${p.style}"></i>`)
          .join('');
        document.body.append(confetti);
        const stage = document.createElement('div');
        stage.className = 'crown-stage';
        stage.innerHTML =
          '<div class="crown-rays"></div><div class="crown-flight"><span class="crown-shape"></span></div><div class="crown-caption">本局冠军</div>';
        document.body.append(stage);
        const hero = document.querySelector('.hero-label'),
          r = hero.getBoundingClientRect();
        stage.style.setProperty('--crown-x', r.left + r.width / 2 - innerWidth / 2 + 'px');
        stage.style.setProperty('--crown-y', r.top - innerHeight * 0.45 + 'px');
        stage.style.setProperty('--crown-scale', '.25');
        const worn = document.createElement('span');
        worn.className = 'champion-crown';
        worn.innerHTML = '<span class="crown-shape"></span>';
        hero.append(worn);
      }
      if (chapter.id === 'farewell') {
        const stage = document.createElement('div');
        stage.className = 'farewell-stage';
        stage.innerHTML =
          '<div class="farewell-ring"></div><div class="farewell-card"><span class="farewell-title">很遗憾，本局结束</span><strong class="farewell-place">第5名</strong><span class="farewell-note">这一局的经验，留给下一次决策。</span></div>';
        document.querySelector('.felt-area').append(stage);
      }
    },
    { title: theme.name, chapter, sparks: premiumSparks(12), pieces: confettiPieces(24) },
  );
  let fixture = null;
  if (chapter.id === 'core') {
    const visible = await page.evaluate(() => ({
      count: document.querySelectorAll('.seat').length + 1,
      hole: [...document.querySelectorAll('.hero-cards>.card')].map((c) => ({
        rank: c.querySelector('b').textContent,
        suit: c.querySelector('i').textContent,
      })),
      board: [...document.querySelectorAll('.board>.card')].map((c) => ({
        rank: c.querySelector('b').textContent,
        suit: c.querySelector('i').textContent,
      })),
    }));
    if (visible.count !== 9) throw Error('Core video must include the nine-player layout');
    fixture = coreFixture(visible.count, visible);
    await page.evaluate(installCoreMotion, { fixture, motion: motion(theme) });
  }
  const geometry = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    table: document.querySelector('.table-wrap').getBoundingClientRect().toJSON(),
    action: (
      document.querySelector('.action-buttons') || document.querySelector('.settlement-actions')
    )
      ?.getBoundingClientRect()
      .toJSON(),
    layoutStable: true,
    installedVariables: {
      profile: document.querySelector('.felt-area').style.getPropertyValue('--profile-width'),
      heroY: document.querySelector('.felt-area').style.getPropertyValue('--hero-y'),
    },
    core: window.__greenMotion?.geometry,
  }));
  return { geometry, loadedSources: observations, fixture };
}
async function setFrame(page, time, theme, chapter) {
  if (chapter.id === 'core') {
    await page.evaluate((t) => window.__greenMotion.draw(t), time);
    return;
  }
  await page.evaluate(
    ({ time, chapter, m, count }) => {
      const t = time - chapter.at,
        clamp = (n) => Math.max(0, Math.min(1, n));
      if (chapter.id === 'rebuy')
        document.querySelector('.hero-label>b').textContent =
          count[Math.min(9, Math.floor(clamp(t / 1.3) * 10))].toLocaleString('en-US');
      if (chapter.id === 'champion') {
        document.querySelector('.result-overlay').style.opacity = clamp((t - 2.3) / m.wager);
        document.querySelector('.champion-crown').style.opacity = t >= 2.15 ? 1 : 0;
      }
      document.getAnimations().forEach((a) => {
        a.pause();
        a.currentTime = t * 1000;
      });
    },
    { time, chapter, m: motion(theme), count: refillCountValues(newGame(5).stakes.startingStack) },
  );
}
function probe(file) {
  return JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], {
      encoding: 'utf8',
    }),
  );
}
function decodedAudioPeak(file) {
  const data = execFileSync(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-f', 'f32le', '-ac', '1', 'pipe:1'],
    { maxBuffer: 12 * 1024 * 1024 },
  );
  let peak = 0;
  for (let i = 0; i + 4 <= data.length; i += 4)
    peak = Math.max(peak, Math.abs(data.readFloatLE(i)));
  return peak;
}

for (const theme of selectedThemes)
  for (const device of selectedDevices) {
    if (reusedCaptureKeys.has(theme.id + '-' + device.id)) {
      console.log('Reusing validated ' + theme.id + '-' + device.id);
      continue;
    }
    const started = Date.now(),
      page = await browser.newPage({
        viewport: { width: device.width, height: device.height },
        deviceScaleFactor: 1,
        reducedMotion: 'no-preference',
      });
    await page.route('**/*', (r) => r.continue());
    let current = null;
    const scenes = {};
    const stem = `${theme.id}-${device.id}${args.has('--preview') ? '-preview' : ''}`;
    async function frame(time) {
      const chapter = chapters.find((c) => time >= c.at && time < c.until) || chapters.at(-1);
      if (current?.id !== chapter.id) {
        if (current?.id === 'core') {
          scenes.core.counterChecks = await page.evaluate(() => window.__greenMotion.chipCounters);
          scenes.core.shownFaces = await page.evaluate(() => window.__greenMotion.inspectFaces());
          scenes.core.faceChecks = await page.evaluate(() => window.__greenMotion.faceChecks);
        }
        scenes[chapter.id] = await prepareScene(page, theme, device, chapter);
        current = chapter;
      }
      await setFrame(page, time, theme, chapter);
      return page.screenshot(
        args.has('--keyframes') || args.has('--lossless-pipe')
          ? { type: 'png', animations: 'allow' }
          : { type: 'jpeg', quality: 96, animations: 'allow' },
      );
    }
    if (args.has('--keyframes')) {
      for (const [time, name] of keyframes)
        await writeFile(path.join(out, `${stem}-${name}.png`), await frame(time));
      records.push({
        kind: 'keyframes',
        theme: theme.id,
        device: device.id,
        viewport: { width: device.width, height: device.height },
        renderSeconds: (Date.now() - started) / 1000,
        files: keyframes.map(([seconds, name]) => ({
          seconds,
          path: `videos/${stem}-${name}.png`,
        })),
        scenes,
      });
      await page.close();
      console.log(stem + ': keyframes complete');
      continue;
    }
    const file = path.join(out, stem + '.mp4'),
      frameCount = args.has('--preview') ? 36 : duration * fps;
    const encoder = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'image2pipe',
        '-framerate',
        String(fps),
        '-i',
        'pipe:0',
        '-i',
        audio[theme.id][device.id].file,
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-vf',
        'pad=ceil(iw/2)*2:ceil(ih/2)*2',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '21',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-t',
        String(frameCount / fps),
        '-movflags',
        '+faststart',
        file,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    let encoderError = '';
    encoder.stderr.on('data', (d) => (encoderError += d));
    const finished = once(encoder, 'close');
    for (let f = 0; f < frameCount; f++) {
      const time = args.has('--preview') ? (f / frameCount) * duration : f / fps,
        data = await frame(time);
      if (!encoder.stdin.write(data)) await once(encoder.stdin, 'drain');
      const key = keyframes.find(([t]) => Math.round(t * fps) === f);
      if (key && !args.has('--preview'))
        await writeFile(
          path.join(out, `${stem}-${key[1]}.png`),
          await page.screenshot({ type: 'png', animations: 'allow' }),
        );
      if (f && f % (fps * 4) === 0) console.log(`${stem}: ${f / fps}/${duration}s`);
    }
    encoder.stdin.end();
    const [code] = await finished;
    if (code !== 0) throw Error(encoderError);
    await page.close();
    const meta = probe(file),
      v = meta.streams.find((s) => s.codec_type === 'video'),
      a = meta.streams.find((s) => s.codec_type === 'audio'),
      peak = decodedAudioPeak(file);
    if (!v || !a || peak >= 1) throw Error('Invalid media tracks or digital clipping');
    records.push({
      theme: theme.id,
      device: device.id,
      path: 'videos/' + stem + '.mp4',
      sha256: sha(await readFile(file)),
      viewport: { width: device.width, height: device.height },
      width: v.width,
      height: v.height,
      duration: Number(meta.format.duration),
      fps: v.r_frame_rate,
      frameCount: v.nb_frames,
      videoCodec: v.codec_name,
      pixelFormat: v.pix_fmt,
      audioCodec: a.codec_name,
      audioSampleRate: a.sample_rate,
      audioTracks: meta.streams.filter((s) => s.codec_type === 'audio').length,
      decodedAudioSamplePeak: peak,
      audioClippingDetected: false,
      padding: device.width % 2 ? 'right 1px for H.264 yuv420p; UI remains 393px' : 'none',
      size: Number(meta.format.size),
      renderSeconds: (Date.now() - started) / 1000,
      scenes,
    });
    console.log(stem + ' done');
  }
await browser.close();
if (
  !args.has('--keyframes') &&
  !args.has('--preview') &&
  selectedThemes.length === 3 &&
  selectedDevices.length === 2
) {
  const file = path.join(out, 'three-directions-mobile.mp4'),
    inputs = themes.map((t) => path.join(out, t.id + '-ios.mp4')),
    started = Date.now();
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    ...inputs.flatMap((f) => ['-i', f]),
    '-filter_complex',
    '[0:v:0][1:v:0][2:v:0]hstack=inputs=3[comparison]',
    '-map',
    '[comparison]',
    '-map',
    '0:a:0',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '21',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'copy',
    '-t',
    String(duration),
    '-movflags',
    '+faststart',
    file,
  ]);
  const meta = probe(file),
    v = meta.streams.find((s) => s.codec_type === 'video'),
    a = meta.streams.find((s) => s.codec_type === 'audio');
  records.push({
    kind: 'comparison',
    path: 'videos/three-directions-mobile.mp4',
    sha256: sha(await readFile(file)),
    sources: await Promise.all(
      inputs.map(async (f) => ({
        path: 'videos/' + path.basename(f),
        sha256: sha(await readFile(f)),
      })),
    ),
    sourceAudio: 'videos/jade-ios.mp4 · one original AAC stream only',
    width: v.width,
    height: v.height,
    duration: Number(meta.format.duration),
    fps: v.r_frame_rate,
    frameCount: v.nb_frames,
    videoCodec: v.codec_name,
    pixelFormat: v.pix_fmt,
    audioCodec: a.codec_name,
    audioSampleRate: a.sample_rate,
    audioTracks: meta.streams.filter((s) => s.codec_type === 'audio').length,
    decodedAudioSamplePeak: decodedAudioPeak(file),
    size: Number(meta.format.size),
    renderSeconds: (Date.now() - started) / 1000,
  });
}
const finalBase = (await import(`./manifest.mjs?audit=${Date.now()}`)).base,
  draftBaseSha = '03d785e314758841a865ce31e299d244c91fb5b6';
const effectFiles = [
  'src/ui/sound-cues.js',
  'src/ui/chip-recording.js',
  'src/ui/ceremony-sounds.js',
  'src/ui/effect-layouts.js',
  'src/styles/game-effects.css',
  'src/styles/emotion-effects.css',
  'public/audio/background-music.m4a',
  'public/audio/background-music-mobile.m4a',
];
const equivalence = await Promise.all(
  effectFiles.map(async (file) => {
    const a = execFileSync('git', ['show', draftBaseSha + ':' + file], {
        maxBuffer: 10 * 1024 * 1024,
      }),
      b = await readFile(file);
    return { file, draftSha256: sha(a), currentSha256: sha(b), byteIdentical: a.equals(b) };
  }),
);
const baselineEvidence = {
  draftBaseSha,
  finalPr64BaseSha: finalBase.sha,
  finalWorkingTreeCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  effectsAndSoundByteIdentical: equivalence.every((f) => f.byteIdentical),
  files: equivalence,
};
await writeFile(path.join(out, 'base-equivalence.json'), JSON.stringify(baselineEvidence, null, 2));
const audit = {
  edition,
  base: finalBase,
  renderStartedWithBase: base,
  baselineEvidence,
  duration,
  fps,
  renderSeconds: (Date.now() - renderStarted) / 1000,
  sourceFingerprints,
  engineSha256: sha(await readFile('src/engine/poker.js')),
  type: '绿色游戏美术设计反馈片段合集；浏览器逐帧渲染，非原生或微信实际运行录屏，非完整连续牌局',
  chapters,
  timeline,
  sourceCues,
  backgroundAudio: audio,
  referenceVideo: 'e70ed0eec006650a58aae200ff1d196d.mp4 · visual reference only; audio not copied',
  referenceEvidenceLimit:
    '47s reference shows lobby/loading/waiting table, not actual dealing or awards; timing is an original NOIR proposal',
  v1OutputsPreserved: true,
  renderingCorrection: {
    issue:
      'Initial green-v2 card wrapper combined filter/drop-shadow with 3D backface culling; in the captured browser the opponent still looked like green card backs after the flip.',
    fix: 'Video-only explicit front/back display selection at 90 degrees; face text and persistent front state checked at 15.7s, 18.9s and 21.1s. Frozen product source/styles/assets are unchanged.',
    previousEvidence: '../development-media/pre-face-fix/',
    actualDecodedCropsRequired: true,
    hudPlacementIssue:
      'The initial revealed-card ghost reused the overlapping card-back anchor and its higher layer could cover the Knox name.',
    hudPlacementFix:
      'Revealed K/J use a separate layer below player HUDs; final fan is derived from the actual player top, a 4px lower gap and exclusion of the upper Jett action strip. Name and stack font sizes stay unchanged.',
    hudPlacementEvidence: '../development-media/face-fixed-hud-overlap/',
    hudValidation:
      'At 15.7s, 18.9s and 21.1s verify text Range/card rectangle zero overlap, upper HUD zero overlap, elementFromPoint HUD hit and unchanged font sizes. Also inspect full decoded MP4 frames and a crop including Jett action/name/stack.',
  },
  renderingVersion,
  reusedCaptures,
  captureFormat:
    args.has('--keyframes') || args.has('--lossless-pipe')
      ? 'PNG'
      : 'JPEG 96 for the video pipe; review keyframes remain lossless PNG',
  recordings: records,
};
await writeFile(
  path.join(
    out,
    args.has('--keyframes')
      ? 'keyframes-audit.json'
      : args.has('--preview')
        ? 'preview-media-audit.json'
        : 'media-audit.json',
  ),
  JSON.stringify(audit, null, 2),
);
console.log(
  `Completed ${records.length} ${args.has('--keyframes') ? 'keyframe sets' : 'media samples'}`,
);
