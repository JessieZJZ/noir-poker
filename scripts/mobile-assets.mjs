import sharp from 'sharp';
import { readFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root } from './mobile-lib.mjs';

const icon = readFileSync(path.join(root, 'mobile/icon.svg'));
const png = (size) => sharp(icon).resize(size, size).png().toBuffer();
const ios = path.join(root, 'ios/App/App/Assets.xcassets');
await sharp(icon)
  .resize(1024, 1024)
  .removeAlpha()
  .png()
  .toFile(path.join(ios, 'AppIcon.appiconset/AppIcon-512@2x.png'));
const splash = await sharp({
  create: { width: 2732, height: 2732, channels: 3, background: '#0b1017' },
})
  .composite([{ input: await png(640), gravity: 'center' }])
  .png()
  .toBuffer();
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'])
  writeFileSync(path.join(ios, 'Splash.imageset', name), splash);

const res = path.join(root, 'android/app/src/main/res');
for (const [density, size] of [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
]) {
  const dir = path.join(res, `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png'])
    writeFileSync(path.join(dir, name), await png(size));
}
// A small original spade stays within Android's adaptive-icon safe zone.
writeFileSync(
  path.join(res, 'drawable-v24/ic_launcher_foreground.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
  <path android:fillColor="#6ee7c5" android:pathData="M54,28 C47,37 36,43 36,52 C36,63 47,66 54,59 C61,66 72,63 72,52 C72,43 61,37 54,28 M50,60 L45,72 L63,72 L58,60 Z"/>
</vector>
`,
);
writeFileSync(
  path.join(res, 'values/ic_launcher_background.xml'),
  '<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">#0b1017</color></resources>\n',
);
for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml'])
  writeFileSync(
    path.join(res, 'mipmap-anydpi-v26', name),
    `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background"/>
  <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>\n`,
  );
for (const directory of readdirSync(res)) {
  const filename = path.join(res, directory, 'splash.png');
  try {
    const { width, height } = await sharp(filename).metadata();
    const size = Math.round(Math.min(width, height) * 0.24);
    await sharp({ create: { width, height, channels: 3, background: '#0b1017' } })
      .composite([{ input: await png(size), gravity: 'center' }])
      .png()
      .toFile(filename + '.new');
    writeFileSync(filename, readFileSync(filename + '.new'));
    const { unlinkSync } = await import('node:fs');
    unlinkSync(filename + '.new');
  } catch (error) {
    if (!String(error.message).includes('Input file is missing')) throw error;
  }
}
console.log('Generated original NOIR app icons and launch artwork');
