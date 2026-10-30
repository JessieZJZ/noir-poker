import { soundSamples, SOUND_SAMPLE_RATE } from '../../src/ui/sound-cues.js';
import {
  verifyLocalWechatModules,
  wechatPackageBytes,
  pruneUnusedSharedModules,
} from '../../scripts/wechat.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PROFILE_PORTRAITS } from '../../src/ui/portraits.js';
import { heroValueGame } from '../fixtures/review-spots.js';
import { INTERACTIVE_REVIEW_OPTIONS } from '../../src/review/budget.js';
import { analyzeDecision } from '../../src/review/analysis.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
test('shared-module pruning keeps page, worker, asynchronous and transitive imports', async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'noir-wechat-reachable-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sources = {
    'app.js': `require('./shared/active'); require.async('./shared/async.js')`,
    'pages/table/table.js': `require('../../shared/page.js')`,
    'workers/review.js': `require('../shared/worker.js')`,
    'shared/active.js': `module.exports = require('./transitive.js')`,
    'shared/transitive.js': 'module.exports = 1',
    'shared/async.js': 'module.exports = 2',
    'shared/page.js': 'module.exports = 3',
    'shared/worker.js': 'module.exports = 4',
    'shared/unused.js': `module.exports = require('./unused-child.js')`,
    'shared/unused-child.js': 'module.exports = 5',
    'shared/style.wxss': 'view { color: red; }',
  };
  for (const [file, source] of Object.entries(sources)) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), source);
  }
  assert.deepEqual(await pruneUnusedSharedModules(directory), [
    'shared/unused-child.js',
    'shared/unused.js',
  ]);
  await verifyLocalWechatModules(directory);
  for (const file of Object.keys(sources).filter((name) => !name.includes('unused')))
    assert.ok(existsSync(path.join(directory, file)), file);
  writeFileSync(
    path.join(directory, 'app.js'),
    `const name = './shared/dynamic.js'; require(name)`,
  );
  writeFileSync(path.join(directory, 'shared/dynamic.js'), 'module.exports = 6');
  assert.deepEqual(await pruneUnusedSharedModules(directory), []);
  assert.ok(existsSync(path.join(directory, 'shared/dynamic.js')));
});
test('music is budgeted separately while main and subpackage retain exact size limits', () => {
  const limit = 2 * 1024 * 1024;
  const app = { subpackages: [{ root: 'music', pages: ['loader'] }] };
  const files = [
    { path: 'app.js', bytes: limit },
    { path: 'music/background-music.m4a', bytes: limit },
  ];
  assert.deepEqual(wechatPackageBytes(files, app), { main: limit, music: limit });
  assert.throws(
    () => wechatPackageBytes([{ ...files[0], bytes: limit + 1 }, files[1]], app),
    /main package exceeds/,
  );
  assert.throws(
    () => wechatPackageBytes([files[0], { ...files[1], bytes: limit + 1 }], app),
    /music package exceeds/,
  );
});
test('WXML bindings keep quoted literals on one line for the DevTools compiler', () => {
  const source = ['table.wxml', 'table-surface.wxml', 'table-templates.wxml']
    .map((name) => readFileSync(path.join(root, 'miniprogram/pages/table', name), 'utf8'))
    .join('\n');
  // The glass-easel compiler accepts a quoted newline that DevTools rejects.
  // Check the saved/formatted template, not only an unformatted input string.
  for (const binding of source.matchAll(/{{([\s\S]*?)}}/g))
    for (const literal of binding[1].matchAll(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g))
      assert.doesNotMatch(literal[0], /[\r\n]/, `Invalid WXML literal: ${literal[0]}`);
});
// The mini-program embeds a Chinese subset generated from its own package
// copy. Every shipped CJK character must be in it, or WeChat falls back to the
// system font.
function assertWechatGlyphCoverage(output) {
  const coverage = JSON.parse(
    readFileSync(path.join(root, 'src/platform/wechat-fonts/coverage.json'), 'utf8'),
  );
  assert.equal(
    createHash('sha256')
      .update(readFileSync(path.join(root, 'src/platform/wechat-fonts/noto-sans-sc.woff2')))
      .digest('hex'),
    coverage.sha256,
  );
  const codepoints = new Set(coverage.codepoints);
  const missing = new Set();
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (/\.(js|json|wxml|wxss)$/.test(entry.name) && entry.name !== 'fonts.wxss') {
        // esbuild writes non-ASCII JavaScript strings as escapes.
        const text = readFileSync(child, 'utf8')
          .replace(/\\u\{([0-9a-f]+)\}/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
          .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
        for (const character of text)
          if (
            /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(
              character,
            ) &&
            !codepoints.has(character.codePointAt(0))
          )
            missing.add(character);
      }
    }
  };
  visit(output);
  assert.deepEqual(
    [...missing],
    [],
    'New WeChat CJK copy requires scripts/subset-fonts.py; see docs/interface-parity.md',
  );
}
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

test('generated WeChat JavaScript loads the controller and complete player research without Node JSON modules', async (t) => {
  const workspace = fixture(t);
  assertSuccess(await build(workspace).result);
  assert.equal(existsSync(path.join(workspace.output, 'shared/engine/store-profiles.js')), false);
  assert.equal(existsSync(path.join(workspace.output, 'shared/ui/bet-sizing.js')), true);
  // The same rules as Web and native, compacted like every shipped stylesheet.
  const { compactWxss } = await import('../../scripts/wechat.mjs');
  for (const name of ['hero-turn', 'game-effects', 'emotion-effects'])
    assert.equal(
      readFileSync(path.join(workspace.output, `shared/ui/${name}.wxss`), 'utf8'),
      compactWxss(readFileSync(path.join(root, `src/styles/${name}.css`), 'utf8')),
      `WeChat must ship the identical ${name} style used by Web and native apps`,
    );
  const context = vm.createContext({ console });
  const modules = new Map();
  function load(request, parent = path.join(workspace.output, 'entry.js')) {
    assert.ok(request.startsWith('.'), `Only local modules are available: ${request}`);
    const file = path.resolve(
      path.dirname(parent),
      request.endsWith('.js') ? request : `${request}.js`,
    );
    assert.ok(file.startsWith(workspace.output + path.sep));
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    const execute = new vm.Script(
      `(function(require, module, exports) {\n${readFileSync(file, 'utf8')}\n})`,
      { filename: file },
    ).runInContext(context);
    execute((name) => load(name, file), module, module.exports);
    return module.exports;
  }
  const { BOT_PROFILES } = load('./shared/engine/bot-profiles.js');
  const research = JSON.parse(
    readFileSync(path.join(workspace.directory, 'src/data/characters.json'), 'utf8'),
  );
  for (const [id, player] of Object.entries(research.characters))
    assert.deepEqual(
      JSON.parse(JSON.stringify(BOT_PROFILES.find((profile) => profile.id === id).character)),
      player,
    );
  const { createWechatController } = load('./shared/platform/wechat-controller.js');
  let snapshot;
  const controller = createWechatController({
    publish: (value) => (snapshot = value),
    schedule: () => 1,
    unschedule() {},
  });
  t.after(() => controller.destroy());
  controller.start();
  assert.equal(controller.getGame().players.length, 5);
  assert.equal(snapshot.seats.length, 4);
  assert.equal(snapshot.heroPosition, '');
  assert.equal(snapshot.entryState, 'waiting');
  context.wx = {};
  context.getCurrentPages = () => [];
  const table = load('./pages/table/page-definition.js');
  assert.equal(
    typeof table.onLoad,
    'function',
    'The actual generated page loads all local dependencies',
  );
  assert.equal(typeof load('./shared/ui/public-card-space.js').growPublicCards, 'function');
  assert.equal(typeof load('./shared/ui/hero-card-space.js').growHeroCards, 'function');
  assert.equal(typeof load('./shared/ui/numeric-width.js').numericWidthScale, 'function');
  assert.equal(typeof load('./record-navigation.js').openRecords, 'function');
});

test('standalone WeChat worker executes the shared interactive analysis without main-package imports', async (t) => {
  const workspace = fixture(t);
  assertSuccess(await build(workspace).result);
  assert.equal(
    JSON.parse(readFileSync(path.join(workspace.output, 'app.json'))).workers,
    'workers',
  );
  const messages = [];
  let receive;
  const context = vm.createContext({
    worker: {
      onMessage(callback) {
        receive = callback;
      },
      postMessage(message) {
        messages.push(JSON.parse(JSON.stringify(message)));
      },
    },
  });
  const source = readFileSync(path.join(workspace.output, 'workers/review.js'), 'utf8');
  assert.doesNotMatch(source, /\brequire\(/);
  new vm.Script(source).runInContext(context);
  const decision = heroValueGame('set-shove').decisions.find((d) => d.street === 1);
  receive({ decisions: [decision] });
  assert.deepEqual(messages, [
    {
      type: 'step',
      index: 0,
      result: JSON.parse(JSON.stringify(analyzeDecision(decision, INTERACTIVE_REVIEW_OPTIONS))),
    },
    { type: 'complete' },
  ]);
  receive({ decisions: [null] });
  assert.deepEqual(messages.at(-1), { type: 'error' });
});

test('WeChat packaging rejects a missing static relative module before publication', async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'noir-wechat-modules-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(path.join(directory, 'entry.js'), "require('./record-navigation.js');\n");
  await assert.rejects(
    verifyLocalWechatModules(directory),
    /entry\.js -> \.\/record-navigation\.js/,
  );
  writeFileSync(path.join(directory, 'record-navigation.js'), 'module.exports = {};\n');
  await verifyLocalWechatModules(directory);
  writeFileSync(path.join(directory, 'entry.js'), "require('./shared-space');\n");
  await assert.rejects(verifyLocalWechatModules(directory), /entry\.js -> \.\/shared-space/);
  writeFileSync(path.join(directory, 'shared-space.js'), 'module.exports = {};\n');
  await verifyLocalWechatModules(directory);
});

test('concurrent WeChat builders serialize and preserve DevTools private preferences', async (t) => {
  const workspace = fixture(t);
  assertSuccess(await build(workspace).result);
  const sourceDigest = JSON.parse(
    readFileSync(path.join(workspace.output, 'build-info.json')),
  ).sourceDigest;
  // IDE preferences in the source tree are local state, never runtime inputs.
  for (const name of ['project.config.json', 'project.private.config.json'])
    writeFileSync(
      path.join(workspace.directory, 'miniprogram', name),
      '{"projectname":"local-only"}',
    );
  const preferences = JSON.stringify({
    projectname: 'My local simulator',
    setting: { hotReload: true },
  });
  writeFileSync(path.join(workspace.output, 'project.private.config.json'), preferences);
  const first = build(workspace);
  const second = build(workspace);
  const results = await Promise.all([first.result, second.result]);
  for (const result of results) assertSuccess(result);
  const fonts = readFileSync(path.join(workspace.output, 'fonts.wxss'), 'utf8');
  for (const name of ['manrope', 'barlow-condensed']) {
    const bytes = readFileSync(path.join(workspace.directory, `public/fonts/${name}.woff2`));
    assert.ok(fonts.includes(bytes.toString('base64')), `${name} must use the Web/native bytes`);
  }
  const chinese = readFileSync(
    path.join(workspace.directory, 'src/platform/wechat-fonts/noto-sans-sc.woff2'),
  );
  assert.ok(fonts.includes(chinese.toString('base64')), 'WeChat embeds its Chinese subset');
  assert.equal(
    fonts.includes(
      readFileSync(path.join(workspace.directory, 'public/fonts/noto-sans-sc.woff2')).toString(
        'base64',
      ),
    ),
    false,
  );
  assert.doesNotMatch(fonts, /url\(['"]?https?:/);
  assertWechatGlyphCoverage(workspace.output);
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
  assert.equal(manifest.sourceDigest, sourceDigest);
  assert.equal(
    manifest.files.filter((file) => /^assets\/portraits\/.*\.jpg$/.test(file.path)).length,
    Object.keys(PROFILE_PORTRAITS).length,
  );
  assert.ok(manifest.packageBytes.main < 2 * 1024 * 1024);
  assert.ok(manifest.packageBytes.music < 2 * 1024 * 1024);
  assert.equal(manifest.totalBytes, manifest.packageBytes.main + manifest.packageBytes.music);
  assert.deepEqual(
    readFileSync(path.join(workspace.output, 'music/background-music.m4a')),
    readFileSync(path.join(workspace.directory, 'public/audio/background-music-mobile.m4a')),
  );
  for (const name of ['fold', 'check', 'chip', 'deal', 'win']) {
    const wave = readFileSync(path.join(workspace.output, `assets/sounds/${name}.wav`));
    let peak = 0,
      saturated = 0;
    for (let i = 44; i < wave.length; i += 2) {
      const value = Math.abs(wave.readInt16LE(i));
      peak = Math.max(peak, value);
      if (value === 32767 || value === 32768) saturated++;
    }
    assert.ok(peak > 3000 && peak < 32767, `${name} has audible amplitude and headroom`);
    const expected = soundSamples(name);
    assert.equal(wave.readUInt32LE(24), SOUND_SAMPLE_RATE);
    assert.equal((wave.length - 44) / 2, expected.length);
    for (let i = 0; i < expected.length; i++)
      assert.equal(
        wave.readInt16LE(44 + i * 2) / 32768,
        expected[i],
        `${name}: PCM sample ${i} differs from Web`,
      );
    assert.equal(saturated, 0, `${name} has no clipped samples`);
  }

  assert.ok(
    manifest.files.every((file) => !/i18n|locales|translator|localization/.test(file.path)),
    'Chinese-only mini-program must not bundle internationalization',
  );
  assert.equal(
    manifest.files.some((file) => file.path === 'project.private.config.json'),
    false,
  );
  cleanBuildFiles(workspace);
});

test('rebuilding keeps the opened DevTools project folder and drops stale entries', async (t) => {
  const workspace = fixture(t);
  assertSuccess(await build(workspace).result);
  const before = statSync(workspace.output).ino;
  writeFileSync(path.join(workspace.output, 'stale-generated.js'), '// old build');
  assertSuccess(await build(workspace).result);
  // DevTools' compiler workers keep this directory as their working directory.
  assert.equal(statSync(workspace.output).ino, before);
  assert.equal(existsSync(path.join(workspace.output, 'stale-generated.js')), false);
  assert.ok(existsSync(path.join(workspace.output, 'app.json')));
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

test('WeChat stylesheets drop comments, indentation and blank lines only', async () => {
  const { compactWxss } = await import('../../scripts/wechat.mjs');
  assert.equal(
    compactWxss(`/* note
   spanning lines */
.a {
  color: red; /* inline */

  background: url('data:image/svg+xml;base64,PHN2Zy8+');
}
@media (max-width: 380px) {
  .a {
    padding: 0;
  }
}
`),
    `.a {
color: red;
background: url('data:image/svg+xml;base64,PHN2Zy8+');
}
@media (max-width: 380px) {
.a {
padding: 0;
}
}`,
  );
});
