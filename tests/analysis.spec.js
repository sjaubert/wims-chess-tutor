const { test, expect } = require('@playwright/test');

test('requestAnalysis renvoie une évaluation et une variante', async ({ page }) => {
  await page.goto('/chess.html');
  // Déclenche une analyse de la position initiale et attend le résultat
  const result = await page.evaluate(() => new Promise(resolve => {
    window.__tutorTest.onAnalysisForTest = resolve; // hook de test
    window.__tutorTest.requestAnalysis(true);       // force, même tuteur éteint
  }));
  expect(typeof result.evalCp).toBe('number');
  expect(Array.isArray(result.pv)).toBe(true);
  expect(result.pv.length).toBeGreaterThan(0);
  // Position initiale : présente dans la table d'ouvertures interne -> théorique
  expect(result.isBook).toBe(true);
  // Chaque coup de la PV est en notation UCI (ex. "e2e4")
  expect(result.pv[0]).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
});
