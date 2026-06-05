// Extrait les lignes principales siciliennes depuis l'explorateur lichess masters,
// en partant de la ligne nommée dans openings.json. Produit tools/sicilian-draft.json
// (sans commentaires). Usage : node tools/build-sicilian-lessons.mjs
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { pathToFileURL } from 'url';

export const TARGETS = [
  { id: 'sicilian-najdorf', side: 'b', anchorName: 'Sicilian Defense: Najdorf Variation' },
  { id: 'sicilian-dragon', side: 'b', anchorName: 'Sicilian Defense: Dragon Variation' },
  { id: 'sicilian-classical', side: 'b', anchorName: 'Sicilian Defense: Classical Variation' },
  { id: 'sicilian-sveshnikov', side: 'b', anchorName: 'Sicilian Defense: Lasker-Pelikan Variation, Sveshnikov Variation' },
];

const MAX_PLIES = 16;
const DELAY_MS = 300;

// Choisit l'entrée homonyme dont la séquence est la plus longue sans dépasser maxPlies.
export function pickAnchor(openings, anchorName, maxPlies) {
  const cands = openings.filter(o => o.name === anchorName);
  if (!cands.length) throw new Error('Ancre introuvable : ' + anchorName);
  const ok = cands.filter(o => o.uci.length <= maxPlies);
  const pool = ok.length ? ok : cands;
  return pool.reduce((a, b) => (b.uci.length > a.uci.length ? b : a));
}

// Prolonge uci en suivant moves[0] fourni par fetchPlay(uciArray) -> { moves:[{uci}] }.
export async function extendLine(uci, maxPlies, fetchPlay) {
  let line = uci.slice();
  while (line.length < maxPlies) {
    const data = await fetchPlay(line);
    if (!data || !Array.isArray(data.moves) || data.moves.length === 0) break;
    line = [...line, data.moves[0].uci];
  }
  return line;
}

// fetchPlay réel : cache disque puis API masters, avec délai de politesse.
// fetchPlay réel : cache disque puis API masters, avec délai de politesse.
function makeRealFetchPlay(cacheDir) {
  return async (uci) => {
    const key = uci.join('_') || 'start';
    const file = new URL(`${key}.json`, cacheDir);
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));

    const url = `https://explorer.lichess.org/masters?play=${uci.join(',')}`;

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.LICHESS_TOKEN}`
      }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);

    const data = await res.json();
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(file, JSON.stringify(data));
    await new Promise(r => setTimeout(r, DELAY_MS));
    return data;
  };
}
async function main() {
  const openings = JSON.parse(readFileSync(new URL('../openings.json', import.meta.url), 'utf8'));
  const cacheDir = new URL('./sicilian-src/', import.meta.url);
  const fetchPlay = makeRealFetchPlay(cacheDir);
  const out = [];
  for (const t of TARGETS) {
    const anchor = pickAnchor(openings, t.anchorName, MAX_PLIES);
    const uci = await extendLine(anchor.uci.slice(), MAX_PLIES, fetchPlay);
    out.push({ id: t.id, name: t.anchorName, eco: anchor.eco, side: t.side, uci, depthReached: uci.length });
    console.log(`${t.id} : ${uci.length} plis — ${uci.join(' ')}`);
  }
  writeFileSync(new URL('./sicilian-draft.json', import.meta.url), JSON.stringify(out, null, 1));
  console.log(`sicilian-draft.json écrit : ${out.length} leçons.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e); process.exit(1); });
}