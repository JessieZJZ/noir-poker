import { soundSamples, SOUND_SAMPLE_RATE } from '../src/ui/sound-cues.js';
import { MOBILE_BACKGROUND_MUSIC_PATH } from '../src/ui/background-music.js';
import { watch } from 'node:fs';
import { cp, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { build, transform } from 'esbuild';
import sharp from 'sharp';
import { PROFILE_PORTRAITS } from '../src/ui/portraits.js';
import { sourceDigest, directoryDigest, root } from './mobile-lib.mjs';
import { guideTemplate } from './wechat-presentation.mjs';

export const wechatOutput = path.join(root, '.artifacts/wechat');
const template = path.join(root, 'miniprogram');
const manifestName = 'build-info.json';
const appId = () => process.env.NOIR_WECHAT_APP_ID || 'touristappid';
const checksum = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function wechatPackageBytes(files, app) {
  const roots = (app.subpackages || []).map((entry) => entry.root.replace(/\/$/, '') + '/');
  const sizes = Object.fromEntries(
    ['main', ...roots.map((root) => root.slice(0, -1))].map((key) => [key, 0]),
  );
  for (const file of files) {
    const root = roots.find((root) => file.path.startsWith(root));
    sizes[root ? root.slice(0, -1) : 'main'] += file.bytes;
  }
  for (const [name, size] of Object.entries(sizes))
    if (size > 2 * 1024 * 1024)
      throw Error(`WeChat ${name} package exceeds the 2 MiB budget (${size})`);
  if (files.reduce((sum, file) => sum + file.bytes, 0) > 20 * 1024 * 1024)
    throw Error('WeChat total packages exceed the 20 MiB budget');
  return sizes;
}

export async function fileList(directory, prefix = '') {
  const files = [];
  for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const name = prefix + item.name;
    if (item.isDirectory())
      files.push(...(await fileList(path.join(directory, item.name), name + '/')));
    else if (item.isFile()) files.push(name);
  }
  return files;
}

export async function verifyLocalWechatModules(directory) {
  const files = await fileList(directory);
  const available = new Set(files);
  for (const file of files.filter((name) => name.endsWith('.js'))) {
    const source = await readFile(path.join(directory, file), 'utf8');
    for (const match of source.matchAll(/\brequire\(\s*(['"])(\.{1,2}\/[^'"]+)\1\s*\)/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[2]));
      if (!available.has(target) && !available.has(`${target}.js`))
        throw Error(`Missing local WeChat module: ${file} -> ${match[2]}`);
    }
  }
}

export function wechatSourceDigest() {
  return checksum(
    sourceDigest() +
      directoryDigest(template, ['project.config.json', 'project.private.config.json']),
  );
}

async function compileJs(sourceDirectory, destination) {
  for (const file of await fileList(sourceDirectory)) {
    if (!file.endsWith('.js') || file === 'worker.js') continue;
    // WeChat only loads JavaScript modules. Inline JSON dependencies while
    // retaining shared JavaScript imports, so rules still have one runtime copy.
    const result = await build({
      entryPoints: [path.join(sourceDirectory, file)],
      bundle: true,
      external: ['*.js'],
      format: 'cjs',
      target: 'es2019',
      write: false,
    });
    const target = path.join(destination, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, result.outputFiles[0].text);
  }
}

async function portraitAssets(output) {
  const directory = path.join(output, 'assets/portraits');
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'credits.js'),
    `module.exports = ${JSON.stringify(Object.fromEntries(Object.entries(PROFILE_PORTRAITS).map(([id, image]) => [id, { label: image.credit, url: image.source }])))};\n`,
  );
  for (const [id, photo] of Object.entries(PROFILE_PORTRAITS)) {
    const source = path.join(root, 'public', photo.src.slice(1));
    // Resolve the same object-fit/zoom window as the Web avatar into a small,
    // local JPEG. This includes the labelled A BAO face inside its wider frame.
    const { width, height } = await sharp(source).metadata();
    const edge = Math.min(width, height),
      zoom = photo.zoom || 1;
    const position = photo.position || 'center';
    const parts = position.split(' ');
    const fraction = (part, axis) =>
      part === 'left' || part === 'top'
        ? 0
        : part === 'right' || part === 'bottom'
          ? 1
          : part?.endsWith('%')
            ? parseFloat(part) / 100
            : 0.5;
    const x = fraction(parts[0], 'x') * (width - edge);
    const y = fraction(parts[1], 'y') * (height - edge);
    const origin = (photo.origin || 'center').split(' ');
    const crop = Math.max(1, Math.round(edge / zoom));
    const left = Math.min(
      width - crop,
      Math.max(0, Math.round(x + edge * fraction(origin[0], 'x') * (1 - 1 / zoom))),
    );
    const top = Math.min(
      height - crop,
      Math.max(0, Math.round(y + edge * fraction(origin[1], 'y') * (1 - 1 / zoom))),
    );
    await sharp(source)
      .extract({ left, top, width: crop, height: crop })
      .resize(160, 160)
      .jpeg({ quality: 85 })
      .toFile(path.join(directory, `${id}.jpg`));
  }
  await cp(path.join(root, 'public/portraits/CREDITS.md'), path.join(directory, 'CREDITS.md'));
}

export function soundWave(kind) {
  const sampleRate = SOUND_SAMPLE_RATE,
    samples = soundSamples(kind),
    length = samples.length;
  const wave = Buffer.alloc(44 + length * 2);
  wave.write('RIFF', 0);
  wave.writeUInt32LE(wave.length - 8, 4);
  wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24);
  wave.writeUInt32LE(sampleRate * 2, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write('data', 36);
  wave.writeUInt32LE(length * 2, 40);
  for (let index = 0; index < length; index++)
    wave.writeInt16LE(Math.round(samples[index] * 32768), 44 + index * 2);
  return wave;
}

async function lockBuild(output) {
  const lock = `${output}.lock`;
  await mkdir(path.dirname(output), { recursive: true });
  const deadline = Date.now() + 60000;
  while (true) {
    try {
      const handle = await open(lock, 'wx');
      await handle.writeFile(String(process.pid));
      await handle.close();
      return () => rm(lock, { force: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const pid = Number(await readFile(lock, 'utf8'));
        if (pid > 0) {
          try {
            process.kill(pid, 0);
          } catch (probe) {
            if (probe.code === 'ESRCH') await rm(lock, { force: true });
          }
        } else if (Date.now() - (await stat(lock)).mtimeMs > 120000) {
          await rm(lock, { force: true });
        }
      } catch (probe) {
        if (probe.code !== 'ENOENT') throw probe;
      }
      if (Date.now() > deadline)
        throw Error('Another WeChat build is still running; retry shortly');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

export async function buildWechat(output = wechatOutput) {
  const unlock = await lockBuild(output);
  const backup = `${output}.previous-${process.pid}`;
  const staging = `${output}.preparing-${process.pid}`;
  try {
    const before = wechatSourceDigest();
    await rm(staging, { recursive: true, force: true });
    await cp(template, staging, {
      recursive: true,
      filter: (source) => path.basename(source) !== '.DS_Store',
    });
    for (const directory of ['engine', 'review'])
      await compileJs(path.join(root, 'src', directory), path.join(staging, 'shared', directory));
    await compileJs(path.join(root, 'src/platform'), path.join(staging, 'shared/platform'));
    // Platform adapters must not accidentally pull Capacitor or DOM modules in.
    for (const file of await fileList(path.join(staging, 'shared/platform')))
      if (!file.startsWith('wechat-')) await rm(path.join(staging, 'shared/platform', file));
    await mkdir(path.join(staging, 'shared/ui'), { recursive: true });
    await cp(
      path.join(root, 'src/styles/hero-turn.css'),
      path.join(staging, 'shared/ui/hero-turn.wxss'),
    );
    for (const name of [
      'bet-sizing.js',
      'seat-geometry.js',
      'recent-action.js',
      'rail-layout.js',
      'compact-table-layout.js',
      'public-card-space.js',
      'hero-card-space.js',
      'activity-parts.js',
      'numeric-width.js',
      'name-tooltip-position.js',
      'cards.js',
      'hero-turn.js',
      'card-rank-glyphs.js',
      'background-music.js',
    ]) {
      const compiled = await transform(await readFile(path.join(root, 'src/ui', name), 'utf8'), {
        format: 'cjs',
        target: 'es2019',
      });
      await writeFile(path.join(staging, 'shared/ui', name), compiled.code);
    }
    // WXSS cannot load package-relative font files. Embed the same WOFF2 bytes
    // used by Web/native; no network request or separate font source is needed.
    const fontCSS = await readFile(path.join(root, 'src/styles/fonts.css'), 'utf8');
    const chineseFaces = fontCSS.replace(
      /@font-face\s*\{[^}]*font-family: 'Noto Sans KR';[^}]*\}/s,
      '',
    );
    let fonts = chineseFaces;
    for (const match of chineseFaces.matchAll(/url\('\/fonts\/([^']+)'\)/g)) {
      const bytes = await readFile(path.join(root, 'public/fonts', match[1]));
      fonts = fonts.replace(match[0], `url('data:font/woff2;base64,${bytes.toString('base64')}')`);
    }
    await writeFile(path.join(staging, 'fonts.wxss'), fonts);
    await writeFile(
      path.join(staging, 'pages/table/guide.wxml'),
      guideTemplate(await readFile(path.join(root, 'index.html'), 'utf8')),
    );
    for (const file of (await fileList(staging)).filter(
      (name) => name.endsWith('.js') && !name.startsWith('shared/'),
    )) {
      const result = await transform(await readFile(path.join(staging, file), 'utf8'), {
        format: 'cjs',
        target: 'es2019',
      });
      await writeFile(path.join(staging, file), result.code);
    }
    await build({
      entryPoints: [path.join(template, 'workers/review.js')],
      bundle: true,
      minify: true,
      format: 'iife',
      target: 'es2019',
      outfile: path.join(staging, 'workers/review.js'),
    });
    await portraitAssets(staging);
    await sharp(path.join(root, 'public/app-icon.png'))
      .resize(128, 128)
      .png()
      .toFile(path.join(staging, 'assets/app-icon.png'));
    await sharp(path.join(root, 'public/launch-icon.png'))
      .resize(128, 128)
      .png({ compressionLevel: 9 })
      .toFile(path.join(staging, 'assets/launch-icon.png'));
    await mkdir(path.join(staging, 'assets/sounds'), { recursive: true });
    for (const sound of ['fold', 'check', 'chip', 'deal', 'win'])
      await writeFile(path.join(staging, `assets/sounds/${sound}.wav`), soundWave(sound));
    await cp(
      path.join(root, 'public', MOBILE_BACKGROUND_MUSIC_PATH),
      path.join(staging, 'music/background-music.m4a'),
    );
    const project = {
      appid: appId(),
      projectname: 'NOIR Poker',
      compileType: 'miniprogram',
      miniprogramRoot: './',
      libVersion: '3.7.0',
      setting: { es6: true, minified: true, enhance: true, urlCheck: true },
      packOptions: {
        ignore: [
          { type: 'file', value: manifestName },
          { type: 'file', value: 'package.json' },
        ],
      },
    };
    await writeFile(path.join(staging, 'project.config.json'), JSON.stringify(project, null, 2));
    await writeFile(path.join(staging, 'package.json'), '{"type":"commonjs","private":true}\n');
    await verifyLocalWechatModules(staging);
    const files = [];
    // Local IDE preferences are preserved below, outside the runtime manifest.
    await rm(path.join(staging, 'project.private.config.json'), { force: true });
    for (const name of await fileList(staging)) {
      const bytes = await readFile(path.join(staging, name));
      files.push({ path: name, bytes: bytes.length, sha256: checksum(bytes) });
    }
    const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
    const packageBytes = wechatPackageBytes(
      files,
      JSON.parse(await readFile(path.join(staging, 'app.json'), 'utf8')),
    );
    if (wechatSourceDigest() !== before)
      throw Error('Source changed while building WeChat; retry after saving');
    await writeFile(
      path.join(staging, manifestName),
      JSON.stringify(
        {
          sourceDigest: before,
          appId: appId(),
          builtAt: new Date().toISOString(),
          totalBytes,
          packageBytes,
          files,
        },
        null,
        2,
      ),
    );
    // Keep DevTools' local preferences while replacing generated source as a unit.
    try {
      await cp(
        path.join(output, 'project.private.config.json'),
        path.join(staging, 'project.private.config.json'),
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await rm(backup, { recursive: true, force: true });
    try {
      await rename(output, backup);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    try {
      await rename(staging, output);
    } catch (error) {
      try {
        await rename(backup, output);
      } catch {}
      throw error;
    }
    await rm(backup, { recursive: true, force: true });
    await verifyWechat(output);
    console.log(
      `WeChat project ready: ${output} (${Math.round(packageBytes.main / 1024)} KiB main; ${Math.round(totalBytes / 1024)} KiB total; current shared source)`,
    );
  } finally {
    try {
      await rm(staging, { recursive: true, force: true });
    } finally {
      await unlock();
    }
  }
}

export async function verifyWechat(output = wechatOutput) {
  const info = JSON.parse(await readFile(path.join(output, manifestName), 'utf8'));
  if (info.sourceDigest !== wechatSourceDigest())
    throw Error('WeChat source changed; run npm run wechat:build');
  if (info.appId !== appId()) throw Error('WeChat AppID changed; run npm run wechat:build');
  const expected = info.files.map((file) => file.path);
  const actual = (await fileList(output)).filter(
    (file) => ![manifestName, 'project.private.config.json'].includes(file),
  );
  if (JSON.stringify(actual.sort()) !== JSON.stringify(expected.sort()))
    throw Error('WeChat output has missing or unexpected files');
  for (const file of info.files) {
    const bytes = await readFile(path.join(output, file.path));
    if (bytes.length !== file.bytes || checksum(bytes) !== file.sha256)
      throw Error(`Stale WeChat asset: ${file.path}`);
  }
  for (const id of Object.keys(PROFILE_PORTRAITS))
    if (!expected.includes(`assets/portraits/${id}.jpg`))
      throw Error(`Missing WeChat portrait ${id}`);
  const project = JSON.parse(await readFile(path.join(output, 'project.config.json'), 'utf8'));
  const app = JSON.parse(await readFile(path.join(output, 'app.json'), 'utf8'));
  const sizes = wechatPackageBytes(info.files, app);
  if (JSON.stringify(sizes) !== JSON.stringify(info.packageBytes))
    throw Error('WeChat package sizes differ from the generated manifest');
  if (!expected.includes('music/background-music.m4a'))
    throw Error('Missing local background music');
  if (
    checksum(await readFile(path.join(output, 'music/background-music.m4a'))) !==
    checksum(await readFile(path.join(root, 'public', MOBILE_BACKGROUND_MUSIC_PATH)))
  )
    throw Error('WeChat background music differs from source');
  if (app.pages?.length < 1 || project.compileType !== 'miniprogram')
    throw Error('Invalid WeChat project');
  const page = await readFile(path.join(output, `${app.pages[0]}.wxml`), 'utf8');
  if (/<web-view\b/i.test(page)) throw Error('WeChat must render the local mini-program UI');
  return info;
}

export async function compileWechatTemplates(output = wechatOutput) {
  await verifyWechat(output);
  const require = createRequire(import.meta.url);
  const { TmplGroup } = require('glass-easel-template-compiler');
  const { StyleSheetTransformer } = require('glass-easel-stylesheet-compiler');
  const group = new TmplGroup();
  let count = 0;
  try {
    for (const file of await fileList(output)) {
      if (file.endsWith('.wxml')) {
        const errors = group.addTmpl(
          file.slice(0, -5),
          await readFile(path.join(output, file), 'utf8'),
        );
        if (errors.length)
          throw Error(`WeChat template diagnostics ${file}: ${JSON.stringify(errors)}`);
        if (!group.getTmplGenObject(file.slice(0, -5))) throw Error(`Empty template: ${file}`);
        count++;
      } else if (file.endsWith('.wxss')) {
        const sheet = new StyleSheetTransformer(
          file,
          await readFile(path.join(output, file), 'utf8'),
          undefined,
          750,
          false,
        );
        try {
          const errors = sheet.extractWarnings();
          if (errors.length)
            throw Error(`WeChat stylesheet diagnostics ${file}: ${JSON.stringify(errors)}`);
          if (!sheet.getContent()) throw Error(`Empty stylesheet: ${file}`);
        } finally {
          sheet.free();
        }
        count++;
      }
    }
  } finally {
    group.free();
  }
  if (!count) throw Error('No WeChat templates found');
  console.log(
    `WeChat WXML/WXSS compilation passed: ${count} files (official glass-easel compiler; DevTools/device runtime is separate)`,
  );
  return count;
}

async function watchWechat() {
  let running = false,
    pending = true,
    debounce,
    child;
  async function refresh() {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    do {
      pending = false;
      try {
        // Reload builder code and portrait metadata for every saved iteration.
        await new Promise((resolve, reject) => {
          child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'build'], {
            cwd: root,
            stdio: 'inherit',
          });
          child.once('error', reject);
          child.once('exit', (code) =>
            code === 0 ? resolve() : reject(Error(`WeChat build exited ${code}`)),
          );
        });
      } catch (error) {
        console.error(error.message);
      }
    } while (pending);
    running = false;
  }
  const changed = () => {
    clearTimeout(debounce);
    debounce = setTimeout(refresh, 200);
  };
  const watchers = ['src', 'public', 'miniprogram', 'scripts', 'mobile'].map((dir) =>
    watch(path.join(root, dir), { recursive: true }, changed),
  );
  for (const file of [
    'index.html',
    'package.json',
    'package-lock.json',
    'vite.config.js',
    'capacitor.config.json',
  ])
    watchers.push(watch(path.join(root, file), changed));
  const close = () => {
    clearTimeout(debounce);
    for (const watcher of watchers) watcher.close();
    child?.kill('SIGTERM');
    process.exit(0);
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
  await refresh();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] || 'build';
  if (command === 'build') await buildWechat();
  else if (command === 'verify') {
    await verifyWechat();
    console.log('WeChat source and all bundled assets verified');
  } else if (command === 'check') await compileWechatTemplates();
  else if (command === 'watch') await watchWechat();
  else if (command === 'open') {
    await buildWechat();
    const cli =
      process.env.NOIR_WECHAT_CLI || '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
    const result = spawnSync(cli, ['open', '--project', wechatOutput], { stdio: 'inherit' });
    if (result.error) throw Error('Install WeChat DevTools or set NOIR_WECHAT_CLI to its cli path');
    if (result.status) throw Error('WeChat DevTools could not open this project');
  } else throw Error('Use build, verify, check, watch or open');
}
