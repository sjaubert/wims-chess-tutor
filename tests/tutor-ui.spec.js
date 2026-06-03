const { test, expect } = require('@playwright/test');

test('le lien de retour WIMS est présent et pointe vers le CGI WIMS', async ({ page }) => {
  await page.goto('/chess.html');
  const link = page.locator('#wimsHome');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/wims/wims.cgi');
});

test('le panneau tuteur est caché par défaut et apparaît quand on l\'active', async ({ page }) => {
  await page.goto('/chess.html');
  await expect(page.locator('#tutorPane')).toBeHidden();
  await page.locator('#tutorToggle').click();
  await expect(page.locator('#tutorPane')).toBeVisible();
});

test('après activation, l\'analyse de la position initiale s\'affiche', async ({ page }) => {
  await page.goto('/chess.html');
  await page.locator('#tutorToggle').click();
  await expect(page.locator('#tutorEval')).not.toBeEmpty({ timeout: 5000 });
  await expect(page.locator('#tutorLine')).toContainText('1.', { timeout: 5000 });
  await expect(page.locator('#tutorBook')).toContainText('théorique', { timeout: 5000 });
});
