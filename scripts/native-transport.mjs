// An emulator can briefly drop its ADB transport when the native driver
// switches back from a device screenshot to the WebView. Retry that switch
// once after reconnecting only the selected device. Game checks are untouched.
export function createNativeCommand({ request, platform, reconnect, waitReady, onRecovery }) {
  return async (method, endpoint, body) => {
    try {
      return await request(method, endpoint, body);
    } catch (error) {
      if (
        platform !== 'android' ||
        endpoint !== '/context' ||
        !/adb: device offline/.test(error.message)
      )
        throw error;
      await reconnect();
      await waitReady();
      onRecovery();
      return request(method, endpoint, body);
    }
  };
}
