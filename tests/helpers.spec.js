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
