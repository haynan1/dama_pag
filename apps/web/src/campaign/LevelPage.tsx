import {
  chapterOf,
  costsLife,
  isUnlocked,
  LEVELS,
  type Level,
  levelById,
  levelIndex,
  MAX_MISTAKES,
  shouldShowInterstitial,
} from '@dama/campaign';
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  CircleNotch,
  Lightbulb,
  MapTrifold,
  X,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Redirect, useLocation } from 'wouter';
import { Board, type BoardArrow } from '../components/Board.tsx';
import { Button } from '../components/ui.tsx';
import { showInterstitial } from '../platform/ads.ts';
import { onBack } from '../platform/back.ts';
import { isPremium, usePremium } from '../platform/billing.ts';
import { markArrival } from './arrival.ts';
import { objective, opponentName } from './describe.ts';
import { campaign, getCampaign } from './store.ts';
import s from './ui/campaign.module.css';
import { StarRow } from './ui/LevelSheet.tsx';
import { LivesSheet } from './ui/Lives.tsx';
import { Sheet } from './ui/Sheet.tsx';
import { type Outcome, useLevelSession } from './useLevelSession.ts';

export function LevelPage({ id }: { id: string }) {
  const level = levelById(id);
  // A fase só abre com o "ingresso" emitido pela trilha (vida paga). Digitar a URL não pula a vida.
  const [allowed] = useState(() => getCampaign().active?.levelId === id);
  // Nova tentativa da mesma fase: a URL não muda, então a sessão é remontada por esta chave.
  const [attempt, setAttempt] = useState(0);
  if (!level || !allowed) return <Redirect to="/" replace />;
  return <LevelView key={attempt} level={level} onRestart={() => setAttempt((n) => n + 1)} />;
}

function LevelView({ level, onRestart }: { level: Level; onRestart: () => void }) {
  const session = useLevelSession(level);
  const [, navigate] = useLocation();
  const premium = usePremium();
  const [quitOpen, setQuitOpen] = useState(false);
  const [livesOpen, setLivesOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const chapter = chapterOf(level.id);
  const index = levelIndex(level.id);
  const next = LEVELS[index + 1];
  const over = session.phase === 'over';

  useEffect(
    () =>
      onBack(() => {
        if (over) return false;
        setQuitOpen(true);
        return true;
      }),
    [over],
  );

  /** Saída pela tela de resultado: o intersticial (se for a vez dele) passa aqui, fora da fase. */
  const leave = async (then: () => void) => {
    setLeaving(true);
    const state = getCampaign();
    if (session.outcome?.completed && shouldShowInterstitial(state, Date.now(), isPremium())) {
      if (await showInterstitial()) campaign.markInterstitial();
    }
    setLeaving(false);
    then();
  };

  const toTrail = () => {
    if (session.outcome?.completed && next && isUnlocked(getCampaign(), next.id)) markArrival(next.id);
    navigate('/', { replace: true });
  };

  const startLevel = (target: Level) => {
    const r = campaign.start(target.id);
    if (r.ok && target.id === level.id) onRestart();
    else if (r.ok) navigate(`/fase/${target.id}`, { replace: true });
    else if (r.reason === 'no-lives') setLivesOpen(true);
    else toTrail();
  };

  const movable = session.phase === 'player' ? session.player : null;
  const arrows: BoardArrow[] =
    session.hint && session.hintStage === 2 ? [{ path: session.hint.path, tone: 'hint' }] : [];
  const highlight = session.hint && session.hintStage >= 1 ? [session.hint.square] : [];

  const status = (() => {
    if (session.feedback) return null;
    if (session.phase === 'loading') return 'Preparando o tabuleiro…';
    if (session.phase === 'thinking')
      return level.kind === 'match' ? `${opponentName(level)} pensando…` : 'Analisando…';
    if (session.phase === 'player') {
      const turn = `Sua vez · ${objective(level)}`;
      return session.maxMoves
        ? `${turn} · lance ${Math.min(session.movesPlayed + 1, session.maxMoves)} de ${session.maxMoves}`
        : turn;
    }
    return null;
  })();

  return (
    <div className={s.level}>
      <header className={s.levelTop}>
        <button
          type="button"
          className={s.iconButton}
          onClick={() => (over ? toTrail() : setQuitOpen(true))}
          aria-label={over ? 'Voltar para a trilha' : 'Sair da fase'}
        >
          {over ? <ArrowLeft aria-hidden="true" /> : <X aria-hidden="true" />}
        </button>
        <div className={s.levelHeading}>
          <p className={s.levelEyebrow}>
            {chapter?.title} · {level.kind === 'match' ? 'Partida' : `Fase ${index + 1}`}
          </p>
          <h1 className={`${s.levelTitle} display`}>{level.title}</h1>
        </div>
        {level.kind === 'puzzle' ? (
          <span
            className={s.tries}
            role="img"
            aria-label={`${MAX_MISTAKES - session.mistakes} tentativas restantes`}
          >
            {Array.from({ length: MAX_MISTAKES }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: posições fixas.
              <span key={i} className={i < MAX_MISTAKES - session.mistakes ? s.tryOn : s.tryOff} />
            ))}
          </span>
        ) : (
          <span className={s.vs}>
            <span className="eyebrow">contra</span>
            {opponentName(level)}
          </span>
        )}
      </header>

      <div className={s.levelBoard}>
        <Board
          variant="brazilian"
          fen={session.fen}
          orientation={session.player}
          movable={movable}
          onMove={(key) => session.move(key)}
          lastMove={session.lastMove}
          pace={session.pace}
          arrows={arrows}
          highlight={highlight}
          label={`Tabuleiro. ${status ?? session.feedback?.title ?? ''}`}
        />
      </div>

      <div className={s.levelDock}>
        <div
          className={`${s.feedback} ${session.feedback ? s[`feedback_${session.feedback.tone}`] : ''}`}
          role="status"
          aria-live="polite"
        >
          {session.feedback ? (
            <>
              <strong>{session.feedback.title}</strong>
              {session.feedback.details?.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </>
          ) : (
            <span className={s.statusLine}>
              {session.phase === 'thinking' && <CircleNotch className={s.spin} aria-hidden="true" />}
              {status}
            </span>
          )}
        </div>
        <div className={s.levelControls} role="toolbar" aria-label="Ações da fase">
          <Button
            variant="secondary"
            onClick={session.requestHint}
            disabled={session.phase !== 'player' || session.hintStage === 2}
          >
            <Lightbulb weight={session.hintStage > 0 ? 'fill' : 'regular'} aria-hidden="true" />
            {session.hintStage === 0 ? 'Dica' : 'Mostrar o lance'}
          </Button>
          {level.kind === 'match' && (
            <Button variant="ghost" onClick={session.undo} disabled={!session.canUndo}>
              <ArrowCounterClockwise aria-hidden="true" /> Desfazer
            </Button>
          )}
        </div>
        {session.assists > 0 && !over && (
          <p className={s.fine}>Dicas e lances desfeitos valem menos estrelas.</p>
        )}
      </div>

      <Sheet open={quitOpen} onClose={() => setQuitOpen(false)} labelledBy="sair-titulo">
        <p className="eyebrow">{level.title}</p>
        <h2 id="sair-titulo" className={s.sheetTitle}>
          Sair da fase?
        </h2>
        <p className={s.sheetLead}>
          {costsLife(level, premium)
            ? 'A fase conta como não concluída e a vida desta tentativa não volta.'
            : 'A fase fica para depois. Esta não custa vida.'}
        </p>
        <div className={s.sheetActions}>
          <Button variant="primary" size="large" block onClick={() => setQuitOpen(false)} autoFocus>
            Continuar jogando
          </Button>
          <Button
            variant="danger"
            size="large"
            block
            onClick={() => {
              setQuitOpen(false);
              session.resign();
              navigate('/', { replace: true });
            }}
          >
            Sair
          </Button>
        </div>
      </Sheet>

      {session.outcome && (
        <ResultSheet
          outcome={session.outcome}
          level={level}
          busy={leaving}
          hasNext={Boolean(next)}
          onNext={() => void leave(() => (next ? startLevel(next) : toTrail()))}
          onRetry={() => void leave(() => startLevel(level))}
          onTrail={() => void leave(toTrail)}
        />
      )}
      <LivesSheet open={livesOpen} onClose={() => setLivesOpen(false)} />
    </div>
  );
}

function ResultSheet({
  outcome,
  level,
  busy,
  hasNext,
  onNext,
  onRetry,
  onTrail,
}: {
  outcome: Outcome;
  level: Level;
  busy: boolean;
  hasNext: boolean;
  onNext: () => void;
  onRetry: () => void;
  onTrail: () => void;
}) {
  const premium = usePremium();
  const retryCost = costsLife(level, premium) ? ' · 1 vida' : '';
  return (
    <Sheet
      open
      onClose={onTrail}
      labelledBy="resultado-titulo"
      tone={outcome.completed ? 'win' : 'loss'}
      dismissible={false}
    >
      <div className={s.result}>
        {outcome.completed && outcome.stars !== null && (
          <StarRow value={outcome.stars} size="lg" label={`${outcome.stars} de 3 estrelas`} />
        )}
        <h2 id="resultado-titulo" className={`${s.resultTitle} display`}>
          {outcome.title}
        </h2>
        <p className={s.sheetLead}>{outcome.reason}</p>
      </div>
      <div className={s.sheetActions}>
        {outcome.completed ? (
          <>
            {hasNext && (
              <Button variant="primary" size="large" block onClick={onNext} loading={busy} autoFocus>
                Próxima fase <ArrowRight aria-hidden="true" />
              </Button>
            )}
            <Button variant="ghost" size="large" block onClick={onTrail} disabled={busy}>
              <MapTrifold aria-hidden="true" /> Trilha
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" size="large" block onClick={onRetry} loading={busy} autoFocus>
              <ArrowCounterClockwise aria-hidden="true" /> Tentar de novo{retryCost}
            </Button>
            <Button variant="ghost" size="large" block onClick={onTrail} disabled={busy}>
              <MapTrifold aria-hidden="true" /> Trilha
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
