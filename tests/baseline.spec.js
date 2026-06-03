const { test, expect } = require('@playwright/test');

// Le plateau utilise le glisser-déposer (pointerdown -> move -> pointerup).
async function dragPiece(page, fromIndex, toIndex) {
  const from = await page.locator(`.square[data-i="${fromIndex}"]`).boundingBox();
  const to = await page.locator(`.square[data-i="${toIndex}"]`).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
  await page.mouse.up();
}

test('le plateau affiche 64 cases et le statut initial', async ({ page }) => {
  await page.goto('/chess.html');
  await expect(page.locator('#board .square')).toHaveCount(64);
  await expect(page.locator('#status')).toContainText('Your move');
});

test('un coup humain (e2-e4) est jouable', async ({ page }) => {
  await page.goto('/chess.html');
  await dragPiece(page, 52, 36); // e2 -> e4
  // La pièce a quitté e2 et occupe e4
  await expect(page.locator('.square[data-i="36"] .piece')).toHaveCount(1);
  await expect(page.locator('.square[data-i="52"] .piece')).toHaveCount(0);
});
