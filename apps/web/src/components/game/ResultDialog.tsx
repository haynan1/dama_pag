import type { GameView, RewardSummary } from '@dama/protocol';
import { ArrowRight, BookOpenText, Medal, TrendDown, TrendUp, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { REASON_LABEL } from '../../lib/format.ts';
import { Badge, ui } from '../ui.tsx';
import s from './game.module.css';

function useCountUp(target: number, ms = 1100): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      setValue(Math.round(target * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

export function ResultDialog({
  game,
  rewards,
  onClose,
}: {
  game: GameView;
  rewards: RewardSummary | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const result = game.result!;
  const outcome = !game.you
    ? 'watch'
    : result.winner === null
      ? 'draw'
      : result.winner === game.you
        ? 'win'
        : 'loss';
  const title =
    outcome === 'win'
      ? 'Vitória'
      : outcome === 'loss'
        ? 'Derrota'
        : outcome === 'draw'
          ? 'Empate'
          : 'Fim de partida';
  const xp = useCountUp(rewards?.xpGained ?? 0);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const ratingDelta = rewards ? rewards.ratingAfter - rewards.ratingBefore : 0;

  return (
    <dialog
      ref={ref}
      className={`${s.dialog} ${s[`dialog_${outcome}`]}`}
      onClose={onClose}
      aria-labelledby="resultado-titulo"
    >
      <button
        type="button"
        className={s.dialogClose}
        onClick={() => ref.current?.close()}
        aria-label="Fechar"
      >
        <X aria-hidden="true" />
      </button>
      <p className="eyebrow">Por {REASON_LABEL[result.reason]}</p>
      <h2 id="resultado-titulo" className={s.dialogTitle}>
        {title}
      </h2>

      {game.you && !rewards && (
        <p className="muted" role="status">
          Calculando precisão e recompensas…
        </p>
      )}

      {rewards && (
        <div className={s.rewards}>
          <div className={s.rewardStats}>
            <div className={s.rewardStat}>
              <span className={s.rewardValue}>+{xp}</span>
              <span className={s.rewardLabel}>XP</span>
            </div>
            {rewards.accuracy !== null && (
              <div className={s.rewardStat}>
                <span className={s.rewardValue}>{rewards.accuracy.toFixed(0)}%</span>
                <span className={s.rewardLabel}>precisão</span>
              </div>
            )}
            <div className={s.rewardStat}>
              <span className={s.rewardValue}>
                {rewards.ratingAfter}
                {ratingDelta !== 0 && (
                  <span className={ratingDelta > 0 ? s.up : s.down}>
                    {ratingDelta > 0 ? <TrendUp aria-hidden="true" /> : <TrendDown aria-hidden="true" />}
                    {ratingDelta > 0 ? `+${ratingDelta}` : ratingDelta}
                  </span>
                )}
              </span>
              <span className={s.rewardLabel}>{game.assisted ? 'rating (partida assistida)' : 'rating'}</span>
            </div>
          </div>

          {rewards.levelAfter > rewards.levelBefore && (
            <p className={s.levelUp}>
              Você subiu para o nível <strong>{rewards.levelAfter}</strong>.
            </p>
          )}

          <ul className={s.breakdown}>
            {rewards.breakdown.map((b) => (
              <li key={b.label}>
                <span>{b.label}</span>
                <span className="mono">{b.xp > 0 ? `+${b.xp}` : b.xp}</span>
              </li>
            ))}
          </ul>

          {rewards.achievements.length > 0 && (
            <div className={s.unlocked}>
              <p className="eyebrow">Conquistas desbloqueadas</p>
              {rewards.achievements.map((a) => (
                <div key={a.key} className={s.achievement}>
                  <Medal weight="duotone" className={s[`tier_${a.tier}`]} aria-hidden="true" />
                  <div>
                    <strong>{a.title}</strong>
                    <p className="muted">{a.description}</p>
                  </div>
                  <Badge tone="brass">+{a.xp}</Badge>
                </div>
              ))}
            </div>
          )}

          {rewards.studiesCreated > 0 && (
            <p className={s.studiesNote}>
              <BookOpenText weight="duotone" aria-hidden="true" />
              {rewards.studiesCreated}{' '}
              {rewards.studiesCreated === 1 ? 'posição virou caso' : 'posições viraram casos'} de estudo.
            </p>
          )}
        </div>
      )}

      <div className={s.dialogActions}>
        <Link href={`/historico/${game.id}`} className={`${ui.button} ${ui.primary}`}>
          Revisar partida <ArrowRight weight="bold" aria-hidden="true" />
        </Link>
        <Link href="/" className={ui.button}>
          Nova partida
        </Link>
      </div>
    </dialog>
  );
}
