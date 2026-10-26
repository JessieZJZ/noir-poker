import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import path from 'node:path';
import { themes, devices, base } from './manifest.mjs';
import { soundSamples, SOUND_SAMPLE_RATE, limitSoundMix } from '../../src/ui/sound-cues.js';
import {
  ceremonySamples,
  ceremonyWav,
  CEREMONY_SAMPLE_RATE,
} from '../../src/ui/ceremony-sounds.js';
import { premiumSparks, confettiPieces, refillCountValues } from '../../src/ui/effect-layouts.js';

// Isolated art samples. No game-engine calls or production modifications.
const args = new Set(process.argv.slice(2));
const out = path.resolve('.artifacts/art-direction-pr64/videos');
const fps = 24;
const duration = 32;
const host = process.env.NOIR_DESIGN_URL || 'http://127.0.0.1:4394';
const chapters = [
  { id: 'core', at: 0, until: 18, screen: null, label: '行动反馈' },
  { id: 'strong', at: 18, until: 21, screen: 'strong-hand', label: '强起手牌' },
  { id: 'emotion', at: 21, until: 23, screen: 'emotion', label: '四类情绪' },
  { id: 'rebuy', at: 23, until: 25, screen: 'rebuy', label: '补充虚拟筹码' },
  { id: 'champion', at: 25, until: 29, screen: 'champion', label: '冠军与撒花' },
  { id: 'farewell', at: 29, until: 32, screen: 'eliminated', label: '本局出局' },
];
const timeline = [
  {
    at: 0,
    until: 2,
    label: '发牌',
    action: '底牌移入，本人牌桌位置稳定',
    sound: 'deal',
    soundAt: [0.12, 0.3],
  },
  {
    at: 2,
    until: 5,
    label: '翻牌',
    action: '公共牌依次翻转',
    sound: 'deal',
    soundAt: [2.08, 2.22, 2.36],
  },
  {
    at: 5,
    until: 8,
    label: '本人行动',
    action: '行动提示显现，稳定描边',
    sound: null,
    soundAt: [],
  },
  {
    at: 8,
    until: 11,
    label: '下注',
    action: '筹码从本人滑入底池，保留原视频节奏音效',
    sound: 'chip',
    soundAt: [8.285],
  },
  {
    at: 11,
    until: 14,
    label: '过牌',
    action: '轻触短圈和文字反馈',
    sound: 'check',
    soundAt: [11.12],
  },
  {
    at: 14,
    until: 18,
    label: '结算',
    action: '底池收拢、奖励出现、切换结算操作',
    sound: 'win',
    soundAt: [14.2],
  },
  {
    at: 18,
    until: 21,
    label: '强起手牌',
    action: '既有紫色牌缘与稀疏火花，2.6秒后消退',
    sound: null,
    soundAt: [],
  },
  {
    at: 21,
    until: 23,
    label: '四类情绪',
    action: '既有橙火焰、蓝盾牌、金星星、红闪电与不同头像环',
    sound: null,
    soundAt: [],
  },
  {
    at: 23,
    until: 25,
    label: '补码',
    action: '共享十阶补码计数与1.3秒上浮金额',
    sound: null,
    soundAt: [],
  },
  {
    at: 25,
    until: 29,
    label: '冠军',
    action: '共享金冠升起、飞向本人，双侧撒花完整收尾',
    sound: 'champion',
    soundAt: [25],
  },
  {
    at: 29,
    until: 32,
    label: '出局',
    action: '既有灰色名次卡与扩散细环，2.8秒消退',
    sound: 'farewell',
    soundAt: [29],
  },
];
const keyframes = [
  [0.7, 'deal'],
  [2.3, 'flip'],
  [6, 'turn'],
  [8.15, 'wager'],
  [11.15, 'check'],
  [15, 'settlement'],
  [18.8, 'strong'],
  [21.65, 'emotion'],
  [23.5, 'rebuy'],
  [26.1, 'champion'],
  [28, 'crowned'],
  [30.1, 'farewell'],
];
const sha = (data) => createHash('sha256').update(data).digest('hex');
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
    ratio = SOUND_SAMPLE_RATE / CEREMONY_SAMPLE_RATE;
  const result = new Float32Array(Math.round(source.length * ratio));
  for (let i = 0; i < result.length; i++) {
    const position = i / ratio,
      a = Math.floor(position),
      f = position - a;
    result[i] = source[a] * (1 - f) + (source[Math.min(a + 1, source.length - 1)] || 0) * f;
  }
  return result;
}
await mkdir(out, { recursive: true });
const sources = {};
for (const kind of ['deal', 'chip', 'check', 'win', 'champion', 'farewell']) {
  const ceremony = ['champion', 'farewell'].includes(kind);
  const data = cueSamples(kind);
  const bytes = ceremony ? Buffer.from(ceremonyWav(kind)) : wav(data);
  await writeFile(path.join(out, `source-${kind}.wav`), bytes);
  sources[kind] = {
    module: ceremony ? 'src/ui/ceremony-sounds.js' : 'src/ui/sound-cues.js',
    duration: data.length / SOUND_SAMPLE_RATE,
    sourceSampleRate: ceremony ? CEREMONY_SAMPLE_RATE : SOUND_SAMPLE_RATE,
    gain: 1,
    wavSha256: sha(bytes),
  };
}
async function soundtrack(theme, device) {
  const themeTimeline = timeline.map((event) =>
    event.sound === 'chip' ? { ...event, soundAt: [8 + (theme.duration / 1000) * 0.75] } : event,
  );
  const source = `public/audio/background-music${device === 'ios' ? '-mobile' : ''}.m4a`;
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
    { maxBuffer: 10 * 1024 * 1024 },
  );
  const mixed = new Float32Array(SOUND_SAMPLE_RATE * duration);
  for (let i = 0; i < mixed.length; i++) {
    const t = i / SOUND_SAMPLE_RATE;
    const fade = Math.min(1, t / 2.4) * Math.min(1, Math.max(0, (duration - t) / 0.45));
    mixed[i] = i * 4 + 4 <= decoded.length ? decoded.readFloatLE(i * 4) * fade : 0;
  }
  for (const event of themeTimeline)
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
    timeline: themeTimeline,
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
const browser = await chromium.launch({ headless: true });
const records = [],
  renderStarted = Date.now();
const selectedThemes = themes.filter(
  (t) => !process.env.NOIR_VIDEO_THEME || t.id === process.env.NOIR_VIDEO_THEME,
);
const selectedDevices = devices.filter(
  (d) =>
    ['desktop', 'ios'].includes(d.id) &&
    (!process.env.NOIR_VIDEO_DEVICE || d.id === process.env.NOIR_VIDEO_DEVICE),
);

const frozenSource = await readFile('design/pr64-art-direction/screen.mjs');
const frozenSourceSha = sha(frozenSource);
const frozenCssSha = sha(await readFile('design/pr64-art-direction/screen.css'));

async function prepareScene(page, theme, device, chapter) {
  const loadedCss = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/screen.css',
  );
  const loadedScript = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/screen.mjs',
  );
  const screen = chapter.screen || (device.id === 'ios' ? 'table5' : 'table9');
  await page.goto(`${host}/screen.html?theme=${theme.id}&device=${device.id}&screen=${screen}`, {
    waitUntil: 'networkidle',
  });
  const actualScript = await loadedScript;
  if (sha(await (await loadedCss).body()) !== frozenCssSha)
    throw new Error('Rendered screen.css differs from the frozen source');
  if (sha(await actualScript.body()) !== frozenSourceSha)
    throw new Error('Rendered screen.mjs differs from the frozen source');
  await page.waitForFunction(
    () =>
      document.body.dataset.ready === 'true' &&
      document.querySelector('.table-wrap')?.textContent.length > 20,
  );
  await page.evaluate(() => window.designReady);
  if (chapter.id !== 'core') {
    await page.addStyleTag({ url: host + '/runtime/styles/game-effects.css' });
    await page.addStyleTag({ url: host + '/runtime/styles/emotion-effects.css' });
  }
  await page.addStyleTag({
    content: `
    body { overflow: hidden !important; }
    .demo .board .card { animation-duration: ${theme.duration * 5}ms !important; }
    .demo .hero-cards .card { animation-duration: ${theme.duration * 2.4}ms !important; }
    .demo .pot-chips { display: flex !important; animation-duration: ${theme.duration}ms !important; }
    .home-indicator { z-index: 100 !important; }
    .video-label { position: fixed; right: ${device.id === 'desktop' ? '37' : '17'}px; bottom: ${device.id === 'desktop' ? '18' : '39'}px; z-index: 100; font: ${device.id === 'desktop' ? '11' : '8'}px Manrope,Noto,sans-serif; letter-spacing: .025em; color: #bdd1c5; background: #07100ddc; border: 1px solid #ffffff19; border-radius: 4px; padding: 7px 10px; }
    .video-label b { color: var(--accent); font-weight: 500; }
    .video-check-marker { position: absolute; left: 50%; top: 83%; width: 56px; height: 56px; margin: -28px 0 0 -28px; border: 1px solid var(--accent); border-radius: 50%; opacity: 0; pointer-events: none; z-index: 9; }
    .video-settlement { position: absolute; z-index: 12; left: 50%; top: 44%; transform: translate(-50%,-50%); text-align: center; padding: 23px 17px; border: 1px solid color-mix(in srgb,var(--accent),transparent 45%); background: color-mix(in srgb,var(--panel),transparent 3%); box-shadow: 0 12px 50px #0008; border-radius: var(--radius); min-width: ${device.id === 'desktop' ? '270' : '220'}px; opacity: 0; }
    .video-end-actions { position: absolute; left: 12px; right: 12px; bottom: 15px; display: flex; gap: 8px; opacity: 0; pointer-events: none; }
    .video-end-actions button { flex: 1; min-height: 49px; font-size: 11px; padding: 10px; }
    .action-area { position: relative; }
    .settlement-actions > button { min-width: 90px; white-space: nowrap; }
    .video-settlement strong { display: block; color: var(--accent); font-size: ${device.id === 'desktop' ? '35' : '26'}px; font-weight: 600; margin-top: 7px; }
    .video-settlement span { font-size: ${device.id === 'desktop' ? '15' : '12'}px; }
    .video-settlement small { display: block; font-size: ${device.id === 'desktop' ? '11' : '9'}px; color: #a7bdb0; margin-top: 9px; }
    .video-extra-strong .strong-start .card { box-shadow: 0 3px 6px #0005; }
    .video-extra-strong .hero-cards { position: relative; }
    .video-extra-strong .premium-sparks { inset: -3px; }
    .video-extra-rebuy .rebuy-cue { animation: rebuy-burst 1.3s cubic-bezier(.2,.8,.3,1) both; }
    .video-extra-champion .design-confetti { display: none; }
    .video-extra-champion .result-overlay { opacity: 0; }
    .video-extra-champion .hero-label { position: relative; }
    .video-extra-champion .champion-crown { left: -18px; top: -14px; opacity: 0; }
    .video-extra-farewell .result-overlay { display: none; }
    .farewell-stage { top: -2%; }
  `,
  });
  await page.evaluate(
    ({ title, chapter, sparks, pieces }) => {
      document.body.classList.add('video-extra-' + chapter.id);
      const label = document.createElement('div');
      label.className = 'video-label';
      label.innerHTML = `<b>${title} · ${chapter.label}</b> · 动效样片 · 非安装版录屏`;
      document.body.append(label);
      if (chapter.id === 'core') {
        const marker = document.createElement('span');
        marker.className = 'video-check-marker';
        document.querySelector('.felt-area').append(marker);
        const settlement = document.createElement('div');
        settlement.className = 'video-settlement';
        settlement.innerHTML =
          '<span>你赢得本手底池</span><strong>+2,400</strong><small>A 一对 · 让好决策自然积累</small>';
        document.querySelector('.felt-area').append(settlement);
        const end = document.createElement('div');
        end.className = 'video-end-actions';
        end.innerHTML =
          '<button class="primary">查看复盘</button><button class="secondary">再练这一手</button><button class="secondary">下一手 →</button>';
        document.querySelector('.action-area').append(end);
      } else if (chapter.id === 'strong') {
        const cards = document.querySelector('.hero-cards');
        cards.classList.add('premium-start');
        cards.querySelectorAll('.card').forEach((el) => el.classList.add('playing-card'));
        cards.querySelector('.premium-sparks').innerHTML = sparks
          .map((p) => `<i class="premium-spark" style="${p.style}"></i>`)
          .join('');
      } else if (chapter.id === 'emotion') {
        document.querySelectorAll('.avatar-wrap').forEach((wrap) => {
          const mood = [...wrap.classList].find((c) => c.startsWith('mood-'));
          if (!mood) return;
          wrap.querySelector('.avatar').classList.add(mood);
          const badge = wrap.querySelector('.mood-icon');
          if (badge) {
            badge.textContent = '';
            badge.classList.add('mood-badge', 'mood-live', mood);
          }
        });
      } else if (chapter.id === 'rebuy') {
        document.querySelector('.hero-label>b').classList.add('stack-refill');
        document.querySelector('.hero-label>b').style.setProperty('--refill-width', '5.6em');
      } else if (chapter.id === 'champion') {
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
        const hero = document.querySelector('.hero-label');
        const r = hero.getBoundingClientRect();
        stage.style.setProperty('--crown-x', `${r.left + r.width / 2 - innerWidth / 2}px`);
        stage.style.setProperty('--crown-y', `${r.top - innerHeight * 0.45}px`);
        stage.style.setProperty('--crown-scale', '.25');
        const worn = document.createElement('span');
        worn.className = 'champion-crown';
        worn.innerHTML = '<span class="crown-shape"></span>';
        hero.append(worn);
      } else if (chapter.id === 'farewell') {
        const stage = document.createElement('div');
        stage.className = 'farewell-stage';
        stage.innerHTML =
          '<div class="farewell-ring"></div><div class="farewell-card"><span class="farewell-title">很遗憾，本局结束</span><strong class="farewell-place">第5名</strong><span class="farewell-note">这一局的经验，留给下一次决策。</span></div>';
        document.querySelector('.felt-area').append(stage);
      }
    },
    { title: theme.name, chapter, sparks: premiumSparks(12), pieces: confettiPieces(24) },
  );
  return page.evaluate(() => ({
    table: document.querySelector('.table-wrap').getBoundingClientRect().toJSON(),
    action: (
      document.querySelector('.action-buttons') || document.querySelector('.settlement-actions')
    )
      ?.getBoundingClientRect()
      .toJSON(),
    width: innerWidth,
    height: innerHeight,
  }));
}
async function setFrame(page, seconds, theme, chapter) {
  await page.evaluate(
    ({ seconds, motion, chapter, count }) => {
      const local = seconds - chapter.at,
        clamp = (value) => Math.max(0, Math.min(1, value));
      if (chapter.id === 'core') {
        window.setDemoTime(seconds);
        const phase =
          seconds < 2
            ? ['正在发牌', '请稍候']
            : seconds < 5
              ? ['公共牌展开', '等待对手行动']
              : seconds < 8
                ? ['轮到你行动', '需跟注 600']
                : seconds < 11
                  ? ['你加注至 1,800', '筹码已投入底池']
                  : seconds < 14
                    ? ['你过牌', '等待下一位玩家']
                    : ['本手已结束', '查看复盘，积累经验'];
        const cue = document.querySelector('.turn-line');
        if (cue) cue.innerHTML = `<strong>${phase[0]}</strong><span>${phase[1]}</span>`;
        const marker = document.querySelector('.video-check-marker'),
          check = clamp((seconds - 11) / motion);
        marker.style.opacity =
          seconds >= 11 && seconds < 11 + motion ? String(0.7 * (1 - check)) : '0';
        marker.style.transform = `scale(${0.7 + check * 0.55})`;
        const settle = clamp((seconds - 14) / motion),
          result = document.querySelector('.video-settlement');
        result.style.opacity = String(settle);
        result.style.transform = `translate(-50%,calc(-50% + ${(1 - settle) * 12}px))`;
        const chips = document.querySelector('.pot-chips');
        if (seconds >= 14) chips.style.opacity = String(1 - settle);
        else chips.style.removeProperty('opacity');
        const pot = document.querySelector('.pot strong');
        if (pot) pot.textContent = seconds >= 14 + motion ? '0' : '2,400';
        document
          .querySelectorAll('.bet-control,.action-buttons')
          .forEach((el) => (el.style.opacity = String(1 - settle)));
        document.querySelector('.video-end-actions').style.opacity = String(settle);
        if (seconds >= 14 + motion)
          document.querySelector('.table-top>span').innerHTML =
            '第 03 局 · 第 12 手 <i>·</i> 已结算';
        const hero = document.querySelector('.hero-label>b');
        if (hero) hero.textContent = seconds >= 14 + motion ? '21,200' : '18,800';
      } else {
        if (chapter.id === 'rebuy') {
          const index = Math.min(9, Math.floor(clamp(local / 1.3) * 10));
          document.querySelector('.hero-label>b').textContent =
            count[index].toLocaleString('en-US');
        }
        if (chapter.id === 'champion') {
          const opacity = clamp((local - 2.3) / motion);
          document.querySelector('.result-overlay').style.opacity = String(opacity);
          document.querySelector('.champion-crown').style.opacity = local >= 2.15 ? '1' : '0';
        }
        document.getAnimations().forEach((animation) => {
          animation.pause();
          animation.currentTime = local * 1000;
        });
      }
    },
    { seconds, motion: theme.duration / 1000, chapter, count: refillCountValues(20000) },
  );
}

for (const theme of selectedThemes)
  for (const device of selectedDevices) {
    const sampleStarted = Date.now();
    const page = await browser.newPage({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: 1,
      reducedMotion: 'no-preference',
    });
    await page.route('**/*', (route) => route.continue());
    let current = null,
      geometry = {};
    async function frame(seconds) {
      const chapter = chapters.find((c) => seconds >= c.at && seconds < c.until) || chapters.at(-1);
      if (chapter.id !== current?.id) {
        geometry[chapter.id] = await prepareScene(page, theme, device, chapter);
        current = chapter;
      }
      await setFrame(page, seconds, theme, chapter);
      return page.screenshot({ type: 'png', animations: 'allow' });
    }
    const stem = `${theme.id}-${device.id}${args.has('--preview') ? '-preview' : ''}`;
    if (args.has('--keyframes')) {
      for (const [seconds, name] of keyframes)
        await writeFile(path.join(out, `${stem}-${name}.png`), await frame(seconds));
      await page.close();
      records.push({
        kind: 'keyframes',
        theme: theme.id,
        device: device.id,
        width: device.width,
        height: device.height,
        sourceSha256: frozenSourceSha,
        renderSeconds: (Date.now() - sampleStarted) / 1000,
        files: keyframes.map(([seconds, name]) => ({
          seconds,
          path: `videos/${stem}-${name}.png`,
        })),
        geometry,
      });
      console.log(`${stem}: reviewed keyframes saved`);
      continue;
    }
    const file = path.join(out, stem + '.mp4'),
      frameCount = args.has('--preview') ? 32 : duration * fps;
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
        String(args.has('--preview') ? frameCount / fps : duration),
        '-movflags',
        '+faststart',
        file,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    let encoderError = '';
    encoder.stderr.on('data', (data) => {
      encoderError += data;
    });
    const finished = once(encoder, 'close');
    for (let f = 0; f < frameCount; f++) {
      const seconds = args.has('--preview') ? ((f / fps) * duration) / (frameCount / fps) : f / fps;
      const data = await frame(seconds);
      if (!encoder.stdin.write(data)) await once(encoder.stdin, 'drain');
      const keyframe = keyframes.find(([time]) => Math.round(time * fps) === f);
      if (!args.has('--preview') && keyframe)
        await writeFile(path.join(out, `${stem}-${keyframe[1]}.png`), data);
      if (f && f % (fps * 4) === 0) console.log(`${stem}: ${f / fps}/${duration}s rendered`);
    }
    encoder.stdin.end();
    const [code] = await finished;
    if (code !== 0) throw new Error(`ffmpeg ${code}: ${encoderError}`);
    await page.close();
    const metadata = JSON.parse(
      execFileSync(
        'ffprobe',
        ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file],
        { encoding: 'utf8' },
      ),
    );
    const video = metadata.streams.find((s) => s.codec_type === 'video'),
      sound = metadata.streams.find((s) => s.codec_type === 'audio');
    if (!video || !sound || video.codec_name !== 'h264' || sound.codec_name !== 'aac')
      throw new Error('Missing or incorrect media tracks');
    const decoded = execFileSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        file,
        '-vn',
        '-f',
        'f32le',
        '-ac',
        '1',
        'pipe:1',
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    let decodedPeak = 0;
    for (let i = 0; i + 4 <= decoded.length; i += 4)
      decodedPeak = Math.max(decodedPeak, Math.abs(decoded.readFloatLE(i)));
    records.push({
      theme: theme.id,
      device: device.id,
      motionDurationMs: theme.duration,
      renderSeconds: (Date.now() - sampleStarted) / 1000,
      path: path.relative(path.resolve('.artifacts/art-direction-pr64'), file),
      sha256: sha(await readFile(file)),
      width: video.width,
      height: video.height,
      duration: Number(metadata.format.duration),
      fps: video.r_frame_rate,
      frameCount: video.nb_frames,
      videoCodec: video.codec_name,
      pixelFormat: video.pix_fmt,
      audioCodec: sound.codec_name,
      audioSampleRate: sound.sample_rate,
      decodedAudioSamplePeak: decodedPeak,
      audioClippingDetected: decodedPeak >= 1,
      padding: device.width % 2 ? 'right 1px for H.264 yuv420p, without UI scaling' : 'none',
      size: Number(metadata.format.size),
      geometry,
    });
    console.log(
      `${stem} done: ${metadata.format.duration}s, H.264/AAC, ${video.width}x${video.height}`,
    );
  }
await browser.close();
if (
  !args.has('--keyframes') &&
  !args.has('--preview') &&
  selectedThemes.length === 3 &&
  selectedDevices.length === 2
) {
  const comparison = path.join(out, 'three-directions-mobile.mp4');
  const inputs = themes.map((theme) => path.join(out, `${theme.id}-ios.mp4`));
  const started = Date.now();
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    ...inputs.flatMap((input) => ['-i', input]),
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
    comparison,
  ]);
  const metadata = JSON.parse(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', comparison],
      { encoding: 'utf8' },
    ),
  );
  const video = metadata.streams.find((stream) => stream.codec_type === 'video');
  const sound = metadata.streams.find((stream) => stream.codec_type === 'audio');
  records.push({
    kind: 'comparison',
    path: 'videos/three-directions-mobile.mp4',
    sha256: sha(await readFile(comparison)),
    sources: await Promise.all(
      inputs.map(async (input) => ({
        path: path.relative(path.resolve('.artifacts/art-direction-pr64'), input),
        sha256: sha(await readFile(input)),
      })),
    ),
    sourceAudio: 'videos/jade-ios.mp4 · only its original AAC audio stream, no stacking',
    width: video.width,
    height: video.height,
    duration: Number(metadata.format.duration),
    fps: video.r_frame_rate,
    frameCount: video.nb_frames,
    videoCodec: video.codec_name,
    pixelFormat: video.pix_fmt,
    audioCodec: sound.codec_name,
    audioSampleRate: sound.sample_rate,
    audioTracks: metadata.streams.filter((stream) => stream.codec_type === 'audio').length,
    decodedAudioSamplePeak: records.find(
      (record) => record.theme === 'jade' && record.device === 'ios',
    )?.decodedAudioSamplePeak,
    audioClippingDetected: records.find(
      (record) => record.theme === 'jade' && record.device === 'ios',
    )?.audioClippingDetected,
    audioValidation: 'Single AAC stream copied from jade-iOS; no stacked audio',
    size: Number(metadata.format.size),
    renderSeconds: (Date.now() - started) / 1000,
  });
  console.log('three-directions-mobile done: 32s, 1182x852, one AAC track');
}
const finalBase = (await import(`./manifest.mjs?audit=${Date.now()}`)).base;
const draftBaseSha = '03d785e314758841a865ce31e299d244c91fb5b6';
const equivalentFiles = [
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
  equivalentFiles.map(async (file) => {
    const original = execFileSync('git', ['show', `${draftBaseSha}:${file}`], {
      maxBuffer: 10 * 1024 * 1024,
    });
    const current = await readFile(file);
    return {
      file,
      draftSha256: sha(original),
      currentSha256: sha(current),
      byteIdentical: original.equals(current),
    };
  }),
);
const baselineEvidence = {
  draftBaseSha,
  finalPr64BaseSha: finalBase.sha,
  finalWorkingTreeCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  effectsAndSoundByteIdentical: equivalence.every((file) => file.byteIdentical),
  files: equivalence,
};
await writeFile(path.join(out, 'base-equivalence.json'), JSON.stringify(baselineEvidence, null, 2));
await writeFile(
  path.join(
    out,
    args.has('--keyframes')
      ? 'keyframes-audit.json'
      : args.has('--preview')
        ? 'preview-media-audit.json'
        : 'media-audit.json',
  ),
  JSON.stringify(
    {
      base: finalBase,
      renderStartedWithBase: base,
      baselineEvidence,
      duration,
      fps,
      renderSeconds: (Date.now() - renderStarted) / 1000,
      frozenSourceSha256: frozenSourceSha,
      frozenCssSha256: frozenCssSha,
      type: '逐帧浏览器渲染的美术与动效片段集；不是原生/微信安装版运行或一手连续合法牌局录屏',
      chapters,
      timeline,
      sharedEffects: [
        'src/ui/effect-layouts.js',
        'src/styles/game-effects.css',
        'src/styles/emotion-effects.css',
      ],
      referenceVideo: '/Users/zjz/Downloads/effects-comparison.mp4',
      sourceCues: sources,
      backgroundAudio: audio,
      mix: '背景单位增益与2.4秒渐入；前景单位增益，仪式音22050Hz线性重采样44100Hz；混音使用共用limitSoundMix，不因动作压低背景。',
      recordings: records,
    },
    null,
    2,
  ),
);
console.log(
  args.has('--keyframes')
    ? `Completed ${records.length} keyframe sets / ${records.length * keyframes.length} PNGs`
    : `Completed ${records.length} media samples`,
);
