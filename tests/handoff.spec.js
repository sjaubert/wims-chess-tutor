const { test, expect } = require('@playwright/test');

const LESSON = { id:'t-it', name:'Test Italienne', category:'mainline', eco:'C50', side:'w',
  uci:['e2e4','e7e5','g1f3','b8c6','f1c4'], comments:['','','','',''], summary:'s' };

test('depuis l\'Étude, « Jouer à partir d\'ici » passe en partie libre à la position courante', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate((l)=>window.__trainTest.startStudy(l), LESSON);
  await page.evaluate(()=>{ window.__trainTest.studyStep(1); window.__trainTest.studyStep(1); }); // 1.e4 e5
  await page.evaluate(()=>window.__trainTest.playFromHere());
  expect(await page.evaluate(()=>window.__trainTest.getMode())).toBe('play');
  await expect(page.locator('#trainPane')).toBeHidden();
  expect(await page.locator('.square[data-i="36"] .piece').count()).toBe(1);
  expect(await page.locator('.square[data-i="52"] .piece').count()).toBe(0);
});

test('depuis la Restitution, « Jouer à partir d\'ici » bascule en partie', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate((l)=>window.__trainTest.startDrill(l,'w'), LESSON);
  await page.locator('#drillToPlay').click();
  expect(await page.evaluate(()=>window.__trainTest.getMode())).toBe('play');
  await expect(page.locator('.score-pane')).toBeVisible();
});
