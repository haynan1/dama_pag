import type { Move, Position } from './position.ts';
import { isMateScore, type Searcher } from './search.ts';

export interface AiLevel {
  readonly level: number;
  readonly name: string;
  readonly depth: number;
  readonly timeMs: number;
  /** Margem (centésimos) dentro da qual lances piores podem ser escolhidos. 0 = sempre o melhor. */
  readonly noise: number;
  /** Rating Elo estimado, usado para calcular o seu rating contra a IA. */
  readonly rating: number;
}

export const AI_LEVELS: readonly AiLevel[] = [
  { level: 1, name: 'Aprendiz', depth: 1, timeMs: 200, noise: 220, rating: 600 },
  { level: 2, name: 'Iniciante', depth: 2, timeMs: 250, noise: 150, rating: 800 },
  { level: 3, name: 'Casual', depth: 3, timeMs: 300, noise: 100, rating: 1000 },
  { level: 4, name: 'Clube', depth: 4, timeMs: 400, noise: 60, rating: 1200 },
  { level: 5, name: 'Competidor', depth: 6, timeMs: 500, noise: 35, rating: 1400 },
  { level: 6, name: 'Regional', depth: 8, timeMs: 700, noise: 18, rating: 1600 },
  { level: 7, name: 'Nacional', depth: 12, timeMs: 1000, noise: 0, rating: 1800 },
  { level: 8, name: 'Mestre', depth: 18, timeMs: 1800, noise: 0, rating: 2000 },
  { level: 9, name: 'Grande Mestre', depth: 28, timeMs: 3000, noise: 0, rating: 2200 },
  { level: 10, name: 'Implacável', depth: 64, timeMs: 5000, noise: 0, rating: 2400 },
];

export function aiLevel(level: number): AiLevel {
  const clamped = Math.max(1, Math.min(AI_LEVELS.length, Math.round(level)));
  return AI_LEVELS[clamped - 1]!;
}

export interface AiDecision {
  readonly move: Move;
  readonly score: number;
  readonly depth: number;
  readonly nodes: number;
  readonly timeMs: number;
}

/**
 * Escolhe o lance da IA. Nos níveis baixos, sorteia entre lances "quase tão bons" com peso
 * decrescente — erra como humano (posicionalmente), não entrega peças absurdamente.
 */
export function chooseMove(
  searcher: Searcher,
  pos: Position,
  level: number,
  random: () => number = Math.random,
): AiDecision | null {
  const cfg = aiLevel(level);
  const legal = pos.legalMoves();
  if (legal.length === 0) return null;
  const multiPv = cfg.noise > 0 ? Math.min(legal.length, 8) : 1;
  const result = searcher.search(pos, { depth: cfg.depth, timeMs: cfg.timeMs, multiPv });
  const lines = result.lines;
  const best = lines[0]!;
  let chosen = best;
  if (cfg.noise > 0 && lines.length > 1 && !isMateScore(best.score)) {
    const candidates = lines.filter((l) => best.score - l.score <= cfg.noise && !isMateScore(l.score));
    const weights = candidates.map((l) => Math.exp(-(best.score - l.score) / (cfg.noise / 2.5)));
    const total = weights.reduce((a, b) => a + b, 0);
    let pick = random() * total;
    for (let i = 0; i < candidates.length; i++) {
      pick -= weights[i]!;
      if (pick <= 0) {
        chosen = candidates[i]!;
        break;
      }
    }
  }
  return {
    move: chosen.move,
    score: chosen.score,
    depth: result.depth,
    nodes: result.nodes,
    timeMs: result.timeMs,
  };
}
