// Oracle des pièges : rejoue chaque ligne `trap` de lessons.json et vérifie
// la conclusion attendue (mat ou gain matériel net du camp `side`).
// Usage : node tools/verify-traps.mjs
import { Chess } from 'chess.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LESSONS = JSON.parse(readFileSync(join(__dirname, '..', 'lessons.json'), 'utf8'));

// Conclusion attendue par id de piège :
//   'mate'                  -> la position finale doit être échec et mat
//   { material: n }         -> `side` doit mener d'au moins n points (P1 C3 F3 T5 D9)
// Les pièges absents de EXPECT ne sont PAS vérifiés par l'oracle (legacy).
export const EXPECT = {
  'budapest-smothered': 'mate',
  'siberian-trap': 'mate',
  'owen-defense-trap': 'mate',
  'tennison-queen-trap': { material: 2 },
};

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// uci "e2e4"/"e7e8q" -> {from,to,promotion?}
function uciToMove(u) {
  return { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || undefined };
}

// bilan matériel du point de vue de `side` (positif = `side` mène)
function materialLead(chess, side) {
  let w = 0, b = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq) continue;
      if (sq.color === 'w') w += VAL[sq.type]; else b += VAL[sq.type];
    }
  }
  return side === 'w' ? w - b : b - w;
}

export function verifyTraps(lessons, expect = EXPECT) {
  const errors = [];
  for (const l of lessons) {
    if (l.category !== 'trap') continue;
    const exp = expect[l.id];
    if (exp == null) continue; // non couvert par l'oracle
    const c = new Chess();
    let illegal = false;
    l.uci.forEach((u, k) => {
      try { if (!c.move(uciToMove(u))) { errors.push(`${l.id}: coup illégal index ${k} (${u})`); illegal = true; } }
      catch { errors.push(`${l.id}: coup illégal index ${k} (${u})`); illegal = true; }
    });
    if (illegal) continue;
    if (exp === 'mate') {
      if (!c.isCheckmate()) errors.push(`${l.id}: la position finale n'est PAS échec et mat (attendu 'mate')`);
    } else if (exp && typeof exp.material === 'number') {
      const lead = materialLead(c, l.side);
      if (lead < exp.material) errors.push(`${l.id}: gain matériel ${lead} < attendu ${exp.material} (côté ${l.side})`);
    }
  }
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errs = verifyTraps(LESSONS);
  if (errs.length) { console.error(`✗ ${errs.length} erreur(s) :\n` + errs.join('\n')); process.exit(1); }
  const n = Object.keys(EXPECT).length;
  console.log(`✓ oracle des pièges : ${n} piège(s) vérifié(s).`);
}
