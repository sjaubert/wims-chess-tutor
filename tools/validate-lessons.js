// Valide lessons.json : lignes légales (chess.js) + conformité de schéma.
// Usage CLI : node tools/validate-lessons.js
const { Chess } = require('chess.js');

const SIDES = ['w', 'b'];
const CATS = ['mainline', 'trap'];

// uci "e2e4"/"e7e8q" -> {from,to,promotion?}
function uciToMove(u) {
  return { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || undefined };
}

// Renvoie un tableau d'erreurs (vide = OK).
function validateLessons(lessons) {
  const errors = [];
  if (!Array.isArray(lessons)) return ['lessons.json doit être un tableau'];
  const ids = new Set();
  lessons.forEach((l, i) => {
    const tag = `leçon[${i}] (${l && l.id ? l.id : '??'})`;
    if (!l || typeof l !== 'object') { errors.push(`${tag} : pas un objet`); return; }
    for (const f of ['id', 'name', 'category', 'side', 'uci', 'comments', 'summary']) {
      if (l[f] == null) errors.push(`${tag} : champ obligatoire manquant « ${f} »`);
    }
    if (l.id != null) {
      if (ids.has(l.id)) errors.push(`${tag} : id en double`);
      ids.add(l.id);
    }
    if (l.category != null && !CATS.includes(l.category)) errors.push(`${tag} : category invalide`);
    if (l.side != null && !SIDES.includes(l.side)) errors.push(`${tag} : side invalide`);
    if (Array.isArray(l.uci) && Array.isArray(l.comments) && l.uci.length !== l.comments.length)
      errors.push(`${tag} : comments.length (${l.comments.length}) != uci.length (${l.uci.length})`);
    if (l.category === 'trap') {
      if (typeof l.trapPly !== 'number' || l.trapPly < 0 || (Array.isArray(l.uci) && l.trapPly >= l.uci.length))
        errors.push(`${tag} : trapPly invalide pour un piège`);
    }
    if (Array.isArray(l.uci)) {
      const c = new Chess();
      l.uci.forEach((u, k) => {
        try {
          const mv = c.move(uciToMove(u));
          if (!mv) errors.push(`${tag} : coup illégal à l'index ${k} (${u})`);
        } catch (e) {
          errors.push(`${tag} : coup illégal à l'index ${k} (${u})`);
        }
      });
    }
  });
  return errors;
}

module.exports = { validateLessons };

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const file = path.join(__dirname, '..', 'lessons.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const errs = validateLessons(data);
  if (errs.length) { console.error(`✗ ${errs.length} erreur(s) :\n` + errs.join('\n')); process.exit(1); }
  console.log(`✓ lessons.json valide : ${data.length} leçon(s).`);
}
