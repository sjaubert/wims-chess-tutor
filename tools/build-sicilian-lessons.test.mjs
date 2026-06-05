import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickAnchor, extendLine, TARGETS } from './build-sicilian-lessons.mjs';

test('TARGETS couvre les 4 variantes, toutes côté Noir', () => {
  assert.equal(TARGETS.length, 4);
  assert.deepEqual(TARGETS.map(t => t.id).sort(),
    ['sicilian-classical','sicilian-dragon','sicilian-najdorf','sicilian-sveshnikov']);
  assert.ok(TARGETS.every(t => t.side === 'b'));
});

test('pickAnchor prend la séquence la plus longue ≤ maxPlies parmi les homonymes', () => {
  const openings = [
    { name: 'X', eco: 'B1', uci: ['e2e4','c7c5'] },
    { name: 'X', eco: 'B2', uci: ['e2e4','c7c5','g1f3','d7d6'] },
    { name: 'Y', eco: 'C1', uci: ['d2d4'] },
  ];
  const a = pickAnchor(openings, 'X', 16);
  assert.equal(a.uci.length, 4);
  assert.equal(a.eco, 'B2');
});

test('pickAnchor ignore les ancres plus longues que maxPlies', () => {
  const openings = [
    { name: 'X', eco: 'B1', uci: ['e2e4','c7c5'] },
    { name: 'X', eco: 'B2', uci: ['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4'] },
  ];
  const a = pickAnchor(openings, 'X', 4);
  assert.equal(a.uci.length, 2);
});

test('pickAnchor lève une erreur si le nom est introuvable', () => {
  assert.throws(() => pickAnchor([], 'Absent', 16), /introuvable/);
});

test('extendLine suit moves[0] jusqu’à maxPlies', async () => {
  const fakeFetch = async (uci) => ({ moves: [{ uci: 'm' + uci.length }] });
  const out = await extendLine(['a','b'], 5, fakeFetch);
  assert.deepEqual(out, ['a','b','m2','m3','m4']);
});

test('extendLine s’arrête si plus de coups maîtres', async () => {
  const fakeFetch = async (uci) => (uci.length < 3 ? { moves: [{ uci: 'x' }] } : { moves: [] });
  const out = await extendLine(['a','b'], 16, fakeFetch);
  assert.deepEqual(out, ['a','b','x']);
});
