import type { VariantId } from '@dama/engine';
import type { CreateGameInput } from '@dama/protocol';
import {
  ArrowRight,
  BookOpenText,
  Brain,
  Copy,
  Cpu,
  Lightning,
  PlayCircle,
  Users,
  WifiHigh,
} from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { LevelMeter } from '../components/LevelMeter.tsx';
import { useToast } from '../components/Toasts.tsx';
import { Badge, Button, Card, Segmented, Switch, ui } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { copyText } from '../lib/clipboard.ts';
import { greeting, relativeText } from '../lib/format.ts';
import { keys, useMe, useMeta } from '../lib/queries.ts';
import s from './Home.module.css';
import p from './pages.module.css';

const TIME_OPTIONS = [
  { value: 'none', label: 'Livre', sub: 'sem relógio' },
  { value: '5+3', label: '5 + 3', sub: 'rápida' },
  { value: '10+5', label: '10 + 5', sub: 'clássica' },
  { value: '20+10', label: '20 + 10', sub: 'longa' },
] as const;
type TimeValue = (typeof TIME_OPTIONS)[number]['value'];

function timeControl(value: TimeValue): CreateGameInput['timeControl'] {
  if (value === 'none') return null;
  const [min, inc] = value.split('+').map(Number) as [number, number];
  return { initialSec: min * 60, incrementSec: inc };
}

export function Home() {
  const me = useMe();
  const meta = useMeta();
  const [, navigate] = useLocation();
  const toast = useToast();
  const qc = useQueryClient();

  const [variant, setVariant] = useState<VariantId>('brazilian');
  const [opponent, setOpponent] = useState<'ai' | 'lan'>('ai');
  const [level, setLevel] = useState(4);
  const [color, setColor] = useState<'white' | 'black' | 'random'>('white');
  const [mentor, setMentor] = useState(true);
  const [time, setTime] = useState<TimeValue>('none');
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  const profile = me.data?.profile;
  const levels = meta.data?.aiLevels ?? [];
  const currentLevel = levels.find((l) => l.level === level);

  const start = async () => {
    setCreating(true);
    try {
      const input: CreateGameInput =
        opponent === 'ai'
          ? { mode: 'ai', variant, level, color, mentor, timeControl: timeControl(time) }
          : { mode: 'lan', variant, color, timeControl: timeControl(time) };
      const { id } = await api.createGame(input);
      void qc.invalidateQueries({ queryKey: keys.me });
      navigate(`/partida/${id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível criar a partida', 'error');
      setCreating(false);
    }
  };

  const join = async (e: FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(clean)) {
      toast('O código tem 6 letras e números, como K7QX2M.', 'error');
      return;
    }
    setJoining(true);
    try {
      const { id } = await api.joinRoom(clean);
      navigate(`/partida/${id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível entrar na sala', 'error');
      setJoining(false);
    }
  };

  const active = me.data?.activeGames ?? [];
  const due = me.data?.studiesDue ?? 0;
  const lanUrl = meta.data?.lanUrls[0];

  return (
    <div className={p.page}>
      <header className={s.hero}>
        <div>
          <p className="eyebrow">{greeting()}</p>
          <h1 className={s.greeting}>
            {profile?.name.split(' ')[0]}
            <span className={s.dot}>.</span>
          </h1>
        </div>
        {profile && <LevelMeter profile={profile} />}
      </header>

      <div className={s.grid}>
        <Card className={s.newGame} aria-labelledby="nova-partida">
          <div className={p.cardBody}>
            <div className={s.cardHead}>
              <h2 id="nova-partida" className={s.cardTitle}>
                Nova partida
              </h2>
              <Segmented
                label="Adversário"
                value={opponent}
                onChange={setOpponent}
                options={[
                  { value: 'ai', label: 'Contra a IA' },
                  { value: 'lan', label: 'Na rede' },
                ]}
              />
            </div>

            <div className={ui.field}>
              <span className={ui.label} id="variante">
                Variante
              </span>
              <Segmented
                label="Variante"
                value={variant}
                onChange={setVariant}
                options={(meta.data?.variants ?? []).map((v) => ({
                  value: v.id,
                  label: v.name,
                  sub: v.short,
                }))}
              />
            </div>

            {opponent === 'ai' && (
              <div className={ui.field}>
                <div className={s.levelHead}>
                  <label htmlFor="nivel" className={ui.label}>
                    Força da IA
                  </label>
                  <span className={s.levelName}>
                    <strong>{currentLevel?.name ?? '—'}</strong>
                    <span className="mono">
                      {' '}
                      · nível {level} · ≈{currentLevel?.rating}
                    </span>
                  </span>
                </div>
                <input
                  id="nivel"
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={level}
                  onChange={(e) => setLevel(Number(e.target.value))}
                  className={ui.range}
                  style={{ ['--fill' as string]: `${((level - 1) / 9) * 100}%` }}
                  aria-valuetext={`Nível ${level}, ${currentLevel?.name ?? ''}`}
                />
              </div>
            )}

            <div className={s.twoCol}>
              <div className={ui.field}>
                <span className={ui.label}>Suas peças</span>
                <Segmented
                  label="Suas peças"
                  value={color}
                  onChange={setColor}
                  options={[
                    { value: 'white', label: 'Brancas' },
                    { value: 'black', label: 'Pretas' },
                    { value: 'random', label: 'Sorteio' },
                  ]}
                />
              </div>
              <div className={ui.field}>
                <span className={ui.label}>Ritmo</span>
                <Segmented label="Ritmo" value={time} onChange={setTime} options={TIME_OPTIONS} />
              </div>
            </div>

            {opponent === 'ai' ? (
              <Switch
                checked={mentor}
                onChange={setMentor}
                label={
                  <span className={s.mentorLabel}>
                    <Brain weight="duotone" aria-hidden="true" /> Modo mentor
                  </span>
                }
                description="Dicas, árvore de 3 jogadas, pausa para estudo e avaliação de cada lance. Usar ajuda reduz o XP pela metade e não conta para o rating."
              />
            ) : (
              <p className={ui.help}>
                O mentor fica desligado nas partidas entre pessoas. A análise completa aparece no fim.
              </p>
            )}

            <Button variant="primary" size="large" onClick={start} loading={creating} block>
              {opponent === 'ai' ? (
                <>
                  <Cpu weight="bold" aria-hidden="true" /> Jogar contra a IA
                </>
              ) : (
                <>
                  <WifiHigh weight="bold" aria-hidden="true" /> Criar sala na rede
                </>
              )}
            </Button>
          </div>
        </Card>

        <div className={s.side}>
          {active.length > 0 && (
            <Card aria-labelledby="continuar">
              <h2 id="continuar" className={`${p.sectionTitle} ${s.sideTitle}`}>
                <PlayCircle weight="fill" aria-hidden="true" /> Continuar
              </h2>
              <ul className={p.list}>
                {active.slice(0, 4).map((g) => (
                  <li key={g.id}>
                    <Link href={`/partida/${g.id}`} className={p.listItem}>
                      <span className={p.listMain}>
                        <strong>
                          {g.status === 'waiting' ? 'Sala aguardando adversário' : `Contra ${g.opponent}`}
                        </strong>
                        <span className={p.listMeta}>
                          {meta.data?.variants.find((v) => v.id === g.variant)?.name} ·{' '}
                          {Math.ceil(g.plies / 2)} lances · {relativeText(g.createdAt)}
                        </span>
                      </span>
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card aria-labelledby="estudo-dia">
            <div className={p.cardBody}>
              <h2 id="estudo-dia" className={p.sectionTitle} style={{ marginBottom: 0 }}>
                <BookOpenText weight="fill" aria-hidden="true" /> Estudo do dia
              </h2>
              {due > 0 ? (
                <>
                  <p className="muted">
                    <span className={s.bigNumber}>{due}</span>{' '}
                    {due === 1 ? 'posição espera' : 'posições esperam'} revisão. Cada acerto espaça a próxima
                    revisão; cada erro volta logo.
                  </p>
                  <Link href="/estudos/treino" className={`${ui.button} ${ui.primary}`}>
                    <Lightning weight="fill" aria-hidden="true" /> Treinar agora
                  </Link>
                </>
              ) : (
                <p className="muted">
                  Nada pendente. Seus erros nas partidas viram casos de estudo automaticamente — jogue e volte
                  aqui.
                </p>
              )}
            </div>
          </Card>

          <Card aria-labelledby="rede">
            <div className={p.cardBody}>
              <h2 id="rede" className={p.sectionTitle} style={{ marginBottom: 0 }}>
                <Users weight="fill" aria-hidden="true" /> Entrar em uma sala
              </h2>
              <form className={s.joinForm} onSubmit={join}>
                <label htmlFor="codigo" className="visually-hidden">
                  Código da sala
                </label>
                <input
                  id="codigo"
                  className={`${ui.input} mono ${s.codeInput}`}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="K7QX2M"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  inputMode="text"
                />
                <Button type="submit" loading={joining}>
                  Entrar
                </Button>
              </form>
              {lanUrl && (
                <div className={s.lan}>
                  <span className={ui.help}>Outros dispositivos da rede abrem:</span>
                  <button
                    type="button"
                    className={`${s.lanUrl} mono`}
                    onClick={() => {
                      void copyText(lanUrl).then((ok) =>
                        toast(
                          ok ? 'Endereço copiado' : 'Não foi possível copiar. Selecione e copie manualmente.',
                          ok ? 'success' : 'error',
                        ),
                      );
                    }}
                    aria-label={`Copiar endereço ${lanUrl}`}
                  >
                    {lanUrl}
                    <Copy aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </Card>

          {profile && profile.stats.games > 0 && (
            <div className={s.quickStats}>
              <Badge tone="good">{profile.stats.wins} vitórias</Badge>
              <Badge>{profile.stats.draws} empates</Badge>
              <Badge tone="bad">{profile.stats.losses} derrotas</Badge>
              {profile.stats.currentStreak > 1 && (
                <Badge tone="brass">{profile.stats.currentStreak} seguidas</Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
