import type { Geometry } from './geometry.ts';

const FILES = 'abcdefghijklmnop';

/** Casa em notação algébrica (a1 = canto inferior esquerdo das brancas). */
export function algebraic(geo: Geometry, sq: number): string {
  return `${FILES[geo.col[sq]!]}${geo.row[sq]! + 1}`;
}

export function parseAlgebraic(geo: Geometry, text: string): number {
  const match = /^([a-p])(\d{1,2})$/.exec(text.trim().toLowerCase());
  if (!match) return -1;
  return geo.squareAt(Number(match[2]) - 1, FILES.indexOf(match[1]!));
}

/** Numeração PDN: casa 1 no canto superior esquerdo (lado das pretas), da esquerda para a direita. */
export function pdnNumber(geo: Geometry, sq: number): number {
  const fromTop = geo.size - 1 - geo.row[sq]!;
  return fromTop * geo.half + (sq % geo.half) + 1;
}

export function fromPdnNumber(geo: Geometry, n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > geo.squares) return -1;
  const fromTop = Math.floor((n - 1) / geo.half);
  const row = geo.size - 1 - fromTop;
  return row * geo.half + ((n - 1) % geo.half);
}

export interface MoveLike {
  readonly path: readonly number[];
  readonly captures: readonly number[];
}

/** Lance em notação algébrica: `c3-d4` ou `c3xe5xc7`. */
export function moveNotation(geo: Geometry, move: MoveLike): string {
  const sep = move.captures.length > 0 ? 'x' : '-';
  return move.path.map((s) => algebraic(geo, s)).join(sep);
}

/** Lance em notação PDN numérica: `22-18` ou `27x18x9`. */
export function movePdn(geo: Geometry, move: MoveLike): string {
  const sep = move.captures.length > 0 ? 'x' : '-';
  return move.path.map((s) => pdnNumber(geo, s)).join(sep);
}
