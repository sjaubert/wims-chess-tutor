const { test, expect } = require('@playwright/test');

test('le sélecteur de mode bascule entre partie libre et entraînement', async ({ page }) => {
  await page.goto('/chess.html');
  // Par défaut : partie libre, panneau scores visible, entraînement caché
  await expect(page.locator('#trainPane')).toBeHidden();
  await expect(page.locator('.score-pane')).toBeVisible();
  // Basculer en entraînement
  await page.locator('#modeTrain').click();
  await expect(page.locator('#trainPane')).toBeVisible();
  await expect(page.locator('.score-pane')).toBeHidden();
  // Revenir en partie libre
  await page.locator('#modePlay').click();
  await expect(page.locator('#trainPane')).toBeHidden();
  await expect(page.locator('.score-pane')).toBeVisible();
});

test('loadOpenings charge le catalogue et la recherche filtre', async ({ page }) => {
  await page.goto('/chess.html');
  const n = await page.evaluate(async () => (await window.__trainTest.loadOpenings()).length);
  expect(n).toBeGreaterThan(1000);

  const found = await page.evaluate(() =>
    window.__trainTest.searchOpenings('ruy lopez').some(o => o.name === 'Ruy Lopez')
  );
  expect(found).toBe(true);

  const feat = await page.evaluate(() => window.__trainTest.featuredOpenings().map(o => o.name));
  expect(feat).toContain('Ruy Lopez');
  expect(feat.length).toBeGreaterThan(5);
});

test('le sélecteur affiche les classiques puis filtre, et propose le choix du camp', async ({ page }) => {
  await page.goto('/chess.html');
  await page.locator('#modeTrain').click();
  await expect(page.locator('#openingResults .opening-row').first()).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#openingResults')).toContainText('Ruy Lopez');
  await page.locator('#openingSearch').fill('sicilian');
  await expect(page.locator('#openingResults')).toContainText('Sicilian', { timeout: 5000 });
  await page.locator('#openingResults .opening-row', { hasText: 'Sicilian' }).first().click();
  await expect(page.locator('.opening-sidechoice')).toBeVisible();
});
