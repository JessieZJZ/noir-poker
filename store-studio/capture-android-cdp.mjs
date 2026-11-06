import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sourceDigest } from "../scripts/mobile-lib.mjs";
import { verifyBundledArtifact } from "../scripts/bundled-assets.mjs";
import { captureOSPhoto } from "./native-photo.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [serial, folder] = process.argv.slice(2);
if (!serial?.startsWith("emulator-") || !folder)
  throw Error("Dedicated emulator serial and output required");
const output = path.resolve(folder);
mkdirSync(output, { recursive: true });
const adb = path.join(
  process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    "/Users/zjz/Library/Android/sdk",
  "platform-tools/adb",
);
const appId = "io.github.jessiezjz.noirpoker",
  apk = path.join(root, ".artifacts/mobile/noir-poker-debug.apk");
const run = (bin, args, timeout = 30000) => {
  const r = spawnSync(bin, args, {
    encoding: "utf8",
    timeout,
    maxBuffer: 24 * 1024 * 1024,
  });
  if (r.status !== 0) throw Error(String(r.stderr || r.error));
  return r.stdout.trim();
};
const device = (...args) => run(adb, ["-s", serial, ...args]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 30000, message = "UI condition timed out") => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await sleep(160);
  }
  throw Error(message);
};
const report = {
  platform: "android",
  serial,
  startedAt: new Date().toISOString(),
  status: "running",
  automation:
    "Installed native APK, normal UI events through its WebView debugging socket, Android OS compositor screenshots",
  physicalDevice: false,
  fullNativeE2E: false,
  injectedGameState: false,
  scenarios: [],
};
process.env.NOIR_STORE_OUTPUT = output;
process.env.NOIR_STORE_DEVICE = serial;
let ws,
  port,
  seq = 0;
const pending = new Map();
const cdp = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error(method + " timed out"));
    }, 45000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (fn, ...args) => {
  const r = await cdp("Runtime.evaluate", {
    expression: "(" + fn.toString() + ")(..." + JSON.stringify(args) + ")",
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails)
    throw Error(
      r.exceptionDetails.exception?.description || r.exceptionDetails.text,
    );
  return r.result.value;
};
try {
  report.bundledAssets = verifyBundledArtifact(apk);
  report.apkSha256 = createHash("sha256")
    .update(readFileSync(apk))
    .digest("hex");
  report.build = JSON.parse(
    run("unzip", ["-p", apk, "assets/public/build-info.json"]),
  );
  assert.equal(report.build.sourceDigest, sourceDigest());
  assert.equal(device("shell", "getprop", "ro.kernel.qemu"), "1");
  await waitFor(
    () => device("shell", "getprop", "sys.boot_completed") === "1",
    120000,
  );
  run(adb, ["-s", serial, "install", "-r", apk], 120000);
  device("shell", "am", "force-stop", appId);
  device("shell", "pm", "clear", appId);
  device("shell", "am", "start", "-n", appId + "/.MainActivity");
  const pid = await waitFor(() => device("shell", "pidof", appId));
  report.processId = pid;
  port = device(
    "forward",
    "tcp:0",
    "localabstract:webview_devtools_remote_" + pid,
  );
  const target = await waitFor(async () => {
    try {
      return (
        await (await fetch("http://127.0.0.1:" + port + "/json/list")).json()
      ).find((t) => t.url === "https://localhost/");
    } catch {
      return null;
    }
  }, 45000);
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.addEventListener("open", r, { once: true });
    ws.addEventListener("error", j, { once: true });
  });
  ws.addEventListener("message", (e) => {
    const d = JSON.parse(e.data),
      p = pending.get(d.id);
    if (p) {
      pending.delete(d.id);
      clearTimeout(p.timer);
      if (d.error) p.reject(Error(d.error.message));
      else p.resolve(d.result);
    }
  });
  await cdp("Runtime.enable");
  await cdp("Runtime.runIfWaitingForDebugger");
  await waitFor(
    () => evaluate(() => document.documentElement.dataset.appReady === "true"),
    90000,
  );
  report.native = await evaluate(() => ({
    platform: window.Capacitor.getPlatform(),
    native: window.Capacitor.isNativePlatform(),
    url: location.href,
    qa: Boolean(window.qa),
    width: innerWidth,
    height: innerHeight,
  }));
  assert.equal(report.native.platform, "android");
  assert.equal(report.native.native, true);
  assert.equal(report.native.qa, false);
  assert.equal(
    (await evaluate(async () => await (await fetch("/build-info.json")).json()))
      .sourceDigest,
    report.build.sourceDigest,
  );
  const visible = (s) =>
    evaluate((s) => {
      const e = document.querySelector(s);
      return Boolean(
        e &&
        !e.hidden &&
        e.getClientRects().length &&
        getComputedStyle(e).visibility !== "hidden",
      );
    }, s);
  const click = async (s) => {
    await waitFor(() =>
      evaluate((s) => {
        const e = document.querySelector(s);
        return Boolean(
          e && !e.disabled && !e.hidden && e.getClientRects().length,
        );
      }, s),
    );
    await evaluate((s) => {
      const e = document.querySelector(s);
      e.scrollIntoView({ block: "nearest", behavior: "instant" });
      e.click();
    }, s);
    await sleep(140);
  };
  const state = () => evaluate(() => window.noir.getState());
  const app = {
    platform: "android",
    sleep,
    waitFor,
    evaluate,
    visible,
    click,
    nativeTap: click,
    state,
    log: (m) => console.log("[android-native-capture] " + m),
    record: (e) => {
      report.scenarios.push(e);
      writeFileSync(
        path.join(output, "progress.json"),
        JSON.stringify(report, null, 2),
      );
    },
    screenshot: async (name) =>
      captureOSPhoto({ platform: "android", udid: serial, output, name }),
    select: async (s, v) => {
      if ((await evaluate((s) => document.querySelector(s).value, s)) === v)
        return;
      await click(s + " + .dropdown-trigger");
      await click('.dropdown-option[data-value="' + v + '"]');
      await waitFor(() =>
        evaluate((s, v) => document.querySelector(s).value === v, s, v),
      );
    },
    waitHero: () =>
      waitFor(async () => {
        const s = await state();
        return s.phase !== "done" && s.legal.enabled;
      }, 90000),
  };
  const { nativeScenarios } = await import(
    process.env.NOIR_STORE_MODE === "stills-locales"
      ? "./capture-stills-locales.mjs"
      : process.env.NOIR_STORE_MODE === "v2"
        ? "./capture-v2.mjs"
        : "./capture-scenarios.mjs"
  );
  await nativeScenarios(app);
  report.status = "captured";
  report.coreFlowChecks = "passed";
} catch (e) {
  report.status = "failed";
  report.error = e.stack;
  process.exitCode = 1;
  console.error(e);
  try {
    captureOSPhoto({
      platform: "android",
      udid: serial,
      output,
      name: "failure",
    });
  } catch {}
} finally {
  ws?.close();
  if (port) {
    try {
      device("forward", "--remove", "tcp:" + port);
    } catch {}
  }
  report.finishedAt = new Date().toISOString();
  writeFileSync(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log("Native Android capture " + report.status + ": " + output);
}
