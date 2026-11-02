import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { finiteSessionSummary } from './bot-session-statistics.mjs';

const input = path.resolve(process.argv[2] || '.artifacts/bot-policy-audit/product-sessions');
const configuration = JSON.parse(readFileSync(path.join(input, 'manifest.json')));
const engine = await import(pathToFileURL(configuration.enginePath).href);
const cells = [];
for (const count of configuration.counts)
  for (const difficulty of configuration.difficulties)
    for (const policy of configuration.policies) {
      const name = `${count}-${difficulty}-${policy}`;
      const results = Array.from({ length: configuration.sessions }, (_, session) =>
        JSON.parse(readFileSync(path.join(input, `${name}-${session}.json`))),
      );
      const game = engine.newGame(count);
      const buyinBB = game.stakes.startingStack / game.bigBlind;
      cells.push({
        cell: name,
        count,
        difficulty,
        policy,
        ...finiteSessionSummary(results, {
          winningProfitBB: (count - 1) * buyinBB,
          losingProfitBB: -(1 + engine.MAX_HERO_REBUYS) * buyinBB,
        }),
      });
    }
writeFileSync(
  path.join(input, 'session-inference.json'),
  JSON.stringify({ configuration, cells }, null, 2),
);
console.log(
  JSON.stringify({
    cells: cells.length,
    sessions: cells.reduce((sum, c) => sum + c.sessions, 0),
    hands: cells.reduce((sum, c) => sum + c.hands, 0),
    censored: cells.reduce((sum, c) => sum + c.censored, 0),
  }),
);
