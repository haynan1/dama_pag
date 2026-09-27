import {
  CHAPTERS,
  type Chapter,
  currentLevel,
  isUnlocked,
  LEVELS,
  type Level,
  levelIndex,
  totalStars,
} from '@dama/campaign';
import { Crown, GearSix, Lock, Play, Star } from '@phosphor-icons/react';
import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useToast } from '../components/Toasts.tsx';
import { TARGET } from '../platform/runtime.ts';
import { consumeArrival } from './arrival.ts';
import { campaign, useCampaign } from './store.ts';
import s from './ui/campaign.module.css';
import { LevelSheet, StarRow } from './ui/LevelSheet.tsx';
import { LivesBadge, LivesSheet } from './ui/Lives.tsx';
import { SettingsSheet } from './ui/Settings.tsx';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
/** Zigue-zague da trilha: deslocamento horizontal de cada fase, de −1 (esquerda) a 1 (direita). */
const SWAY = [0, 0.62, 0.92, 0.62, 0, -0.62, -0.92, -0.62];
const STEP = 108;
const HEAD = 76;

function ChapterPath({
  chapter,
  offset,
  width,
  onOpen,
  arrived,
}: {
  chapter: Chapter;
  offset: number;
  width: number;
  onOpen: (level: Level) => void;
  arrived: string | null;
}) {
  const state = useCampaign();
  const current = currentLevel(state);
  const amp = Math.min(width / 2 - 48, 132);
  const points = chapter.levels.map((_, i) => ({
    x: width / 2 + SWAY[(offset + i) % SWAY.length]! * amp,
    y: HEAD + i * STEP,
  }));
  const height = HEAD + (chapter.levels.length - 1) * STEP + HEAD;

  // Curva suave entre as fases; o trecho já percorrido é traçado em latão.
  const segment = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    `M${a.x},${a.y} C${a.x},${a.y + STEP / 2} ${b.x},${b.y - STEP / 2} ${b.x},${b.y}`;
  const segments = points.slice(1).map((p, i) => ({
    d: segment(points[i]!, p),
    done: state.stars[chapter.levels[i]!.id] !== undefined,
  }));

  return (
    <div className={s.path} style={{ height }}>
      <svg className={s.pathSvg} width={width} height={height} aria-hidden="true">
        {segments.map((seg) => (
          <path key={seg.d} d={seg.d} className={seg.done ? s.roadDone : s.road} />
        ))}
      </svg>
      <ol className={s.nodes}>
        {chapter.levels.map((level, i) => {
          const p = points[i]!;
          const n = levelIndex(level.id) + 1;
          const stars = state.stars[level.id];
          const unlocked = isUnlocked(state, level.id);
          const isCurrent = level.id === current.id && stars === undefined;
          const boss = level.kind === 'match';
          const status = isCurrent ? 'current' : stars !== undefined ? 'done' : unlocked ? 'open' : 'locked';
          const label = `${boss ? 'Partida' : `Fase ${n}`}: ${level.title}. ${
            status === 'locked'
              ? 'Bloqueada'
              : stars !== undefined
                ? `${stars} de 3 estrelas`
                : isCurrent
                  ? 'Próxima fase'
                  : 'Disponível'
          }`;
          return (
            <li
              key={level.id}
              className={s.nodeItem}
              style={{ '--x': `${p.x - width / 2}px`, '--y': `${p.y}px` } as CSSProperties}
              data-current={isCurrent || undefined}
            >
              <button
                type="button"
                className={`${s.node} ${s[`node_${status}`]} ${boss ? s.nodeBoss : ''} ${
                  arrived === level.id ? s.nodeArrived : ''
                }`}
                onClick={() => onOpen(level)}
                disabled={status === 'locked'}
                aria-label={label}
              >
                <span className={s.piece} aria-hidden="true">
                  {status === 'locked' ? (
                    <Lock weight="bold" />
                  ) : boss ? (
                    <Crown weight="fill" />
                  ) : (
                    <span className={s.pieceNumber}>{n}</span>
                  )}
                </span>
              </button>
              {stars !== undefined && <StarRow value={stars} />}
              {isCurrent && (
                <span className={s.nodeFlag} aria-hidden="true">
                  {boss ? 'Chefe' : 'Jogar'}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * A trilha: capítulos como regiões de um mapa, fases como peças no caminho. Abre centrada na
 * próxima fase. Nada de menu para escolher modo — o próximo passo está sempre a um toque.
 */
export function Trail() {
  const state = useCampaign();
  const [, navigate] = useLocation();
  const toast = useToast();
  const [open, setOpen] = useState<Level | null>(null);
  const [livesOpen, setLivesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [width, setWidth] = useState(360);
  const column = useRef<HTMLDivElement>(null);
  const [arrived] = useState(() => consumeArrival());
  const current = currentLevel(state);
  const stars = totalStars(state);

  useLayoutEffect(() => {
    const el = column.current;
    if (!el) return;
    const measure = () => setWidth(Math.min(el.clientWidth, 440));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Abre na próxima fase, sem animar a rolagem (é o ponto de partida, não um movimento).
  useEffect(() => {
    document.querySelector('[data-current]')?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, []);

  const offsets = useMemo(() => {
    let acc = 0;
    return CHAPTERS.map((c) => {
      const o = acc;
      acc += c.levels.length;
      return o;
    });
  }, []);

  const play = (level: Level) => {
    const r = campaign.start(level.id);
    if (r.ok) {
      setOpen(null);
      navigate(`/fase/${level.id}`);
      return;
    }
    if (r.reason === 'no-lives') {
      setOpen(null);
      setLivesOpen(true);
    } else toast('Conclua a fase anterior para liberar esta.', 'info');
  };

  return (
    <div className={`${s.trail} ${TARGET === 'web' ? s.inShell : ''}`}>
      <header className={s.topbar}>
        <span className={`${s.wordmark} display`}>
          <span className={s.mark} aria-hidden="true" />
          Dama
        </span>
        <span className={s.starTotal} role="img" aria-label={`${stars} de ${LEVELS.length * 3} estrelas`}>
          <Star weight="fill" aria-hidden="true" />
          <span className="mono">{stars}</span>
        </span>
        <LivesBadge onOpen={() => setLivesOpen(true)} />
        {TARGET === 'app' && (
          <button
            type="button"
            className={s.iconButton}
            onClick={() => setSettingsOpen(true)}
            aria-label="Configurações"
          >
            <GearSix aria-hidden="true" />
          </button>
        )}
      </header>

      <div className={s.column} ref={column}>
        <div className={s.intro}>
          <p className="eyebrow">Campanha</p>
          <h1 className={`${s.introTitle} display`}>
            Do primeiro passo <em>ao Implacável</em>
          </h1>
        </div>
        {CHAPTERS.map((chapter, ci) => {
          const got = chapter.levels.reduce((sum, l) => sum + (state.stars[l.id] ?? 0), 0);
          const reached = isUnlocked(state, chapter.levels[0]!.id);
          return (
            <section
              key={chapter.id}
              className={`${s.region} ${s[`tone_${chapter.tone}`]} ${reached ? '' : s.regionLocked}`}
              aria-labelledby={`cap-${chapter.id}`}
            >
              <header className={s.regionHead}>
                <span className={`${s.roman} display`} aria-hidden="true">
                  {ROMAN[ci]}
                </span>
                <div>
                  <h2 id={`cap-${chapter.id}`} className={`${s.regionTitle} display`}>
                    <span className="visually-hidden">Capítulo {ci + 1}: </span>
                    {chapter.title}
                  </h2>
                  <p className={s.regionSub}>{chapter.subtitle}</p>
                </div>
                <span className={s.regionStars}>
                  <Star weight="fill" aria-hidden="true" />
                  <span className="mono">
                    {got}/{chapter.levels.length * 3}
                  </span>
                  <span className="visually-hidden"> estrelas</span>
                </span>
              </header>
              <ChapterPath
                chapter={chapter}
                offset={offsets[ci]!}
                width={width}
                onOpen={setOpen}
                arrived={arrived}
              />
            </section>
          );
        })}
        <p className={s.trailEnd}>Novos capítulos em breve.</p>
      </div>

      <div className={s.dock}>
        <button type="button" className={s.continue} onClick={() => setOpen(current)}>
          <Play weight="fill" aria-hidden="true" />
          <span className={s.continueText}>
            <span className={s.continueEyebrow}>Continuar</span>
            <span className={s.continueTitle}>{current.title}</span>
          </span>
        </button>
      </div>

      <LevelSheet
        level={open}
        number={open ? levelIndex(open.id) + 1 : 0}
        onClose={() => setOpen(null)}
        onPlay={play}
        onNeedLives={() => {
          setOpen(null);
          setLivesOpen(true);
        }}
      />
      <LivesSheet open={livesOpen} onClose={() => setLivesOpen(false)} />
      {TARGET === 'app' && <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
