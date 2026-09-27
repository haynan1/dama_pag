import { type Color, Position, parseAlgebraic, type VariantId } from '../src/index.ts';

/** Monta posição a partir de casas algébricas; prefixo `K` indica dama. */
export function setup(
  side: Color,
  white: string[],
  black: string[],
  variant: VariantId = 'brazilian',
): Position {
  const pos = Position.empty(variant);
  const place = (list: string[], sign: number) => {
    for (const s of list) {
      const king = s.startsWith('K');
      const sq = parseAlgebraic(pos.geo, king ? s.slice(1) : s);
      if (sq < 0) throw new Error(`casa inválida ${s}`);
      pos.board[sq] = sign * (king ? 2 : 1);
    }
  };
  place(white, 1);
  place(black, -1);
  pos.side = side;
  return Position.fromFen(variant, pos.fen());
}
