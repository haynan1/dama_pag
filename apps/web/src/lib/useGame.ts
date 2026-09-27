import { type Lookahead, moveKey, Position } from '@dama/engine';
import type { ClientMessage, GameView, HintView, ReviewView, RewardSummary } from '@dama/protocol';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../components/Toasts.tsx';
import { keys } from './queries.ts';
import { type ConnectionState, socket } from './socket.ts';

export interface LiveGame {
  readonly game: GameView | null;
  /** Momento local em que o estado chegou (base do relógio, imune a diferença de relógio com o servidor). */
  readonly receivedAt: number;
  readonly connection: ConnectionState;
  readonly hint: HintView | null;
  readonly tree: Lookahead | null;
  readonly busy: { readonly hint: boolean; readonly lookahead: boolean };
  readonly lastReview: ReviewView | null;
  readonly rewards: RewardSummary | null;
  /** Posição exibida: inclui o lance otimista enquanto o servidor confirma. */
  readonly display: {
    fen: string;
    lastMove: { path: readonly number[]; captures: readonly number[] } | null;
    /** O último lance foi de outra pessoa (IA ou adversário): ganha um respiro antes de ser encenado. */
    lastMoveByOpponent: boolean;
  } | null;
  move(key: string): void;
  send(message: DistributiveOmit<ClientMessage, 'gameId'>): void;
  clearHint(): void;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

const SILENT_ERRORS = new Set(['stale']);

export function useGame(id: string): LiveGame {
  const toast = useToast();
  const qc = useQueryClient();
  const [game, setGame] = useState<GameView | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [connection, setConnection] = useState<ConnectionState>(socket.state);
  const [hint, setHint] = useState<HintView | null>(null);
  const [tree, setTree] = useState<Lookahead | null>(null);
  const [busy, setBusy] = useState({ hint: false, lookahead: false });
  const [lastReview, setLastReview] = useState<ReviewView | null>(null);
  const [rewards, setRewards] = useState<RewardSummary | null>(null);
  const [optimistic, setOptimistic] = useState<{
    ply: number;
    fen: string;
    path: number[];
    captures: number[];
  } | null>(null);
  const plyRef = useRef(-1);

  useEffect(() => {
    const unsubscribe = socket.subscribe(id);
    const offState = socket.onState(setConnection);
    const off = socket.on((msg) => {
      switch (msg.type) {
        case 'state':
          if (msg.game.id !== id) return;
          setGame(msg.game);
          setReceivedAt(Date.now());
          if (msg.game.moves.length !== plyRef.current) {
            plyRef.current = msg.game.moves.length;
            setHint(null);
            setTree(null);
            setBusy({ hint: false, lookahead: false });
          }
          setOptimistic((o) => (o && msg.game.moves.length > o.ply ? null : o));
          if (msg.game.status === 'finished') void qc.invalidateQueries({ queryKey: keys.me });
          return;
        case 'review':
          if (msg.gameId === id) setLastReview(msg.review);
          return;
        case 'hint':
          if (msg.gameId !== id) return;
          setHint(msg.hint);
          setBusy((b) => ({ ...b, hint: false }));
          return;
        case 'lookahead':
          if (msg.gameId !== id) return;
          setTree(msg.tree);
          setBusy((b) => ({ ...b, lookahead: false }));
          return;
        case 'mentor-busy':
          if (msg.gameId === id) setBusy((b) => ({ ...b, [msg.task]: true }));
          return;
        case 'rewards':
          if (msg.gameId !== id) return;
          setRewards(msg.rewards);
          void qc.invalidateQueries({ queryKey: keys.me });
          void qc.invalidateQueries({ queryKey: keys.progress });
          return;
        case 'error':
          setOptimistic(null);
          setBusy({ hint: false, lookahead: false });
          if (!SILENT_ERRORS.has(msg.code))
            toast(msg.message, msg.code === 'draw-declined' ? 'info' : 'error');
          return;
        case 'pong':
          return;
      }
    });
    return () => {
      off();
      offState();
      unsubscribe();
    };
  }, [id, qc, toast]);

  const send = useCallback(
    (message: DistributiveOmit<ClientMessage, 'gameId'>) => {
      socket.send({ ...message, gameId: id } as ClientMessage);
    },
    [id],
  );

  const move = useCallback(
    (key: string) => {
      if (!game) return;
      const pos = Position.fromFen(game.variant, game.fen);
      const m = pos.legalMoves().find((x) => moveKey(x) === key);
      if (!m) return;
      pos.make(m);
      setOptimistic({ ply: game.moves.length, fen: pos.fen(), path: [...m.path], captures: [...m.captures] });
      setHint(null);
      setTree(null);
      send({ type: 'move', ply: game.moves.length, key });
    },
    [game, send],
  );

  const last = game?.moves.at(-1);
  const display = game
    ? optimistic
      ? {
          fen: optimistic.fen,
          lastMove: { path: optimistic.path, captures: optimistic.captures },
          lastMoveByOpponent: false,
        }
      : {
          fen: game.fen,
          lastMove: last ? { path: last.path, captures: last.captures } : null,
          lastMoveByOpponent: last !== undefined && last.side !== game.you,
        }
    : null;

  return {
    game,
    receivedAt,
    connection,
    hint,
    tree,
    busy,
    lastReview,
    rewards,
    display,
    move,
    send,
    clearHint: () => setHint(null),
  };
}
