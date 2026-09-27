import { type Move, moveNotation, Position, VARIANTS } from '@dama/engine';
import type { StudyView } from '@dama/protocol';
import { ArrowRight, CheckCircle, Confetti, XCircle } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Board, type BoardArrow } from '../components/Board.tsx';
import { useToast } from '../components/Toasts.tsx';
import { Badge, Button, Card, Empty, Skeleton } from '../components/ui.tsx';
import { type AttemptResponse, api } from '../lib/api.ts';
import { relativeText } from '../lib/format.ts';
import { keys } from '../lib/queries.ts';
import p from './pages.module.css';
import s from './StudyTrainer.module.css';

/** Sessão de treino: fila de posições pendentes, uma por vez, no estilo de problemas. */
export default function StudyTrainer() {
  const qc = useQueryClient();
  const toast = useToast();
  // A fila é fixada no início da sessão: estudos errados voltam na próxima sessão.
  const query = useQuery({
    queryKey: keys.due,
    queryFn: api.dueStudies,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [played, setPlayed] = useState<{ fen: string; path: number[]; captures: number[] } | null>(null);
  const [pending, setPending] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0, xp: 0 });

  const queue = query.data?.studies ?? [];
  const study: StudyView | undefined = queue[index];

  const onMove = async (key: string, move: Move) => {
    if (!study || pending || result) return;
    const pos = Position.fromFen(study.variant, study.fen);
    pos.make(move);
    setPlayed({ fen: pos.fen(), path: [...move.path], captures: [...move.captures] });
    setPending(true);
    try {
      const res = await api.attemptStudy(study.id, key);
      setResult(res);
      setScore((sc) => ({
        correct: sc.correct + (res.correct ? 1 : 0),
        total: sc.total + 1,
        xp: sc.xp + res.xpGained,
      }));
      for (const a of res.achievements) toast(`Conquista: ${a.title}`, 'success');
    } catch (err) {
      setPlayed(null);
      toast(err instanceof Error ? err.message : 'Falha ao verificar', 'error');
    } finally {
      setPending(false);
    }
  };

  const next = () => {
    setResult(null);
    setPlayed(null);
    setIndex((i) => i + 1);
    void qc.invalidateQueries({ queryKey: keys.me });
    void qc.invalidateQueries({ queryKey: keys.studies });
  };

  const bestArrow = useMemo<BoardArrow[]>(() => {
    if (!study || !result || result.correct) return [];
    const pos = Position.fromFen(study.variant, study.fen);
    const best = pos.legalMoves().find((m) => moveNotation(pos.geo, m) === result.bestNotation);
    return best ? [{ path: best.path, tone: 'good' }] : [];
  }, [study, result]);

  if (query.isPending) {
    return (
      <div className={p.page}>
        <Skeleton height={48} width="40%" />
        <Skeleton height={480} />
      </div>
    );
  }

  if (!study) {
    return (
      <div className={p.page}>
        <Card>
          <Empty
            icon={<Confetti weight="duotone" aria-hidden="true" />}
            title={score.total > 0 ? 'Sessão concluída' : 'Nada pendente agora'}
          >
            {score.total > 0 && (
              <p>
                {score.correct} de {score.total} acertos · +{score.xp} XP
              </p>
            )}
            <Link href="/estudos">Ver todos os estudos</Link>
          </Empty>
        </Card>
      </div>
    );
  }

  const side = study.fen.startsWith('W') ? 'white' : 'black';
  return (
    <div className={p.page}>
      <header className={p.header}>
        <div>
          <p className="eyebrow">
            Treino · {index + 1} de {queue.length}
          </p>
          <h1 className={p.title}>
            {side === 'white' ? 'Brancas' : 'Pretas'} jogam. <em>Qual o melhor lance?</em>
          </h1>
          <p className={p.lede}>{study.title}</p>
        </div>
        <div className={p.row}>
          <Badge>{VARIANTS[study.variant].name}</Badge>
          <Badge tone="good">{score.correct} acertos</Badge>
        </div>
      </header>

      <div className={s.layout}>
        <div className={s.board}>
          <Board
            variant={study.variant}
            fen={played?.fen ?? study.fen}
            orientation={side}
            movable={result || pending || played ? null : side}
            onMove={(key, move) => void onMove(key, move)}
            lastMove={played ? { path: played.path, captures: played.captures } : null}
            arrows={bestArrow}
            label="Posição de estudo"
          />
        </div>
        <Card className={s.panel}>
          <div className={p.cardBody}>
            {!result && !pending && (
              <>
                <p className="muted">
                  Encontre o lance que o motor considera melhor. Lances equivalentes também valem. Não há
                  pressa: pense na resposta do adversário.
                </p>
                {study.headline && (
                  <p className={s.clue}>
                    Pista: na partida, o problema foi <em>{study.headline.toLowerCase()}</em>.
                  </p>
                )}
              </>
            )}
            {pending && (
              <p className="muted" role="status">
                Verificando com o motor…
              </p>
            )}
            {result && (
              <div className={`${s.result} ${result.correct ? s.correct : s.wrong}`} role="status">
                <p className={s.verdict}>
                  {result.correct ? (
                    <CheckCircle weight="fill" aria-hidden="true" />
                  ) : (
                    <XCircle weight="fill" aria-hidden="true" />
                  )}
                  {result.correct ? 'Correto!' : 'Não é o melhor'}
                  <span className="mono">+{result.xpGained} XP</span>
                </p>
                <p>
                  Você jogou <strong className="mono">{result.playedNotation}</strong>
                  {!result.correct && (
                    <>
                      ; o melhor era <strong className="mono">{result.bestNotation}</strong>
                    </>
                  )}
                  .
                </p>
                <p className={s.headline}>{result.insight.headline}</p>
                <ul className={s.details}>
                  {result.insight.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
                {result.bestLine.length > 1 && (
                  <p className={s.lineText}>
                    Linha: <span className="mono">{result.bestLine.slice(0, 7).join('  ')}</span>
                  </p>
                )}
                <p className={s.nextDue}>Próxima revisão {relativeText(result.nextDueAt)}.</p>
                <Button variant="primary" onClick={next} autoFocus>
                  {index + 1 < queue.length ? 'Próxima posição' : 'Concluir'}{' '}
                  <ArrowRight weight="bold" aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
