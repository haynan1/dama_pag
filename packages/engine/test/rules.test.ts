import { describe, expect, it } from 'vitest';
import { perft } from '../bench/perft.ts';
import { BLACK, Game, moveKey, moveNotation, Position, parseAlgebraic, WHITE } from '../src/index.ts';
import { setup } from './helpers.ts';

const notations = (pos: Position) =>
  pos
    .legalMoves()
    .map((m) => moveNotation(pos.geo, m))
    .sort();

describe('gerador de lances — perft', () => {
  it('internacional 10×10 bate os valores de referência publicados', () => {
    const expected = [9, 81, 658, 4265, 27117, 167140];
    const pos = Position.initial('international');
    for (const [i, n] of expected.entries()) expect(perft(pos, i + 1)).toBe(n);
  });

  it('brasileira 8×8 bate os valores de referência', () => {
    const expected = [7, 49, 302, 1469, 7473, 37628, 187302];
    const pos = Position.initial('brazilian');
    for (const [i, n] of expected.entries()) expect(perft(pos, i + 1)).toBe(n);
  });

  it('canadense 12×12 abre com 11 lances', () => {
    expect(Position.initial('canadian').legalMoves()).toHaveLength(11);
  });
});

describe('regras brasileiras', () => {
  it('posição inicial tem 12 pedras de cada lado e brancas começam', () => {
    const pos = Position.initial('brazilian');
    expect(pos.pieceCount(WHITE)).toBe(12);
    expect(pos.pieceCount(BLACK)).toBe(12);
    expect(pos.side).toBe(WHITE);
    expect(notations(pos)).toEqual(['a3-b4', 'c3-b4', 'c3-d4', 'e3-d4', 'e3-f4', 'g3-f4', 'g3-h4']);
  });

  it('pedra captura para trás', () => {
    const pos = setup(WHITE, ['d4'], ['c3']);
    expect(notations(pos)).toEqual(['d4xb2']);
  });

  it('pedra não anda para trás sem capturar', () => {
    const pos = setup(WHITE, ['d4'], ['h8']);
    expect(notations(pos)).toEqual(['d4-c5', 'd4-e5']);
  });

  it('captura é obrigatória', () => {
    const pos = setup(WHITE, ['c3', 'g3'], ['d4']);
    expect(notations(pos)).toEqual(['c3xe5']);
  });

  it('lei da maioria: obriga a sequência que captura mais peças', () => {
    const pos = setup(WHITE, ['c3', 'e1'], ['d4', 'f6', 'f2']);
    expect(notations(pos)).toEqual(['c3xe5xg7']);
  });

  it('dama voadora escolhe qualquer casa livre após a peça capturada', () => {
    const pos = setup(WHITE, ['Ka1'], ['c3']);
    expect(notations(pos)).toEqual(['a1xd4', 'a1xe5', 'a1xf6', 'a1xg7', 'a1xh8']);
  });

  it('dama deve pousar onde a captura continua', () => {
    const pos = setup(WHITE, ['Ka1'], ['c3', 'f4']);
    expect(notations(pos)).toEqual(['a1xe5xg3', 'a1xe5xh2']);
  });

  it('pedra que passa pela última fileira no meio da captura não é promovida', () => {
    const pos = setup(WHITE, ['f6'], ['e7', 'c7']);
    const moves = pos.legalMoves();
    expect(moves.map((m) => moveNotation(pos.geo, m))).toEqual(['f6xd8xb6']);
    expect(moves[0]!.promotes).toBe(false);
    pos.make(moves[0]!);
    expect(pos.board[parseAlgebraic(pos.geo, 'b6')]).toBe(1);
  });

  it('pedra que termina a captura na última fileira é promovida', () => {
    const pos = setup(WHITE, ['f6'], ['e7']);
    const [move] = pos.legalMoves();
    expect(move!.promotes).toBe(true);
    pos.make(move!);
    expect(pos.board[parseAlgebraic(pos.geo, 'd8')]).toBe(2);
    expect(pos.counts[1]).toBe(1);
  });

  it('peça capturada não pode ser saltada duas vezes (captura circular)', () => {
    // d4 dá a volta capturando c5, c7, e7 e e5 e termina na própria origem; c5 não pode ser
    // capturada de novo. Os dois sentidos da volta são o mesmo lance.
    const pos = setup(WHITE, ['d4'], ['c5', 'c7', 'e7', 'e5']);
    const moves = pos.legalMoves();
    expect(moves).toHaveLength(1);
    expect(moves[0]!.captures).toHaveLength(4);
    expect(moves[0]!.from).toBe(moves[0]!.to);
    pos.make(moves[0]!);
    expect(pos.pieceCount(BLACK)).toBe(0);
    expect(pos.board[parseAlgebraic(pos.geo, 'd4')]).toBe(1);
  });

  it('make/unmake restaura exatamente a posição e o hash', () => {
    const pos = Position.initial('brazilian');
    const fen = pos.fen();
    const key = pos.key();
    const walk = (depth: number): void => {
      if (depth === 0) return;
      for (const m of pos.legalMoves()) {
        pos.make(m);
        walk(depth - 1);
        pos.unmake();
      }
    };
    walk(4);
    expect(pos.fen()).toBe(fen);
    expect(pos.key()).toBe(key);
  });

  it('hash incremental coincide com o recalculado', () => {
    const game = Game.create('brazilian');
    for (let i = 0; i < 20 && !game.result; i++) game.play(game.legalMoves()[i % game.legalMoves().length]!);
    const fresh = Position.fromFen('brazilian', game.position.fen());
    expect(game.position.key()).toBe(fresh.key());
  });

  it('FEN ida e volta', () => {
    for (const v of ['brazilian', 'international', 'canadian'] as const) {
      const pos = Position.initial(v);
      expect(Position.fromFen(v, pos.fen()).fen()).toBe(pos.fen());
    }
    const pos = Position.fromFen('brazilian', 'B:W5-7,K30:B20');
    expect(pos.side).toBe(BLACK);
    expect(pos.counts[1]).toBe(1);
    expect(() => Position.fromFen('brazilian', 'X:W1')).toThrow();
    expect(() => Position.fromFen('brazilian', 'W:W99')).toThrow();
    expect(() => Position.fromFen('brazilian', 'W:W1:B1')).toThrow();
    // Pedra branca na última fileira (casa 1) ou preta na primeira (casa 32) é impossível.
    expect(() => Position.fromFen('brazilian', 'W:W1:B20')).toThrow(/coroação/);
    expect(() => Position.fromFen('brazilian', 'W:W20:B32')).toThrow(/coroação/);
    expect(Position.fromFen('brazilian', 'W:WK1:BK32').counts[1]).toBe(1);
  });
});

describe('fim de partida', () => {
  it('sem lances = derrota', () => {
    const game = Game.create('brazilian', setup(WHITE, ['c3'], ['d4']).fen());
    game.play(game.legalMoves()[0]!);
    expect(game.result).toEqual({ winner: WHITE, reason: 'no-moves' });
  });

  it('repetição tripla = empate', () => {
    const game = Game.create('brazilian', setup(WHITE, ['Ka1', 'Kc1'], ['Kh8', 'Kf8']).fen());
    const shuffle = ['c1', 'd2', 'f8', 'e7', 'd2', 'c1', 'e7', 'f8'];
    const play = (from: string, to: string) => {
      const pos = game.position;
      const m = pos
        .legalMoves()
        .find((x) => x.from === parseAlgebraic(pos.geo, from) && x.to === parseAlgebraic(pos.geo, to));
      game.play(m!);
    };
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < shuffle.length; i += 2) play(shuffle[i]!, shuffle[i + 1]!);
    }
    expect(game.result).toEqual({ winner: null, reason: 'repetition' });
  });

  it('20 lances só de damas de cada lado = empate', () => {
    const game = Game.create('brazilian', setup(WHITE, ['Ka1', 'Kc1'], ['Kh8', 'Kf8']).fen());
    let guard = 0;
    while (!game.result && guard++ < 100) {
      // Escolhe lances que não repetem posição para testar só a contagem.
      const moves = game.legalMoves().filter((m) => m.captures.length === 0);
      const key = new Set<number>();
      const pick =
        moves.find((m) => {
          game.position.make(m);
          const ok = game.position.repetitions() === 1 && !game.position.hasCapture(game.position.side);
          if (ok) key.add(game.position.key());
          game.position.unmake();
          return ok;
        }) ?? moves[0]!;
      game.play(pick);
    }
    expect(game.result?.winner).toBeNull();
    expect(['kings-only', 'repetition']).toContain(game.result?.reason);
  });

  it('desfazer reabre a partida', () => {
    const game = Game.create('brazilian', setup(WHITE, ['c3'], ['d4']).fen());
    game.play(game.legalMoves()[0]!);
    expect(game.result).not.toBeNull();
    game.undo();
    expect(game.result).toBeNull();
    expect(game.ply).toBe(0);
  });

  it('replay reconstrói a partida pelas chaves e rejeita lance ilegal', () => {
    const game = Game.create('brazilian');
    for (let i = 0; i < 10; i++) game.play(game.legalMoves()[0]!);
    const keys = game.moves.map((m) => m.key);
    const copy = Game.replay('brazilian', game.startFen, keys);
    expect(copy.position.fen()).toBe(game.position.fen());
    expect(() => Game.replay('brazilian', game.startFen, ['0-99'])).toThrow();
  });

  it('exporta PDN com GameType brasileiro', () => {
    const game = Game.create('brazilian');
    game.play(game.legalMoves()[0]!);
    game.play(game.legalMoves()[0]!);
    const pdn = game.pdn({ White: 'Ana', Black: 'IA "nível 5"' });
    expect(pdn).toContain('[GameType "26"]');
    expect(pdn).toContain('[Black "IA \\"nível 5\\""]');
    expect(pdn).toMatch(/1\. \d+-\d+ \d+-\d+ \*/);
  });

  it('chave de lance é estável e independe da ordem das capturas', () => {
    expect(moveKey({ from: 1, to: 9, captures: [7, 3] })).toBe(moveKey({ from: 1, to: 9, captures: [3, 7] }));
  });
});
