import { chapterOf, costsLife, type Level, livesNow } from '@dama/campaign';
import { Heart, Play, Star } from '@phosphor-icons/react';
import type { CSSProperties } from 'react';
import { Button } from '../../components/ui.tsx';
import { usePremium } from '../../platform/billing.ts';
import { details, objective } from '../describe.ts';
import { useCampaign, useNow } from '../store.ts';
import s from './campaign.module.css';
import { Sheet } from './Sheet.tsx';

export function StarRow({
  value,
  size = 'md',
  label,
}: {
  value: number;
  size?: 'md' | 'lg';
  label?: string;
}) {
  return (
    <span
      className={`${s.stars} ${size === 'lg' ? s.starsLg : ''}`}
      role="img"
      aria-label={label ?? `${value} de 3 estrelas`}
    >
      {[1, 2, 3].map((n) => (
        <Star
          key={n}
          weight="fill"
          className={n <= value ? s.starOn : s.starOff}
          style={{ '--i': n } as CSSProperties}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

/** Entrada de uma fase: a lição, o objetivo e o custo, antes de gastar uma vida. */
export function LevelSheet({
  level,
  number,
  onClose,
  onPlay,
  onNeedLives,
}: {
  level: Level | null;
  number: number;
  onClose: () => void;
  onPlay: (level: Level) => void;
  onNeedLives: () => void;
}) {
  const state = useCampaign();
  const premium = usePremium();
  const now = useNow();
  if (!level)
    return (
      <Sheet open={false} onClose={onClose} labelledBy="fase-titulo">
        {null}
      </Sheet>
    );

  const chapter = chapterOf(level.id);
  const best = state.stars[level.id] ?? 0;
  const paid = costsLife(level, premium);
  const noLives = paid && livesNow(state, now).count === 0;

  return (
    <Sheet open onClose={onClose} labelledBy="fase-titulo">
      <p className="eyebrow">
        {chapter?.title} · {level.kind === 'match' ? 'Partida' : `Fase ${number}`}
      </p>
      <h2 id="fase-titulo" className={s.sheetTitle}>
        {level.title}
      </h2>
      {best > 0 && <StarRow value={best} label={`Melhor resultado: ${best} de 3 estrelas`} />}
      <p className={s.sheetLead}>{level.brief}</p>
      <ul className={s.chips} aria-label="Objetivo">
        <li className={s.chipGoal}>{objective(level)}</li>
        {details(level).map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <div className={s.sheetActions}>
        {noLives ? (
          <Button variant="primary" size="large" block onClick={onNeedLives}>
            <Heart aria-hidden="true" /> Sem vidas — ver opções
          </Button>
        ) : (
          <Button variant="primary" size="large" block onClick={() => onPlay(level)} autoFocus>
            <Play weight="fill" aria-hidden="true" />
            {best > 0 ? 'Jogar de novo' : 'Jogar'}
            <span className={s.cost}>
              {paid ? (
                <>
                  <Heart weight="fill" aria-hidden="true" /> 1<span className="visually-hidden"> vida</span>
                </>
              ) : (
                'grátis'
              )}
            </span>
          </Button>
        )}
      </div>
      {paid && !noLives && <p className={s.fine}>A vida volta se você concluir a fase.</p>}
    </Sheet>
  );
}
