import type { Lookahead, LookaheadNode } from '@dama/engine';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LookaheadTree } from '../src/components/game/LookaheadTree.tsx';
import { setCoordinates, useCoordinates } from '../src/lib/preferences.ts';

afterEach(cleanup);

function node(
  key: string,
  side: 1 | -1,
  children: LookaheadNode[] = [],
  continuation: string[] = [],
): LookaheadNode {
  return {
    key,
    notation: key,
    path: [0, 4],
    captures: [],
    side,
    score: 0,
    insight: { tags: [], headline: `por que ${key}`, details: [] },
    continuation,
    children,
  };
}

const tree: Lookahead = {
  rootSide: 1,
  depth: 6,
  timeMs: 900,
  bestLine: ['c3-d4', 'f6-e5', 'd4xf6'],
  summary: 'Melhor plano: c3-d4.',
  nodes: [
    node('c3-d4', 1, [
      node('f6-e5', -1, [node('d4xf6', 1, [], ['g7xe5', 'g3-f4'])]),
      node('h6-g5', -1, [node('a3-b4', 1, [], ['b6-a5'])]),
    ]),
    node('e3-f4', 1, [node('f6-g5', -1)]),
  ],
};

describe('Árvore de 3 jogadas: assistir', () => {
  it('o botão principal assiste o melhor plano contra cada resposta, até a continuação do motor', () => {
    const onWatch = vi.fn();
    render(<LookaheadTree tree={tree} onPreview={() => {}} onWatch={onWatch} />);
    fireEvent.click(screen.getByRole('button', { name: /Assistir no tabuleiro/ }));
    const [lines] = onWatch.mock.calls[0]!;
    expect(lines).toHaveLength(2);
    expect(lines[0].keys).toEqual(['c3-d4', 'f6-e5', 'd4xf6', 'g7xe5', 'g3-f4']);
    expect(lines[0].notes).toEqual(['por que c3-d4', 'por que f6-e5', 'por que d4xf6']);
    expect(lines[1].title).toBe('Se o adversário responder h6-g5');
    expect(screen.getByText(/mostra as 2 respostas do adversário/)).toBeTruthy();
  });

  it('cada resposta e cada continuação têm o seu próprio "assistir"', () => {
    const onWatch = vi.fn();
    render(<LookaheadTree tree={tree} onPreview={() => {}} onWatch={onWatch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assistir c3-d4 e a resposta h6-g5' }));
    expect(onWatch.mock.calls[0]![0]).toHaveLength(1);
    expect(onWatch.mock.calls[0]![0][0].keys).toEqual(['c3-d4', 'h6-g5', 'a3-b4', 'b6-a5']);

    fireEvent.click(screen.getByRole('button', { name: /Assistir c3-d4 contra cada resposta/ }));
    expect(onWatch.mock.calls[1]![0]).toHaveLength(2);

    fireEvent.click(screen.getByTitle(/por que d4xf6 — toque para assistir/));
    expect(onWatch.mock.calls[2]![0][0].title).toBe('Você continua com d4xf6');
  });

  it('começar a assistir apaga a prévia de setas', () => {
    const onPreview = vi.fn();
    render(<LookaheadTree tree={tree} onPreview={onPreview} onWatch={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Assistir no tabuleiro/ }));
    expect(onPreview).toHaveBeenLastCalledWith(null);
  });

  it('sem onWatch (onde não se pode encenar) não oferece botões de assistir', () => {
    render(<LookaheadTree tree={tree} onPreview={() => {}} />);
    expect(screen.queryByRole('button', { name: /Assistir/ })).toBeNull();
  });
});

describe('Preferência: nome das casas', () => {
  afterEach(() => {
    setCoordinates(true);
    vi.restoreAllMocks();
  });

  it('liga por padrão, persiste e avisa todas as telas abertas', () => {
    const a = renderHook(() => useCoordinates());
    const b = renderHook(() => useCoordinates());
    expect(a.result.current[0]).toBe(true);
    act(() => a.result.current[1](false));
    expect(b.result.current[0]).toBe(false);
    expect(localStorage.getItem('dama:coordinates')).toBe('0');
  });

  it('acompanha a mudança feita em outra aba', () => {
    const { result } = renderHook(() => useCoordinates());
    localStorage.setItem('dama:coordinates', '0');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'dama:coordinates' }));
    });
    expect(result.current[0]).toBe(false);
  });

  it('sem armazenamento (janela privada) continua funcionando na sessão', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    const { result } = renderHook(() => useCoordinates());
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });
});
