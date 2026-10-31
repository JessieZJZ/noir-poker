import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const delay = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
async function until(predicate, diagnostics, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(40);
  }
  assert.fail(`Timed out waiting for WeChat watch rebuild:\n${diagnostics()}`);
}
function processHarness(directory) {
  const child = spawn(process.execPath, ['scripts/wechat.mjs', 'watch'], {
    cwd: directory,
    env: { ...process.env, NOIR_WECHAT_APP_ID: 'touristappid' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let output = '';
  let buildCount = 0;
  let pending = '';
  let error = null;
  child.on('error', (value) => {
    error = value;
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (text) => {
    output += text;
  });
  child.stdout.on('data', (text) => {
    output += text;
    pending += text;
    const lines = pending.split('\n');
    pending = lines.pop();
    for (const line of lines) if (line.startsWith('WeChat project ready:')) buildCount++;
  });
  const closed = new Promise((resolve) => child.once('close', resolve));
  function signal(name) {
    try {
      if (process.platform === 'win32') child.kill(name);
      else process.kill(-child.pid, name);
    } catch (value) {
      if (value.code !== 'ESRCH') throw value;
    }
  }
  return {
    output: () => output,
    buildCount: () => buildCount,
    async waitForBuild(after) {
      await until(
        () => {
          if (error) throw error;
          if (child.exitCode !== null || child.signalCode !== null)
            assert.fail(`Watch exited unexpectedly:\n${output}`);
          return buildCount > after;
        },
        () => output,
      );
    },
    async stop() {
      signal('SIGTERM');
      let deadline;
      const stopped = await Promise.race([
        closed.then(() => true),
        new Promise((resolve) => {
          deadline = setTimeout(() => resolve(false), 2000);
        }),
      ]);
      clearTimeout(deadline);
      if (!stopped) {
        signal('SIGKILL');
        await closed;
      }
    },
  };
}

test(
  'WeChat watch rebuilds current portrait configuration, native metadata and builder code',
  { timeout: 60000 },
  async (t) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'noir-wechat-watch-'));
    let watch;
    t.after(async () => {
      if (watch) await watch.stop();
      await rm(directory, { recursive: true, force: true });
    });
    for (const name of ['src', 'public', 'scripts', 'miniprogram', 'mobile'])
      await cp(path.join(root, name), path.join(directory, name), { recursive: true });
    for (const name of [
      'index.html',
      'package.json',
      'package-lock.json',
      'vite.config.js',
      'capacitor.config.json',
    ])
      await cp(path.join(root, name), path.join(directory, name));
    await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
    watch = processHarness(directory);
    await watch.waitForBuild(0);
    const output = path.join(directory, '.artifacts/wechat');
    const manifest = async () =>
      JSON.parse(await readFile(path.join(output, 'build-info.json'), 'utf8'));
    const initial = await manifest();
    const originalPortrait = digest(await readFile(path.join(output, 'assets/portraits/rook.jpg')));
    assert.equal(initial.appId, 'touristappid');
    assert.ok(initial.files.some((file) => file.path === 'shared/platform/wechat-controller.js'));

    const portraitsPath = path.join(directory, 'src/ui/portraits.js');
    const portraits = await readFile(portraitsPath, 'utf8');
    assert.ok(portraits.includes("src: '/portraits/rook.jpg',"));
    const portraitBuild = watch.buildCount();
    await writeFile(
      portraitsPath,
      portraits.replace(
        "src: '/portraits/rook.jpg',",
        "src: '/portraits/rook.jpg', zoom: 2, origin: 'left top', position: 'left top',",
      ),
    );
    await watch.waitForBuild(portraitBuild);
    const changedPortrait = await manifest();
    assert.notEqual(changedPortrait.sourceDigest, initial.sourceDigest);
    assert.notEqual(
      digest(await readFile(path.join(output, 'assets/portraits/rook.jpg'))),
      originalPortrait,
      'a live watch iteration must load the new crop metadata, not the startup module cache',
    );

    const iconPath = path.join(directory, 'mobile/release.json');
    const nativeBuild = watch.buildCount();
    await writeFile(iconPath, (await readFile(iconPath, 'utf8')) + '\n');
    await watch.waitForBuild(nativeBuild);
    const nativeChanged = await manifest();
    assert.notEqual(
      nativeChanged.sourceDigest,
      changedPortrait.sourceDigest,
      'mobile files included in the source fingerprint must also trigger watch updates',
    );

    const builderPath = path.join(directory, 'scripts/wechat.mjs');
    const codeBuild = watch.buildCount();
    const marker = 'WECHAT_BUILDER_RELOADED_IN_CHILD';
    await writeFile(
      builderPath,
      (await readFile(builderPath, 'utf8')) + `\nconsole.log('${marker}');\n`,
    );
    await watch.waitForBuild(codeBuild);
    await until(() => watch.output().includes(marker), watch.output);
    const builderChanged = await manifest();
    assert.notEqual(builderChanged.sourceDigest, nativeChanged.sourceDigest);
    assert.ok(
      watch.output().includes(marker),
      'each iteration must execute the latest builder module',
    );
  },
);
