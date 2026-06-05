const { test, expect } = require('@playwright/test');
const { validateLessons } = require('../tools/validate-lessons.js');
const lessons = require('../lessons.json');

const IDS = ['sicilian-najdorf', 'sicilian-dragon', 'sicilian-sveshnikov', 'sicilian-classical'];

test('lessons.json reste valide après ajout des siciliennes', () => {
  const errors = validateLessons(lessons);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('les 4 leçons siciliennes sont présentes, profondes et côté Noir', () => {
  for (const id of IDS) {
    const l = lessons.find(x => x.id === id);
    expect(l, `leçon manquante : ${id}`).toBeTruthy();
    expect(l.category).toBe('mainline');
    expect(l.side).toBe('b');
    expect(l.uci.length).toBeGreaterThanOrEqual(14);
    expect(l.uci.length).toBe(l.comments.length);
  }
});

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
