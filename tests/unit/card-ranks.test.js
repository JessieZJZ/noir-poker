import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { renderCard } from '../../src/ui/cards.js';
import { readNativeRankInk, assertStableRankInk } from '../native/card-ranks.mjs';

test('every rank and suit keeps accessible labels and fixed outlines in full and mini cards', () => {
  const symbols = ['♠', '♥', '♣', '♦'];
  for (let rank = 2; rank <= 14; rank++) {
    const label = rank <= 10 ? String(rank) : ['J', 'Q', 'K', 'A'][rank - 11];
    for (let suit = 0; suit < 4; suit++) {
      for (const small of [false, true]) {
        const markup = renderCard({ rank, suit, symbol: symbols[suit] }, { small });
        assert.ok(markup.includes(`aria-label="${label}${symbols[suit]}"`));
        assert.equal((markup.match(/class="card-rank"/g) || []).length, small ? 1 : 2);
        assert.ok(markup.includes(`data-rank="${label}"`));
        assert.match(markup, /<path d="M[^\"]+" transform="scale/);
        assert.doesNotMatch(markup, /<text\b|font-family|font-weight/);
        assert.ok(markup.includes(`playing-card ${suit % 2 ? 'red' : 'black'}`));
      }
    }
  }
});

test('native pixel regression detects glyph growth and weight changes even with unchanged CSS', () => {
  const before = [{ rank: '9', width: 18, height: 27, pixels: 242 }];
  assert.doesNotThrow(() =>
    assertStableRankInk(before, [{ rank: '9', width: 19, height: 28, pixels: 250 }]),
  );
  assert.throws(
    () => assertStableRankInk(before, [{ rank: '9', width: 22, height: 33, pixels: 377 }]),
    /dimensions/,
  );
  assert.throws(
    () => assertStableRankInk(before, [{ rank: '9', width: 18, height: 27, pixels: 260 }]),
    /weight/,
  );
});

test('native glyph crops map CSS coordinates through Android XML and iOS screenshot scaling', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'noir-rank-pixels-'));
  try {
    const imagePath = path.join(directory, 'screen.png');
    const sourcePath = path.join(directory, 'screen.xml');
    const ink = await sharp({
      create: { width: 8, height: 16, channels: 3, background: '#000' },
    })
      .png()
      .toBuffer();
    await sharp({
      create: { width: 200, height: 400, channels: 3, background: '#fff' },
    })
      .composite([{ input: ink, left: 40, top: 80 }])
      .png()
      .toFile(imagePath);
    const state = {
      width: 80,
      ranks: [{ rank: '9', rect: { x: 10, y: 20, width: 4, height: 8 } }],
    };
    for (const xml of [
      '<android.webkit.WebView class="android.webkit.WebView" bounds="[20,40][180,360]"/>',
      '<node class="android.webkit.WebView" bounds="[20,40][180,360]"/>',
      '<XCUIElementTypeApplication width="100"><XCUIElementTypeWebView x="10" y="20" width="80"/></XCUIElementTypeApplication>',
    ]) {
      writeFileSync(sourcePath, xml);
      assert.deepEqual(await readNativeRankInk({ imagePath, sourcePath }, state), [
        { rank: '9', width: 8, height: 16, pixels: 128 },
      ]);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
