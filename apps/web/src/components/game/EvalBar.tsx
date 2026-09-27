import type { Side } from '@dama/protocol';
import type { CSSProperties } from 'react';
import { formatScore, winProbability } from '../../lib/format.ts';
import s from './game.module.css';

/**
 * Barra de avaliação. Ao lado do tabuleiro (vertical, seu lado embaixo) em telas largas; no celular
 * em pé vira uma faixa fina abaixo dele (seu lado à esquerda), devolvendo a largura ao tabuleiro.
 */
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
        style={{ '--share': bottomShare } as CSSProperties}
      />
      <span className={`${s.evalText} mono`}>
        {formatScore(orientation === 'white' ? evalWhite : -evalWhite)}
      </span>
    </div>
  );
}
