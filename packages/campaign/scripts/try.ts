/** node scripts/try.ts "<white>" "<black>" side goal(gain:N|promote|win) maxMoves */
import { Position, Searcher } from '@dama/engine';
import type { Goal } from '../src/goals.ts';
import { setupToFen } from '../src/setup.ts';
import { solve } from '../src/solver.ts';

const [w = '', b = '', side = 'white', g = 'gain:1', max = '6'] = process.argv.slice(2);
const goal: Goal =
  g === 'promote'
    ? { type: 'promote' }
    : g === 'win'
      ? { type: 'win' }
      : { type: 'gain', pieces: Number(g.split(':')[1]) };
const fen = setupToFen({ white: w, black: b, toMove: side as 'white' });
const pos = Position.fromFen('brazilian', fen);
const r = solve(new Searcher(20), fen, goal, Number(max));
console.log(
  `${r.solved ? 'OK ' : 'NÃO'} ${r.moves} lances | legais ${pos.legalMoves().length} | ${r.line.join(' ')}`,
);
