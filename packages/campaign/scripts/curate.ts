/**
 * Curadoria: roda cada tática minerada pelo juiz real da campanha e ordena por dificuldade.
 *   node scripts/curate.ts mine.json
 */
import { readFileSync } from 'node:fs';
import { Position, Searcher } from '@dama/engine';
import { setupToFen } from '../src/setup.ts';
import { solve } from '../src/solver.ts';

type Mined = {
  white: string;
  black: string;
  toMove: 'white' | 'black';
  theme: string;
  gap: number;
  pieces: number;
  solution: string;
  score: number;
};
const list = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as Mined[];
const s = new Searcher(20);
const out = [];
for (const m of list) {
  const fen = setupToFen(m);
  const pos = Position.fromFen('brazilian', fen);
  const t0 = performance.now();
  const r = solve(s, fen, { type: 'gain', pieces: 1 }, 6);
  const ms = Math.round(performance.now() - t0);
  if (!r.solved) continue;
  const legal = pos.legalMoves().length;
  out.push({ ...m, moves: r.moves, line: r.line.join(' '), legal, ms });
}
out.sort((a, b) => a.moves - b.moves || a.pieces - b.pieces);
console.log(JSON.stringify(out, null, 1));
