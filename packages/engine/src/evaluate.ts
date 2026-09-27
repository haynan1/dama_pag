import type { Geometry } from './geometry.ts';
import { type Position, WHITE } from './position.ts';

/**
 * Avaliação estática em centésimos de pedra, do ponto de vista de quem joga.
 *
 * Termos: material (dama ≈ 3 pedras), avanço das pedras (peso cresce no final), controle do
 * centro, guarda da base na abertura/meio-jogo, pedras com caminho livre para coroar, domínio
 * da grande diagonal pelas damas e escalonamento de finais teoricamente empatados.
 */

interface Tables {
  /** Bônus de avanço por fileira relativa (0 = base própria). */
  readonly advance: Int16Array;
  /** Bônus de centralização por casa. */
  readonly center: Int16Array;
}

const tablesCache = new Map<number, Tables>();

function tables(geo: Geometry): Tables {
  const cached = tablesCache.get(geo.size);
  if (cached) return cached;
  const n = geo.size;
  const advance = new Int16Array(n);
  for (let r = 0; r < n; r++) advance[r] = Math.round((r * r * 36) / ((n - 1) * (n - 1)));
  const center = new Int16Array(geo.squares);
  const mid = (n - 1) / 2;
  for (let sq = 0; sq < geo.squares; sq++) {
    const dc = Math.abs(geo.col[sq]! - mid);
    const dr = Math.abs(geo.row[sq]! - mid);
    // Colunas laterais são mais seguras, porém passivas; o centro dá espaço e ataque.
    center[sq] = Math.max(0, Math.round(10 - 3.2 * dc - 1.2 * dr));
  }
  const t = { advance, center };
  tablesCache.set(n, t);
  return t;
}

export function evaluate(pos: Position): number {
  const { board, geo, rules } = pos;
  const n = geo.size;
  const t = tables(geo);
  const wm = pos.counts[0]!;
  const wk = pos.counts[1]!;
  const bm = pos.counts[2]!;
  const bk = pos.counts[3]!;
  const total = wm + wk + bm + bk;
  const initial = rules.rowsPerSide * geo.half * 2;
  // 1 no início, 0 sem peças.
  const phase = total / initial;
  const endWeight = 1.6 - phase;

  let material = (wm - bm) * 100 + (wk - bk) * rules.kingValue;
  // Quem está à frente em material ganha ao trocar peças.
  const whiteMat = wm * 100 + wk * rules.kingValue;
  const blackMat = bm * 100 + bk * rules.kingValue;
  if (whiteMat !== blackMat) {
    const ratio = (whiteMat - blackMat) / (whiteMat + blackMat);
    material += Math.round(ratio * 60);
  }

  let positional = 0;
  const backGuard = Math.round(9 * phase);
  for (let sq = 0; sq < geo.squares; sq++) {
    const p = board[sq]!;
    if (p === 0) continue;
    const r = geo.row[sq]!;
    switch (p) {
      case 1:
        positional += t.advance[r]! * endWeight + t.center[sq]!;
        if (r === 0) positional += backGuard;
        if (bk === 0) positional += runaway(pos, sq, WHITE);
        break;
      case -1:
        positional -= t.advance[n - 1 - r]! * endWeight + t.center[sq]!;
        if (r === n - 1) positional -= backGuard;
        if (wk === 0) positional -= runaway(pos, sq, -1);
        break;
      case 2:
        positional += geo.mainDiagonal[sq]! * 18 + t.center[sq]!;
        break;
      case -2:
        positional -= geo.mainDiagonal[sq]! * 18 + t.center[sq]!;
        break;
    }
  }

  let score = material + Math.round(positional);
  score = Math.round(scaleDrawish(pos, score, wm, wk, bm, bk));
  return pos.side === WHITE ? score : -score;
}

/**
 * Pedra sem nenhuma peça adversária no cone à frente: praticamente uma dama futura.
 * Só avaliada quando o adversário não tem damas (damas voadoras interceptam qualquer pedra).
 */
function runaway(pos: Position, sq: number, color: 1 | -1): number {
  const { geo, board } = pos;
  const r0 = geo.row[sq]!;
  const c0 = geo.col[sq]!;
  const target = color === WHITE ? geo.size - 1 : 0;
  const distance = Math.abs(target - r0);
  if (distance === 0) return 0;
  for (let step = 1; step <= distance; step++) {
    const r = r0 + step * color;
    const spread = step + 1;
    for (let c = c0 - spread; c <= c0 + spread; c++) {
      const s = geo.squareAt(r, c);
      if (s >= 0 && board[s]! * color < 0) return 0;
    }
  }
  return Math.max(0, 110 - 14 * distance);
}

/** Finais com vantagem insuficiente para vencer: reduz a avaliação em direção ao empate. */
function scaleDrawish(pos: Position, score: number, wm: number, wk: number, bm: number, bk: number): number {
  const whiteLoneKing = wm === 0 && wk === 1;
  const blackLoneKing = bm === 0 && bk === 1;
  if (blackLoneKing && wk >= 1) return score / scaleAgainstLoneKing(pos, wm + wk, -1);
  if (whiteLoneKing && bk >= 1) return score / scaleAgainstLoneKing(pos, bm + bk, 1);
  if (wm === 0 && bm === 0 && wk > 0 && bk > 0 && Math.abs(wk - bk) <= 1) return score / 4;
  return score;
}

function scaleAgainstLoneKing(pos: Position, strongPieces: number, loneColor: 1 | -1): number {
  if (strongPieces <= 2) return 16;
  if (strongPieces === 3) {
    const { board, geo } = pos;
    // Nos tabuleiros maiores, três peças contra uma dama raramente vencem.
    if (geo.size > 8) return 8;
    // No 8×8, a dama isolada só empata se dominar a grande diagonal.
    for (let sq = 0; sq < geo.squares; sq++) {
      if (board[sq] === 2 * loneColor) return geo.mainDiagonal[sq] ? 12 : 1.5;
    }
  }
  return 1;
}
