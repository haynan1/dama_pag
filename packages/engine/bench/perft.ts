import { Position } from '../src/position.ts';
import type { VariantId } from '../src/variants.ts';

export function perft(pos: Position, depth: number): number {
  const moves = pos.legalMoves();
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) {
    pos.make(m);
    n += perft(pos, depth - 1);
    pos.unmake();
  }
  return n;
}

if (import.meta.main) {
  const variant = (process.argv[2] ?? 'brazilian') as VariantId;
  const max = Number(process.argv[3] ?? 7);
  const pos = Position.initial(variant);
  for (let d = 1; d <= max; d++) {
    const t = performance.now();
    const n = perft(pos, d);
    const ms = performance.now() - t;
    console.log(
      `${variant} perft(${d}) = ${n}  ${ms.toFixed(0)}ms  ${(((n / ms) * 1000) / 1e6).toFixed(2)}M/s`,
    );
  }
}
