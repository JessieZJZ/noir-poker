import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));

test('CI shards cover each browser project once under its original check', async (t) => {
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
  const geometryFilter = job('table-geometry').match(/--grep '([^']+)'/)?.[1];
  assert.ok(geometryFilter, 'The layout job must own the geometry filter');
  const lock = JSON.parse(
    await readFile(new URL('../../package-lock.json', import.meta.url), 'utf8'),
  );
  const playwrightImage = `mcr.microsoft.com/playwright:v${lock.packages['node_modules/@playwright/test'].version}-noble`;
  assert.equal(job('table-geometry').match(/image: (\S+)/)?.[1], playwrightImage);
  assert.doesNotMatch(job('table-geometry'), /playwright install/);

  const list = async (project, shard) => {
    const args = [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--list',
      '--reporter=json',
      '--project=' + project,
      '--grep-invert',
      geometryFilter,
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
  for (const [project, aggregateJob] of [
    ['desktop', 'desktop-ui'],
    ['mobile', 'browser-ui'],
  ]) {
    await t.test(project, async (projectTest) => {
      const shardJob = project + '-ui-shard';
      const shard = job(shardJob);
      assert.match(shard, /shard: \[1, 2\]/);
      assert.ok(shard.includes('--project=' + project + ' --shard=${{ matrix.shard }}/2 '));
      assert.equal(shard.match(/--grep-invert '([^']+)'/)?.[1], geometryFilter);
      // The tests keep a 30-minute deadline of their own. Browsers and their
      // system packages come from Playwright's image, never the apt mirror.
      assert.match(shard, /--grep-invert '[^']+'\n {8}timeout-minutes: 30\n/);
      assert.equal(shard.match(/image: (\S+)/)?.[1], playwrightImage);
      assert.doesNotMatch(shard, /playwright install/);
      const aggregate = job(aggregateJob);
      assert.ok(aggregate.includes(`name: browser-ui (${project})`));
      assert.ok(aggregate.includes(`needs: ${shardJob}`));
      assert.match(aggregate, /if: always\(\)/);
      assert.ok(aggregate.includes('SHARD_RESULT: ${{ needs.' + shardJob + '.result }}'));
      assert.match(aggregate, /run: test "\$SHARD_RESULT" = success/);

      const [full, first, second] = await Promise.all([
        list(project),
        list(project, 1),
        list(project, 2),
      ]);
      assert.equal(new Set(full).size, full.length, 'Full suite has duplicate test IDs');
      const combined = [...first, ...second];
      assert.equal(new Set(combined).size, combined.length, 'Shards repeat a test');
      assert.deepEqual(combined.sort(), full.sort(), 'Shards omit or add tests');
      assert.ok(
        Math.abs(first.length - second.length) <= 1,
        'Fully parallel shards must be balanced',
      );
      projectTest.diagnostic(
        `Full suite: ${full.length}; shards: ${first.length} + ${second.length}`,
      );
    });
  }
});
