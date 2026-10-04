import type { Lookahead, LookaheadNode } from '@dama/engine';
import { CaretRight, Play } from '@phosphor-icons/react';
import { useState } from 'react';
import { formatScore } from '../../lib/format.ts';
import {
  bestPlanLines,
  lineForFollowUp,
  lineForReply,
  linesForCandidate,
  MAX_PLIES,
  type WatchLine,
} from '../../lib/playback.ts';
import type { BoardArrow } from '../Board.tsx';
import s from './game.module.css';

interface Props {
  readonly tree: Lookahead;
  readonly onPreview: (arrows: BoardArrow[] | null) => void;
  /** Encena linhas no tabuleiro (a IA joga pelos dois lados e volta à posição atual). */
  readonly onWatch?: (lines: WatchLine[]) => void;
}

function tone(score: number): string {
  if (score >= 60) return 'good';
  if (score <= -60) return 'bad';
  return 'neutral';
}

function Score({ value }: { value: number }) {
  return (
    <span
      className={`${s.score} ${s[`score_${tone(value)}`]} mono`}
      title="Avaliação do seu ponto de vista (em pedras)"
    >
      {formatScore(value)}
    </span>
  );
}

/**
 * Árvore de 3 jogadas: seus candidatos → respostas do adversário → sua continuação.
 * Passar o mouse ou focar um nó desenha a sequência no tabuleiro.
 */
export function LookaheadTree({ tree, onPreview, onWatch }: Props) {
  const [open, setOpen] = useState<string | null>(tree.nodes[0]?.key ?? null);

  const preview = (chain: LookaheadNode[]) => () =>
    onPreview(
      chain.map((n, i) => ({
        path: n.path,
        tone: i % 2 === 0 ? 'brass' : 'steel',
        faint: i === 2,
      })),
    );
  const clear = () => onPreview(null);
  const watch = (lines: WatchLine[]) => () => {
    clear();
    onWatch?.(lines);
  };
  const best = tree.nodes[0];

  return (
    <div className={s.tree}>
      <blockquote className={s.summary}>{tree.summary}</blockquote>
      {onWatch && best && (
        <button type="button" className={s.watchHero} onClick={watch(bestPlanLines(tree))}>
          <span className={s.watchIcon} aria-hidden="true">
            <Play weight="fill" />
          </span>
          <span className={s.watchText}>
            <strong>Assistir no tabuleiro</strong>
            <span>
              A IA joga {best.notation} por você e mostra{' '}
              {best.children.length > 1
                ? `as ${best.children.length} respostas do adversário`
                : 'a continuação'}
              , {MAX_PLIES / 2} lances de cada lado. Depois volta para cá.
            </span>
          </span>
        </button>
      )}
      <p className={s.treeLegend}>
        <span className={s.legendMine} /> seu lance <span className={s.legendTheirs} /> resposta do adversário
      </p>
      <ol className={s.treeList}>
        {tree.nodes.map((node, i) => {
          const expanded = open === node.key;
          return (
            <li key={node.key} className={`${s.treeNode} ${i === 0 ? s.treeBest : ''}`}>
              <button
                type="button"
                className={s.treeHead}
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : node.key)}
                onMouseEnter={preview([node])}
                onFocus={preview([node])}
                onMouseLeave={clear}
                onBlur={clear}
              >
                <CaretRight className={s.caret} aria-hidden="true" />
                <span className={`${s.treeMove} mono`}>{node.notation}</span>
                <span className={s.treeHeadline}>{node.insight.headline}</span>
                <Score value={node.score} />
              </button>
              {expanded && (
                <div className={s.treeBody}>
                  {node.insight.details.length > 0 && (
                    <ul className={s.details}>
                      {node.insight.details.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  )}
                  {onWatch && (
                    <button type="button" className={s.watchPlan} onClick={watch(linesForCandidate(node))}>
                      <Play weight="fill" aria-hidden="true" /> Assistir {node.notation} contra cada resposta
                    </button>
                  )}
                  <p className="eyebrow">O que o adversário pode fazer</p>
                  <ul className={s.replies}>
                    {node.children.map((reply) => (
                      <li key={reply.key}>
                        <div className={s.replyRow}>
                          <button
                            type="button"
                            className={s.reply}
                            onMouseEnter={preview([node, reply])}
                            onFocus={preview([node, reply])}
                            onMouseLeave={clear}
                            onBlur={clear}
                          >
                            <span className={`${s.replyMove} mono`}>{reply.notation}</span>
                            <span className={s.replyText}>{reply.insight.headline}</span>
                            <Score value={reply.score} />
                          </button>
                          {onWatch && (
                            <button
                              type="button"
                              className={s.watchLine}
                              onClick={watch([lineForReply(node, reply)])}
                              aria-label={`Assistir ${node.notation} e a resposta ${reply.notation}`}
                              title="Assistir esta linha"
                            >
                              <Play weight="fill" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                        {reply.children.length > 0 && (
                          <div className={s.followUps}>
                            <span className={s.followLabel}>você responde</span>
                            {reply.children.map((f) => (
                              <button
                                key={f.key}
                                type="button"
                                className={s.follow}
                                onMouseEnter={preview([node, reply, f])}
                                onFocus={preview([node, reply, f])}
                                onMouseLeave={clear}
                                onBlur={clear}
                                onClick={onWatch ? watch([lineForFollowUp(node, reply, f)]) : undefined}
                                title={
                                  onWatch ? `${f.insight.headline} — toque para assistir` : f.insight.headline
                                }
                              >
                                <span className="mono">{f.notation}</span>
                                <Score value={f.score} />
                              </button>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className={s.treeFoot}>
        Profundidade {tree.depth} · {(tree.timeMs / 1000).toFixed(1)}s de cálculo. Pontuação em pedras, do seu
        ponto de vista.
      </p>
    </div>
  );
}
