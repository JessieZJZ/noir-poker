import { soundSamples, SOUND_SAMPLE_RATE } from '../../src/ui/sound-cues.js';
import { test, expect } from '@playwright/test';
import { toggleSound } from './settings-helpers.js';

function pcmEvent(kind) {
  const samples = soundSamples(kind);
  let fingerprint = 2166136261;
  for (const value of samples)
    fingerprint = Math.imul(fingerprint ^ Math.round(value * 32768), 16777619) >>> 0;
  return { length: samples.length, sampleRate: SOUND_SAMPLE_RATE, fingerprint };
}
async function installPCMProbe(page) {
  await page.addInitScript(() => {
    window.audioEvents = [];
    window.AudioContext = class {
      state = 'suspended';
      currentTime = 0;
      destination = {};
      createWaveShaper() {
        return { connect() {} };
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      createBuffer(channels, length, sampleRate) {
        const samples = new Float32Array(length);
        return { sampleRate, getChannelData: () => samples };
      }
      createBufferSource() {
        return {
          connect() {},
          start() {
            const samples = this.buffer.getChannelData(0);
            let fingerprint = 2166136261;
            for (const value of samples)
              fingerprint = Math.imul(fingerprint ^ Math.round(value * 32768), 16777619) >>> 0;
            window.audioEvents.push({
              length: samples.length,
              sampleRate: this.buffer.sampleRate,
              fingerprint,
            });
          },
        };
      }
    };
  });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.keyboard.press('Tab');
}
test('hero and bot checks use the shared two-tap PCM and respect mute', async ({ page }) => {
  await installPCMProbe(page);
  await page.evaluate(() => window.qa.bettingTurn(1, 1));
  await page.locator('#call-button').click();
  await page.evaluate(() => window.qa.stop());
  expect(await page.evaluate(() => window.audioEvents)).toEqual([pcmEvent('check')]);
  const waiting = await page.evaluate(() => window.qa.botCheckTurn());
  await page.clock.runFor(waiting.delayMs + 1);
  await page.evaluate(() => window.qa.stop());
  expect(await page.evaluate(() => window.audioEvents)).toEqual([
    pcmEvent('check'),
    pcmEvent('check'),
  ]);
  await toggleSound(page);
  await page.evaluate(() => window.qa.bettingTurn(1, 1));
  await page.locator('#call-button').click();
  await page.evaluate(() => window.qa.stop());
  const muted = await page.evaluate(() => window.qa.botCheckTurn());
  await page.clock.runFor(muted.delayMs + 1);
  await page.evaluate(() => window.qa.stop());
  expect(await page.evaluate(() => window.audioEvents.length)).toBe(2);
});
test('hero and bot folds and paid calls use identical shared PCM and obey sound toggles', async ({
  page,
}) => {
  await installPCMProbe(page);
  await page.evaluate(() => window.qa.heroTurn(6));
  await page.locator('#fold-button').click();
  await page.evaluate(() => window.qa.stop());
  expect(await page.evaluate(() => window.audioEvents)).toEqual([pcmEvent('fold')]);
  await page.evaluate(() => window.qa.heroTurn(6));
  await page.locator('#call-button').click();
  await page.evaluate(() => window.qa.stop());
  const waiting = await page.evaluate(() => window.qa.botFoldTurn());
  await page.clock.runFor(waiting.delayMs + 1);
  await page.evaluate(() => window.qa.stop());
  expect(await page.evaluate(() => window.audioEvents)).toEqual([
    pcmEvent('fold'),
    pcmEvent('call'),
    pcmEvent('fold'),
  ]);
  await toggleSound(page);
  await page.evaluate(() => window.qa.heroTurn(6));
  await page.locator('#fold-button').click();
  await page.evaluate(() => window.qa.stop());
  const muted = await page.evaluate(() => window.qa.botFoldTurn());
  await page.clock.runFor(muted.delayMs + 1);
  await page.evaluate(() => window.qa.stop());
  expect(await page.evaluate(() => window.audioEvents.length)).toBe(3);
});

test('icon controls and every dropdown remain centered on narrow and wide screens', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.foldWin(6));
  await page.locator('#opponents-button').click();
  await page.locator('#opponents-dialog .icon-button.close-dialog').click();
  const checkIcons = async () => {
    const icons = await page
      .locator('.icon-button:visible, .seat-peek:visible')
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const box = button.getBoundingClientRect(),
            icon = button.querySelector('svg')?.getBoundingClientRect();
          return (
            icon && {
              x: icon.left + icon.width / 2 - box.left - box.width / 2,
              y: icon.top + icon.height / 2 - box.top - box.height / 2,
              fits: icon.width <= box.width && icon.height <= box.height,
            }
          );
        }),
      );
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(icon).toBeTruthy();
      expect(Math.abs(icon.x)).toBeLessThan(0.6);
      expect(Math.abs(icon.y)).toBeLessThan(0.6);
      expect(icon.fits).toBe(true);
    }
  };
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await checkIcons();
    for (const id of ['opponents', 'rules', 'reset', 'pot', 'review']) {
      await page.evaluate((id) => document.querySelector(`#${id}-dialog`).showModal(), id);
      await checkIcons();
      await page.locator(`#${id}-dialog .icon-button.close-dialog`).click();
    }
    const dropdowns = await page.locator('select').evaluateAll((selects) =>
      selects.map((select) => {
        const style = getComputedStyle(select);
        return {
          appearance: style.appearance,
          image: style.backgroundImage,
          y: style.backgroundPositionY,
          right: parseFloat(style.paddingRight),
          iconSize: parseFloat(style.backgroundSize),
        };
      }),
    );
    expect(dropdowns).toHaveLength(12);
    for (const dropdown of dropdowns) {
      expect(dropdown.appearance).toBe('none');
      expect(dropdown.image).toBe(dropdowns[0].image);
      expect(dropdown.y).toBe('50%');
      expect(dropdown.right).toBeGreaterThanOrEqual(dropdown.iconSize + 10);
    }
  }
});

test('saved sound choices restore, while missing or unavailable storage defaults to enabled', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  for (const enabled of [false, true]) {
    await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', String(!enabled));
    await toggleSound(page);
    expect(await page.evaluate(() => localStorage.getItem('noir-sound'))).toBe(String(enabled));
    await page.reload();
    await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', String(enabled));
  }
  await page.evaluate(() => localStorage.removeItem('noir-sound'));
  await page.reload();
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'true');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('Storage unavailable');
      },
    });
  });
  await page.reload();
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'true');
  await toggleSound(page);
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'false');
});

test('sound prepares the shared PCM player, waits for a real gesture and handles failed audio resume', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.audioProbe = { created: 0, resumes: 0, notes: 0, reject: false, gains: [], limiters: 0 };
    const parameter = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
    window.AudioContext = class {
      state = 'suspended';
      currentTime = 0;
      destination = {};
      createWaveShaper() {
        window.audioProbe.limiters++;
        return { connect() {} };
      }
      constructor() {
        window.audioProbe.created++;
      }
      resume() {
        window.audioProbe.resumes++;
        if (window.audioProbe.reject) return Promise.reject(new Error('Resume unavailable'));
        this.state = 'running';
        return Promise.resolve();
      }
      createBuffer(channels, length) {
        const samples = new Float32Array(length);
        return { getChannelData: () => samples };
      }
      createBufferSource() {
        return {
          connect() {},
          start() {
            window.audioProbe.notes++;
          },
        };
      }
      createGain() {
        const gain = parameter();
        window.audioProbe.gains.push(gain);
        return { gain, connect() {} };
      }
      createDynamicsCompressor() {
        return Object.fromEntries(
          ['threshold', 'knee', 'ratio', 'attack', 'release']
            .map((key) => [key, parameter()])
            .concat([['connect', () => {}]]),
        );
      }
    };
  });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.stop();
    document
      .querySelector('#rules-button')
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  expect(await page.evaluate(() => window.audioProbe)).toMatchObject({
    created: 1,
    resumes: 0,
    notes: 0,
  });
  expect(await page.evaluate(() => window.audioProbe.gains.length)).toBe(0);
  expect(await page.evaluate(() => window.audioProbe.limiters)).toBe(1);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => window.audioProbe)).toMatchObject({
    created: 1,
    resumes: 1,
    notes: 0,
  });
  await page.evaluate(() => window.qa.foldWin(6));
  await page.locator('#next-button').click();
  await page.evaluate(() => window.qa.stop());
  expect(await page.evaluate(() => window.audioProbe.notes)).toBe(1);
  await toggleSound(page);
  await page.evaluate(() => window.qa.foldWin(6));
  await page.locator('#next-button').click();
  await page.evaluate(() => window.qa.stop());
  expect(await page.evaluate(() => window.audioProbe.notes)).toBe(1);
  await toggleSound(page);
  await expect.poll(() => page.evaluate(() => window.audioProbe.notes)).toBe(2);
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.stop();
    window.audioProbe.reject = true;
  });
  await page.keyboard.press('Tab');
  await toggleSound(page);
  await toggleSound(page);
  await page.evaluate(() => window.qa.foldWin(6));
  await page.locator('#next-button').click();
  await page.evaluate(() => window.qa.stop());
  expect(await page.evaluate(() => window.audioProbe)).toMatchObject({ created: 1, notes: 0 });
  expect(errors).toEqual([]);
});
