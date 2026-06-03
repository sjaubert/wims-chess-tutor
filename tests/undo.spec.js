const { test, expect } = require('@playwright/test');

async function dragPiece(page, fromIndex, toIndex){
  const f=await page.locator(`.square[data-i="${fromIndex}"]`).boundingBox();
  const t=await page.locator(`.square[data-i="${toIndex}"]`).boundingBox();
  await page.mouse.move(f.x+f.width/2,f.y+f.height/2);
  await page.mouse.down();
  await page.mouse.move(t.x+t.width/2,t.y+t.height/2,{steps:6});
  await page.mouse.up();
}
async function occupied(page){
  return page.$$eval('.square .piece', els => els.map(e=>+e.closest('.square').dataset.i).sort((a,b)=>a-b));
}

test('annuler un coup ramène à la position de départ et désactive le bouton', async ({ page }) => {
  await page.goto('/chess.html');
  const start = await occupied(page);
  await expect(page.locator('#undoMove')).toBeDisabled(); // rien à annuler au départ
  await dragPiece(page, 52, 36);                           // e2 -> e4 ; le bot répond
  await expect(page.locator('#undoMove')).toBeEnabled({ timeout: 5000 }); // bot a répondu, votre trait
  await page.locator('#undoMove').click();
  expect(await occupied(page)).toEqual(start);             // retour au départ
  await expect(page.locator('#undoMove')).toBeDisabled();  // plus rien à annuler
});

test('annuler restaure exactement la position intermédiaire (et deux fois -> départ)', async ({ page }) => {
  await page.goto('/chess.html');
  const start = await occupied(page);
  await dragPiece(page, 52, 36); // 1) e2-e4
  await expect(page.locator('#undoMove')).toBeEnabled({ timeout: 5000 });
  const afterMove1 = await occupied(page); // votre trait après coup 1 + réponse bot
  await dragPiece(page, 51, 35); // 2) d2-d4
  await expect(page.locator('#undoMove')).toBeEnabled({ timeout: 5000 });
  await page.locator('#undoMove').click(); // annule le coup 2 -> revient à afterMove1
  expect(await occupied(page)).toEqual(afterMove1);
  await page.locator('#undoMove').click(); // annule le coup 1 -> départ
  expect(await occupied(page)).toEqual(start);
  await expect(page.locator('#undoMove')).toBeDisabled();
});

test('Annuler est désactivé pendant la réflexion du bot puis réactivé', async ({ page }) => {
  await page.goto('/chess.html');
  await dragPiece(page, 52, 36);                          // votre coup -> trait au bot
  await expect(page.locator('#undoMove')).toBeDisabled(); // bot réfléchit / trait au bot
  await expect(page.locator('#undoMove')).toBeEnabled({ timeout: 5000 }); // bot a répondu
});

test('Annuler est désactivé après la fin de partie (abandon)', async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/chess.html');
  await dragPiece(page, 52, 36);
  await expect(page.locator('#undoMove')).toBeEnabled({ timeout: 5000 });
  await page.locator('#resign').click();                  // partie terminée
  await expect(page.locator('#undoMove')).toBeDisabled();
});
