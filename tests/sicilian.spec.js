const { test, expect } = require('@playwright/test');

// NB : les tests de données des 4 leçons curées (Najdorf/Dragon/Sveshnikov/Classique)
// sont ajoutés dans la Task 4, une fois le contenu rédigé dans lessons.json.

test('le catalogue groupe les résultats par famille (en-tête repliable)', async ({ page }) => {
  await page.goto('/chess.html');
  await page.locator('#modeTrain').click();
  await expect(page.locator('#openingResults .opening-row').first()).toBeVisible({ timeout: 5000 });
  await page.locator('#openingSearch').fill('sicilian');
  const fams = page.locator('#openingResults details.opening-fam > summary');
  await expect(fams.first()).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#openingResults details.opening-fam > summary',
    { hasText: 'Sicilian Defense' }).first()).toBeVisible();
  await expect(page.locator('#openingResults details.opening-fam .opening-row').first()).toBeVisible();
});

test('familyOf isole le texte avant le deux-points', async ({ page }) => {
  await page.goto('/chess.html');
  const r = await page.evaluate(() => [
    window.__trainTest.familyOf('Sicilian Defense: Najdorf Variation'),
    window.__trainTest.familyOf('Sicilian Defense'),
  ]);
  expect(r[0]).toBe('Sicilian Defense');
  expect(r[1]).toBe('Sicilian Defense');
});
