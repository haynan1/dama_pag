import { profileNameError } from '@dama/protocol';
import { LockSimple, Medal, PencilSimple } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { LevelMeter } from '../components/LevelMeter.tsx';
import { useToast } from '../components/Toasts.tsx';
import { Button, Card, Skeleton, ui } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { dateText } from '../lib/format.ts';
import { keys } from '../lib/queries.ts';
import s from './Progress.module.css';
import p from './pages.module.css';

export default function Progress() {
  const query = useQuery({ queryKey: keys.progress, queryFn: api.progress });
  const data = query.data;

  if (!data) {
    return (
      <div className={p.page}>
        <Skeleton height={60} width="50%" />
        <Skeleton height={200} />
      </div>
    );
  }

  const { profile, achievements, ratingHistory } = data;
  const st = profile.stats;
  const unlocked = achievements.filter((a) => a.unlockedAt).length;
  const winRate = st.games > 0 ? Math.round((st.wins / st.games) * 100) : 0;

  return (
    <div className={p.page}>
      <header className={p.header}>
        <div>
          <p className="eyebrow">Progresso</p>
          <NameEditor name={profile.name} />
          <p className={p.lede}>
            {profile.level.title} · desde {dateText(profile.createdAt)}
          </p>
        </div>
        <LevelMeter profile={profile} />
      </header>

      <div className={s.stats}>
        {[
          { label: 'Partidas', value: st.games },
          { label: 'Vitórias', value: `${st.wins}`, sub: `${winRate}%` },
          { label: 'Empates', value: st.draws },
          { label: 'Derrotas', value: st.losses },
          { label: 'Melhor sequência', value: st.bestStreak },
          { label: 'Estudos resolvidos', value: st.studiesSolved },
          { label: 'Dias seguidos estudando', value: st.studyStreak },
          { label: 'XP total', value: profile.xp },
        ].map((item) => (
          <Card key={item.label} className={s.stat}>
            <span className={p.statValue}>
              {item.value}
              {item.sub && <span className={s.statSub}>{item.sub}</span>}
            </span>
            <span className={p.statLabel}>{item.label}</span>
          </Card>
        ))}
      </div>

      <Card>
        <div className={p.cardBody}>
          <h2 className={p.sectionTitle} style={{ marginBottom: 0 }}>
            Rating
          </h2>
          <RatingChart points={ratingHistory} current={profile.rating} />
        </div>
      </Card>

      <section aria-labelledby="conquistas">
        <h2 id="conquistas" className={p.sectionTitle}>
          <Medal weight="fill" aria-hidden="true" /> Conquistas · {unlocked}/{achievements.length}
        </h2>
        <ul className={s.achievements}>
          {achievements.map((a) => (
            <li key={a.key} className={`${s.achievement} ${a.unlockedAt ? s.unlocked : ''}`}>
              <span className={`${s.medal} ${s[`tier_${a.tier}`]}`} aria-hidden="true">
                {a.unlockedAt ? <Medal weight="duotone" /> : <LockSimple />}
              </span>
              <div className={s.achText}>
                <strong>{a.title}</strong>
                <span>{a.description}</span>
                <span className={s.achMeta}>
                  {a.unlockedAt ? `Desbloqueada ${dateText(a.unlockedAt)}` : 'Bloqueada'} · +{a.xp} XP
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function NameEditor({ name }: { name: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const nameError = profileNameError(value);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (nameError) return;
    setSaving(true);
    try {
      await api.rename(value.trim());
      await qc.invalidateQueries({ queryKey: keys.progress });
      await qc.invalidateQueries({ queryKey: keys.me });
      setEditing(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível salvar', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <h1 className={`${p.title} ${s.nameRow}`}>
        {name}
        <Button variant="ghost" icon onClick={() => setEditing(true)} aria-label="Editar nome">
          <PencilSimple aria-hidden="true" />
        </Button>
      </h1>
    );
  }
  return (
    <form onSubmit={save} className={s.nameForm}>
      <label htmlFor="nome" className="visually-hidden">
        Nome
      </label>
      <input
        id="nome"
        className={ui.input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={24}
        aria-invalid={Boolean(nameError)}
        // biome-ignore lint/a11y/noAutofocus: edição iniciada pelo usuário.
        autoFocus
      />
      <Button type="submit" variant="primary" loading={saving} disabled={Boolean(nameError)}>
        Salvar
      </Button>
      <Button variant="ghost" onClick={() => setEditing(false)}>
        Cancelar
      </Button>
      {nameError && <p className={ui.error}>{nameError}</p>}
    </form>
  );
}

function RatingChart({
  points,
  current,
}: {
  points: readonly { rating: number; at: string }[];
  current: number;
}) {
  if (points.length < 2) {
    return (
      <p className="muted">
        Seu rating atual é <strong className="mono">{current}</strong>. Jogue partidas sem ajuda contra a IA
        (ou na rede) para ver a evolução aqui.
      </p>
    );
  }
  const W = 800;
  const H = 180;
  const values = points.map((pt) => pt.rating);
  const min = Math.min(...values) - 20;
  const max = Math.max(...values) + 20;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / (max - min)) * H;
  const d = points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(pt.rating).toFixed(1)}`)
    .join(' ');
  const first = values[0]!;
  const last = values.at(-1)!;
  return (
    <figure className={s.chart}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Rating de ${first} para ${last} em ${points.length} partidas`}
      >
        <defs>
          <linearGradient id="ratingFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--brass)', stopOpacity: 0.28 }} />
            <stop offset="1" style={{ stopColor: 'var(--brass)', stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <path d={`${d} L${W} ${H} L0 ${H} Z`} fill="url(#ratingFill)" />
        <path d={d} className={s.chartLine} />
      </svg>
      <figcaption className={s.chartCaption}>
        <span className="mono">{Math.round(min + 20)}</span>
        <span>
          {last - first >= 0 ? '+' : ''}
          {last - first} nas últimas {points.length} partidas
        </span>
        <span className="mono">{Math.round(max - 20)}</span>
      </figcaption>
    </figure>
  );
}
