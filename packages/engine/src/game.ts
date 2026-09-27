import { moveNotation, movePdn } from './notation.ts';
import { BLACK, type Color, type DrawReason, type Move, moveKey, Position, WHITE } from './position.ts';
import { VARIANTS, type VariantId } from './variants.ts';

export type EndReason = 'no-moves' | 'resign' | 'timeout' | 'agreement' | 'abandon' | DrawReason;

export interface GameResult {
  /** `null` = empate. */
  readonly winner: Color | null;
  readonly reason: EndReason;
}

export interface PlayedMove {
  readonly move: Move;
  readonly key: string;
  readonly notation: string;
  readonly pdn: string;
  readonly side: Color;
  readonly fenBefore: string;
}

/**
 * Partida: posição atual, histórico completo (para desfazer, repetição e PDN) e resultado.
 */
export class Game {
  readonly variant: VariantId;
  readonly startFen: string;
  private pos: Position;
  private readonly played: PlayedMove[] = [];
  private finished: GameResult | null = null;

  private constructor(variant: VariantId, pos: Position) {
    this.variant = variant;
    this.pos = pos;
    this.startFen = pos.fen();
    this.updateResult();
  }

  static create(variant: VariantId, startFen?: string): Game {
    return new Game(variant, startFen ? Position.fromFen(variant, startFen) : Position.initial(variant));
  }

  /** Reconstrói uma partida a partir das chaves dos lances. Lança erro se algum for ilegal. */
  static replay(variant: VariantId, startFen: string, keys: readonly string[]): Game {
    const game = Game.create(variant, startFen);
    for (const key of keys) game.play(key);
    return game;
  }

  get position(): Position {
    return this.pos;
  }

  get moves(): readonly PlayedMove[] {
    return this.played;
  }

  get result(): GameResult | null {
    return this.finished;
  }

  get turn(): Color {
    return this.pos.side;
  }

  get ply(): number {
    return this.played.length;
  }

  legalMoves(): Move[] {
    return this.finished ? [] : this.pos.legalMoves();
  }

  findMove(key: string): Move | undefined {
    return this.legalMoves().find((m) => moveKey(m) === key);
  }

  play(moveOrKey: Move | string): PlayedMove {
    if (this.finished) throw new GameError('game-over', 'A partida já terminou');
    const key = typeof moveOrKey === 'string' ? moveOrKey : moveKey(moveOrKey);
    const move = this.findMove(key);
    if (!move) throw new GameError('illegal-move', 'Lance ilegal');
    const record: PlayedMove = {
      move,
      key,
      notation: moveNotation(this.pos.geo, move),
      pdn: movePdn(this.pos.geo, move),
      side: this.pos.side,
      fenBefore: this.pos.fen(),
    };
    this.pos.make(move);
    this.played.push(record);
    this.updateResult();
    return record;
  }

  /** Desfaz `count` lances (reabre a partida se ela tinha terminado por regra). */
  undo(count = 1): number {
    let undone = 0;
    while (undone < count && this.played.length > 0) {
      this.pos.unmake();
      this.played.pop();
      undone++;
    }
    if (undone > 0) this.updateResult();
    return undone;
  }

  finish(result: GameResult): void {
    if (!this.finished) this.finished = result;
  }

  private updateResult(): void {
    this.finished = null;
    if (this.pos.legalMoves().length === 0) {
      this.finished = { winner: -this.pos.side as Color, reason: 'no-moves' };
      return;
    }
    const draw = this.pos.drawReason(3);
    if (draw) this.finished = { winner: null, reason: draw };
  }

  /** Exporta em PDN 3.0 com numeração numérica padrão. */
  pdn(tags: Readonly<Record<string, string>> = {}): string {
    const rules = VARIANTS[this.variant];
    const result = this.finished
      ? this.finished.winner === WHITE
        ? '2-0'
        : this.finished.winner === BLACK
          ? '0-2'
          : '1-1'
      : '*';
    const allTags: Record<string, string> = {
      Event: 'Partida casual',
      Date: new Date().toISOString().slice(0, 10).replaceAll('-', '.'),
      White: 'Brancas',
      Black: 'Pretas',
      ...tags,
      Result: result,
      GameType: String(rules.pdnGameType),
    };
    const initial = Position.initial(this.variant).fen();
    if (this.startFen !== initial) allTags['FEN'] = this.startFen;
    const header = Object.entries(allTags)
      .map(([k, v]) => `[${k} "${v.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`)
      .join('\n');
    const tokens: string[] = [];
    const blackStarts = Position.fromFen(this.variant, this.startFen).side === BLACK;
    this.played.forEach((m, i) => {
      const index = blackStarts ? i + 1 : i;
      if (index % 2 === 0) tokens.push(`${index / 2 + 1}.`);
      else if (i === 0) tokens.push(`${Math.floor(index / 2) + 1}...`);
      tokens.push(m.pdn);
    });
    tokens.push(result);
    const body: string[] = [];
    let line = '';
    for (const t of tokens) {
      if (line.length + t.length + 1 > 80) {
        body.push(line);
        line = t;
      } else line = line ? `${line} ${t}` : t;
    }
    if (line) body.push(line);
    return `${header}\n\n${body.join('\n')}\n`;
  }
}

export class GameError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'GameError';
  }
}
