const { test, expect } = require('@playwright/test');

async function setKey(page){
  await page.goto('/chess.html');
  await page.evaluate(() => {
    localStorage.setItem('tutorApiKey','sk-ant-test');
    localStorage.setItem('tutorModel','claude-haiku-4-5-20251001');
  });
  await page.reload();
  await page.locator('#tutorToggle').click();
}

test('buildLLMPrompt ancre le prompt sur l\'analyse du moteur', async ({ page }) => {
  await page.goto('/chess.html');
  const prompt = await page.evaluate(() =>
    window.__tutorTest.buildLLMPrompt({ evalCp: 70, pv: ['e2e4','e7e5'], isBook: true })
  );
  expect(prompt).toContain('+0,7');
  expect(prompt).toContain('1.e4 e5');
  expect(prompt).toContain('théorique');
});

test('Avis de l\'IA : appelle l\'API Claude et affiche la réponse', async ({ page }) => {
  let captured=null;
  await page.route('https://api.anthropic.com/**', async route => {
    captured = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: [{ type:'text', text:'Bonne ouverture classique, développez vos pièces.' }] })
    });
  });
  await setKey(page);
  await page.locator('#tutorAskBtn').click();
  await expect(page.locator('#tutorLLM')).toContainText('Bonne ouverture', { timeout: 5000 });
  // Le corps envoyé contient bien l'ancrage moteur
  expect(JSON.stringify(captured)).toContain('Meilleure ligne');
});

test('Avis de l\'IA : erreur API affichée proprement', async ({ page }) => {
  await page.route('https://api.anthropic.com/**', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: { message: 'invalid x-api-key' } })
  }));
  await setKey(page);
  await page.locator('#tutorAskBtn').click();
  await expect(page.locator('#tutorLLM.error')).toContainText('invalid x-api-key', { timeout: 5000 });
});
