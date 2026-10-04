import type { VariantId } from '@dama/engine';
import { type RefObject, useCallback, useEffect, useMemo, useState } from 'react';
import { buildScene, type Frame, type Scene, type WatchLine } from './playback.ts';

export type Speed = 'normal' | 'slow';

/** Leitura sem pressa: só o tempo parado entre lances cresce, a animação segue igual. */
const SLOW_FACTOR = 1.7;

export interface Playback {
  readonly active: boolean;
  readonly scenes: readonly Scene[];
  readonly sceneIndex: number;
  readonly scene: Scene | null;
  readonly frame: Frame | null;
  readonly paused: boolean;
  readonly speed: Speed;
  /** Começa a encenar; `false` se nenhuma linha cabe na posição (nada acontece). */
  watch(lines: readonly WatchLine[], startAt?: number): boolean;
  stop(): void;
  togglePause(): void;
  next(): void;
  previous(): void;
  setSpeed(speed: Speed): void;
}

interface Cursor {
  readonly scene: number;
  readonly frame: number;
}

/**
 * Relógio da encenação. `fen` é a posição de origem: se ela mudar (lance, desfazer, nova
 * posição na análise) a encenação para — o roteiro não vale mais.
 */
export function usePlayback(
  variant: VariantId | undefined,
  fen: string | undefined,
  /** Tabuleiro a trazer para a tela ao começar (no celular o botão fica abaixo dele). */
  stage?: RefObject<HTMLElement | null>,
): Playback {
  const [scenes, setScenes] = useState<readonly Scene[]>([]);
  const [cursor, setCursor] = useState<Cursor>({ scene: 0, frame: 0 });
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [origin, setOrigin] = useState<string | undefined>(undefined);

  const stop = useCallback(() => {
    setScenes([]);
    setCursor({ scene: 0, frame: 0 });
    setPaused(false);
  }, []);

  const watch = useCallback(
    (lines: readonly WatchLine[], startAt = 0) => {
      if (!variant || !fen) return false;
      const built = lines.map((l) => buildScene(variant, fen, l)).filter((s) => s.plies.length > 0);
      if (built.length === 0) return false;
      setScenes(built);
      setOrigin(fen);
      setCursor({ scene: Math.min(startAt, Math.max(0, built.length - 1)), frame: 0 });
      setPaused(false);
      return true;
    },
    [variant, fen],
  );

  // A posição real mudou por baixo da encenação: o roteiro não vale mais.
  // Passou da última linha: acabou (o último quadro já devolveu o tabuleiro à origem).
  const stale = scenes.length > 0 && origin !== fen;
  const finished = scenes.length > 0 && cursor.scene >= scenes.length;
  const active = scenes.length > 0 && !stale && !finished;
  useEffect(() => {
    if (stale || finished) stop();
  }, [stale, finished, stop]);

  const scene = active ? (scenes[cursor.scene] ?? null) : null;
  const frame = scene ? (scene.frames[cursor.frame] ?? null) : null;

  const advance = useCallback(() => {
    setCursor((c) => {
      const current = scenes[c.scene];
      if (!current) return c;
      if (c.frame + 1 < current.frames.length) return { scene: c.scene, frame: c.frame + 1 };
      if (c.scene + 1 < scenes.length) return { scene: c.scene + 1, frame: 0 };
      return { scene: scenes.length, frame: 0 };
    });
  }, [scenes]);

  useEffect(() => {
    if (!frame || paused) return;
    // A pausa de leitura entre lances alonga no modo devagar; animação e rebobinar não.
    const hold = frame.phase === 'play' && speed === 'slow' ? frame.hold * SLOW_FACTOR : frame.hold;
    const t = setTimeout(advance, hold);
    return () => clearTimeout(t);
  }, [frame, paused, speed, advance]);

  // Ao começar, o tabuleiro vem para a tela durante a abertura, antes do primeiro lance andar.
  useEffect(() => {
    const el = stage?.current;
    if (!active || !el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top >= 0 && rect.bottom <= window.innerHeight) return;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
  }, [active, stage]);

  // Esc encerra de qualquer lugar.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, stop]);

  const jump = useCallback(
    (delta: number) =>
      setCursor((c) => {
        // "Anterior" no meio de uma linha recomeça a própria linha, como num player de música.
        const target = delta < 0 && c.frame > 1 ? c.scene : c.scene + delta;
        return { scene: Math.max(0, Math.min(scenes.length - 1, target)), frame: 0 };
      }),
    [scenes.length],
  );

  return useMemo(
    () => ({
      active,
      scenes,
      sceneIndex: cursor.scene,
      scene,
      frame,
      paused,
      speed,
      watch,
      stop,
      togglePause: () => setPaused((p) => !p),
      next: () => jump(1),
      previous: () => jump(-1),
      setSpeed,
    }),
    [active, scenes, cursor.scene, scene, frame, paused, speed, watch, stop, jump],
  );
}
