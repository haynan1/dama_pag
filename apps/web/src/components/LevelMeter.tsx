import type { ProfileView } from '@dama/protocol';
import s from './LevelMeter.module.css';

/** Anel de progresso do nível + rating. */
export function LevelMeter({ profile, compact }: { profile: ProfileView; compact?: boolean }) {
  const { level } = profile;
  const ratio = level.required > 0 ? level.current / level.required : 1;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className={`${s.meter} ${compact ? s.compact : ''}`}>
      <div
        className={s.ring}
        role="img"
        aria-label={`Nível ${level.level}: ${level.current} de ${level.required} XP para o próximo`}
      >
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r={r} className={s.track} />
          <circle
            cx="32"
            cy="32"
            r={r}
            className={s.value}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - ratio)}
            transform="rotate(-90 32 32)"
          />
        </svg>
        <span className={s.levelNumber}>{level.level}</span>
      </div>
      <div className={s.text}>
        <span className={s.title}>{level.title}</span>
        <span className={s.sub}>
          <span className="mono">
            {level.required > 0 ? `${level.current}/${level.required} XP` : 'nível máximo'}
          </span>
        </span>
      </div>
      <div className={s.rating}>
        <span className={s.ratingValue}>{profile.rating}</span>
        <span className={s.sub}>rating</span>
      </div>
    </div>
  );
}
