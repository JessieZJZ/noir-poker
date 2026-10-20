// Prepare held-out observation sessions. Private keys never enter review packets.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fork } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const args = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')));
const out = resolve(args.out || '.artifacts/style-audit-2026-10-20/blind-round-1-isolated');
const root = resolve(args.root || '.');
const { BOT_PROFILES } = await import(pathToFileURL(join(root, 'src/engine/bot-profiles.js')));
const seeds = (args.seeds || '38418,50613,81343').split(',').map(Number);
const hands = Number(args.hands || 50);
if (!Number.isSafeInteger(hands) || hands < 1 || hands > 1000)
  throw Error('--hands must be an integer from 1 to 1000');
const random = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const cards = (hand) => hand.map((c) => '23456789TJQKA'[c.rank - 2] + 'shcd'[c.suit]).join(' ');
mkdirSync(join(out, 'private'), { recursive: true });
const jobs = [];
for (let reviewer = 0; reviewer < seeds.length; reviewer++) {
  const ids = BOT_PROFILES.map((p) => p.id),
    rng = random(seeds[reviewer]);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const key = Object.fromEntries(ids.map((id, i) => [String.fromCharCode(65 + i), id]));
  const dir = join(out, `reviewer-${reviewer + 1}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(out, 'private', `key-${reviewer + 1}.json`), JSON.stringify(key, null, 2));
  writeFileSync(
    join(dir, 'README.txt'),
    [
      '独立 AI 公开牌谱盲评。每个代号是一个固定策略对手，位置会轮换。',
      '5 人桌，每手 100 BB，SB/BB=100/200，无情绪，进阶难度。其他座位是固定的陪测策略。',
      `每个代号包含连续 ${hands} 手，没有筛选胜负或特色动作。牌局由真实游戏引擎完成。`,
      '每手仅披露 Hero 底牌、公开行动，以及确实进入摊牌的未弃牌底牌。',
      'history 中 betTo 为本街总下注额，paid 为新增投入，potBefore 为动作前底池。',
      '你可以使用公开内容计算统计，但不得读取项目源码、其他目录、private 目录或其他评审结果。',
      '先自由描述各代号的行为并引用代号/手号，不预设一定能区分。证据不够时明确写不确定。',
      '评价可辨认程度、行为一致性、应对策略、突兀行为和游戏体验。暂时不要猜真实人物。',
      '先将自由描述写入 free-review.md；之后会另给分类问卷。',
    ].join('\n'),
  );
  // Different sessions must not share initial deals: a showdown in one
  // packet must never reveal a folded hand from another anonymous opponent.
  for (const [code, id] of Object.entries(key))
    jobs.push({
      reviewer,
      code,
      id,
      dir,
      seed: seeds[reviewer] + (code.charCodeAt(0) - 65) * 131071,
    });
}
let next = 0,
  done = 0;
async function worker() {
  while (next < jobs.length) {
    const job = jobs[next++];
    const raw = join(out, 'private', `raw-${job.reviewer + 1}-${job.code}`);
    await new Promise((ok, fail) => {
      const child = fork(
        new URL('./style-audit.mjs', import.meta.url),
        [
          '--mode=job',
          `--root=${root}`,
          `--out=${raw}`,
          `--hands=${hands}`,
          '--players=5',
          '--difficulty=hard',
          `--seed=${job.seed}`,
          `--profile=${job.id}`,
          '--public=yes',
          '--opponents=current',
        ],
        { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] },
      );
      child.on('exit', (code) => (code === 0 ? ok() : fail(Error(`blind job failed ${code}`))));
    });
    const name = `${job.id}-5-hard-${job.seed}`;
    const data = JSON.parse(readFileSync(join(raw, name + '.public.json')));
    const rows = data.map((hand) => {
      const stacks = Array(5).fill(20000),
        bets = Array(5).fill(0);
      const sb = (hand.dealer + 1) % 5,
        bb = (hand.dealer + 2) % 5;
      stacks[sb] -= 100;
      stacks[bb] -= 200;
      bets[sb] = 100;
      bets[bb] = 200;
      let street = 0,
        pot = 300,
        current = 200;
      const who = (id) => (id === hand.target ? job.code : id === 0 ? 'Hero' : `R${id}`);
      const history = hand.history.map((event) => {
        if (event.street !== street) {
          street = event.street;
          bets.fill(0);
          current = 0;
        }
        const paid =
          event.action === 'call'
            ? Math.min(stacks[event.id], Math.max(0, current - bets[event.id]))
            : event.action === 'raise'
              ? event.amount - bets[event.id]
              : 0;
        const row = {
          street: event.street,
          actor: who(event.id),
          action: event.action,
          paid,
          potBefore: pot,
          ...(event.action === 'raise' ? { betTo: event.amount } : {}),
        };
        stacks[event.id] -= paid;
        bets[event.id] += paid;
        pot += paid;
        if (event.action === 'raise') current = event.amount;
        return row;
      });
      return {
        hand: hand.hand,
        dealer: who(hand.dealer),
        targetSeat: hand.target,
        hero: cards(hand.hero),
        board: cards(hand.board),
        history,
        showdown: hand.showdown.map((p) => ({ actor: who(p.id), hole: cards(p.hole) })),
        targetNetBB: (hand.finalStacks[hand.target] - 20000) / 200,
      };
    });
    writeFileSync(
      join(job.dir, job.code + '.jsonl'),
      rows.map((r) => JSON.stringify(r)).join('\n') + '\n',
    );
    const meta = JSON.parse(readFileSync(join(raw, name + '.json')));
    writeFileSync(
      join(out, 'private', `metadata-${job.reviewer + 1}-${job.code}.json`),
      JSON.stringify({
        sourceDigest: meta.sourceDigest,
        harnessDigest: meta.harnessDigest,
        seed: job.seed,
        profile: job.id,
        code: job.code,
      }),
    );
    done++;
    console.log(`${done}/${jobs.length} anonymous ${hands}-hand sessions prepared`);
  }
}
await Promise.all(Array.from({ length: +(args.workers || 2) }, worker));
