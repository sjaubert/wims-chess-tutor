const { test, expect } = require('@playwright/test');

test('loadLessons charge la bibliothèque curée et expose 2 catégories', async ({ page }) => {
  await page.goto('/chess.html');
  const data = await page.evaluate(async () => await window.__trainTest.loadLessons());
  expect(Array.isArray(data)).toBe(true);
  expect(data.length).toBeGreaterThan(1);
  const cats = await page.evaluate(() => window.__trainTest.featuredLessons().map(g => g.category));
  expect(cats).toContain('mainline');
  expect(cats).toContain('trap');
});

test('searchLessons filtre par nom', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate(async () => await window.__trainTest.loadLessons());
  const hit = await page.evaluate(() => window.__trainTest.searchLessons('légal').length);
  expect(hit).toBeGreaterThan(0);
});
