import type { Lookahead } from '@dama/engine';
import type { GameView, HintView, ReviewView } from '@dama/protocol';
import { Brain, Lightbulb, Pause, Play, TreeStructure } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { formatScore } from '../../lib/format.ts';
import type { WatchLine } from '../../lib/playback.ts';
import type { BoardArrow } from '../Board.tsx';
import { Button, ClassificationBadge, Skeleton, Switch } from '../ui.tsx';
import s from './game.module.css';
import { LookaheadTree } from './LookaheadTree.tsx';

interface Props {
  readonly game: GameView;
  readonly yourTurn: boolean;
  readonly hint: HintView | null;
  readonly tree: Lookahead | null;
  readonly busy: { hint: boolean; lookahead: boolean };
  readonly lastReview: ReviewView | null;
  readonly hintStage: 0 | 1 | 2;
  readonly onHintStage: (stage: 0 | 1 | 2) => void;
  readonly onRequestHint: () => void;
  readonly onRequestTree: () => void;
  readonly onToggleMentor: (enabled: boolean) => void;
  readonly onPause: (paused: boolean) => void;
  readonly onPreview: (arrows: BoardArrow[] | null) => void;
  readonly onWatch: (lines: WatchLine[]) => void;
}

export function MentorPanel(props: Props) {
  const { game, yourTurn, hint, tree, busy, lastReview, hintStage, onHintStage } = props;
  const review = lastReview ?? game.reviews.filter((r) => r.side === game.you).at(-1) ?? null;
  const active = game.status === 'active';

  if (!game.mentor) {
    return (
      <div className={s.mentorOff}>
        <Brain weight="duotone" className={s.mentorIcon} aria-hidden="true" />
        <h3>Mentor desligado</h3>
        <p className="muted">
          Ligue para receber dicas, ver a árvore de 3 jogadas, pausar para estudar e ver a avaliação de cada
          lance seu. Partidas com ajuda rendem metade do XP e não contam para o rating.
        </p>
        <Switch checked={false} onChange={props.onToggleMentor} label="Ativar mentor" disabled={!active} />
      </div>
    );
  }

  return (
    <div className={s.mentor}>
      <div className={s.studyMode}>
        <Switch
          checked={game.paused}
          onChange={props.onPause}
          disabled={!active}
          label={
            <span className={s.inlineIcon}>
              {game.paused ? (
                <Pause weight="fill" aria-hidden="true" />
              ) : (
                <Play weight="fill" aria-hidden="true" />
              )}
              Modo estudo
            </span>
          }
          description={
            game.paused
              ? 'Relógio parado e IA aguardando. Explore com calma e retome quando decidir.'
              : 'Pausa a partida: relógio parado, IA espera o seu tempo.'
          }
        />
      </div>

      {review?.classification && (
        <section className={s.review} aria-live="polite" aria-label="Avaliação do seu último lance">
          <div className={s.reviewHead}>
            <span className="mono">{review.notation}</span>
            <ClassificationBadge value={review.classification} />
            <span className={`${s.score} mono`}>
              {formatScore(game.you === 'white' ? review.evalWhite : -review.evalWhite)}
            </span>
          </div>
          {review.headline && <p className={s.reviewHeadline}>{review.headline}</p>}
          {review.details.length > 0 && (
            <ul className={s.details}>
              {review.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className={s.tool}>
        <div className={s.toolHead}>
          <h3 className={s.inlineIcon}>
            <Lightbulb weight="duotone" aria-hidden="true" /> Dica
          </h3>
          {!yourTurn && active && <span className={s.toolNote}>na sua vez</span>}
        </div>
        {hintStage === 0 && (
          <Button
            block
            onClick={() => {
              onHintStage(1);
              if (!hint) props.onRequestHint();
            }}
            disabled={!yourTurn || !active}
            loading={busy.hint}
          >
            Qual peça devo mover?
          </Button>
        )}
        {hintStage >= 1 && busy.hint && <Skeleton height={44} />}
        {hintStage >= 1 && hint && (
          <div className={s.hint}>
            <p>
              Olhe para a peça em <strong className="mono">{hint.squareName}</strong>.
            </p>
            {hintStage === 1 ? (
              <Button block variant="ghost" onClick={() => onHintStage(2)}>
                Mostrar o lance e o porquê
              </Button>
            ) : (
              <>
                <p className={s.hintMove}>
                  <span className="mono">{hint.notation}</span>
                  <span className={`${s.score} mono`}>{formatScore(hint.score)}</span>
                </p>
                <p className={s.reviewHeadline}>{hint.insight.headline}</p>
                <ul className={s.details}>
                  {hint.insight.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
                {hint.pv.length > 1 && (
                  <p className={s.pv}>
                    Linha: <span className="mono">{hint.pv.slice(0, 6).join('  ')}</span>
                  </p>
                )}
              </>
            )}
          </div>
        )}
        {hintStage >= 1 && !busy.hint && !hint && yourTurn && (
          <p className={s.toolNote}>Sem dica para esta posição.</p>
        )}
      </section>

      <section className={s.tool}>
        <div className={s.toolHead}>
          <h3 className={s.inlineIcon}>
            <TreeStructure weight="duotone" aria-hidden="true" /> 3 jogadas à frente
          </h3>
        </div>
        {!tree && (
          <Button
            block
            onClick={props.onRequestTree}
            disabled={!yourTurn || !active}
            loading={busy.lookahead}
          >
            Mapear possibilidades
          </Button>
        )}
        {busy.lookahead && !tree && <TreeSkeleton />}
        {tree && <LookaheadTree tree={tree} onPreview={props.onPreview} onWatch={props.onWatch} />}
      </section>
    </div>
  );
}

function TreeSkeleton() {
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d + 1) % 4), 400);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={s.treeLoading} role="status">
      <p className="muted">Calculando lances, respostas e continuações{'.'.repeat(dots)}</p>
      <Skeleton height={52} />
      <Skeleton height={52} />
      <Skeleton height={52} />
    </div>
  );
}
