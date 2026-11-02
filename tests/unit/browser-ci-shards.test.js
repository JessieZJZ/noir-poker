import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));

test('CI desktop shards cover the complete browser suite once without changing the mobile filter', async (t) => {
  const workflow = await readFile(
    new URL('../../.github/workflows/mobile-build.yml', import.meta.url),
    'utf8',
  );
  const job = (name) => {
    const block = workflow.match(
      new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z][a-z-]*:|(?![\\s\\S]))`, 'm'),
    );
    assert.ok(block, `Missing CI job ${name}`);
    return block[1];
  };
  const desktop = job('desktop-ui-shard');
  const mobile = job('browser-ui');
  const filter = (block) => {
    const match = block.match(/--grep-invert '([^']+)'/);
    assert.ok(match, 'Browser jobs must retain their explicit geometry exclusion');
    return match[1];
  };
  assert.equal(filter(desktop), filter(mobile));
  assert.match(mobile, /project: \[mobile\]/);
  assert.match(desktop, /shard: \[1, 2\]/);
  assert.match(desktop, /--project=desktop --shard=\$\{\{ matrix\.shard \}\}\/2 /);
  const aggregate = job('desktop-ui');
  assert.match(aggregate, /name: browser-ui \(desktop\)/);
  assert.match(aggregate, /needs: desktop-ui-shard/);
  assert.match(aggregate, /if: always\(\)/);
  assert.match(aggregate, /SHARD_RESULT: \$\{\{ needs\.desktop-ui-shard\.result \}\}/);
  assert.match(aggregate, /run: test "\$SHARD_RESULT" = success/);

  const list = async (shard) => {
    const args = [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--list',
      '--reporter=json',
      '--project=desktop',
      '--grep-invert',
      filter(desktop),
    ];
    if (shard) args.push(`--shard=${shard}/2`);
    const { stdout } = await run(process.execPath, args, { cwd: root, maxBuffer: 8 * 1024 * 1024 });
    const report = JSON.parse(stdout);
    assert.deepEqual(report.errors, []);
    const ids = [];
    const visit = (suite) => {
      for (const spec of suite.specs ?? []) {
        for (const entry of spec.tests) ids.push(`${entry.projectName}:${spec.id}`);
      }
      for (const child of suite.suites ?? []) visit(child);
    };
    report.suites.forEach(visit);
    assert.ok(ids.length > 0, 'An empty shard must not report a coverage pass');
    return ids;
  };
  const full = await list();
  const first = await list(1);
  const second = await list(2);
  assert.equal(new Set(full).size, full.length, 'Full suite has duplicate test IDs');
  const combined = [...first, ...second];
  assert.equal(new Set(combined).size, combined.length, 'Shards repeat a test');
  assert.deepEqual(combined.sort(), full.sort(), 'Shards omit or add tests');
  assert.ok(Math.abs(first.length - second.length) <= 1, 'Fully parallel shards must be balanced');
  t.diagnostic(
    `Full desktop suite: ${full.length}; shards: ${first.length} + ${second.length}; no missing or repeated tests`,
  );
});
