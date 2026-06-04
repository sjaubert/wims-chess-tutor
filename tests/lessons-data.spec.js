const { test, expect } = require('@playwright/test');
const { validateLessons } = require('../tools/validate-lessons.js');
const lessons = require('../lessons.json');

test('lessons.json respecte le schéma et ne contient que des coups légaux', () => {
  const errors = validateLessons(lessons);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('validateLessons détecte un coup illégal', () => {
  const bad = [{ id: 'x', name: 'X', category: 'mainline', side: 'w', uci: ['e2e5'], comments: [''], summary: 's' }];
  expect(validateLessons(bad).length).toBeGreaterThan(0);
});

test('validateLessons détecte un désalignement commentaires/coups', () => {
  const bad = [{ id: 'x', name: 'X', category: 'mainline', side: 'w', uci: ['e2e4', 'e7e5'], comments: ['un seul'], summary: 's' }];
  expect(validateLessons(bad).some(e => /comments/.test(e))).toBe(true);
});
