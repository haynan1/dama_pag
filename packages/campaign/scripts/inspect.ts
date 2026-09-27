/**
 * Ferramenta de autoria: mostra a posição e as melhores linhas do motor.
 *   node scripts/inspect.ts "c3 e3" "d6 f6" [white|black] [depth]
 */
import { algebraic, analyzePosition, Position, Searcher } from '@dama/engine';
import { setupToFen } from '../src/setup.ts';

const [white = '', black = '', side = 'white', depthArg = '16'] = process.argv.slice(2);
const fen = setupToFen({ white, black, toMove: side === 'black' ? 'black' : 'white' });
const pos = Position.fromFen('brazilian', fen);
const g = pos.geo;
const rows: string[] = [];
for (let r = 7; r >= 0; r--) {
  let line = `${r + 1} `;
  for (let c = 0; c < 8; c++) {
    const sq = g.squareAt(r, c);
    if (sq < 0) line += ' .';
    else {
      const p = pos.board[sq]!;
      line += ` ${p === 1 ? 'w' : p === 2 ? 'W' : p === -1 ? 'b' : p === -2 ? 'B' : '_'}`;
    }
  }
  rows.push(line);
}
console.log(`${rows.join('\n')}\n   a b c d e f g h\n${fen}  (${side} joga)`);
const legal = pos.legalMoves();
console.log(
  `legais: ${legal.map((m) => m.path.map((s) => algebraic(g, s)).join(m.captures.length ? 'x' : '-')).join(' ')}`,
);
const a = analyzePosition(new Searcher(20), pos, {
  depth: Number(depthArg),
  multiPv: Math.min(4, legal.length),
});
for (const l of a.lines)
  console.log(`${String(l.score).padStart(6)}  ${l.pv.join(' ')}  — ${l.insight.headline}`);
