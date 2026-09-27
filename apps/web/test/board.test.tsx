import { moveKey, Position } from '@dama/engine';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Board } from '../src/components/Board.tsx';

afterEach(cleanup);

describe('Tabuleiro', () => {
  it('renderiza só as casas escuras como botões acessíveis', () => {
    render(
      <Board
        variant="brazilian"
        fen={Position.initial('brazilian').fen()}
        orientation="white"
        movable={null}
        label="tab"
      />,
    );
    const squares = screen.getAllByRole('button');
    expect(squares).toHaveLength(32);
    expect(screen.getByRole('button', { name: 'c3, pedra branca' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'd4' })).toBeTruthy();
  });

  it('seleciona pelo teclado e envia a chave do lance', () => {
    const onMove = vi.fn();
    render(
      <Board
        variant="brazilian"
        fen={Position.initial('brazilian').fen()}
        orientation="white"
        movable="white"
        onMove={onMove}
        label="tab"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'c3, pedra branca' }));
    expect(screen.getByRole('button', { name: /c3, pedra branca, selecionada/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /d4, destino possível/ }));
    const pos = Position.initial('brazilian');
    const expected = pos.legalMoves().find((m) => m.path.length === 2 && m.from === 9 && m.to === 13)!;
    expect(onMove).toHaveBeenCalledWith(moveKey(expected), expect.objectContaining({ from: 9, to: 13 }));
  });

  it('com captura obrigatória só oferece o destino da captura', () => {
    const onMove = vi.fn();
    // Brancas c3 e g3, pretas d4: c3 é obrigada a capturar.
    render(
      <Board
        variant="brazilian"
        fen="W:W22,24:B18"
        orientation="white"
        movable="white"
        onMove={onMove}
        label="tab"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'g3, pedra branca' }));
    expect(screen.queryByRole('button', { name: /destino possível/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'c3, pedra branca' }));
    fireEvent.click(screen.getByRole('button', { name: /e5, destino possível/ }));
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('não permite mover quando não é a vez do usuário', () => {
    const onMove = vi.fn();
    render(
      <Board
        variant="brazilian"
        fen={Position.initial('brazilian').fen()}
        orientation="black"
        movable="black"
        onMove={onMove}
        label="tab"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'c3, pedra branca' }));
    expect(screen.queryByRole('button', { name: /destino possível/ })).toBeNull();
  });
});
