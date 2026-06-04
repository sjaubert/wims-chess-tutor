const { test, expect } = require('@playwright/test');

test('loadLessons charge la bibliothèque curée et expose 2 catégories', async ({ page }) => {
  await page.goto('/chess.html');
  const data = await page.evaluate(async () => await window.__trainTest.loadLessons());
  expect(Array.isArray(data)).toBe(true);
  expect(data.length).toBeGreaterThan(1);
  const cats = await page.evaluate(() => window.__trainTest.featuredLessons().map(g => g.category));
  expect(cats).toContain('mainline');
  expect(cats).toContain('trap');
});

test('searchLessons filtre par nom', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate(async () => await window.__trainTest.loadLessons());
  const hit = await page.evaluate(() => window.__trainTest.searchLessons('légal').length);
  expect(hit).toBeGreaterThan(0);
});

const LESSON = { id:'t-leg', name:'Test Légal', category:'trap', eco:'C41', side:'w', trapPly:2,
  uci:['e2e4','e7e5','g1f3'], comments:['idée 1','idée 2','idée 3'], summary:'s' };

async function dragPiece(page, fromIndex, toIndex){
  const f=await page.locator(`.square[data-i="${fromIndex}"]`).boundingBox();
  const t=await page.locator(`.square[data-i="${toIndex}"]`).boundingBox();
  await page.mouse.move(f.x+f.width/2,f.y+f.height/2);
  await page.mouse.down();
  await page.mouse.move(t.x+t.width/2,t.y+t.height/2,{steps:6});
  await page.mouse.up();
}

test('un coup faux incrémente le compteur d\'essais', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate((l)=>window.__trainTest.startDrill(l,'w'), LESSON);
  await dragPiece(page, 48, 40); // a2-a3 (FAUX)
  await page.waitForTimeout(150);
  expect(await page.evaluate(()=>window.__trainTest.getDrill().wrongTries)).toBe(1);
  expect(await page.evaluate(()=>window.__trainTest.getDrill().plyIndex)).toBe(0);
});

module.exports = { LESSON, dragPiece };

test('indices progressifs : mot -> pièce -> case -> coup joué', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate((l)=>window.__trainTest.startDrill(l,'w'), LESSON);
  // Niveau 1 : idée en mots
  await page.locator('#drillHintBtn').click();
  await expect(page.locator('#drillHintText')).toContainText('idée 1');
  expect(await page.evaluate(()=>window.__trainTest.getDrill().hintLevel)).toBe(1);
  // Niveau 2 : surligne la pièce (e2 = index 52)
  await page.locator('#drillHintBtn').click();
  await expect(page.locator('.square[data-i="52"]')).toHaveClass(/hint-from/);
  // Niveau 3 : surligne la case d'arrivée (e4 = index 36)
  await page.locator('#drillHintBtn').click();
  await expect(page.locator('.square[data-i="36"]')).toHaveClass(/hint-to/);
  // Niveau 4 : joue le coup -> plyIndex avance (e4 puis réponse e5)
  await page.locator('#drillHintBtn').click();
  await page.waitForTimeout(500);
  expect(await page.evaluate(()=>window.__trainTest.getDrill().plyIndex)).toBeGreaterThanOrEqual(2);
});
