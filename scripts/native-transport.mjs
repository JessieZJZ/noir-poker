// An emulator can briefly drop its ADB transport when the native driver
// switches back from a device screenshot to the WebView. Retry that switch
// once after reconnecting only the selected device. Game checks are untouched.
// A busy CI emulator can also drop the driver's proxy connection for a moment;
// read-only Android requests (screenshots, page source) retry twice for that.
const TRANSIENT_DRIVER = /Could not proxy command|socket hang up|exited with code 255/;
export function createNativeCommand({
  request,
  platform,
  reconnect,
  waitReady,
  onRecovery,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  return async (method, endpoint, body) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await request(method, endpoint, body);
      } catch (error) {
        if (
          platform === 'android' &&
          endpoint === '/context' &&
          attempt === 0 &&
          /adb: device offline/.test(error.message)
        ) {
          await reconnect();
          await waitReady();
          onRecovery();
          continue;
        }
        if (
          platform === 'android' &&
          method === 'GET' &&
          attempt < 2 &&
          TRANSIENT_DRIVER.test(error.message)
        ) {
          await pause(1000);
          continue;
        }
        throw error;
      }
    }
  };
}
