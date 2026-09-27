import type { ReviewView } from '@dama/protocol';
import { type KeyboardEvent, useMemo } from 'react';
import { CLASSIFICATION_META, formatScore, winProbability } from '../lib/format.ts';
import s from './EvalGraph.module.css';

interface Props {
  readonly reviews: readonly ReviewView[];
  readonly plies: number;
  readonly current: number;
  readonly onSelect: (ply: number) => void;
}

const W = 600;
const H = 120;

/**
 * Gráfico da partida: vantagem das brancas (acima) ou pretas (abaixo) em probabilidade de vitória,
 * com marcadores nos erros. Clique ou setas do teclado navegam pelos lances.
 */
export function EvalGraph({ reviews, plies, current, onSelect }: Props) {
  const points = useMemo(() => {
    const byPly = new Map(reviews.map((r) => [r.ply, r]));
    const pts: { ply: number; y: number; review: ReviewView | undefined }[] = [];
    let lastY = 0.5;
    for (let ply = 0; ply < plies; ply++) {
      const r = byPly.get(ply);
      if (r) lastY = winProbability(r.evalWhite);
      pts.push({ ply, y: lastY, review: r });
    }
    return pts;
  }, [reviews, plies]);

  if (plies === 0) return null;
  const x = (ply: number) => (plies <= 1 ? W / 2 : (ply / (plies - 1)) * W);
  const y = (v: number) => H - v * H;
  const line = points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${x(pt.ply).toFixed(1)} ${y(pt.y).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${x(plies - 1)} ${H} L0 ${H} Z`;
  const marks = points.filter(
    (pt) =>
      pt.review?.classification && ['mistake', 'blunder', 'brilliant'].includes(pt.review.classification),
  );
  const cur = points[current];

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') onSelect(Math.max(0, current - 1));
    else if (e.key === 'ArrowRight') onSelect(Math.min(plies - 1, current + 1));
    else return;
    e.preventDefault();
  };

  const worst = marks.filter((m) => m.review?.classification === 'blunder').length;
  const summary = `Gráfico de avaliação com ${plies} lances${worst ? `, ${worst} erros graves marcados` : ''}. Lance atual ${current + 1}${cur?.review ? `, avaliação ${formatScore(cur.review.evalWhite)} para as brancas` : ''}.`;

  return (
    <div
      className={s.wrap}
      tabIndex={0}
      onKeyDown={onKey}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        onSelect(Math.max(0, Math.min(plies - 1, Math.round(ratio * (plies - 1)))));
      }}
      role="slider"
      aria-label={summary}
      aria-valuemin={1}
      aria-valuemax={plies}
      aria-valuenow={current + 1}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={s.svg} aria-hidden="true">
        <rect width={W} height={H} className={s.black} />
        <path d={area} className={s.white} />
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} className={s.mid} />
        <path d={line} className={s.line} />
        {cur && <line x1={x(cur.ply)} x2={x(cur.ply)} y1={0} y2={H} className={s.cursor} />}
      </svg>
      <div className={s.hits}>
        {marks.map((m) => {
          const meta = CLASSIFICATION_META[m.review!.classification!];
          return (
            <span
              key={`m${m.ply}`}
              className={`${s.mark} ${s[`mark_${meta.tone}`]}`}
              style={{ left: `${(x(m.ply) / W) * 100}%`, top: `${(y(m.y) / H) * 100}%` }}
              title={`${m.review!.notation}: ${meta.label}`}
            />
          );
        })}
      </div>
    </div>
  );
}
