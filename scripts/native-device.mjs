import assert from 'node:assert/strict';

export function selectIOSSimulator(
  { devices, runtimes, devicetypes },
  { runtimeIdentifier, deviceTypeIdentifier } = {},
) {
  const runtime = runtimes
    .filter(
      (item) =>
        item.isAvailable &&
        item.identifier.includes('iOS') &&
        (!runtimeIdentifier || item.identifier === runtimeIdentifier),
    )
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0];
  assert.ok(
    runtime,
    `No available iOS Simulator runtime: ${runtimeIdentifier ?? 'install in Xcode'}`,
  );
  const supported = runtime.supportedDeviceTypes?.map((item) => item.identifier);
  const phone = devicetypes
    .filter(
      (item) =>
        item.name.startsWith('iPhone') &&
        (!deviceTypeIdentifier || item.identifier === deviceTypeIdentifier) &&
        (!supported || supported.includes(item.identifier)),
    )
    .sort((a, b) => {
      // Prefer a standard-size iPhone, then the newest supported generation.
      const standard = (item) => /^iPhone \d+$/.test(item.name);
      return (
        Number(standard(b)) - Number(standard(a)) ||
        b.name.localeCompare(a.name, undefined, { numeric: true })
      );
    })[0];
  assert.ok(
    phone,
    `No compatible iPhone device type: ${deviceTypeIdentifier ?? runtime.identifier}`,
  );
  const existing = devices[runtime.identifier]?.find(
    (item) =>
      item.isAvailable &&
      item.name === 'Noir Poker E2E' &&
      item.deviceTypeIdentifier === phone.identifier,
  );
  return { runtime, phone, existing };
}
