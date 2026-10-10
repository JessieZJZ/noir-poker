import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'noir-wechat-builder-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const name of [
    'src',
    'public',
    'scripts',
    'mobile',
    'miniprogram',
    'index.html',
    'vite.config.js',
    'package.json',
    'package-lock.json',
    'capacitor.config.json',
  ])
    cpSync(path.join(root, name), path.join(directory, name), { recursive: true });
  symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
  return { directory, output: path.join(directory, '.artifacts/wechat') };
}
function run(fixture, body) {
  const url = pathToFileURL(path.join(fixture.directory, 'scripts/wechat.mjs')).href;
  const child = spawn(
    process.execPath,
    ['--input-type=module', '-e', `import * as builder from ${JSON.stringify(url)}; ${body}`],
    { cwd: fixture.directory, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (bytes) => (stdout += bytes));
  child.stderr.on('data', (bytes) => (stderr += bytes));
  return {
    child,
    result: new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve({ code, stdout, stderr }));
    }),
  };
}
function build(fixture) {
  return run(fixture, `await builder.buildWechat(${JSON.stringify(fixture.output)});`);
}
function cleanBuildFiles(fixture) {
  assert.equal(existsSync(`${fixture.output}.lock`), false);
  assert.deepEqual(
    readdirSync(path.dirname(fixture.output)).filter((name) =>
      /\.preparing-|\.previous-/.test(name),
    ),
    [],
  );
}
function assertSuccess(result) {
  assert.equal(result.code, 0, result.stderr || result.stdout);
}
async function waitForStaging(fixture, processId) {
  const deadline = Date.now() + 10000;
  while (!existsSync(`${fixture.output}.preparing-${processId}`)) {
    assert.ok(Date.now() < deadline, 'builder must reach its staging directory');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('concurrent WeChat builders serialize and preserve DevTools private preferences', async (t) => {
  const workspace = fixture(t);
  assertSuccess(await build(workspace).result);
  const preferences = JSON.stringify({
    projectname: 'My local simulator',
    setting: { hotReload: true },
  });
  writeFileSync(path.join(workspace.output, 'project.private.config.json'), preferences);
  const first = build(workspace);
  const second = build(workspace);
  const results = await Promise.all([first.result, second.result]);
  for (const result of results) assertSuccess(result);
  assert.equal(
    readFileSync(path.join(workspace.output, 'project.private.config.json'), 'utf8'),
    preferences,
  );
  const verification = run(
    workspace,
    `await builder.verifyWechat(${JSON.stringify(workspace.output)});`,
  );
  assertSuccess(await verification.result);
  const manifest = JSON.parse(readFileSync(path.join(workspace.output, 'build-info.json'), 'utf8'));
  assert.equal(
    manifest.files.filter((file) => /^assets\/portraits\/.*\.jpg$/.test(file.path)).length,
    8,
  );
  assert.ok(manifest.totalBytes < 2 * 1024 * 1024);
  assert.equal(
    manifest.files.some((file) => file.path === 'project.private.config.json'),
    false,
  );
  cleanBuildFiles(workspace);
});

test('source changes during a WeChat build reject the staging output and keep the prior artifact', async (t) => {
  const workspace = fixture(t);
  assertSuccess(await build(workspace).result);
  const originalManifest = readFileSync(path.join(workspace.output, 'build-info.json'), 'utf8');
  const changing = build(workspace);
  await waitForStaging(workspace, changing.child.pid);
  appendFileSync(
    path.join(workspace.directory, 'src/engine/bet-sizing.js'),
    '\n// fixture iteration\n',
  );
  const failed = await changing.result;
  assert.notEqual(failed.code, 0);
  assert.match(failed.stderr, /Source changed while building WeChat/);
  assert.equal(
    readFileSync(path.join(workspace.output, 'build-info.json'), 'utf8'),
    originalManifest,
  );
  cleanBuildFiles(workspace);
  const stale = await run(
    workspace,
    `await builder.verifyWechat(${JSON.stringify(workspace.output)});`,
  ).result;
  assert.notEqual(stale.code, 0);
  assert.match(stale.stderr, /WeChat source changed/);
  assertSuccess(await build(workspace).result);
  const fresh = await run(
    workspace,
    `await builder.verifyWechat(${JSON.stringify(workspace.output)});`,
  ).result;
  assertSuccess(fresh);
  assert.notEqual(
    readFileSync(path.join(workspace.output, 'build-info.json'), 'utf8'),
    originalManifest,
  );
  cleanBuildFiles(workspace);
});

test('WeChat source-fingerprint failure releases its build lock before returning', async (t) => {
  const workspace = fixture(t);
  const failed = await run(
    workspace,
    `const fs = await import('node:fs/promises');
     await fs.rename(${JSON.stringify(path.join(workspace.directory, 'src'))}, ${JSON.stringify(path.join(workspace.directory, 'src-missing'))});
     await builder.buildWechat(${JSON.stringify(workspace.output)});`,
  ).result;
  assert.notEqual(failed.code, 0);
  assert.match(failed.stderr, /ENOENT/);
  cleanBuildFiles(workspace);
  renameSync(path.join(workspace.directory, 'src-missing'), path.join(workspace.directory, 'src'));
  assertSuccess(await build(workspace).result);
  cleanBuildFiles(workspace);
});
