import { type Geometry, geometry } from './geometry.ts';
import { fromPdnNumber, pdnNumber } from './notation.ts';
import { shortEndgameLimit, VARIANTS, type VariantId, type VariantRules } from './variants.ts';

export type Color = 1 | -1;
export const WHITE: Color = 1;
export const BLACK: Color = -1;

/** Conteúdo de casa: 0 vazia, ±1 pedra, ±2 dama. Positivo = brancas. */
export type Piece = -2 | -1 | 0 | 1 | 2;

export interface Move {
  readonly from: number;
  readonly to: number;
  /** Casa de origem seguida de cada casa de pouso. */
  readonly path: readonly number[];
  /** Casas das peças capturadas, na ordem em que foram saltadas. */
  readonly captures: readonly number[];
  readonly promotes: boolean;
}

export type DrawReason = 'repetition' | 'kings-only' | 'short-endgame';

interface Undo {
  readonly move: Move;
  readonly piece: number;
  readonly captured: Int8Array;
  readonly quietPlies: number;
  readonly endgamePlies: number;
  readonly hashLo: number;
  readonly hashHi: number;
}

/** Tabelas Zobrist determinísticas (mesmas chaves em qualquer thread ou processo). */
interface Zobrist {
  readonly lo: Int32Array;
  readonly hi: Int32Array;
  readonly sideLo: number;
  readonly sideHi: number;
}

const zobristCache = new Map<number, Zobrist>();

function zobrist(squares: number): Zobrist {
  const cached = zobristCache.get(squares);
  if (cached) return cached;
  let state = 0x9e3779b9 ^ squares;
  const next = (): number => {
    // mulberry32
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) | 0;
  };
  const lo = new Int32Array(squares * 4);
  const hi = new Int32Array(squares * 4);
  for (let i = 0; i < lo.length; i++) {
    lo[i] = next();
    hi[i] = next();
  }
  const table = { lo, hi, sideLo: next(), sideHi: next() };
  zobristCache.set(squares, table);
  return table;
}

function pieceIndex(p: number): number {
  return p === 1 ? 0 : p === 2 ? 1 : p === -1 ? 2 : 3;
}

/**
 * Posição mutável com make/unmake, otimizada para busca. Para partidas, use `Game`.
 */
export class Position {
  readonly rules: VariantRules;
  readonly geo: Geometry;
  readonly board: Int8Array;
  side: Color = WHITE;
  /** Plies desde a última captura ou movimento de pedra. */
  quietPlies = 0;
  /** Plies sem captura sob a regra de finais curtos. */
  endgamePlies = 0;
  hashLo = 0;
  hashHi = 0;
  /** [pedras brancas, damas brancas, pedras pretas, damas pretas] */
  readonly counts = new Int16Array(4);

  private readonly zob: Zobrist;
  private readonly undos: Undo[] = [];
  /** Chaves das posições desde o início (inclui a atual). */
  private readonly keys: number[] = [];
  private readonly marks: Uint8Array;

  private constructor(rules: VariantRules) {
    this.rules = rules;
    this.geo = geometry(rules.size);
    this.board = new Int8Array(this.geo.squares);
    this.zob = zobrist(this.geo.squares);
    this.marks = new Uint8Array(this.geo.squares);
  }

  static initial(variant: VariantId): Position {
    const pos = new Position(VARIANTS[variant]);
    const { geo, rules } = pos;
    for (let sq = 0; sq < geo.squares; sq++) {
      const r = geo.row[sq]!;
      if (r < rules.rowsPerSide) pos.board[sq] = 1;
      else if (r >= geo.size - rules.rowsPerSide) pos.board[sq] = -1;
    }
    pos.recompute();
    return pos;
  }

  static empty(variant: VariantId): Position {
    const pos = new Position(VARIANTS[variant]);
    pos.recompute();
    return pos;
  }

  /**
   * Lê FEN no padrão PDN: `W:W21,22,K30:B1-12`. Casas na numeração PDN; `K` indica dama.
   */
  static fromFen(variant: VariantId, fen: string): Position {
    const pos = new Position(VARIANTS[variant]);
    const parts = fen.trim().replace(/\.$/, '').split(':');
    const turn = parts[0]?.trim().toUpperCase();
    if (turn !== 'W' && turn !== 'B') throw new SyntaxError('FEN inválido: lado a jogar ausente');
    pos.side = turn === 'W' ? WHITE : BLACK;
    for (const section of parts.slice(1)) {
      const color = section.trim()[0]?.toUpperCase();
      if (color !== 'W' && color !== 'B') throw new SyntaxError(`FEN inválido: seção "${section}"`);
      const sign = color === 'W' ? 1 : -1;
      const body = section.trim().slice(1);
      if (!body) continue;
      for (const raw of body.split(',')) {
        const token = raw.trim();
        const king = token.toUpperCase().startsWith('K');
        const spec = king ? token.slice(1) : token;
        const [a, b] = spec.split('-').map(Number);
        const first = a ?? Number.NaN;
        const last = b ?? first;
        if (!Number.isInteger(first) || !Number.isInteger(last) || last < first) {
          throw new SyntaxError(`FEN inválido: casa "${token}"`);
        }
        for (let n = first; n <= last; n++) {
          const sq = fromPdnNumber(pos.geo, n);
          if (sq < 0) throw new SyntaxError(`FEN inválido: casa ${n} fora do tabuleiro`);
          if (pos.board[sq] !== 0) throw new SyntaxError(`FEN inválido: casa ${n} repetida`);
          if (!king && pos.geo.row[sq] === pos.promotionRow(sign as Color)) {
            throw new SyntaxError(`FEN inválido: pedra na fileira de coroação (casa ${n})`);
          }
          pos.board[sq] = sign * (king ? 2 : 1);
        }
      }
    }
    pos.recompute();
    return pos;
  }

  fen(): string {
    const white: [number, boolean][] = [];
    const black: [number, boolean][] = [];
    for (let sq = 0; sq < this.geo.squares; sq++) {
      const p = this.board[sq]!;
      if (p === 0) continue;
      (p > 0 ? white : black).push([pdnNumber(this.geo, sq), Math.abs(p) === 2]);
    }
    const fmt = (list: [number, boolean][]) =>
      list
        .sort((x, y) => x[0] - y[0])
        .map(([n, k]) => (k ? `K${n}` : `${n}`))
        .join(',');
    return `${this.side === WHITE ? 'W' : 'B'}:W${fmt(white)}:B${fmt(black)}`;
  }

  clone(): Position {
    const copy = new Position(this.rules);
    copy.board.set(this.board);
    copy.side = this.side;
    copy.recompute();
    copy.quietPlies = this.quietPlies;
    copy.endgamePlies = this.endgamePlies;
    copy.keys.length = 0;
    copy.keys.push(...this.keys);
    return copy;
  }

  /** Chave de 53 bits segura para `Map`/`Set`. */
  key(): number {
    return (this.hashHi & 0x1fffff) * 0x100000000 + (this.hashLo >>> 0);
  }

  get ply(): number {
    return this.undos.length;
  }

  lastMove(): Move | null {
    return this.undos.at(-1)?.move ?? null;
  }

  private recompute(): void {
    this.counts.fill(0);
    let lo = 0;
    let hi = 0;
    for (let sq = 0; sq < this.geo.squares; sq++) {
      const p = this.board[sq]!;
      if (p === 0) continue;
      const idx = pieceIndex(p);
      this.counts[idx]!++;
      lo ^= this.zob.lo[sq * 4 + idx]!;
      hi ^= this.zob.hi[sq * 4 + idx]!;
    }
    if (this.side === BLACK) {
      lo ^= this.zob.sideLo;
      hi ^= this.zob.sideHi;
    }
    this.hashLo = lo;
    this.hashHi = hi;
    this.keys.length = 0;
    this.keys.push(this.key());
  }

  private toggle(sq: number, p: number): void {
    const idx = sq * 4 + pieceIndex(p);
    this.hashLo ^= this.zob.lo[idx]!;
    this.hashHi ^= this.zob.hi[idx]!;
  }

  pieceCount(color: Color): number {
    return color === WHITE ? this.counts[0]! + this.counts[1]! : this.counts[2]! + this.counts[3]!;
  }

  promotionRow(color: Color): number {
    return color === WHITE ? this.geo.size - 1 : 0;
  }

  // ---------------------------------------------------------------------------------------------
  // Geração de lances
  // ---------------------------------------------------------------------------------------------

  legalMoves(): Move[] {
    const captures = this.captureMoves();
    return captures.length > 0 ? captures : this.quietMoves();
  }

  /** Teste rápido: o lado `color` tem alguma captura disponível? */
  hasCapture(color: Color = this.side): boolean {
    const { board, geo } = this;
    for (let sq = 0; sq < geo.squares; sq++) {
      const p = board[sq]! * color;
      if (p <= 0) continue;
      for (let d = 0; d < 4; d++) {
        const ray = geo.rays[d]![sq]!;
        if (p === 1) {
          if (ray.length >= 2 && board[ray[0]!]! * color < 0 && board[ray[1]!] === 0) return true;
        } else {
          let k = 0;
          while (k < ray.length && board[ray[k]!] === 0) k++;
          if (k + 1 < ray.length && board[ray[k]!]! * color < 0 && board[ray[k + 1]!] === 0) return true;
        }
      }
    }
    return false;
  }

  private quietMoves(): Move[] {
    const { board, geo, side } = this;
    const out: Move[] = [];
    const promoRow = this.promotionRow(side);
    const forward = side === WHITE ? 0 : 2;
    for (let sq = 0; sq < geo.squares; sq++) {
      const p = board[sq]! * side;
      if (p <= 0) continue;
      if (p === 1) {
        for (let d = forward; d < forward + 2; d++) {
          const ray = geo.rays[d]![sq]!;
          if (ray.length === 0) continue;
          const to = ray[0]!;
          if (board[to] === 0) {
            out.push({ from: sq, to, path: [sq, to], captures: [], promotes: geo.row[to] === promoRow });
          }
        }
      } else {
        for (let d = 0; d < 4; d++) {
          const ray = geo.rays[d]![sq]!;
          for (let k = 0; k < ray.length; k++) {
            const to = ray[k]!;
            if (board[to] !== 0) break;
            out.push({ from: sq, to, path: [sq, to], captures: [], promotes: false });
          }
        }
      }
    }
    return out;
  }

  /**
   * Todas as sequências de captura de tamanho máximo (lei da maioria). As peças capturadas
   * permanecem no tabuleiro até o fim do lance: bloqueiam o caminho e não podem ser saltadas
   * duas vezes. A pedra que passa pela última fileira no meio de uma captura não é promovida.
   */
  private captureMoves(): Move[] {
    const { board, geo, side, marks } = this;
    const promoRow = this.promotionRow(side);
    let out: Move[] = [];
    let best = 1;
    const path: number[] = [];
    const caps: number[] = [];

    const record = (to: number, man: boolean): void => {
      if (caps.length < best) return;
      if (caps.length > best) {
        best = caps.length;
        out = [];
      }
      out.push({
        from: path[0]!,
        to,
        path: path.slice(),
        captures: caps.slice(),
        promotes: man && geo.row[to] === promoRow,
      });
    };

    const manJumps = (cur: number): void => {
      let extended = false;
      for (let d = 0; d < 4; d++) {
        const ray = geo.rays[d]![cur]!;
        if (ray.length < 2) continue;
        const mid = ray[0]!;
        const land = ray[1]!;
        if (board[mid]! * side < 0 && marks[mid] === 0 && board[land] === 0) {
          extended = true;
          marks[mid] = 1;
          caps.push(mid);
          path.push(land);
          manJumps(land);
          path.pop();
          caps.pop();
          marks[mid] = 0;
        }
      }
      if (!extended && caps.length > 0) record(cur, true);
    };

    const kingJumps = (cur: number): void => {
      let extended = false;
      for (let d = 0; d < 4; d++) {
        const ray = geo.rays[d]![cur]!;
        let k = 0;
        while (k < ray.length && board[ray[k]!] === 0) k++;
        if (k + 1 >= ray.length) continue;
        const victim = ray[k]!;
        if (board[victim]! * side >= 0 || marks[victim] === 1) continue;
        marks[victim] = 1;
        caps.push(victim);
        for (let j = k + 1; j < ray.length && board[ray[j]!] === 0; j++) {
          extended = true;
          path.push(ray[j]!);
          kingJumps(ray[j]!);
          path.pop();
        }
        caps.pop();
        marks[victim] = 0;
      }
      if (!extended && caps.length > 0) record(cur, false);
    };

    for (let sq = 0; sq < geo.squares; sq++) {
      const p = board[sq]! * side;
      if (p <= 0) continue;
      board[sq] = 0;
      path.push(sq);
      if (p === 1) manJumps(sq);
      else kingJumps(sq);
      path.pop();
      board[sq] = p * side;
    }

    if (out.length < 2) return out;
    // Sequências diferentes com mesma origem, destino e peças capturadas são o mesmo lance.
    const seen = new Set<string>();
    return out.filter((m) => {
      const key = moveKey(m);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Make / unmake
  // ---------------------------------------------------------------------------------------------

  make(move: Move): void {
    const { board, counts } = this;
    const piece = board[move.from]!;
    const captured = new Int8Array(move.captures.length);
    this.undos.push({
      move,
      piece,
      captured,
      quietPlies: this.quietPlies,
      endgamePlies: this.endgamePlies,
      hashLo: this.hashLo,
      hashHi: this.hashHi,
    });

    this.toggle(move.from, piece);
    board[move.from] = 0;
    for (let i = 0; i < move.captures.length; i++) {
      const sq = move.captures[i]!;
      const victim = board[sq]!;
      captured[i] = victim;
      this.toggle(sq, victim);
      counts[pieceIndex(victim)]!--;
      board[sq] = 0;
    }
    const placed = move.promotes ? piece * 2 : piece;
    if (move.promotes) {
      counts[pieceIndex(piece)]!--;
      counts[pieceIndex(placed)]!++;
    }
    board[move.to] = placed;
    this.toggle(move.to, placed);

    const irreversible = move.captures.length > 0 || Math.abs(piece) === 1;
    this.quietPlies = irreversible ? 0 : this.quietPlies + 1;

    this.side = -this.side as Color;
    this.hashLo ^= this.zob.sideLo;
    this.hashHi ^= this.zob.sideHi;

    this.endgamePlies = move.captures.length === 0 && this.shortEndgameApplies() ? this.endgamePlies + 1 : 0;
    this.keys.push(this.key());
  }

  unmake(): void {
    const undo = this.undos.pop();
    if (!undo) throw new Error('Nada para desfazer');
    const { board, counts } = this;
    const { move, piece, captured } = undo;
    const placed = board[move.to]!;
    board[move.to] = 0;
    if (move.promotes) {
      counts[pieceIndex(placed)]!--;
      counts[pieceIndex(piece)]!++;
    }
    for (let i = 0; i < move.captures.length; i++) {
      board[move.captures[i]!] = captured[i]!;
      counts[pieceIndex(captured[i]!)]!++;
    }
    board[move.from] = piece;
    this.side = -this.side as Color;
    this.quietPlies = undo.quietPlies;
    this.endgamePlies = undo.endgamePlies;
    this.hashLo = undo.hashLo;
    this.hashHi = undo.hashHi;
    this.keys.pop();
  }

  // ---------------------------------------------------------------------------------------------
  // Empates
  // ---------------------------------------------------------------------------------------------

  /** Uma dama isolada contra até 3 peças com ao menos uma dama. */
  private shortEndgameApplies(): boolean {
    const [wm, wk, bm, bk] = this.counts as unknown as [number, number, number, number];
    const whiteLone = wm === 0 && wk === 1;
    const blackLone = bm === 0 && bk === 1;
    if (blackLone && wk >= 1 && wm + wk <= 3) return true;
    if (whiteLone && bk >= 1 && bm + bk <= 3) return true;
    return false;
  }

  /** Quantas vezes a posição atual ocorreu (mesmo lado a jogar) desde o último lance irreversível. */
  repetitions(): number {
    const keys = this.keys;
    const current = keys[keys.length - 1]!;
    let count = 1;
    const limit = Math.max(0, keys.length - 1 - this.quietPlies);
    for (let i = keys.length - 3; i >= limit; i -= 2) if (keys[i] === current) count++;
    return count;
  }

  /** Empate pelas regras da partida (repetição tripla, lances só de damas, finais curtos). */
  drawReason(repetitionsForDraw = 3): DrawReason | null {
    if (this.repetitions() >= repetitionsForDraw) return 'repetition';
    if (this.quietPlies >= this.rules.kingOnlyDrawPlies) return 'kings-only';
    if (this.endgamePlies > 0) {
      const strong = Math.max(this.pieceCount(WHITE), this.pieceCount(BLACK));
      if (this.endgamePlies >= shortEndgameLimit(this.rules, strong)) return 'short-endgame';
    }
    return null;
  }
}

/** Identificador estável de um lance: origem, destino e peças capturadas (ordenadas). */
export function moveKey(m: Pick<Move, 'from' | 'to' | 'captures'>): string {
  if (m.captures.length === 0) return `${m.from}-${m.to}`;
  return `${m.from}x${m.to}:${[...m.captures].sort((a, b) => a - b).join('.')}`;
}
