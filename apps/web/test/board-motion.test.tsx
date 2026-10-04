import { Position } from '@dama/engine';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Board, type Pace } from '../src/components/Board.tsx';
import { moveDuration, TEMPO } from '../src/lib/motion.ts';

interface Call {
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  anim: { finish: ReturnType<typeof vi.fn> };
}

let calls: Call[] = [];

beforeEach(() => {
  calls = [];
  // jsdom não implementa Web Animations: registramos o que o tabuleiro pediria ao navegador.
  HTMLElement.prototype.animate = vi.fn(function (
    this: HTMLElement,
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    const end = Number(options.delay ?? 0) + Number(options.duration);
    const anim = {
      finish: vi.fn(),
      cancel: vi.fn(),
      currentTime: 0,
      effect: { target: this, getComputedTiming: () => ({ endTime: end }) },
      onfinish: null,
      oncancel: null,
    };
    calls.push({ frames, options, anim });
    return anim as unknown as Animation;
  }) as unknown as HTMLElement['animate'];
});

afterEach(cleanup);

type Pick = (m: { from: number; to: number; captures: readonly number[] }) => boolean;

function play(fen: string, pick: Pick) {
  const pos = Position.fromFen('brazilian', fen);
  const move = pos.legalMoves().find(pick)!;
  pos.make(move);
  return { fen: pos.fen(), lastMove: { path: [...move.path], captures: [...move.captures] } };
}

/** Monta o tabuleiro em `startFen` e joga cada lance em sequência, com o ritmo indicado. */
function playSequence(startFen: string, steps: { pick: Pick; pace: Pace }[]) {
  const { rerender } = render(
    <Board variant="brazilian" fen={startFen} orientation="white" movable={null} label="tab" />,
  );
  let fen = startFen;
  for (const step of steps) {
    const after = play(fen, step.pick);
    fen = after.fen;
    rerender(
      <Board
        variant="brazilian"
        fen={fen}
        orientation="white"
        movable={null}
        lastMove={after.lastMove}
        pace={step.pace}
        label="tab"
      />,
    );
  }
  return calls;
}

const animateMove = (pace: Pace, startFen: string, pick: Pick) =>
  playSequence(startFen, [{ pick, pace }]).at(-1)!;

const INITIAL = Position.initial('brazilian').fen();
const simple = (m: { from: number; to: number }) => m.from === 9 && m.to === 13;
const capture = (m: { captures: readonly number[] }) => m.captures.length > 0;

const any = () => true;

describe('Animação do último lance', () => {
  it('navegando por lances (revisão, análise) é rápido', () => {
    const { options } = animateMove('quick', INITIAL, simple);
    expect(options.delay).toBe(0);
    expect(options.duration).toBeLessThan(300);
  });

  it('seu lance tem o mesmo ritmo encenado do adversário, mas sai na hora', () => {
    const own = animateMove('own', INITIAL, simple);
    cleanup();
    const opponent = animateMove('opponent', INITIAL, simple);
    expect(own.options.duration).toBe(opponent.options.duration);
    expect(Number(own.options.duration)).toBeGreaterThan(700);
    expect(own.options.delay).toBe(0);
    expect(Number(opponent.options.delay)).toBeGreaterThan(0);
  });

  it('a peça se ergue no trajeto e assenta no destino', () => {
    const { options, frames } = animateMove('opponent', INITIAL, simple);
    expect(options.fill).toBe('backwards');
    expect(String(frames[0]!.transform)).toContain('scale(1)');
    expect(frames.some((f) => String(f.transform).includes('scale(1.1)'))).toBe(true);
    expect(String(frames.at(-1)!.transform)).toContain('scale(1)');
    expect(frames.at(-1)!.offset).toBe(1);
  });

  it('resposta rápida da IA espera o seu lance terminar em vez de cortá-lo', () => {
    const [own, reply] = playSequence(INITIAL, [
      { pick: simple, pace: 'own' },
      { pick: any, pace: 'opponent' },
    ]);
    expect(own!.anim.finish).not.toHaveBeenCalled();
    const ownEnd = Number(own!.options.duration);
    expect(Number(reply!.options.delay)).toBeGreaterThan(ownEnd);
  });

  it('peças capturadas somem quando a peça passa por cima, não antes', () => {
    const { options } = animateMove('opponent', 'W:W22,24:B18', capture);
    const ghost = document.querySelector<HTMLElement>('[style*="animation-delay"]')!;
    expect(ghost).toBeTruthy();
    const delay = Number.parseFloat(ghost.style.animationDelay);
    expect(delay).toBeGreaterThan(Number(options.delay));
    expect(delay).toBeLessThan(Number(options.delay) + Number(options.duration));
  });

  it('um toque do usuário conclui a encenação na hora', () => {
    const { anim } = animateMove('opponent', INITIAL, simple);
    fireEvent.pointerDown(screen.getByRole('group'));
    expect(anim.finish).toHaveBeenCalled();
  });
});

describe('Rebobinar da encenação', () => {
  it('volta a peça pelo caminho inverso em vez de saltar, inclusive depois de uma captura', () => {
    // Brancas c3 capturam d4 e f6 (c3xe5xg7); o quadro seguinte desfaz o lance.
    const start = 'W:W22:B18,11';
    const after = play(start, capture);
    expect(after.lastMove.path).toHaveLength(3);
    const { rerender } = render(
      <Board variant="brazilian" fen={after.fen} orientation="white" movable={null} label="tab" />,
    );
    calls = [];
    rerender(
      <Board
        variant="brazilian"
        fen={start}
        orientation="white"
        movable={null}
        lastMove={{ path: [...after.lastMove.path].reverse(), captures: [] }}
        pace="quick"
        label="tab"
      />,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.anim.finish).not.toHaveBeenCalled();
  });
});

describe('Duração anunciada para a encenação do mentor', () => {
  it('bate com a animação que o tabuleiro de fato executa', () => {
    for (const pace of ['quick', 'own', 'opponent'] as const) {
      const { options } = animateMove(pace, INITIAL, simple);
      expect(Number(options.delay) + Number(options.duration)).toBe(moveDuration(pace, 1, false));
      cleanup();
      calls = [];
    }
    // Captura dupla: trajeto + o sumiço da última peça capturada.
    const { options } = animateMove('own', 'W:W22:B18,11', capture);
    expect(Number(options.delay) + Number(options.duration)).toBe(
      moveDuration('own', 2, true) - TEMPO.own.capture.vanish,
    );
  });
});
