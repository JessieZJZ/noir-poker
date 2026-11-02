import sharp from 'sharp';
import { readFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root } from './mobile-lib.mjs';

// One vector master avoids enlarging a low-resolution launch bitmap.
const master = readFileSync(path.join(root, 'public/brand-mark.svg'));
const vectorPng = (size) => sharp(master, { density: 384 }).resize(size, size).png().toBuffer();
const launchIcon = await vectorPng(1024);
const icon = await sharp(launchIcon).flatten({ background: '#0b1017' }).png().toBuffer();
writeFileSync(path.join(root, 'public/launch-icon.png'), launchIcon);
writeFileSync(path.join(root, 'public/app-icon.png'), icon);
writeFileSync(path.join(root, 'public/favicon.png'), await vectorPng(64));
writeFileSync(
  path.join(root, 'public/apple-touch-icon.png'),
  await sharp(icon).resize(180, 180).png().toBuffer(),
);
const png = (size) => sharp(icon).resize(size, size).png().toBuffer();
const launchPng = vectorPng;
const ios = path.join(root, 'ios/App/App/Assets.xcassets');
await sharp(icon)
  .resize(1024, 1024)
  .removeAlpha()
  .png()
  .toFile(path.join(ios, 'AppIcon.appiconset/AppIcon-512@2x.png'));
const launchAssets = path.join(ios, 'LaunchMark.imageset');
mkdirSync(launchAssets, { recursive: true });
writeFileSync(path.join(launchAssets, 'launch-mark.png'), await vectorPng(720));
writeFileSync(
  path.join(launchAssets, 'Contents.json'),
  JSON.stringify(
    {
      images: [{ idiom: 'universal', filename: 'launch-mark.png' }],
      info: { version: 1, author: 'xcode' },
    },
    null,
    2,
  ) + '\n',
);

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
// Keep the supplied artwork inside Android's adaptive-icon safe zone.
mkdirSync(path.join(res, 'drawable-nodpi'), { recursive: true });
await sharp({ create: { width: 648, height: 648, channels: 4, background: '#001011' } })
  .composite([{ input: await png(432), gravity: 'center' }])
  .png()
  .toFile(path.join(res, 'drawable-nodpi/ic_launcher_artwork.png'));
// Android's system launch icon is independent from its opaque launcher tile.
await sharp({ create: { width: 648, height: 648, channels: 4, background: '#00000000' } })
  // A square tile must fit INSIDE Android's circular splash safe zone.
  .composite([{ input: await launchPng(324), gravity: 'center' }])
  .png()
  .toFile(path.join(res, 'drawable-nodpi/launch_artwork.png'));
writeFileSync(
  path.join(res, 'drawable-v24/ic_launcher_foreground.xml'),
  '<?xml version="1.0" encoding="utf-8"?><bitmap xmlns:android="http://schemas.android.com/apk/res/android" android:src="@drawable/ic_launcher_artwork" android:gravity="fill"/>\n',
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
      .composite([{ input: await launchPng(size), gravity: 'center' }])
      .png()
      .toFile(filename + '.new');
    writeFileSync(filename, readFileSync(filename + '.new'));
    const { unlinkSync } = await import('node:fs');
    unlinkSync(filename + '.new');
  } catch (error) {
    if (!String(error.message).includes('Input file is missing')) throw error;
  }
}
console.log('Generated NOIR icons and launch artwork from public/brand-mark.svg');
