const { test, expect } = require('@playwright/test');
const path = require('path');
const url = 'file://' + path.resolve(__dirname, '..', 'chess.html');

async function bilanApi(page) {
  await page.goto(url);
  await page.waitForSelector('.square .piece');
  await page.waitForFunction(() => !!window.__bilanTest);
}

test('winPercent : 0 cp ≈ 50 %, gros avantage ≈ 100 %', async ({ page }) => {
  await bilanApi(page);
  const r = await page.evaluate(() => ({
    zero: window.__bilanTest.winPercent(0),
    big: window.__bilanTest.winPercent(2000),
    neg: window.__bilanTest.winPercent(-2000),
  }));
  expect(Math.round(r.zero)).toBe(50);
  expect(r.big).toBeGreaterThan(95);
  expect(r.neg).toBeLessThan(5);
});

test('cpLoss : jamais négatif, plafonné, point de vue du camp', async ({ page }) => {
  await bilanApi(page);
  const r = await page.evaluate(() => ({
    drop: window.__bilanTest.cpLoss(100, -50, 1000),
    improved: window.__bilanTest.cpLoss(-50, 50, 1000),
    capped: window.__bilanTest.cpLoss(1000000, 50, 1000),
  }));
  expect(r.drop).toBe(150);
  expect(r.improved).toBe(0);
  expect(r.capped).toBe(1000);
});

test('classifyLoss : respecte les seuils 50/100/200', async ({ page }) => {
  await bilanApi(page);
  const r = await page.evaluate(() => [49, 50, 100, 200].map(window.__bilanTest.classifyLoss));
  expect(r).toEqual(['ok', 'inaccuracy', 'mistake', 'blunder']);
});

test('acplToElo : décroissant et borné 400–2800', async ({ page }) => {
  await bilanApi(page);
  const r = await page.evaluate(() => ({
    perfect: window.__bilanTest.acplToElo(0),
    awful: window.__bilanTest.acplToElo(800),
    a: window.__bilanTest.acplToElo(10),
    b: window.__bilanTest.acplToElo(100),
    c: window.__bilanTest.acplToElo(300),
  }));
  expect(r.perfect).toBe(2800);
  expect(r.awful).toBe(400);
  expect(r.a).toBeGreaterThan(r.b);
  expect(r.b).toBeGreaterThan(r.c);
});

test('moveAccuracy : delta nul ≈ 100, gros delta faible', async ({ page }) => {
  await bilanApi(page);
  const r = await page.evaluate(() => ({
    perfect: window.__bilanTest.moveAccuracy(0),
    bad: window.__bilanTest.moveAccuracy(50),
  }));
  expect(Math.round(r.perfect)).toBe(100);
  expect(r.bad).toBeLessThan(30);
});

test('computeBilan : pertes et compteurs par camp', async ({ page }) => {
  await bilanApi(page);
  const r = await page.evaluate(() => {
    const history = [{ by: 'w', uci: 'e2e4' }, { by: 'b', uci: 'e7e5' }];
    const records = [
      { evalCp: 20, isBook: false, nLegal: 20 },   // P0 (blanc au trait)
      { evalCp: -200, isBook: false, nLegal: 20 },  // P1 (noir au trait)
      { evalCp: 10, isBook: false, nLegal: 20 },    // P2
    ];
    return window.__bilanTest.computeBilan(history, records);
  });
  expect(r.white.counted).toBe(1);
  expect(r.white.blunders).toBe(1);     // 20 -> -200 = perte 220 (blanc)
  expect(r.black.counted).toBe(1);
  expect(r.black.blunders).toBe(1);     // 200 -> -10 = perte 210 (noir)
  expect(r.white.elo).toBeGreaterThanOrEqual(400);
  expect(r.white.elo).toBeLessThanOrEqual(2800);
});

test('computeBilan : exclut coups du livre et coups forcés', async ({ page }) => {
  await bilanApi(page);
  const r = await page.evaluate(() => {
    const history = [{ by: 'w', uci: 'e2e4' }, { by: 'b', uci: 'e7e5' }];
    const records = [
      { evalCp: 20, isBook: true, nLegal: 20 },     // coup blanc = théorie -> exclu
      { evalCp: -200, isBook: false, nLegal: 1 },   // coup noir = forcé -> exclu
      { evalCp: 10, isBook: false, nLegal: 20 },
    ];
    return window.__bilanTest.computeBilan(history, records);
  });
  expect(r.white.counted).toBe(0);
  expect(r.white.elo).toBeNull();
  expect(r.black.counted).toBe(0);
  expect(r.black.accuracy).toBeNull();
});
