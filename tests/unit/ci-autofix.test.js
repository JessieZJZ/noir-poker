import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { eligiblePull, repairTarget, validatePatchFiles } from '../../.github/ci-autofix.mjs';

function failedRun() {
  const owner = { id: 1, login: 'maintainer', type: 'User' };
  return {
    repository: { id: 2, owner, full_name: 'maintainer/noir-poker', default_branch: 'main' },
    workflow_run: {
      id: 3,
      run_attempt: 1,
      path: '.github/workflows/mobile-build.yml',
      name: 'Mobile build',
      status: 'completed',
      conclusion: 'failure',
      event: 'pull_request',
      head_repository: { id: 2 },
      head_sha: 'a'.repeat(40),
      head_branch: 'codex/table',
      actor: { id: 1 },
      triggering_actor: { id: 1 },
    },
  };
}

test('CI repair scopes failures to owned branches and avoids generated repair runs', () => {
  const event = failedRun();
  const target = repairTarget(event);
  assert.equal(target.sha, event.workflow_run.head_sha);
  assert.equal(target.base, 'main');
  assert.equal(target.fixBranch, `codex/ci-fix-${target.sha}`);

  for (const overrides of [
    { conclusion: 'cancelled' },
    { head_repository: { id: 99 } },
    { actor: { id: 99 } },
    { triggering_actor: { id: 99 } },
    { head_branch: target.fixBranch },
    { event: 'workflow_dispatch' },
    { event: 'push' },
    { head_sha: 'main' },
    { path: '.github/workflows/other.yml' },
  ])
    assert.equal(
      repairTarget({ ...event, workflow_run: { ...event.workflow_run, ...overrides } }),
      null,
    );
  Object.assign(event.workflow_run, { event: 'push', head_branch: 'main' });
  assert.equal(repairTarget(event).pullRequest, false);
});

test('CI repair requires the original PR to still target main at the failed commit', () => {
  const target = repairTarget(failedRun());
  const pull = {
    user: { id: 1 },
    state: 'open',
    head: { repo: { id: 2 }, ref: target.branch, sha: target.sha },
    base: { repo: { id: 2 }, ref: target.base },
  };
  assert.equal(eligiblePull(target, pull), true);
  assert.equal(eligiblePull(target, { ...pull, state: 'closed' }), false);
  assert.equal(
    eligiblePull(target, { ...pull, head: { ...pull.head, sha: 'b'.repeat(40) } }),
    false,
  );
  assert.equal(eligiblePull(target, { ...pull, base: { ...pull.base, ref: 'other' } }), false);
});

test('only regular in-scope text file edits can cross the CI repair publication boundary', () => {
  const modification = ':100644 100644 0123 4567 M\0';
  for (const file of ['src/engine/rules.js', 'tests/unit/rules.test.js', 'index.html'])
    validatePatchFiles(`${modification}${file}\0`);
  for (const file of ['.github/workflows/mobile-build.yml', 'package.json', 'scripts/mobile.mjs'])
    assert.throws(() => validatePatchFiles(`${modification}${file}\0`), /outside automatic repair/);
  assert.throws(() => validatePatchFiles(':100644 120000 0123 4567 M\0src/rules.js\0'));
  assert.throws(() => validatePatchFiles(':100644 000000 0123 0000 D\0src/rules.js\0'));
});

test('CI repair exports a patch and applies it to the unchanged failed Git revision', (t) => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'noir-ci-autofix-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const repo = path.join(temporary, 'checkout');
  mkdirSync(path.join(repo, 'src'), { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  const source = path.join(repo, 'src', 'value.js');
  writeFileSync(source, 'export const value = 1;\n');
  git('add', '.');
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-qm',
    'test',
  );
  const event = failedRun();
  event.workflow_run.head_sha = git('rev-parse', 'HEAD').trim();

  const env = {
    ...process.env,
    GITHUB_EVENT_PATH: path.join(temporary, 'event.json'),
    GITHUB_OUTPUT: path.join(temporary, 'outputs'),
    CI_AUTOFIX_PATCH: path.join(temporary, 'repair.patch'),
    CI_AUTOFIX_CANDIDATE: repo,
  };
  writeFileSync(env.GITHUB_EVENT_PATH, JSON.stringify(event));
  writeFileSync(source, 'export const value = 2;\n');
  const script = fileURLToPath(new URL('../../.github/ci-autofix.mjs', import.meta.url));
  const run = (step) => execFileSync(process.execPath, [script, step], { cwd: temporary, env });
  run('collect');
  assert.match(readFileSync(env.GITHUB_OUTPUT, 'utf8'), /^has_patch=true/m);
  git('reset', '--hard', 'HEAD');
  run('apply-patch');
  assert.equal(readFileSync(source, 'utf8'), 'export const value = 2;\n');
  assert.match(git('diff', '--cached', '--name-only'), /src\/value.js/);
});
