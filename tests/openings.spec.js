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
