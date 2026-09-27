/**
 * Geometria do tabuleiro. Só as casas escuras são jogáveis; a casa a1 (canto inferior esquerdo
 * das brancas) é escura. Índices internos: 0..N²/2-1, linha a linha a partir da base das brancas.
 *
 * Direções: 0 = NE (+1,+1), 1 = NO (+1,-1), 2 = SE (-1,+1), 3 = SO (-1,-1).
 * "Norte" é o sentido de avanço das brancas.
 */
export const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export interface Geometry {
  readonly size: number;
  readonly half: number;
  readonly squares: number;
  readonly row: Int8Array;
  readonly col: Int8Array;
  /** rays[dir][sq]: casas percorridas a partir de `sq` na direção `dir`, em ordem. */
  readonly rays: readonly (readonly Int16Array[])[];
  /** Casas da grande diagonal (a1 até o canto oposto). */
  readonly mainDiagonal: Uint8Array;
  squareAt(row: number, col: number): number;
}

const cache = new Map<number, Geometry>();

export function geometry(size: number): Geometry {
  const cached = cache.get(size);
  if (cached) return cached;
  if (size < 6 || size > 16 || size % 2 !== 0) throw new RangeError(`Tamanho de tabuleiro inválido: ${size}`);

  const half = size / 2;
  const squares = size * half;
  const row = new Int8Array(squares);
  const col = new Int8Array(squares);
  for (let i = 0; i < squares; i++) {
    const r = Math.floor(i / half);
    row[i] = r;
    col[i] = 2 * (i % half) + (r & 1);
  }

  const squareAt = (r: number, c: number): number => {
    if (r < 0 || r >= size || c < 0 || c >= size || (r + c) % 2 !== 0) return -1;
    return r * half + (c >> 1);
  };

  const rays = DIRECTIONS.map(([dr, dc]) => {
    const perSquare: Int16Array[] = [];
    for (let i = 0; i < squares; i++) {
      const cells: number[] = [];
      let r = row[i]! + dr;
      let c = col[i]! + dc;
      while (r >= 0 && r < size && c >= 0 && c < size) {
        cells.push(squareAt(r, c));
        r += dr;
        c += dc;
      }
      perSquare.push(Int16Array.from(cells));
    }
    return perSquare;
  });

  const mainDiagonal = new Uint8Array(squares);
  for (let i = 0; i < squares; i++) if (row[i] === col[i]) mainDiagonal[i] = 1;

  const geo: Geometry = { size, half, squares, row, col, rays, mainDiagonal, squareAt };
  cache.set(size, geo);
  return geo;
}
