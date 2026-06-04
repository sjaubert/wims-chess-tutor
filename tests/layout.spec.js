const { test, expect } = require('@playwright/test');
const path = require('path');
const url = 'file://' + path.resolve(__dirname, '..', 'chess.html');

// Bug 2 : les pièces prises ne sont pas toutes visibles (même tuteur éteint).
test('toutes les pièces prises restent visibles (5 types, aucun rognage)', async ({ page }) => {
  await page.goto(url);
  await page.waitForSelector('.square .piece');
  // Remplit le sac de prises avec les 5 types, exactement comme renderCaptureBag.
  await page.evaluate(() => {
    const order = ['Q', 'R', 'B', 'N', 'P'];
    const el = document.getElementById('userCaps');
    // .cap-piece est dimensionné par le CSS (28x28) — le contenu SVG n'influe pas
    // sur la mise en page testée ici (rognage par débordement).
    el.innerHTML = order.map(() =>
      `<span class="cap-item"><span class="cap-piece"></span><span class="cap-count">x2</span></span>`
    ).join('');
  });
  const clipped = await page.$$eval('#userCaps .cap-item', items => {
    const g = document.querySelector('.captures-grid').getBoundingClientRect();
    return items.filter(it => {
      const r = it.getBoundingClientRect();
      return r.bottom > g.bottom + 1 || r.right > g.right + 1; // déborde la zone visible
    }).length;
  });
  expect(clipped).toBe(0);
});

// Bug 1 : en activant le tuteur IA, la liste « Past moves » disparaît.
test('le tuteur IA activé ne fait pas disparaître les Past moves ni les prises', async ({ page }) => {
  await page.goto(url);
  await page.waitForSelector('.square .piece');
  await page.evaluate(() =>
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5'].forEach(u => window.__gameTest.playUci(u))
  );
  await page.click('#tutorToggle');
  await page.waitForTimeout(150);
  const movesH = await page.$eval('#moves', el => el.clientHeight);
  const capsH = await page.$eval('.captures-grid', el => el.clientHeight);
  expect(movesH).toBeGreaterThanOrEqual(100); // la liste des coups reste utilisable
  expect(capsH).toBeGreaterThanOrEqual(100);  // la zone des prises n'est pas écrasée
});
