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

test('loadOpenings charge le catalogue et la recherche filtre', async ({ page }) => {
  await page.goto('/chess.html');
  const n = await page.evaluate(async () => (await window.__trainTest.loadOpenings()).length);
  expect(n).toBeGreaterThan(1000);

  const found = await page.evaluate(() =>
    window.__trainTest.searchOpenings('ruy lopez').some(o => o.name === 'Ruy Lopez')
  );
  expect(found).toBe(true);

  const feat = await page.evaluate(() => window.__trainTest.featuredOpenings().map(o => o.name));
  expect(feat).toContain('Ruy Lopez');
  expect(feat.length).toBeGreaterThan(5);
});

test('le sélecteur affiche les classiques puis filtre, et propose le choix du camp', async ({ page }) => {
  await page.goto('/chess.html');
  await page.locator('#modeTrain').click();
  await expect(page.locator('#openingResults .opening-row').first()).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#openingResults')).toContainText('Ruy Lopez');
  await page.locator('#openingSearch').fill('sicilian');
  await expect(page.locator('#openingResults')).toContainText('Sicilian', { timeout: 5000 });
  await page.locator('#openingResults .opening-row', { hasText: 'Sicilian' }).first().click();
  await expect(page.locator('.opening-sidechoice')).toBeVisible();
});

async function dragPiece(page, fromIndex, toIndex){
  const f=await page.locator(`.square[data-i="${fromIndex}"]`).boundingBox();
  const t=await page.locator(`.square[data-i="${toIndex}"]`).boundingBox();
  await page.mouse.move(f.x+f.width/2,f.y+f.height/2);
  await page.mouse.down();
  await page.mouse.move(t.x+t.width/2,t.y+t.height/2,{steps:6});
  await page.mouse.up();
}
const TEST_LINE = {eco:'C50', name:'Test Italienne', uci:['e2e4','e7e5','g1f3','b8c6','f1c4']};

test('drill Blancs : coup juste avance, coup faux est refusé', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate(async (op) => { await window.__trainTest.loadOpenings(); window.__trainTest.startDrill(op, 'w'); }, TEST_LINE);
  await dragPiece(page, 48, 40); // a2 -> a3 (FAUX)
  await page.waitForTimeout(200);
  expect(await page.evaluate(()=>window.__trainTest.getDrill().plyIndex)).toBe(0);
  await expect(page.locator('#drillFeedback')).toContainText('ligne');
  await dragPiece(page, 52, 36); // e2 -> e4 (JUSTE) ; l'app répond e7-e5
  await page.waitForTimeout(500);
  expect(await page.evaluate(()=>window.__trainTest.getDrill().plyIndex)).toBe(2);
});

test('drill Noirs : l\'app joue d\'abord le coup blanc', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate(async (op) => { await window.__trainTest.loadOpenings(); window.__trainTest.startDrill(op, 'b'); }, TEST_LINE);
  await page.waitForTimeout(500);
  expect(await page.evaluate(()=>window.__trainTest.getDrill().plyIndex)).toBe(1);
});

test('Indice surligne la pièce à jouer', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate(async (op) => { await window.__trainTest.loadOpenings(); window.__trainTest.startDrill(op, 'w'); }, TEST_LINE);
  await page.locator('#drillHintBtn').click();
  await expect(page.locator('.square[data-i="52"]')).toHaveClass(/hint-from/);
});

test('fin de ligne : message de réussite + Continuer en partie libre', async ({ page }) => {
  await page.goto('/chess.html');
  const shortLine = {eco:'C20', name:'Test court', uci:['e2e4','e7e5']};
  await page.evaluate(async (op) => { await window.__trainTest.loadOpenings(); window.__trainTest.startDrill(op, 'w'); }, shortLine);
  await dragPiece(page, 52, 36); // e2 -> e4 ; l'app répond e7-e5 -> fin
  await expect(page.locator('#drillFeedback')).toContainText('terminée', { timeout: 4000 });
  await expect(page.locator('#drillToFree')).toBeVisible();
  await page.locator('#drillToFree').click();
  expect(await page.evaluate(()=>window.__trainTest.getMode())).toBe('play');
});

test('buildOpeningPrompt mentionne le nom et les coups', async ({ page }) => {
  await page.goto('/chess.html');
  const prompt = await page.evaluate((op) =>
    window.__trainTest.buildOpeningPrompt(op), TEST_LINE);
  expect(prompt).toContain('Test Italienne');
  expect(prompt).toContain('1.e4');
});

test('Explique cette ouverture appelle Claude et affiche la réponse', async ({ page }) => {
  await page.route('https://api.anthropic.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ content: [{ type:'text', text:'L\'Italienne vise un développement rapide.' }] })
  }));
  await page.goto('/chess.html');
  await page.evaluate(() => { localStorage.setItem('tutorApiKey','sk-ant-test'); });
  await page.reload();
  await page.evaluate(async (op) => { await window.__trainTest.loadOpenings(); window.__trainTest.startDrill(op, 'w'); }, TEST_LINE);
  await page.locator('#drillExplainBtn').click();
  await expect(page.locator('#drillExplain')).toContainText('Italienne', { timeout: 5000 });
});

test('parcours réel : choisir Ruy Lopez via l\'UI, jouer les Blancs, 1er coup juste', async ({ page }) => {
  await page.goto('/chess.html');
  await page.locator('#modeTrain').click();
  const row = page.locator('#openingResults .opening-row', { hasText: 'Ruy Lopez' }).first();
  await expect(row).toBeVisible({ timeout: 5000 });
  await row.click();
  await page.locator('.opening-sidechoice button', { hasText: 'Blancs' }).click();
  await expect(page.locator('#drillName')).toHaveText('Ruy Lopez');
  await dragPiece(page, 52, 36); // e2 -> e4 (1er coup de la Ruy Lopez)
  await expect(page.locator('#drillFeedback')).toContainText('Bien joué', { timeout: 4000 });
});
