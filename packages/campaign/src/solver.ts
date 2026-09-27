import { Position, type Searcher } from '@dama/engine';
import { baseline, defend, type Goal, goalReached } from './goals.ts';

/** Profundidade do juiz e da defesa nas fases de exercício. */
export const PUZZLE_DEPTH = 10;

export interface Solution {
  readonly solved: boolean;
  /** Lances do jogador até cumprir o objetivo (ou até desistir). */
  readonly moves: number;
  /** Linha jogada, em notação algébrica. */
  readonly line: readonly string[];
}

/**
 * Resolve a fase com o motor dos dois lados: o jogador joga o melhor lance, o adversário a melhor
 * defesa. É a prova, em teste, de que toda fase publicada tem solução dentro do limite.
 */
export function solve(
  searcher: Searcher,
  fen: string,
  goal: Goal,
  maxMoves: number,
  depth = PUZZLE_DEPTH,
): Solution {
  const pos = Position.fromFen('brazilian', fen);
  const base = baseline(pos);
  const line: string[] = [];
  let moves = 0;
  while (moves < maxMoves) {
    const mine = defend(searcher, pos, depth);
    if (!mine) break;
    line.push(notation(pos, mine.move.path, mine.move.captures.length > 0));
    pos.make(mine.move);
    moves++;
    if (goalReached(goal, pos, base)) return { solved: true, moves, line };
    const reply = defend(searcher, pos, depth);
    if (!reply) return { solved: goal.type === 'win', moves, line };
    line.push(notation(pos, reply.move.path, reply.move.captures.length > 0));
    pos.make(reply.move);
    if (goalReached(goal, pos, base)) return { solved: true, moves, line };
    if (pos.drawReason(3)) break;
  }
  return { solved: false, moves, line };
}

function notation(pos: Position, path: readonly number[], capture: boolean): string {
  const files = 'abcdefgh';
  return path.map((s) => `${files[pos.geo.col[s]!]}${pos.geo.row[s]! + 1}`).join(capture ? 'x' : '-');
}
