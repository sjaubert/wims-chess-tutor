const { test, expect } = require('@playwright/test');

// Aller-retour des cavaliers : revient à la position initiale tous les 4 demi-coups.
const SHUFFLE = ['g1f3','g8f6','f3g1','f6g8'];

test('la triple répétition de la position initiale est déclarée nulle', async ({ page }) => {
  await page.goto('/chess.html');
  // Position initiale = occurrence 1 ; après 2 cycles complets elle réapparaît 2 fois -> 3 au total.
  await page.evaluate((seq) => { for (const u of seq) window.__gameTest.playUci(u); },
    [...SHUFFLE, ...SHUFFLE]);
  await expect(page.locator('#status')).toContainText('threefold');
});

test('timing exact : nulle à la 3e occurrence, pas à la 2e (position de milieu de partie)', async ({ page }) => {
  await page.goto('/chess.html');
  // 1.a3 a6 (poussées simples, pas d'en passant) -> position H (occurrence 1), puis 1 cycle -> H (occurrence 2)
  await page.evaluate((seq) => { for (const u of seq) window.__gameTest.playUci(u); },
    ['a2a3', 'a7a6', ...SHUFFLE]);
  await expect(page.locator('#status')).not.toContainText('threefold'); // 2e occurrence : pas encore
  await page.evaluate((seq) => { for (const u of seq) window.__gameTest.playUci(u); }, [...SHUFFLE]);
  await expect(page.locator('#status')).toContainText('threefold');     // 3e occurrence : nulle
});
