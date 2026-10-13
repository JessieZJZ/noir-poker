import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
export function notifyHeroTurn() {
  if (Capacitor.isNativePlatform()) return Haptics.impact({ style: ImpactStyle.Light });
  return globalThis.navigator?.vibrate?.(50);
}
