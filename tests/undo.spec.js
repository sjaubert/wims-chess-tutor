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

test('naviguer dans l\'historique via les clics sur les coups ne supprime pas l\'historique', async ({ page }) => {
  await page.goto('/chess.html');
  const start = await occupied(page);
  await dragPiece(page, 52, 36); // 1) e2 -> e4 ; le bot répond (ply 1, 2)
  await expect(page.locator('#undoMove')).toBeEnabled({ timeout: 5000 });
  const afterMove1 = await occupied(page);
  await dragPiece(page, 51, 35); // 2) d2 -> d4 ; le bot répond (ply 3, 4)
  await expect(page.locator('#undoMove')).toBeEnabled({ timeout: 5000 });
  const afterMove2 = await occupied(page);
  
  const moves = page.locator('.history-move');
  await expect(moves.nth(0)).toBeVisible(); // 1. e4
  
  // Cliquer sur le 1er coup blanc (e4) -> visualisation du ply 1
  await moves.nth(0).click();
  
  // L'historique n'est pas tronqué (les 4 coups sont toujours là)
  await expect(moves).toHaveCount(4);
  
  // Le bouton "Retour au Direct" doit être actif
  await expect(page.locator('#liveMove')).toBeEnabled();
  
  // Retour au direct
  await page.locator('#liveMove').click();
  expect(await occupied(page)).toEqual(afterMove2);
  await expect(page.locator('#liveMove')).toBeDisabled();
});

test('naviguer avec les boutons de navigation Précédent/Suivant/Direct', async ({ page }) => {
  await page.goto('/chess.html');
  const start = await occupied(page);
  await dragPiece(page, 52, 36); // 1) e2 -> e4 ; le bot répond
  await expect(page.locator('#undoMove')).toBeEnabled({ timeout: 5000 });
  const afterMove1 = await occupied(page);
  
  // Au direct, Suivant et Direct sont désactivés, Précédent est activé
  await expect(page.locator('#prevMove')).toBeEnabled();
  await expect(page.locator('#nextMove')).toBeDisabled();
  await expect(page.locator('#liveMove')).toBeDisabled();
  
  // Reculer d'un coup (on revient avant le coup du Bot, donc après e2-e4 seul)
  await page.locator('#prevMove').click();
  await expect(page.locator('#nextMove')).toBeEnabled();
  await expect(page.locator('#liveMove')).toBeEnabled();
  
  // Reculer encore d'un coup -> position de départ
  await page.locator('#prevMove').click();
  expect(await occupied(page)).toEqual(start);
  await expect(page.locator('#prevMove')).toBeDisabled(); // impossible de reculer plus
  
  // Avancer de deux coups -> revient à afterMove1
  await page.locator('#nextMove').click();
  await page.locator('#nextMove').click();
  expect(await occupied(page)).toEqual(afterMove1);
  await expect(page.locator('#nextMove')).toBeDisabled();
});
