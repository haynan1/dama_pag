import { now } from './clock.ts';
import { evaluate } from './evaluate.ts';
import type { Move, Position } from './position.ts';

export const MATE = 30000;
export const MATE_BOUND = MATE - 1000;
const INF = 32000;
const MAX_PLY = 128;

const EXACT = 1;
const LOWER = 2;
const UPPER = 3;

export interface SearchLimits {
  /** Profundidade máxima em plies. */
  readonly depth?: number;
  /** Tempo máximo em milissegundos. */
  readonly timeMs?: number;
  /** Limite de nós visitados. */
  readonly nodes?: number;
  /** Quantas linhas principais calcular com pontuação exata (padrão 1). */
  readonly multiPv?: number;
}

export interface Line {
  readonly move: Move;
  /** Pontuação do ponto de vista de quem joga na posição analisada. */
  readonly score: number;
  readonly pv: readonly Move[];
}

export interface SearchResult {
  readonly lines: readonly Line[];
  readonly depth: number;
  readonly nodes: number;
  readonly timeMs: number;
}

export function isMateScore(score: number): boolean {
  return Math.abs(score) >= MATE_BOUND;
}

/** Plies até o fim forçado (positivo = vitória de quem joga). */
export function mateDistance(score: number): number {
  return score > 0 ? MATE - score : -(MATE + score);
}

/**
 * Tabela de transposição em arrays tipados: índice pelos bits baixos do hash,
 * verificação pelos altos. Substituição por profundidade, com envelhecimento por busca.
 */
class TranspositionTable {
  private readonly mask: number;
  private readonly check: Int32Array;
  private readonly score: Int16Array;
  private readonly depth: Int8Array;
  private readonly flag: Uint8Array;
  private readonly move: Int16Array;
  private readonly age: Uint8Array;
  generation = 0;

  constructor(bits: number) {
    const size = 1 << bits;
    this.mask = size - 1;
    this.check = new Int32Array(size);
    this.score = new Int16Array(size);
    this.depth = new Int8Array(size);
    this.flag = new Uint8Array(size);
    this.move = new Int16Array(size);
    this.age = new Uint8Array(size);
  }

  clear(): void {
    this.flag.fill(0);
    this.generation = 0;
  }

  probe(lo: number, hi: number): number {
    const i = lo & this.mask;
    return this.flag[i] !== 0 && this.check[i] === hi ? i : -1;
  }

  entryScore(i: number): number {
    return this.score[i]!;
  }
  entryDepth(i: number): number {
    return this.depth[i]!;
  }
  entryFlag(i: number): number {
    return this.flag[i]!;
  }
  entryMove(i: number): number {
    return this.move[i]!;
  }

  store(lo: number, hi: number, depth: number, flag: number, score: number, move: number): void {
    const i = lo & this.mask;
    if (
      this.flag[i] !== 0 &&
      this.check[i] !== hi &&
      this.age[i] === this.generation &&
      this.depth[i]! > depth
    ) {
      return;
    }
    this.check[i] = hi;
    this.score[i] = score;
    this.depth[i] = Math.max(-128, Math.min(127, depth));
    this.flag[i] = flag;
    this.move[i] = move;
    this.age[i] = this.generation;
  }
}

class SearchAborted extends Error {}

/**
 * Busca alfa-beta com aprofundamento iterativo, PVS, tabela de transposição, killer moves,
 * heurística de histórico, redução de lances tardios e extensão de lance único.
 * No horizonte, capturas obrigatórias continuam sendo buscadas (quiescência natural das damas).
 */
export class Searcher {
  private readonly tt: TranspositionTable;
  private readonly killers: Int32Array = new Int32Array(MAX_PLY * 2).fill(-1);
  private history: Int32Array = new Int32Array(0);
  private readonly pvTable: Move[][] = Array.from({ length: MAX_PLY }, () => []);
  private nodes = 0;
  private deadline = Number.POSITIVE_INFINITY;
  private nodeLimit = Number.POSITIVE_INFINITY;
  private stopped = false;

  constructor(ttBits = 20) {
    this.tt = new TranspositionTable(ttBits);
  }

  clear(): void {
    this.tt.clear();
    this.history = new Int32Array(0);
  }

  /** Interrompe uma busca em andamento a partir de outro callback (ex.: mensagem de cancelamento). */
  stop(): void {
    this.stopped = true;
  }

  search(root: Position, limits: SearchLimits = {}): SearchResult {
    const start = now();
    const pos = root.clone();
    const maxDepth = Math.min(limits.depth ?? 64, MAX_PLY - 8);
    const timeMs = limits.timeMs ?? Number.POSITIVE_INFINITY;
    this.deadline = start + timeMs;
    this.nodeLimit = limits.nodes ?? Number.POSITIVE_INFINITY;
    this.nodes = 0;
    this.stopped = false;
    this.killers.fill(-1);
    this.tt.generation = (this.tt.generation + 1) & 0xff;
    const squares = pos.geo.squares;
    if (this.history.length !== squares * squares) this.history = new Int32Array(squares * squares);
    else for (let i = 0; i < this.history.length; i++) this.history[i]! >>= 2;

    const moves = pos.legalMoves();
    if (moves.length === 0) return { lines: [], depth: 0, nodes: 0, timeMs: 0 };

    const multiPv = Math.max(1, Math.min(limits.multiPv ?? 1, moves.length));
    let order = moves.map((move) => ({ move, score: -INF, pv: [move] as Move[] }));
    let completed: Line[] = order.slice(0, multiPv).map((l) => ({ move: l.move, score: 0, pv: l.pv }));
    let completedDepth = 0;

    // Lance forçado único: não há o que pensar além do necessário para exibir a linha.
    const depthCap = moves.length === 1 && multiPv === 1 ? Math.min(maxDepth, 6) : maxDepth;

    for (let depth = 1; depth <= depthCap; depth++) {
      try {
        const scored = this.searchRoot(pos, order, depth, multiPv);
        order = scored;
        completed = scored.slice(0, multiPv).map((l) => ({ move: l.move, score: l.score, pv: l.pv }));
        completedDepth = depth;
      } catch (err) {
        if (err instanceof SearchAborted) break;
        throw err;
      }
      const elapsed = now() - start;
      if (isMateScore(completed[0]!.score) && depth > mateDistance(Math.abs(completed[0]!.score)) + 2) break;
      // Próxima iteração custa várias vezes a atual: não começa se não vai terminar.
      if (elapsed > timeMs * 0.45) break;
    }

    return {
      lines: completed.map((l) => ({ ...l, pv: this.extendPv(pos, l.pv) })),
      depth: completedDepth,
      nodes: this.nodes,
      timeMs: Math.round(now() - start),
    };
  }

  private searchRoot(
    pos: Position,
    order: { move: Move; score: number; pv: Move[] }[],
    depth: number,
    multiPv: number,
  ): { move: Move; score: number; pv: Move[] }[] {
    const results: { move: Move; score: number; pv: Move[] }[] = [];
    // Limiar: pontuação da k-ésima melhor linha exata até aqui.
    const threshold = (): number => {
      if (results.length < multiPv) return -INF;
      const sorted = results.map((r) => r.score).sort((a, b) => b - a);
      return sorted[multiPv - 1]!;
    };

    for (let i = 0; i < order.length; i++) {
      const { move } = order[i]!;
      pos.make(move);
      let score: number;
      const alpha = threshold();
      if (alpha === -INF) {
        score = -this.negamax(pos, depth - 1, -INF, INF, 1, true);
      } else {
        score = -this.negamax(pos, depth - 1, -alpha - 1, -alpha, 1, false);
        if (score > alpha) score = -this.negamax(pos, depth - 1, -INF, -alpha, 1, true);
      }
      pos.unmake();
      const exact = alpha === -INF || score > alpha;
      const pv = exact ? [move, ...this.pvTable[1]!.slice(0, this.pvLength(1))] : [move];
      results.push({ move, score: exact ? score : Math.min(score, alpha), pv });
    }
    // Ordenação estável: empates mantêm a ordem anterior (melhor da iteração passada primeiro).
    return results.sort((a, b) => b.score - a.score);
  }

  private readonly pvLen = new Int16Array(MAX_PLY);

  private pvLength(ply: number): number {
    return this.pvLen[ply]!;
  }

  private negamax(
    pos: Position,
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    pvNode: boolean,
  ): number {
    this.nodes++;
    if ((this.nodes & 2047) === 0) {
      if (this.stopped || now() > this.deadline || this.nodes > this.nodeLimit) {
        this.stopped = true;
      }
    }
    if (this.stopped) throw new SearchAborted();
    this.pvLen[ply] = 0;

    // Empate por repetição dentro da árvore (basta uma) ou pelas regras de contagem.
    if (pos.repetitions() >= 2 || pos.drawReason(3) !== null) return 0;

    const moves = pos.legalMoves();
    if (moves.length === 0) return -MATE + ply;
    const capturing = moves[0]!.captures.length > 0;
    if ((depth <= 0 && !capturing) || ply >= MAX_PLY - 2) return evaluate(pos);

    // Distância ao mate: não adianta buscar se nem o melhor caso melhora alfa.
    alpha = Math.max(alpha, -MATE + ply);
    beta = Math.min(beta, MATE - ply - 1);
    if (alpha >= beta) return alpha;

    const alphaOrig = alpha;
    let ttMove = -1;
    const entry = this.tt.probe(pos.hashLo, pos.hashHi);
    if (entry >= 0) {
      ttMove = this.tt.entryMove(entry);
      if (!pvNode && this.tt.entryDepth(entry) >= depth) {
        const s = fromTt(this.tt.entryScore(entry), ply);
        const f = this.tt.entryFlag(entry);
        if (f === EXACT || (f === LOWER && s >= beta) || (f === UPPER && s <= alpha)) return s;
      }
    }

    const extension = moves.length === 1 ? 1 : 0;
    const order = this.orderMoves(pos, moves, ttMove, ply);
    const squares = pos.geo.squares;

    let best = -INF;
    let bestIdx = -1;
    for (let n = 0; n < order.length; n++) {
      const idx = order[n]!;
      const move = moves[idx]!;
      const newDepth = depth - 1 + extension;
      pos.make(move);
      let score: number;
      if (n === 0) {
        score = -this.negamax(pos, newDepth, -beta, -alpha, ply + 1, pvNode);
      } else {
        let reduction = 0;
        if (depth >= 3 && n >= 3 && !capturing && !move.promotes && extension === 0) {
          reduction = n >= 8 && depth >= 6 ? 2 : 1;
        }
        score = -this.negamax(pos, newDepth - reduction, -alpha - 1, -alpha, ply + 1, false);
        if (score > alpha && reduction > 0) {
          score = -this.negamax(pos, newDepth, -alpha - 1, -alpha, ply + 1, false);
        }
        if (score > alpha && score < beta) {
          score = -this.negamax(pos, newDepth, -beta, -alpha, ply + 1, true);
        }
      }
      pos.unmake();

      if (score > best) {
        best = score;
        bestIdx = idx;
        if (score > alpha) {
          alpha = score;
          const row = this.pvTable[ply]!;
          const childLen = this.pvLen[ply + 1]!;
          row.length = 0;
          row.push(move);
          const child = this.pvTable[ply + 1]!;
          for (let k = 0; k < childLen; k++) row.push(child[k]!);
          this.pvLen[ply] = row.length;
          if (alpha >= beta) {
            if (!capturing) {
              const key = move.from * squares + move.to;
              if (this.killers[ply * 2] !== key) {
                this.killers[ply * 2 + 1] = this.killers[ply * 2]!;
                this.killers[ply * 2] = key;
              }
              this.history[key]! += depth * depth;
            }
            break;
          }
        }
      }
    }

    const flag = best <= alphaOrig ? UPPER : best >= beta ? LOWER : EXACT;
    this.tt.store(pos.hashLo, pos.hashHi, depth, flag, toTt(best, ply), bestIdx);
    return best;
  }

  private orderMoves(pos: Position, moves: Move[], ttMove: number, ply: number): number[] {
    const squares = pos.geo.squares;
    const k1 = this.killers[ply * 2];
    const k2 = this.killers[ply * 2 + 1];
    const keys = new Float64Array(moves.length);
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i]!;
      const key = m.from * squares + m.to;
      let s = this.history[key]!;
      if (i === ttMove) s += 1e9;
      if (m.promotes) s += 1e7;
      if (m.captures.length > 0) {
        for (const c of m.captures) if (Math.abs(pos.board[c]!) === 2) s += 1e6;
      }
      if (key === k1) s += 1e5;
      else if (key === k2) s += 5e4;
      keys[i] = s;
    }
    const idx = Array.from({ length: moves.length }, (_, i) => i);
    idx.sort((a, b) => keys[b]! - keys[a]!);
    return idx;
  }

  /** Completa a linha principal seguindo a tabela de transposição. */
  private extendPv(root: Position, pv: readonly Move[]): Move[] {
    const pos = root.clone();
    const out: Move[] = [];
    for (const m of pv) {
      out.push(m);
      pos.make(m);
    }
    const seen = new Set<number>([pos.key()]);
    while (out.length < 14) {
      const entry = this.tt.probe(pos.hashLo, pos.hashHi);
      if (entry < 0) break;
      const moves = pos.legalMoves();
      const m = moves[this.tt.entryMove(entry)];
      if (!m) break;
      out.push(m);
      pos.make(m);
      if (seen.has(pos.key())) break;
      seen.add(pos.key());
    }
    return out;
  }
}

function toTt(score: number, ply: number): number {
  if (score >= MATE_BOUND) return score + ply;
  if (score <= -MATE_BOUND) return score - ply;
  return score;
}

function fromTt(score: number, ply: number): number {
  if (score >= MATE_BOUND) return score - ply;
  if (score <= -MATE_BOUND) return score + ply;
  return score;
}
