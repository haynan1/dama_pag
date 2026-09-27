import { type Color, isMateScore, type Line, moveKey, type Position, type Searcher } from '@dama/engine';

/**
 * Objetivo de uma fase de exercício. Tudo é medido no tabuleiro — nunca comparado com uma
 * "resposta decorada" — então qualquer lance tão bom quanto o do motor é aceito.
 */
export type Goal =
  /** Ganhar `pieces` peças de saldo, medido numa posição quieta (sem captura pendente). */
  | { readonly type: 'gain'; readonly pieces: number }
  /** Coroar uma pedra. */
  | { readonly type: 'promote' }
  /** Vencer: o adversário fica sem lances (sem peças ou bloqueado). */
  | { readonly type: 'win' };

/** Retrato do início da fase, para medir progresso. */
export interface Baseline {
  readonly player: Color;
  readonly balance: number;
  readonly kings: number;
}

function pieces(pos: Position, color: Color): number {
  return color === 1 ? pos.counts[0]! + pos.counts[1]! : pos.counts[2]! + pos.counts[3]!;
}

function kings(pos: Position, color: Color): number {
  return color === 1 ? pos.counts[1]! : pos.counts[3]!;
}

export function baseline(pos: Position): Baseline {
  const player = pos.side;
  return {
    player,
    balance: pieces(pos, player) - pieces(pos, -player as Color),
    kings: kings(pos, player),
  };
}

/** O objetivo já foi cumprido nesta posição? */
export function goalReached(goal: Goal, pos: Position, base: Baseline): boolean {
  const me = base.player;
  const them = -me as Color;
  switch (goal.type) {
    case 'win':
      return pieces(pos, them) === 0 || (pos.side === them && pos.legalMoves().length === 0);
    case 'promote':
      return kings(pos, me) > base.kings;
    case 'gain': {
      if (pieces(pos, them) === 0) return true;
      // No meio de uma troca o saldo engana: só conta quando ninguém tem captura pendente.
      if (pos.hasCapture(pos.side)) return false;
      return pieces(pos, me) - pieces(pos, them) - base.balance >= goal.pieces;
    }
  }
}

/** Margem (centésimos de pedra) dentro da qual um lance vale tanto quanto o melhor. */
export const TOLERANCE = 40;

export interface Verdict {
  readonly accepted: boolean;
  /** Melhor linha do motor na posição antes do lance. */
  readonly best: Line;
  /** Pontuação do lance jogado, do ponto de vista de quem jogou. */
  readonly playedScore: number;
  /** Melhor resposta do adversário ao lance jogado (a refutação, quando o lance é recusado). */
  readonly reply: Line | null;
}

/**
 * Julga um lance do jogador. Aceito se cumpre o objetivo na hora, se vale tanto quanto o melhor
 * (dentro de `TOLERANCE`) ou se, numa posição de vitória forçada, continua vencendo à força.
 * Busca só por profundidade: o veredito é o mesmo em qualquer aparelho, rápido ou lento.
 */
export function judge(
  searcher: Searcher,
  pos: Position,
  key: string,
  goal: Goal,
  base: Baseline,
  depth: number,
): Verdict {
  const root = searcher.search(pos, { depth });
  const best = root.lines[0];
  if (!best) throw new Error('Posição sem lances legais');
  const move = pos.legalMoves().find((m) => moveKey(m) === key);
  if (!move) throw new Error('Lance ilegal');

  const child = pos.clone();
  child.make(move);
  if (goalReached(goal, child, base)) return { accepted: true, best, playedScore: best.score, reply: null };
  if (moveKey(best.move) === key) return { accepted: true, best, playedScore: best.score, reply: null };

  const answer = searcher.search(child, { depth: Math.max(1, depth - 1) }).lines[0] ?? null;
  const playedScore = answer ? -answer.score : best.score;
  const winning = isMateScore(best.score) && best.score > 0;
  const accepted = winning
    ? isMateScore(playedScore) && playedScore > 0
    : playedScore >= best.score - TOLERANCE;
  return { accepted, best, playedScore, reply: answer };
}

/** Resposta do adversário na fase de exercício: sempre a melhor defesa, determinística. */
export function defend(searcher: Searcher, pos: Position, depth: number): Line | null {
  return searcher.search(pos, { depth }).lines[0] ?? null;
}
