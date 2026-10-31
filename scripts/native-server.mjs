// Loading an unrelated installed driver must not delay the selected platform.
export function nativeServerArguments(platform, port) {
  const driver = { ios: 'xcuitest', android: 'uiautomator2' }[platform];
  if (!driver) throw Error(`Unsupported native test platform: ${platform}`);
  return [
    '--address',
    '127.0.0.1',
    '--port',
    String(port),
    '--use-drivers',
    driver,
    ...(platform === 'android'
      ? ['--allow-insecure', 'uiautomator2:chromedriver_autodownload']
      : []),
  ];
}
