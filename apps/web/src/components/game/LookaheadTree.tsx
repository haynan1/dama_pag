import type { Lookahead, LookaheadNode } from '@dama/engine';
import { CaretRight } from '@phosphor-icons/react';
import { useState } from 'react';
import { formatScore } from '../../lib/format.ts';
import type { BoardArrow } from '../Board.tsx';
import s from './game.module.css';

interface Props {
  readonly tree: Lookahead;
  readonly onPreview: (arrows: BoardArrow[] | null) => void;
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
export function LookaheadTree({ tree, onPreview }: Props) {
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

  return (
    <div className={s.tree}>
      <blockquote className={s.summary}>{tree.summary}</blockquote>
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
                  <p className="eyebrow">O que o adversário pode fazer</p>
                  <ul className={s.replies}>
                    {node.children.map((reply) => (
                      <li key={reply.key}>
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
                                title={f.insight.headline}
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
