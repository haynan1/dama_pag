import { Position } from '@dama/engine';
import { afterAll, describe, expect, it } from 'vitest';
import { AiBusyError, AiPool } from '../src/ai/pool.ts';

const pool = new AiPool(1, 2);
afterAll(() => pool.close());

describe('pool da IA', () => {
  it('recusa análises além do teto da fila, mas nunca o lance da IA', async () => {
    const fen = Position.initial('international').fen();
    const analyze = () =>
      pool.run({ kind: 'analyze', variant: 'international', fen, multiPv: 1, depth: 30, timeMs: 400 });
    const running = analyze();
    const queued = [analyze(), analyze()];
    await expect(analyze()).rejects.toBeInstanceOf(AiBusyError);
    const move = pool.run({
      kind: 'ai-move',
      variant: 'brazilian',
      startFen: Position.initial('brazilian').fen(),
      moves: [],
      level: 1,
      seed: 1,
    });
    const results = await Promise.all([running, ...queued, move]);
    expect(results).toHaveLength(4);
    expect(results[3]).toMatchObject({ key: expect.any(String) });
  });

  it('rejeita tarefa inválida sem derrubar a thread', async () => {
    await expect(
      pool.run({ kind: 'analyze', variant: 'brazilian', fen: 'lixo', multiPv: 1, depth: 2, timeMs: 100 }),
    ).rejects.toThrow(/FEN/);
    const ok = await pool.run({
      kind: 'analyze',
      variant: 'brazilian',
      fen: 'W:W22:B18',
      multiPv: 1,
      depth: 2,
      timeMs: 100,
    });
    expect(ok.lines.length).toBe(1);
  });
});
