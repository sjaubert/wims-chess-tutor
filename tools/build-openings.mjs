// Génère openings.json à partir des TSV lichess chess-openings (CC0).
// Usage : node tools/build-openings.mjs
import { Chess } from 'chess.js';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';

const FILES = ['a','b','c','d','e'];
const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master';
const SRC_DIR = new URL('./openings-src/', import.meta.url);

async function getTsv(letter){
  const local = new URL(`${letter}.tsv`, SRC_DIR);
  if(existsSync(local)) return readFileSync(local,'utf8');
  const res = await fetch(`${BASE}/${letter}.tsv`);
  if(!res.ok) throw new Error(`HTTP ${res.status} pour ${letter}.tsv`);
  const text = await res.text();
  mkdirSync(SRC_DIR, {recursive:true});
  writeFileSync(new URL(`${letter}.tsv`, SRC_DIR), text);
  return text;
}

function pgnToUci(pgn){
  const c = new Chess();
  c.loadPgn(pgn);                       // lève une exception si invalide
  return c.history({verbose:true}).map(m => m.from + m.to + (m.promotion||''));
}

const out = [];
let skipped = 0;
for(const letter of FILES){
  const tsv = await getTsv(letter);
  const lines = tsv.split('\n').slice(1).filter(Boolean); // enlève l'entête
  for(const line of lines){
    const [eco, name, pgn] = line.split('\t');
    if(!eco || !name || !pgn) continue;
    try {
      const uci = pgnToUci(pgn.trim());
      if(uci.length) out.push({ eco, name, uci });
    } catch(e){ skipped++; }
  }
}
out.sort((a,b)=> a.name.localeCompare(b.name));
writeFileSync(new URL('../openings.json', import.meta.url), JSON.stringify(out));
console.log(`openings.json écrit : ${out.length} ouvertures, ${skipped} ignorées.`);
