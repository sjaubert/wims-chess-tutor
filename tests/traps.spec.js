const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const LESSONS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'lessons.json'), 'utf8'));
const TRAPS = LESSONS.filter((l) => l.category === 'trap');

// 11 pièges historiques + 6 ajoutés (vérifiés par tools/verify-traps.mjs).
test('le catalogue compte au moins 17 pièges', () => {
  expect(TRAPS.length).toBeGreaterThanOrEqual(17);
});

test('chaque piège a un trapPly dans les bornes, des commentaires alignés et une réfutation', () => {
  for (const l of TRAPS) {
    expect(typeof l.trapPly, `${l.id}: trapPly numérique`).toBe('number');
    expect(l.trapPly, `${l.id}: trapPly >= 0`).toBeGreaterThanOrEqual(0);
    expect(l.trapPly, `${l.id}: trapPly < uci.length`).toBeLessThan(l.uci.length);
    expect((l.refutation || '').length, `${l.id}: refutation non vide`).toBeGreaterThan(0);
    expect(l.comments.length, `${l.id}: commentaires alignés sur les coups`).toBe(l.uci.length);
  }
});

test('les nouveaux pièges sont chargeables par le picker', async ({ page }) => {
  await page.goto('/chess.html');
  const ids = await page.evaluate(async () => {
    const all = await window.__trainTest.loadLessons();
    return all.map((l) => l.id);
  });
  for (const id of [
    'budapest-smothered',
    'siberian-trap',
    'owen-defense-trap',
    'tennison-queen-trap',
    'reti-tartakower-trap',
    'petroff-fork-trap',
  ]) {
    expect(ids, `le picker connaît ${id}`).toContain(id);
  }
});
