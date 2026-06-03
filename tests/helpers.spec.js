const { test, expect } = require('@playwright/test');

test('getTutorSettings renvoie les valeurs par défaut', async ({ page }) => {
  await page.goto('/chess.html');
  const s = await page.evaluate(() => window.__tutorTest.getTutorSettings());
  expect(s.apiKey).toBe('');
  expect(s.model).toBe('claude-haiku-4-5-20251001');
});

test('setTutorSetting persiste la clé et le modèle', async ({ page }) => {
  await page.goto('/chess.html');
  await page.evaluate(() => {
    window.__tutorTest.setTutorSetting('tutorApiKey', 'sk-test-123');
    window.__tutorTest.setTutorSetting('tutorModel', 'claude-sonnet-4-6');
  });
  const s = await page.evaluate(() => window.__tutorTest.getTutorSettings());
  expect(s.apiKey).toBe('sk-test-123');
  expect(s.model).toBe('claude-sonnet-4-6');
});

test('formatEval formate les centipions du point de vue des Blancs', async ({ page }) => {
  await page.goto('/chess.html');
  const r = await page.evaluate(() => ({
    plus:  window.__tutorTest.formatEval(70),
    moins: window.__tutorTest.formatEval(-130),
    zero:  window.__tutorTest.formatEval(0),
    matB:  window.__tutorTest.formatEval(999950),
    matN:  window.__tutorTest.formatEval(-999950)
  }));
  expect(r.plus).toBe('+0,7');
  expect(r.moins).toBe('−1,3'); // signe moins typographique U+2212
  expect(r.zero).toBe('0,0');
  expect(r.matB).toBe('#');
  expect(r.matN).toBe('−#');
});

test('evalToWords traduit en français', async ({ page }) => {
  await page.goto('/chess.html');
  const r = await page.evaluate(() => ({
    egal:    window.__tutorTest.evalToWords(10),
    legerB:  window.__tutorTest.evalToWords(60),
    legerN:  window.__tutorTest.evalToWords(-60),
    decisif: window.__tutorTest.evalToWords(400),
    matB:    window.__tutorTest.evalToWords(999950)
  }));
  expect(r.egal).toBe('position égale');
  expect(r.legerB).toContain('Blancs');
  expect(r.legerN).toContain('Noirs');
  expect(r.decisif).toContain('décisif');
  expect(r.matB).toContain('Mat');
});

test('pvToSan convertit une variante UCI en notation française', async ({ page }) => {
  await page.goto('/chess.html');
  const san = await page.evaluate(() =>
    window.__tutorTest.pvToSan(['e2e4', 'e7e5', 'g1f3'])
  );
  expect(san).toEqual(['e4', 'e5', 'Cf3']);
});

test('formatPvLine numérote les coups depuis la position initiale (Blancs au trait)', async ({ page }) => {
  await page.goto('/chess.html');
  const line = await page.evaluate(() =>
    window.__tutorTest.formatPvLine(['e4', 'e5', 'Cf3'])
  );
  expect(line).toBe('1.e4 e5 2.Cf3');
});

test('notation désambiguïse par la colonne (deux cavaliers vers d2 -> Cbd2)', async ({ page }) => {
  await page.goto('/chess.html');
  // Cavaliers blancs en b1 et f3, les deux peuvent aller en d2
  const san = await page.evaluate(() => {
    const s = window.__tutorTest.fromFEN('7k/8/8/8/8/5N2/8/1N5K w - - 0 1');
    return window.__tutorTest.pvToSan(['b1d2'], s);
  });
  expect(san).toEqual(['Cbd2']);
});

test('notation désambiguïse par la rangée quand la colonne ne suffit pas (Rooks a1/a3 vers a2)', async ({ page }) => {
  await page.goto('/chess.html');
  // Tours blanches en a1 et a3 (même colonne) vers a2 -> désambiguïsation par rangée: T1a2
  const san = await page.evaluate(() => {
    const s = window.__tutorTest.fromFEN('8/8/8/8/8/R7/8/R3K1k1 w - - 0 1');
    return window.__tutorTest.pvToSan(['a1a2'], s);
  });
  expect(san).toEqual(['T1a2']);
});
