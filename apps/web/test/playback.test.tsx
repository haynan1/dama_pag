import { buildLookahead, moveKey, Position, parseAlgebraic, Searcher } from '@dama/engine';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Board } from '../src/components/Board.tsx';
import { WatchBar } from '../src/components/game/WatchBar.tsx';
import { bestPlanLines, buildScene, linesForCandidate, MAX_PLIES } from '../src/lib/playback.ts';
import { usePlayback } from '../src/lib/usePlayback.ts';

afterEach(cleanup);

/** Linha qualquer de `n` lances a partir da posição inicial (primeiro lance legal a cada vez). */
function firstMoves(n: number): string[] {
  const pos = Position.initial('brazilian');
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    const m = pos.legalMoves()[0]!;
    keys.push(moveKey(m));
    pos.make(m);
  }
  return keys;
}

const START = Position.initial('brazilian').fen();

describe('roteiro da encenação', () => {
  it('encena até seis lances alternando você e o adversário e rebobina até a origem', () => {
    const scene = buildScene('brazilian', START, { title: 't', keys: firstMoves(9) });
    expect(scene.plies).toHaveLength(MAX_PLIES);
    expect(scene.plies.map((p) => p.actor)).toEqual(['you', 'them', 'you', 'them', 'you', 'them']);
    // Abertura + 6 lances + 6 quadros de rebobinar.
    expect(scene.frames).toHaveLength(1 + 2 * MAX_PLIES);
    expect(scene.frames[0]!.phase).toBe('intro');
    expect(scene.frames.at(-1)!.fen).toBe(START);
    expect(scene.frames.at(-1)!.phase).toBe('rewind');
    // O rebobinar anda no caminho inverso do lance.
    const lastPlay = scene.frames[MAX_PLIES]!;
    const firstRewind = scene.frames[MAX_PLIES + 1]!;
    expect(firstRewind.lastMove!.path).toEqual([...lastPlay.lastMove!.path].reverse());
  });

  it('descreve casas na mesma notação escrita no tabuleiro', () => {
    const scene = buildScene('brazilian', START, { title: 't', keys: firstMoves(1) });
    const ply = scene.plies[0]!;
    expect(ply.piece).toBe('pedra');
    expect(ply.squares).toHaveLength(2);
    for (const sq of ply.squares) expect(sq).toMatch(/^[a-h][1-8]$/);
  });

  it('para no primeiro lance que não cabe mais na posição', () => {
    const keys = firstMoves(4);
    const scene = buildScene('brazilian', START, {
      title: 't',
      keys: [keys[0]!, keys[1]!, 'lixo', keys[3]!],
    });
    expect(scene.plies).toHaveLength(2);
  });

  it('o plano principal vira uma linha por resposta do adversário, todas legais', () => {
    const tree = buildLookahead(new Searcher(4), Position.initial('brazilian'), { depth: 4, timeMs: 600 });
    const lines = bestPlanLines(tree);
    expect(lines).toHaveLength(tree.nodes[0]!.children.length);
    expect(linesForCandidate(tree.nodes[0]!)).toEqual(lines);
    for (const line of lines) {
      expect(line.keys[0]).toBe(tree.nodes[0]!.key);
      const scene = buildScene('brazilian', START, line);
      expect(scene.plies.length).toBeGreaterThanOrEqual(3);
      expect(scene.plies[0]!.note).toBe(tree.nodes[0]!.insight.headline);
    }
  });
});

describe('relógio da encenação', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('avança sozinho, termina na origem e encerra', () => {
    const { result } = renderHook(() => usePlayback('brazilian', START));
    act(() => result.current.watch([{ title: 'a', keys: firstMoves(2) }]));
    expect(result.current.active).toBe(true);
    expect(result.current.frame!.phase).toBe('intro');
    act(() => {
      vi.advanceTimersByTime(result.current.frame!.hold);
    });
    expect(result.current.frame!.phase).toBe('play');
    // Cada quadro agenda o seguinte depois de renderizar: avança quadro a quadro.
    const phases = new Set<string>();
    for (let i = 0; i < 20 && result.current.active; i++) {
      phases.add(result.current.frame!.phase);
      act(() => {
        vi.advanceTimersByTime(result.current.frame!.hold);
      });
    }
    expect([...phases]).toEqual(['play', 'rewind']);
    expect(result.current.active).toBe(false);
    expect(result.current.frame).toBeNull();
  });

  it('pausado não avança; posição nova encerra', () => {
    const { result, rerender } = renderHook(({ fen }) => usePlayback('brazilian', fen), {
      initialProps: { fen: START },
    });
    act(() => result.current.watch([{ title: 'a', keys: firstMoves(2) }]));
    act(() => result.current.togglePause());
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.frame!.phase).toBe('intro');

    const after = Position.initial('brazilian');
    after.make(after.legalMoves()[0]!);
    rerender({ fen: after.fen() });
    expect(result.current.active).toBe(false);
  });

  it('pula para a próxima linha', () => {
    const { result } = renderHook(() => usePlayback('brazilian', START));
    act(() =>
      result.current.watch([
        { title: 'a', keys: firstMoves(2) },
        { title: 'b', keys: firstMoves(3) },
      ]),
    );
    act(() => result.current.next());
    expect(result.current.sceneIndex).toBe(1);
    expect(result.current.scene!.title).toBe('b');
  });
});

describe('narração e mapa de casas', () => {
  it('narra quem joga e de onde para onde', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePlayback('brazilian', START));
    act(() => result.current.watch([{ title: 'Linha de teste', keys: firstMoves(1) }]));
    act(() => {
      vi.advanceTimersByTime(result.current.frame!.hold);
    });
    render(<WatchBar playback={result.current} />);
    const [from, to] = result.current.scene!.plies[0]!.squares;
    expect(screen.getByText('Você')).toBeTruthy();
    expect(screen.getByText(from!)).toBeTruthy();
    expect(screen.getByText(to!)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Parar e voltar ao jogo' })).toBeTruthy();
    vi.useRealTimers();
  });

  it('escreve o nome em cada casa escura, e só quando pedido', () => {
    const props = {
      variant: 'brazilian',
      fen: START,
      orientation: 'white',
      movable: null,
      label: 't',
    } as const;
    const { container, rerender } = render(<Board {...props} coordinates />);
    const names = [...container.querySelectorAll('[aria-hidden="true"] span')].map((n) => n.textContent);
    expect(names.filter((n) => /^[a-h][1-8]$/.test(n ?? ''))).toHaveLength(32);
    expect(names).toContain('d4');
    rerender(<Board {...props} coordinates={false} />);
    expect(screen.queryByText('d4')).toBeNull();
  });
});

/** Posição a partir de casas algébricas (prefixo `K` = dama). */
function fenOf(side: 'W' | 'B', white: string[], black: string[]): string {
  const pos = Position.empty('brazilian');
  const place = (list: string[], sign: number) => {
    for (const s of list) {
      const king = s.startsWith('K');
      pos.board[parseAlgebraic(pos.geo, king ? s.slice(1) : s)] = sign * (king ? 2 : 1);
    }
  };
  place(white, 1);
  place(black, -1);
  pos.side = side === 'W' ? 1 : -1;
  return pos.fen();
}

function onlyMove(fen: string): string {
  return moveKey(Position.fromFen('brazilian', fen).legalMoves()[0]!);
}

describe('roteiro: casos de borda', () => {
  it('marca a coroação', () => {
    const fen = fenOf('W', ['g7'], ['a5']);
    const key = moveKey(
      Position.fromFen('brazilian', fen)
        .legalMoves()
        .find((m) => m.to !== m.from)!,
    );
    const scene = buildScene('brazilian', fen, { title: 't', keys: [key] });
    expect(scene.plies[0]!.promotes).toBe(true);
    // Rebobinar devolve a pedra (não a dama) à origem.
    expect(scene.frames.at(-1)!.fen).toBe(Position.fromFen('brazilian', fen).fen());
  });

  it('captura múltipla narra quantas peças e o caminho inteiro', () => {
    vi.useFakeTimers();
    const fen = fenOf('W', ['c3'], ['d4', 'f6', 'a7']);
    const { result } = renderHook(() => usePlayback('brazilian', fen));
    act(() => result.current.watch([{ title: 'golpe', keys: [onlyMove(fen)] }]));
    act(() => {
      vi.advanceTimersByTime(result.current.frame!.hold);
    });
    render(<WatchBar playback={result.current} />);
    expect(screen.getByText(/captura 2 peças com a pedra/)).toBeTruthy();
    for (const sq of ['c3', 'e5', 'g7']) expect(screen.getByText(sq)).toBeTruthy();
    vi.useRealTimers();
  });

  it('dama é chamada de dama', () => {
    const fen = fenOf('W', ['Kd4'], ['a7']);
    const scene = buildScene('brazilian', fen, { title: 't', keys: [onlyMove(fen)] });
    expect(scene.plies[0]!.piece).toBe('dama');
    expect(scene.plies[0]!.promotes).toBe(false);
  });

  it('linhas sem nenhum lance legal não iniciam a encenação', () => {
    const { result } = renderHook(() => usePlayback('brazilian', START));
    let started = true;
    act(() => {
      started = result.current.watch([{ title: 'x', keys: ['lixo'] }]);
    });
    expect(started).toBe(false);
    expect(result.current.active).toBe(false);
  });

  it('sem posição ainda (partida carregando), assistir não faz nada', () => {
    const { result } = renderHook(() => usePlayback(undefined, undefined));
    act(() => result.current.watch([{ title: 'a', keys: firstMoves(2) }]));
    expect(result.current.active).toBe(false);
  });

  it('árvore vazia não tem plano para assistir; lance que encerra o jogo vira uma linha só', () => {
    expect(bestPlanLines({ rootSide: 1, depth: 1, timeMs: 0, nodes: [], bestLine: [], summary: '' })).toEqual(
      [],
    );
    const leaf = {
      key: 'k',
      notation: 'c3-d4',
      path: [9, 13],
      captures: [],
      side: 1 as const,
      score: 0,
      insight: { tags: [], headline: 'h', details: [] },
      continuation: [],
      children: [],
    };
    expect(linesForCandidate(leaf)).toEqual([{ title: 'Você joga c3-d4', keys: ['k'], notes: ['h'] }]);
  });
});

describe('controles do player', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const twoLines = () => [
    { title: 'a', keys: firstMoves(4) },
    { title: 'b', keys: firstMoves(4) },
  ];

  it('Esc encerra', () => {
    const { result } = renderHook(() => usePlayback('brazilian', START));
    act(() => result.current.watch(twoLines()));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.active).toBe(false);
  });

  it('"anterior" no meio da linha recomeça a linha; no início volta para a anterior', () => {
    const { result } = renderHook(() => usePlayback('brazilian', START));
    act(() => result.current.watch(twoLines(), 1));
    expect(result.current.sceneIndex).toBe(1);
    for (let i = 0; i < 3; i++)
      act(() => {
        vi.advanceTimersByTime(result.current.frame!.hold);
      });
    expect(result.current.frame!.ply).toBeGreaterThan(0);
    act(() => result.current.previous());
    expect(result.current.sceneIndex).toBe(1);
    expect(result.current.frame!.phase).toBe('intro');
    act(() => result.current.previous());
    expect(result.current.sceneIndex).toBe(0);
  });

  it('devagar alonga só a pausa de leitura entre lances', () => {
    const { result } = renderHook(() => usePlayback('brazilian', START));
    act(() => result.current.watch(twoLines()));
    act(() => result.current.setSpeed('slow'));
    // A abertura não alonga.
    act(() => {
      vi.advanceTimersByTime(result.current.frame!.hold);
    });
    const play = result.current.frame!;
    expect(play.phase).toBe('play');
    act(() => {
      vi.advanceTimersByTime(play.hold + 1);
    });
    expect(result.current.frame).toBe(play);
    act(() => {
      vi.advanceTimersByTime(play.hold);
    });
    expect(result.current.frame).not.toBe(play);
  });

  it('traz o tabuleiro para a tela ao começar, se ele estiver fora dela', () => {
    const el = document.createElement('div');
    const scroll = vi.fn();
    el.scrollIntoView = scroll;
    el.getBoundingClientRect = () => ({ top: -500, bottom: -100 }) as DOMRect;
    window.matchMedia ??= (() => ({ matches: false })) as unknown as typeof window.matchMedia;
    const { result } = renderHook(() => usePlayback('brazilian', START, { current: el }));
    act(() => result.current.watch(twoLines()));
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }));
  });
});
