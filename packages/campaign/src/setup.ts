import { Position, parseAlgebraic } from '@dama/engine';

/**
 * Posição de uma fase escrita como se lê no tabuleiro: casas algébricas separadas por espaço,
 * prefixo `K` para dama. Ex.: `{ white: 'c3 e3 Kd4', black: 'd6 f6', toMove: 'white' }`.
 * Mais legível e revisável que FEN numérico — e convertido/validado uma única vez.
 */
export interface Setup {
  readonly white: string;
  readonly black: string;
  readonly toMove: 'white' | 'black';
}

export function setupToFen(setup: Setup): string {
  const pos = Position.empty('brazilian');
  const seen = new Set<number>();
  const place = (list: string, sign: 1 | -1) => {
    for (const token of list.split(/\s+/).filter(Boolean)) {
      const king = token.startsWith('K');
      const sq = parseAlgebraic(pos.geo, king ? token.slice(1) : token);
      if (sq < 0) throw new RangeError(`Casa inválida ou clara: "${token}"`);
      if (seen.has(sq)) throw new RangeError(`Casa repetida: "${token}"`);
      seen.add(sq);
      const row = pos.geo.row[sq]!;
      // Pedra na própria fileira de coroação não existe numa partida real.
      if (!king && ((sign === 1 && row === 7) || (sign === -1 && row === 0))) {
        throw new RangeError(`Pedra já coroada em "${token}": use K`);
      }
      pos.board[sq] = sign * (king ? 2 : 1);
    }
  };
  place(setup.white, 1);
  place(setup.black, -1);
  pos.side = setup.toMove === 'white' ? 1 : -1;
  return pos.fen();
}
