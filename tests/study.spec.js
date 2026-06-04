const { test, expect } = require('@playwright/test');

const LESSON = { id:'t-leg', name:'Test Légal', category:'trap', eco:'C41', side:'w', trapPly:2,
  uci:['e2e4','e7e5','g1f3'], comments:['Ouvre le centre.','Réponse classique.','⚠ Le piège.'], summary:'résumé' };

test('startStudy ouvre le panneau d\'étude au coup 0', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate((l)=>window.__trainTest.startStudy(l), LESSON);
  await expect(page.locator('#studyPanel')).toBeVisible();
  await expect(page.locator('#studyName')).toHaveText('Test Légal');
  expect(await page.evaluate(()=>window.__trainTest.getStudy().ply)).toBe(0);
});

test('les coups de la liste ont un texte lisible (pas blanc sur blanc)', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate((l)=>window.__trainTest.startStudy(l), LESSON);
  const first = page.locator('#studyMoves .study-move').first();
  await expect(first).toHaveText('1.e4');
  const color = await first.evaluate(el => getComputedStyle(el).color);
  expect(color).not.toBe('rgb(255, 255, 255)');
});

test('avancer déplace les pièces et affiche le commentaire', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate((l)=>window.__trainTest.startStudy(l), LESSON);
  await page.locator('#studyNext').click();
  expect(await page.evaluate(()=>window.__trainTest.getStudy().ply)).toBe(1);
  await expect(page.locator('#studyComment')).toContainText('Ouvre le centre');
  expect(await page.locator('.square[data-i="52"] .piece').count()).toBe(0);
  expect(await page.locator('.square[data-i="36"] .piece').count()).toBe(1);
});

test('l\'encart piège apparaît au trapPly', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate((l)=>window.__trainTest.startStudy(l), LESSON);
  await page.locator('#studyNext').click(); // ply 1
  await expect(page.locator('#studyTrap')).toBeHidden();
  await page.locator('#studyNext').click(); // ply 2
  await page.locator('#studyNext').click(); // ply 3 -> dernier coup index 2 = trapPly
  await expect(page.locator('#studyTrap')).toBeVisible();
  await expect(page.locator('#studyTrap')).toContainText('Piège');
});

test('reculer revient en arrière', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate((l)=>window.__trainTest.startStudy(l), LESSON);
  await page.locator('#studyNext').click();
  await page.locator('#studyNext').click();
  await page.locator('#studyPrev').click();
  expect(await page.evaluate(()=>window.__trainTest.getStudy().ply)).toBe(1);
});

test('le picker liste les leçons curées (ouvertures + pièges)', async ({ page }) => {
  await page.goto('/chess.html');
  await page.locator('#modeTrain').click();
  await expect(page.locator('#lessonMainlines .opening-row').first()).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#lessonTraps')).toContainText('Légal', { timeout: 5000 });
});

test('cliquer une leçon curée ouvre directement l\'Étude', async ({ page }) => {
  await page.goto('/chess.html');
  await page.locator('#modeTrain').click();
  await page.locator('#lessonTraps .opening-row', { hasText: 'Légal' }).first().click();
  await expect(page.locator('#studyPanel')).toBeVisible();
  await expect(page.locator('#studyName')).toContainText('Légal');
});
