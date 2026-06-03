const { test, expect } = require('@playwright/test');

test('Abandonner termine la partie et l\'affiche durablement', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/chess.html');
  await expect(page.locator('#status')).toContainText('Your move');
  await page.locator('#resign').click();
  // Le statut doit indiquer l'abandon et NE PAS revenir à "Your move"
  await expect(page.locator('#status')).toContainText('abandonn', { timeout: 4000 });
  await page.waitForTimeout(400);
  await expect(page.locator('#status')).toContainText('abandonn');
  // Le bot a marqué un point
  await expect(page.locator('#scoreboard')).toHaveText('0 - 1 - 0');
});

test('reset des scores remet le tableau à zéro', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/chess.html');
  // Provoque un score via un abandon, puis reset
  await page.locator('#resign').click();
  await expect(page.locator('#scoreboard')).toHaveText('0 - 1 - 0');
  await page.locator('#resetScores').click();
  await expect(page.locator('#scoreboard')).toHaveText('0 - 0 - 0');
});

test('Nouvelle partie après un abandon réautorise le jeu', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/chess.html');
  await page.locator('#resign').click();
  await expect(page.locator('#status')).toContainText('abandonn');
  await page.locator('#newGame').click();
  // Après New Game, on n'est plus en état d'abandon
  await expect(page.locator('#status')).not.toContainText('abandonn', { timeout: 4000 });
});
