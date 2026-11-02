// Reproducible policy audit. Full hands use production botDecision sampling;
// paired probes reuse only before-action actor/public snapshots.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { fork } from 'node:child_process';
import { completedCardInspection } from './style-public-snapshot.mjs';
import { freshSimulationGame } from './style-simulation-game.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')));
const root = resolve(args.root || '.');
const out = resolve(args.out || '.artifacts/style-audit-2026-10-20/current');
const load = (name) => import(pathToFileURL(join(root, 'src/engine', name + '.js')));
const engine = await load('poker');
const { BOT_PROFILES, chooseBotAction, freshBotMood } = await load('bot-profiles');
const currentCompanions = (args.companions || 'balanced,jett,rook').split(',');
if (currentCompanions.some((id) => !BOT_PROFILES.some((p) => p.id === id)))
  throw Error('--companions must contain active style IDs');
const referenceRoot = resolve(
  args['reference-root'] || '.artifacts/style-audit-2026-10-20/baseline',
);
const referenceSelector = (
  await import(pathToFileURL(join(referenceRoot, 'src/engine/bot-profiles.js')))
).chooseBotAction;
const protocol = 'split-streams-v2.4';
const references = JSON.parse(
  readFileSync(new URL('../tests/fixtures/character-strategies.json', import.meta.url)),
);
const harnessDigest = createHash('sha256')
  .update(readFileSync(new URL(import.meta.url)))
  .update(readFileSync(new URL('./style-public-snapshot.mjs', import.meta.url)))
  .update(readFileSync(new URL('./style-simulation-game.mjs', import.meta.url)))
  .digest('hex');
const seeded = (initial) => {
  let n = initial >>> 0;
  return () => (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296;
};
const digest = () => {
  const h = createHash('sha256');
  for (const file of readdirSync(join(root, 'src/engine'))
    .filter((p) => p.endsWith('.js'))
    .sort())
    h.update(file).update(readFileSync(join(root, 'src/engine', file)));
  h.update(readFileSync(join(root, 'src/data/characters.json')));
  return h.digest('hex');
};

// Eligibility never reads the selected profile or its intent/trace flags.
export function opportunities(v) {
  const l = v.legal,
    f = v.features,
    result = [];
  const safe = !v.allIn && !(v.opponents || []).some((p) => p.allin);
  const hu = v.rivals === 1 && (v.publicEquity?.assumedOpponentIds.length ?? 1) === 1;
  const raises = v.history.filter((a) => a.street === v.street && a.action === 'raise');
  const last = v.history.filter((a) => a.action === 'raise').at(-1);
  const odds = v.callPrice?.odds ?? l.callAmount / Math.max(1, v.contestable);
  const pressure = l.callAmount / Math.max(1, v.stack + v.bet);
  if (safe && !v.street && l.toCall > 0 && v.currentBet <= v.bigBlind && pressure <= 0.08)
    result.push('cheap-entry');
  if (
    safe &&
    !v.street &&
    raises.length === 1 &&
    raises[0].id !== v.id &&
    l.toCall > 0 &&
    v.currentBet <= 4 * v.bigBlind &&
    pressure <= 0.08
  )
    result.push('small-open-defense');
  if (
    !v.street &&
    !raises.length &&
    ['BTN', 'CO'].includes(v.position) &&
    !v.history.some((a) => a.action === 'call' && a.amount > 0) &&
    safe
  )
    result.push('late-open');
  if (!v.street || !safe || !hu || !l.canRaise) return result;
  const checked = l.canCheck;
  const dry = !f.wet;
  if (
    v.street < 3 &&
    f.draw &&
    pressure <= 0.12 &&
    (checked || odds <= Math.min(0.25, (f.drawOuts || 0) / (52 - v.hole.length - v.board.length)))
  )
    result.push('draw-pressure');
  const boardHigh = Math.max(0, ...v.board.map((c) => c.rank));
  const ranks = v.hole.map((c) => c.rank);
  const safeTopPair =
    v.street === 1 &&
    f.ownPair &&
    f.madeCategory === 1 &&
    v.board.filter((c) => c.rank === boardHigh).length === 1 &&
    ranks.includes(boardHigh) &&
    Math.max(0, ...ranks.filter((rank) => rank !== boardHigh)) >= 12;
  const ownStrong =
    !v.playsBoard && (f.strongMade || safeTopPair || (f.overpair && Math.max(...ranks) >= 12));
  const effective = Math.min(v.stack, Math.max(0, ...(v.opponents || []).map((p) => p.stack)));
  if (
    checked &&
    dry &&
    ownStrong &&
    v.equity >= 0.72 &&
    effective >= v.pot * 2 &&
    (v.street < 3 ||
      (!v.inPosition &&
        (v.opponents || []).every(
          (p) => !v.history.some((a) => a.street === v.street && a.id === p.id),
        )))
  )
    result.push('safe-value-induction');
  if (
    checked &&
    dry &&
    v.street < 3 &&
    f.ownPair &&
    !f.draw &&
    !f.strongMade &&
    v.equity >= 0.4 &&
    v.equity <= 0.65
  )
    result.push('medium-pot-control');
  if (
    checked &&
    v.street === 1 &&
    v.inPosition &&
    dry &&
    last?.id === v.id &&
    Math.max(...v.board.map((c) => c.rank)) >= 12 &&
    v.equity >= 0.28 &&
    !v.playsBoard
  )
    result.push('dry-high-cbet');
  if (
    checked &&
    v.street === 2 &&
    v.history.some((a) => a.street === 1 && a.id === v.id && a.action === 'raise') &&
    (f.ownMade || f.draw) &&
    v.equity >= 0.35
  )
    result.push('turn-barrel');
  if (
    v.street === 1 &&
    v.inPosition &&
    dry &&
    !f.ownMade &&
    !f.draw &&
    Math.max(...v.hole.map((c) => c.rank)) >= 11 &&
    v.equity >= 0.15 &&
    v.equity <= 0.4 &&
    l.callAmount > 0 &&
    l.callAmount <= v.pot * 0.25 &&
    pressure <= 0.08
  )
    result.push('float-price');
  if (
    checked &&
    v.street === 2 &&
    v.inPosition &&
    dry &&
    v.history.some((a) => a.street === 1 && a.id === v.id && a.action === 'call') &&
    v.history.some((a) => a.street === 2 && a.id !== v.id && a.action === 'check') &&
    !f.ownMade &&
    !f.draw &&
    v.equity >= 0.15 &&
    v.equity < 0.45
  )
    result.push('delayed-probe');
  if (checked && v.street === 3 && f.ownMade && v.equity >= 0.72 && !v.playsBoard)
    result.push('river-value');
  if (
    checked &&
    v.inPosition &&
    v.street === 3 &&
    dry &&
    !f.ownMade &&
    !f.draw &&
    v.equity < 0.45 &&
    Math.max(...v.hole.map((c) => c.rank)) >= 13
  )
    result.push('river-probe');
  return result;
}

export function record(bucket, d, v) {
  bucket.n++;
  bucket[d.action]++;
  if (d.action === 'raise') {
    const fraction = (d.amount - v.currentBet) / Math.max(1, v.pot + v.legal.callAmount);
    bucket.small += Number(fraction <= 0.45);
    bucket.large += Number(fraction >= 0.85);
    bucket.fraction += fraction;
  }
}
const empty = () => ({
  n: 0,
  fold: 0,
  check: 0,
  call: 0,
  raise: 0,
  small: 0,
  large: 0,
  fraction: 0,
});
const validate = (g) => {
  if (g.players.some((p) => p.stack < 0 || p.stack % g.chipUnit || p.total % g.chipUnit))
    throw Error('Invalid chip ledger');
  if (
    g.phase === 'done' &&
    g.players.reduce((s, p) => s + p.stack, 0) !== g.players.length * g.bigBlind * 100
  )
    throw Error('Chip conservation failed');
};

if (args.mode === 'job') {
  const count = +args.players,
    hands = +args.hands,
    seed = +args.seed;
  const profile = args.profile,
    difficulty = args.difficulty;
  const metrics = {},
    corpus = {},
    totals = { hands, vpip: 0, pfr: 0, post: 0, postRaises: 0, postCalls: 0, decisions: 0 };
  const publicHands = [];
  // A separate evolving stream avoids correlated first LCG draws for every
  // event. Per-cell/metric hashing does not consume deck or policy randomness.
  const reservoirStreams = new Map();
  const reservoirRandom = (metric) => {
    if (!reservoirStreams.has(metric)) {
      let hash = 2166136261;
      for (const c of `${seed}/${profile}/${count}/${difficulty}/${metric}`)
        hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
      reservoirStreams.set(metric, seeded(hash));
    }
    return reservoirStreams.get(metric)();
  };
  // Separate per-hand policy/deck streams prevent earlier policy divergence
  // from changing the initial deal in subsequent paired hands.
  for (let h = 0; h < hands; h++) {
    const g = freshSimulationGame(engine, count, h, difficulty);
    const deckRandom = seeded(seed + h * 700001 + 19);
    const target = 1 + (h % (count - 1));
    const old = Math.random;
    Math.random = deckRandom;
    try {
      engine.startHand(g);
    } finally {
      Math.random = old;
    }
    if (g.players.some((p) => p.out || p.hole.length !== 2))
      throw Error('Independent sample inherited an eliminated seat');
    g.players[target].botProfile = profile;
    let vpip = false,
      pfr = false,
      loops = 0;
    const events = [];
    while (g.phase !== 'done') {
      if (++loops > 600) throw Error('Unfinished hand');
      if (g.phase === 'between') {
        engine.advanceStreet(g);
        continue;
      }
      const actor = g.actor,
        decisionSeed = seed + h * 100003 + g.history.length * 7919 + 71,
        production = engine.botDecision(g, seeded(decisionSeed)),
        v = production.trace.view;
      // Fixed pre-calibration opponents supply a range of public prices.
      // Equity and legality still come from the production botDecision view.
      const referenceId =
        args.opponents === 'current'
          ? currentCompanions[actor % currentCompanions.length]
          : ['balanced', 'nico', 'rook'][actor % 3];
      const reference =
        args.opponents === 'current'
          ? BOT_PROFILES.find((p) => p.id === referenceId) || BOT_PROFILES[0]
          : references.find((p) => p.id === referenceId);
      const selector = args.opponents === 'current' ? chooseBotAction : referenceSelector;
      const d =
        actor === target
          ? chooseBotAction(
              v,
              BOT_PROFILES.find((p) => p.id === profile),
              freshBotMood(),
              'off',
              seeded(decisionSeed + 13000019),
            )
          : selector(
              v,
              { ...reference, name: 'Reference' },
              freshBotMood(),
              'off',
              seeded(decisionSeed + 13000019),
            );
      if (actor === target) {
        totals.decisions++;
        if (v.street === 0) {
          vpip ||= ['call', 'raise'].includes(d.action) && v.legal.callAmount > 0;
          pfr ||= d.action === 'raise';
        } else {
          totals.post++;
          totals.postRaises += Number(d.action === 'raise');
          totals.postCalls += Number(d.action === 'call');
        }
        for (const metric of opportunities(v)) {
          record((metrics[metric] ||= empty()), d, v);
          const items = (corpus[metric] ||= []);
          // Deterministic reservoir across the complete run, not first-hand cherry-picking.
          const index = Math.floor(reservoirRandom(metric) * metrics[metric].n);
          const snapshot = { ...v, auditUnit: `${profile}-${count}-${difficulty}-${seed}-${h}` };
          if (items.length < 8) items.push(snapshot);
          else if (index < 8) items[index] = snapshot;
        }
      }
      events.push({
        street: g.street,
        id: actor,
        action: d.action,
        ...(d.amount == null ? {} : { amount: d.amount }),
      });
      engine.act(g, actor, d.action, d.amount);
      validate(g);
    }
    validate(g); // Includes river settlement reached through advanceStreet.
    totals.vpip += Number(vpip || pfr);
    totals.pfr += Number(pfr);
    if (args.public === 'yes')
      publicHands.push({
        hand: h + 1,
        target,
        dealer: g.dealer,
        board: g.board,
        history: events,
        hero: g.players[0].hole,
        showdown:
          g.players.filter((p) => !p.folded).length > 1
            ? g.players.filter((p) => !p.folded).map((p) => ({ id: p.id, hole: p.hole }))
            : [],
        ...(args.inspection === 'completed'
          ? {
              inspection: completedCardInspection(
                g,
                true,
                (id) => id,
                (hole) => hole,
              ),
            }
          : {}),
        finalStacks: g.players.map((p) => p.stack),
      });
  }
  mkdirSync(out, { recursive: true });
  const name = `${profile}-${count}-${difficulty}-${seed}`;
  writeFileSync(
    join(out, name + '.json'),
    JSON.stringify({
      profile,
      count,
      difficulty,
      seed,
      totals,
      metrics,
      sourceDigest: digest(),
      harnessDigest,
      protocol,
      referenceRoot,
      opponents: args.opponents || 'frozen',
      ...(args.opponents === 'current' ? { companions: currentCompanions } : {}),
      chipConservation: true,
      equitySampling: 'production defaults: 28/52; all-in 72/96/256',
    }),
  );
  writeFileSync(join(out, name + '.corpus.json'), JSON.stringify(corpus));
  if (publicHands.length)
    writeFileSync(join(out, name + '.public.json'), JSON.stringify(publicHands));
} else if (args.mode === 'matrix') {
  mkdirSync(out, { recursive: true });
  const profiles = args.profiles?.split(',') || BOT_PROFILES.map((p) => p.id);
  const counts = (args.players || '5,6,7,8,9').split(',').map(Number);
  const difficulties = (args.difficulties || 'normal,hard').split(',');
  const seeds = (args.seeds || '781,9182,16061').split(',').map(Number);
  const jobs = profiles.flatMap((profile) =>
    counts.flatMap((players) =>
      difficulties.flatMap((difficulty) =>
        seeds.map((seed) => ({ profile, players, difficulty, seed })),
      ),
    ),
  );
  const sourceDigest = digest();
  writeFileSync(
    join(out, 'manifest.json'),
    JSON.stringify(
      {
        sourceDigest,
        harnessDigest,
        protocol,
        referenceRoot,
        profiles,
        counts,
        difficulties,
        seeds,
        handsPerCell: +(args.hands || 80),
        opponents:
          args.opponents === 'current'
            ? 'current policies; test seat rotates each hand'
            : 'frozen historical balanced/small-ball/pressure; test seat rotates each hand',
        ...(args.opponents === 'current' ? { companions: currentCompanions } : {}),
        emotion: 'off',
        startingStacks: '100BB reset each hand',
        chipUnit: 'small blind',
        jobs: jobs.length,
      },
      null,
      2,
    ),
  );
  let next = 0,
    done = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const filename = join(
        out,
        `${job.profile}-${job.players}-${job.difficulty}-${job.seed}.json`,
      );
      try {
        const saved = JSON.parse(readFileSync(filename));
        if (
          saved.sourceDigest === sourceDigest &&
          saved.harnessDigest === harnessDigest &&
          saved.totals.hands === +(args.hands || 80) &&
          saved.chipConservation &&
          JSON.parse(readFileSync(filename.replace(/\.json$/, '.corpus.json')))
        ) {
          done++;
          continue;
        }
      } catch {}
      await new Promise((ok, fail) => {
        const child = fork(
          new URL(import.meta.url),
          [
            '--mode=job',
            `--root=${root}`,
            `--reference-root=${referenceRoot}`,
            `--opponents=${args.opponents || 'frozen'}`,
            ...(args.companions ? [`--companions=${args.companions}`] : []),
            `--out=${out}`,
            `--hands=${args.hands || 80}`,
            ...Object.entries(job).map(([k, v]) => `--${k}=${v}`),
          ],
          { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] },
        );
        child.on('exit', (code) =>
          code === 0 ? ok() : fail(Error(`job failed ${JSON.stringify(job)}`)),
        );
      });
      done++;
      if (done % 15 === 0) console.log(`${done}/${jobs.length} completed`);
    }
  };
  await Promise.all(Array.from({ length: +(args.workers || 4) }, worker));
  console.log(
    `finished ${done} cells / ${done * +(args.hands || 80)} complete hands; digest ${sourceDigest}`,
  );
} else if (args.mode === 'probes') {
  const directory = resolve(args.corpus);
  const corpus = {};
  for (const file of readdirSync(directory)
    .filter((p) => p.endsWith('.corpus.json'))
    .sort()) {
    const data = JSON.parse(readFileSync(join(directory, file)));
    for (const [metric, views] of Object.entries(data)) (corpus[metric] ||= []).push(...views);
  }
  const repetitions = +(args.repetitions || 16),
    results = {};
  for (const profile of BOT_PROFILES) {
    const metrics = (results[profile.id] = {});
    for (const [metric, views] of Object.entries(corpus)) {
      const bucket = (metrics[metric] = empty());
      const byDifficulty = (bucket.byDifficulty = {});
      bucket.snapshots = [];
      for (let i = 0; i < views.length; i++) {
        const counts = empty();
        for (let k = 0; k < repetitions; k++) {
          const v = views[i],
            d = chooseBotAction(
              v,
              profile,
              freshBotMood(),
              'off',
              seeded(15013 + i * 104729 + k * 7919),
            );
          if (
            d.action === 'raise' &&
            (!v.legal.canRaise ||
              d.amount < v.legal.minRaiseTo ||
              d.amount > v.legal.maxRaiseTo ||
              d.amount % v.chipUnit)
          )
            throw Error('Illegal probe raise');
          record(bucket, d, v);
          record((byDifficulty[v.difficulty] ||= empty()), d, v);
          record(counts, d, v);
        }
        bucket.snapshots.push({
          unit: views[i].auditUnit || `${metric}-${i}`,
          difficulty: views[i].difficulty,
          ...counts,
        });
      }
      bucket.distinctSnapshots = views.length;
    }
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, 'probes.json'),
    JSON.stringify(
      {
        sourceDigest: digest(),
        corpusDirectory: directory,
        repetitions,
        description:
          'paired stochastic decisions at identical production public snapshots; NOT completed hands',
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    'wrote paired probes',
    Object.fromEntries(Object.entries(corpus).map(([k, v]) => [k, v.length])),
  );
} else if (args.mode === 'summary') {
  const results = {};
  let hands = 0;
  for (const file of readdirSync(out).filter((p) => /^[\w]+-\d-(normal|hard)-\d+\.json$/.test(p))) {
    const data = JSON.parse(readFileSync(join(out, file)));
    const bucket = (results[data.profile] ||= { totals: {}, metrics: {}, cells: [] });
    for (const [k, v] of Object.entries(data.totals))
      bucket.totals[k] = (bucket.totals[k] || 0) + v;
    for (const [metric, counts] of Object.entries(data.metrics)) {
      const aggregate = (bucket.metrics[metric] ||= empty());
      for (const [k, v] of Object.entries(counts)) aggregate[k] += v;
    }
    bucket.cells.push(data);
    hands += data.totals.hands;
  }
  writeFileSync(join(out, 'summary.json'), JSON.stringify({ hands, results }, null, 2));
  console.log(
    JSON.stringify(
      {
        hands,
        results: Object.fromEntries(
          Object.entries(results).map(([id, r]) => [
            id,
            {
              hands: r.totals.hands,
              vpip: r.totals.vpip / r.totals.hands,
              pfr: r.totals.pfr / r.totals.hands,
              metrics: Object.fromEntries(
                Object.entries(r.metrics).map(([k, v]) => [
                  k,
                  {
                    n: v.n,
                    raise: v.raise / v.n,
                    check: v.check / v.n,
                    call: v.call / v.n,
                    small: v.small / v.n,
                    large: v.large / v.n,
                  },
                ]),
              ),
            },
          ]),
        ),
      },
      null,
      2,
    ),
  );
} else throw Error('mode must be matrix, job, probes or summary');
