import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const swift = readFileSync(
  new URL('../../ios/App/App/SceneDelegate.swift', import.meta.url),
  'utf8',
);
const literal = (name) => {
  const value = swift.match(new RegExp(`let ${name} = "([^"\\n]*)"`))?.[1];
  assert.ok(value, `Actual Swift ${name} literal is required`);
  return value;
};
const bridge = readFileSync(
  new URL(
    '../../node_modules/@capacitor/ios/Capacitor/Capacitor/assets/native-bridge.js',
    import.meta.url,
  ),
  'utf8',
);
assert.equal(createHash('sha256').update(bridge).digest('hex'), literal('bridgeSHA256'));
const configuration = swift.match(/var startupConfigSource = """\s*([\s\S]*?)\s*"""/)?.[1];
assert.ok(configuration, 'Execute the actual native-injected config, not a test copy');
let patched = bridge;
for (const name of ['cookies', 'http']) {
  const needle = literal(`${name}Needle`);
  assert.equal(patched.split(needle).length, 2);
  patched = patched.replace(needle, literal(`${name}Replacement`));
}

function context({ cookiesEnabled = false, httpEnabled = false, original = false } = {}) {
  const prompts = [],
    messages = [];
  let cookie = 'web=value';
  class Document {}
  Object.defineProperty(Document.prototype, 'cookie', {
    get: () => cookie,
    set: (value) => {
      cookie = value;
    },
    configurable: true,
  });
  class XMLHttpRequest {}
  for (const name of [
    'abort',
    'getAllResponseHeaders',
    'getResponseHeader',
    'open',
    'send',
    'setRequestHeader',
  ])
    XMLHttpRequest.prototype[name] = () => {};
  const document = new Document();
  document.addEventListener = () => {};
  const webFetch = async () => 'local-web-fetch';
  const prompt = (value) => {
    prompts.push(value);
    let payload;
    try {
      payload = JSON.parse(value);
    } catch {
      return 'ordinary-response';
    }
    if (['CapacitorCookies.isEnabled', 'CapacitorHttp'].includes(payload.type)) {
      assert.ok(original, 'No synchronous startup enabled probe may remain');
      return 'false';
    }
    if (payload.type === 'CapacitorCookies.get') return 'native=value';
    if (payload.type === 'CapacitorCookies.set') return '';
    throw Error('Unexpected prompt payload');
  };
  const sandbox = {
    Document,
    HTMLDocument: Document,
    document,
    XMLHttpRequest,
    EventTarget,
    URL,
    URLSearchParams,
    Headers,
    Request,
    Response,
    FormData,
    Blob,
    File,
    TextEncoder,
    TextDecoder,
    navigator: {},
    console: Object.fromEntries(
      ['debug', 'error', 'info', 'log', 'trace', 'warn', 'groupCollapsed', 'groupEnd', 'dir'].map(
        (key) => [key, () => {}],
      ),
    ),
    Capacitor: { DEBUG: false, Plugins: {} },
    WEBVIEW_SERVER_URL: 'capacitor://localhost',
    webkit: { messageHandlers: { bridge: { postMessage: (data) => messages.push(data) } } },
    fetch: webFetch,
    prompt,
    addEventListener() {},
    setTimeout: () => 0,
    clearTimeout() {},
  };
  sandbox.window = sandbox;
  const c = vm.createContext(sandbox);
  if (!original)
    vm.runInContext(
      configuration
        .replaceAll('\\(cookiesEnabled)', String(cookiesEnabled))
        .replaceAll('\\(httpEnabled)', String(httpEnabled)),
      c,
    );
  vm.runInContext(original ? bridge : patched, c);
  return { c, prompts, messages, prompt, webFetch, XMLHttpRequest };
}

test('unmodified actual Capacitor bridge reproduces both unconditional startup probes', () => {
  const { prompts } = context({ original: true });
  assert.deepEqual(
    prompts.map((value) => JSON.parse(value).type),
    ['CapacitorCookies.isEnabled', 'CapacitorHttp'],
  );
});

test('actual Swift replacements run the full bridge for all four native plugin configurations', () => {
  for (const cookiesEnabled of [false, true])
    for (const httpEnabled of [false, true]) {
      const { c, prompts, prompt, webFetch, XMLHttpRequest } = context({
        cookiesEnabled,
        httpEnabled,
      });
      assert.equal(c.Capacitor.getPlatform(), 'ios');
      assert.equal(prompts.length, 0, 'Boot must not synchronously ask native enabled flags');
      assert.equal(
        c.fetch === webFetch,
        !httpEnabled,
        'Enabled=true must still activate native HTTP',
      );
      assert.equal(c.XMLHttpRequest === XMLHttpRequest, !httpEnabled);
      assert.equal(c.document.cookie, cookiesEnabled ? 'native=value' : 'web=value');
      c.document.cookie = 'session=updated; domain=localhost';
      assert.equal(c.prompt, prompt, 'Ordinary window.prompt must not be replaced');
      assert.equal(c.prompt('ordinary question'), 'ordinary-response');
      const dynamic = prompts
        .filter((value) => value.startsWith('{'))
        .map((value) => JSON.parse(value));
      assert.deepEqual(
        dynamic.map((value) => value.type),
        cookiesEnabled ? ['CapacitorCookies.get', 'CapacitorCookies.set'] : [],
      );
      if (cookiesEnabled) {
        assert.equal(dynamic[1].action, 'session=updated; domain=localhost');
        assert.equal(dynamic[1].domain, 'localhost');
      }
    }
});

test('the source fingerprint covers actual Swift fix but excludes generated iOS public copies', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'noir-native-source-digest-'));
  try {
    for (const directory of ['src', 'public', 'scripts', 'mobile', 'ios/App/App/public'])
      mkdirSync(path.join(root, directory), { recursive: true });
    cpSync(
      new URL('../../scripts/mobile-lib.mjs', import.meta.url),
      path.join(root, 'scripts/mobile-lib.mjs'),
    );
    for (const file of [
      'index.html',
      'vite.config.js',
      'package.json',
      'package-lock.json',
      'capacitor.config.json',
      'mobile/release.json',
      'ios/App/App/SceneDelegate.swift',
    ])
      writeFileSync(path.join(root, file), 'initial');
    const { sourceDigest } = await import(pathToFileURL(path.join(root, 'scripts/mobile-lib.mjs')));
    const before = sourceDigest();
    writeFileSync(
      path.join(root, 'ios/App/App/SceneDelegate.swift'),
      'changed actual native source',
    );
    const after = sourceDigest();
    assert.notEqual(after, before);
    writeFileSync(
      path.join(root, 'ios/App/App/public/generated.html'),
      'generated copies are outside source',
    );
    assert.equal(sourceDigest(), after);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
