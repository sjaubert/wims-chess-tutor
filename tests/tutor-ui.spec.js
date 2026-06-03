const { test, expect } = require('@playwright/test');

async function dragPiece(page, fromIndex, toIndex) {
  const from = await page.locator(`.square[data-i="${fromIndex}"]`).boundingBox();
  const to = await page.locator(`.square[data-i="${toIndex}"]`).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
  await page.mouse.up();
}

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

test('live : tuteur allumé, on joue e2-e4, le bot répond et l\'analyse se rafraîchit', async ({ page }) => {
  await page.goto('/chess.html');
  await page.locator('#tutorToggle').click();
  await expect(page.locator('#tutorEval')).not.toBeEmpty({ timeout: 5000 });
  await dragPiece(page, 52, 36); // e2 -> e4
  // Le coup humain apparaît dans l'historique
  await expect(page.locator('#moves')).toContainText('e4', { timeout: 5000 });
  // Le bot répond : le trait revient au joueur humain (sans casser le flux avec le tuteur)
  await expect(page.locator('#status')).toContainText('Your move', { timeout: 8000 });
  // Le panneau tuteur reste alimenté après le coup
  await expect(page.locator('#tutorEval')).not.toBeEmpty();
  await expect(page.locator('#tutorLine')).not.toBeEmpty();
});
