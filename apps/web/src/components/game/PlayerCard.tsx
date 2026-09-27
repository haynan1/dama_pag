import type { ClockView, PlayerView, Side } from '@dama/protocol';
import { Cpu, User } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { clockText } from '../../lib/format.ts';
import { Piece } from '../Board.tsx';
import s from './game.module.css';

interface Props {
  readonly side: Side;
  readonly player: PlayerView;
  readonly isYou: boolean;
  readonly toMove: boolean;
  readonly thinking: boolean;
  readonly pieces: { men: number; kings: number };
  readonly clock: ClockView | null;
  readonly receivedAt: number;
  readonly paused: boolean;
}

export function PlayerCard({
  side,
  player,
  isYou,
  toMove,
  thinking,
  pieces,
  clock,
  receivedAt,
  paused,
}: Props) {
  return (
    <div className={`${s.player} ${toMove ? s.toMove : ''}`}>
      <div className={s.playerPiece} aria-hidden="true">
        <Piece value={side === 'white' ? 1 : -1} />
      </div>
      <div className={s.playerInfo}>
        <span className={s.playerName}>
          {player.name}
          {isYou && <span className={s.you}>você</span>}
        </span>
        <span className={s.playerMeta}>
          {player.kind === 'ai' ? <Cpu aria-hidden="true" /> : <User aria-hidden="true" />}
          {player.kind === 'ai'
            ? `IA · nível ${player.level}`
            : player.connected
              ? 'conectado'
              : 'desconectado'}
          {player.kind === 'human' && (
            <span className={`${s.presence} ${player.connected ? s.online : ''}`} aria-hidden="true" />
          )}
          <span className={s.material}>
            · {pieces.men} {pieces.men === 1 ? 'pedra' : 'pedras'}
            {pieces.kings > 0 && `, ${pieces.kings} ${pieces.kings === 1 ? 'dama' : 'damas'}`}
          </span>
        </span>
      </div>
      {thinking && (
        <span className={s.thinking} role="status">
          <span className="visually-hidden">A IA está pensando</span>
          <i />
          <i />
          <i />
        </span>
      )}
      {clock && <Clock side={side} clock={clock} receivedAt={receivedAt} paused={paused} />}
    </div>
  );
}

function Clock({
  side,
  clock,
  receivedAt,
  paused,
}: {
  side: Side;
  clock: ClockView;
  receivedAt: number;
  paused: boolean;
}) {
  const running = clock.running === side && !paused;
  const base = side === 'white' ? clock.whiteMs : clock.blackMs;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [running]);
  const remaining = running ? base - (now - receivedAt) : base;
  const low = remaining < 20_000;
  return (
    <span
      className={`${s.clock} ${running ? s.clockRunning : ''} ${low ? s.clockLow : ''} mono`}
      aria-label={`Tempo ${side === 'white' ? 'das brancas' : 'das pretas'}: ${clockText(remaining)}`}
      role="timer"
    >
      {clockText(remaining)}
    </span>
  );
}
