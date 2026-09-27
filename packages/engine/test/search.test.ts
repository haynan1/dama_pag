import { describe, expect, it } from 'vitest';
import {
  AI_LEVELS,
  buildLookahead,
  chooseMove,
  evaluate,
  formatScore,
  Game,
  hint,
  MATE,
  moveAccuracy,
  moveNotation,
  Position,
  reviewMove,
  Searcher,
  WHITE,
} from '../src/index.ts';
import { setup } from './helpers.ts';

const searcher = new Searcher(16);

describe('avaliação', () => {
  it('posição inicial é equilibrada e simétrica', () => {
    const pos = Position.initial('brazilian');
    expect(Math.abs(evaluate(pos))).toBeLessThan(30);
    const mirrored = Position.fromFen('brazilian', `B${pos.fen().slice(1)}`);
    expect(evaluate(mirrored)).toBe(-evaluate(pos));
  });

  it('vantagem material domina', () => {
    expect(evaluate(setup(WHITE, ['c3', 'e3'], ['f6']))).toBeGreaterThan(80);
    expect(evaluate(setup(WHITE, ['Kc3'], ['f6', 'h6']))).toBeGreaterThan(50);
  });

  it('dama contra dama tende a zero', () => {
    expect(Math.abs(evaluate(setup(WHITE, ['Ka1', 'Kc1'], ['Kh8'])))).toBeLessThan(60);
  });
});

describe('busca', () => {
  it('encontra vitória imediata', () => {
    const r = searcher.search(setup(WHITE, ['c3'], ['d4']), { depth: 4 });
    expect(r.lines[0]!.score).toBe(MATE - 1);
  });

  it('não entrega peça quando há lance seguro', () => {
    // c3-d4 e g3-f4 entregam a pedra para e5; c3-b4 e g3-h4 são seguros.
    const pos = setup(WHITE, ['c3', 'g3'], ['e5', 'h8']);
    const best = searcher.search(pos, { depth: 8 }).lines[0]!;
    expect(['c3-b4', 'g3-h4']).toContain(moveNotation(pos.geo, best.move));
  });

  it('multiPV devolve linhas ordenadas com pontuação exata', () => {
    const r = searcher.search(Position.initial('brazilian'), { depth: 6, multiPv: 4 });
    expect(r.lines).toHaveLength(4);
    for (let i = 1; i < r.lines.length; i++)
      expect(r.lines[i - 1]!.score).toBeGreaterThanOrEqual(r.lines[i]!.score);
    expect(r.lines[0]!.pv.length).toBeGreaterThan(1);
  });

  it('respeita limite de tempo', () => {
    const t = performance.now();
    searcher.search(Position.initial('international'), { timeMs: 300 });
    expect(performance.now() - t).toBeLessThan(900);
  });

  it('IA forte vence IA fraca', () => {
    const game = Game.create('brazilian');
    let rng = 7;
    const random = () => {
      rng = (rng * 16807) % 2147483647;
      return rng / 2147483647;
    };
    while (!game.result && game.ply < 160) {
      const level = game.turn === WHITE ? 6 : 1;
      game.play(chooseMove(searcher, game.position, level, random)!.move);
    }
    expect(game.result?.winner).toBe(WHITE);
  });

  it('níveis têm rating crescente', () => {
    for (let i = 1; i < AI_LEVELS.length; i++)
      expect(AI_LEVELS[i]!.rating).toBeGreaterThan(AI_LEVELS[i - 1]!.rating);
  });
});

describe('mentor', () => {
  it('classifica lance que entrega peça como erro', () => {
    const pos = setup(WHITE, ['c3', 'g3'], ['e5', 'h8']);
    const d4 = pos.legalMoves().find((m) => m.to === pos.geo.squareAt(3, 3))!;
    const review = reviewMove(searcher, pos, `${d4.from}-${d4.to}`, { depth: 8 });
    expect(['mistake', 'blunder']).toContain(review.classification);
    expect(review.played.insight.tags).toContain('hangs');
    expect(review.accuracy).toBeLessThan(60);
  });

  it('melhor lance recebe classificação máxima', () => {
    const pos = setup(WHITE, ['c3', 'g3'], ['e5', 'h8']);
    const best = searcher.search(pos, { depth: 8 }).lines[0]!;
    const review = reviewMove(searcher, pos, `${best.move.from}-${best.move.to}`, { depth: 8 });
    expect(['best', 'brilliant']).toContain(review.classification);
    expect(review.accuracy).toBeGreaterThan(95);
  });

  it('dica aponta a peça e o lance', () => {
    const h = hint(searcher, setup(WHITE, ['c3', 'g3'], ['d4']), { depth: 4 })!;
    expect(h.squareName).toBe('c3');
    expect(h.best.notation).toBe('c3xe5');
    expect(h.best.insight.tags).toContain('capture');
  });

  it('árvore de três jogadas tem três níveis e pontuações do ponto de vista de quem pediu', () => {
    const tree = buildLookahead(searcher, Position.initial('brazilian'), { depth: 6, timeMs: 1500 });
    expect(tree.nodes.length).toBe(4);
    expect(tree.nodes[0]!.children.length).toBeGreaterThan(0);
    expect(tree.nodes[0]!.children[0]!.children.length).toBeGreaterThan(0);
    expect(tree.nodes[0]!.side).toBe(WHITE);
    expect(tree.nodes[0]!.children[0]!.side).toBe(-1);
    expect(tree.bestLine).toHaveLength(3);
    expect(tree.summary).toContain('Melhor plano');
  });

  it('captura seguida de recaptura é troca, não sacrifício', () => {
    // Brancas d4 capturam c5 e caem em b6, onde a7 recaptura.
    const pos = setup(WHITE, ['d4', 'g1'], ['c5', 'a7', 'h8']);
    const h = hint(searcher, pos, { depth: 6 })!;
    expect(h.best.notation).toBe('d4xb6');
    expect(h.best.insight.tags).toContain('exchange');
    expect(h.best.insight.tags).not.toContain('sacrifice');
    expect(h.best.insight.headline).toBe('Troca de peças');
  });

  it('formata pontuações', () => {
    expect(formatScore(0)).toBe('0.0');
    expect(formatScore(4)).toBe('0.0');
    expect(formatScore(150)).toBe('+1.5');
    expect(formatScore(-230)).toBe('−2.3');
    expect(formatScore(MATE - 5)).toBe('V5');
    expect(formatScore(-(MATE - 4))).toBe('D4');
  });

  it('precisão é 100 para o melhor lance e cai com a perda', () => {
    expect(moveAccuracy(50, 50)).toBeCloseTo(100, 0);
    expect(moveAccuracy(50, -300)).toBeLessThan(40);
  });
});
