import { test, expect } from '@playwright/test';

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
    expect(dropdowns).toHaveLength(11);
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
    await page.locator('#sound-button').click();
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
  await page.locator('#sound-button').click();
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'false');
});

test('sound waits for a real gesture without queuing old effects and handles failed audio resume', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.audioProbe = { created: 0, resumes: 0, notes: 0, reject: false };
    const parameter = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
    window.AudioContext = class {
      state = 'suspended';
      currentTime = 0;
      destination = {};
      constructor() {
        window.audioProbe.created++;
      }
      resume() {
        window.audioProbe.resumes++;
        if (window.audioProbe.reject) return Promise.reject(new Error('Resume unavailable'));
        this.state = 'running';
        return Promise.resolve();
      }
      createOscillator() {
        window.audioProbe.notes++;
        return { frequency: parameter(), connect() {}, start() {}, stop() {} };
      }
      createGain() {
        return { gain: parameter(), connect() {} };
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
  expect(await page.evaluate(() => window.audioProbe)).toMatchObject({ created: 0, notes: 0 });
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => window.audioProbe)).toMatchObject({
    created: 1,
    resumes: 1,
    notes: 0,
  });
  await page.evaluate(() => window.qa.foldWin(6));
  await page.locator('#next-button').click();
  await page.evaluate(() => window.qa.stop());
  expect(await page.evaluate(() => window.audioProbe.notes)).toBe(2);
  await page.locator('#sound-button').click();
  await page.evaluate(() => window.qa.foldWin(6));
  await page.locator('#next-button').click();
  await page.evaluate(() => window.qa.stop());
  expect(await page.evaluate(() => window.audioProbe.notes)).toBe(2);
  await page.locator('#sound-button').click();
  await expect.poll(() => page.evaluate(() => window.audioProbe.notes)).toBe(4);
  await page.reload();
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => {
    window.qa.stop();
    window.audioProbe.reject = true;
  });
  await page.keyboard.press('Tab');
  await page.locator('#sound-button').click();
  await page.locator('#sound-button').click();
  await page.evaluate(() => window.qa.foldWin(6));
  await page.locator('#next-button').click();
  await page.evaluate(() => window.qa.stop());
  expect(await page.evaluate(() => window.audioProbe)).toMatchObject({ created: 1, notes: 0 });
  expect(errors).toEqual([]);
});
