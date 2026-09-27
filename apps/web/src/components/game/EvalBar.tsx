import type { Side } from '@dama/protocol';
import { formatScore, winProbability } from '../../lib/format.ts';
import s from './game.module.css';

/** Barra vertical de avaliação (brancas embaixo quando você joga de brancas). */
export function EvalBar({ evalWhite, orientation }: { evalWhite: number; orientation: Side }) {
  const white = winProbability(evalWhite);
  const bottomShare = orientation === 'white' ? white : 1 - white;
  return (
    <div
      className={s.evalBar}
      role="meter"
      aria-label="Avaliação da posição"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(white * 100)}
      aria-valuetext={`${formatScore(evalWhite)} para as brancas`}
    >
      <div
        className={`${s.evalFill} ${orientation === 'white' ? s.evalWhite : s.evalBlack}`}
        style={{ transform: `scaleY(${bottomShare})` }}
      />
      <span className={`${s.evalText} mono`}>
        {formatScore(orientation === 'white' ? evalWhite : -evalWhite)}
      </span>
    </div>
  );
}
