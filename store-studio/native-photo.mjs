import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

// A media-only capture path: read the actual compositor without changing the
// attached WebView context. Full native E2E retains its original AX/error checks.
export function captureOSPhoto({ platform, udid, output, name, adbPort }) {
  if (platform !== "android") throw Error("OS photo adapter is Android-only");
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const adb = sdk ? path.join(sdk, "platform-tools/adb") : "adb";
  const result = spawnSync(
    adb,
    [
      ...(adbPort ? ["-P", adbPort] : []),
      "-s",
      udid,
      "exec-out",
      "screencap",
      "-p",
    ],
    {
      timeout: 30000,
      maxBuffer: 24 * 1024 * 1024,
    },
  );
  if (result.status !== 0)
    throw Error(
      "Native OS screenshot failed: " +
        (result.stderr?.toString() || result.error),
    );
  if (
    !result.stdout
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw Error("The device did not return a native PNG");
  const imagePath = path.join(output, `${name}.png`);
  writeFileSync(imagePath, result.stdout);
  return {
    imagePath,
    sourcePath: null,
    capture: "Android OS compositor; visual QA required",
  };
}
