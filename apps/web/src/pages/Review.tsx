import { moveNotation, Position, VARIANTS } from '@dama/engine';
import type { Side } from '@dama/protocol';
import {
  ArrowsDownUp,
  BookmarkSimple,
  CaretDoubleLeft,
  CaretDoubleRight,
  CaretLeft,
  CaretRight,
  DownloadSimple,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Board, type BoardArrow } from '../components/Board.tsx';
import { EvalGraph } from '../components/EvalGraph.tsx';
import { MoveList } from '../components/game/MoveList.tsx';
import { useToast } from '../components/Toasts.tsx';
import { Badge, Button, Card, ClassificationBadge, Skeleton, ui } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { formatScore, REASON_LABEL } from '../lib/format.ts';
import { keys } from '../lib/queries.ts';
import p from './pages.module.css';
import s from './Review.module.css';

export default function Review({ id }: { id: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: keys.game(id), queryFn: () => api.game(id) });
  const data = query.data;
  /** Ply exibido: -1 = posição inicial, n = depois do lance n. */
  const [ply, setPly] = useState<number | null>(null);
  const [orientation, setOrientation] = useState<Side | null>(null);
  const [saving, setSaving] = useState(false);

  const total = data?.moves.length ?? 0;
  const current = ply ?? total - 1;
  const go = useCallback((n: number) => setPly(Math.max(-1, Math.min(total - 1, n))), [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, [role="slider"]')) return;
      if (e.key === 'ArrowLeft') go(current - 1);
      else if (e.key === 'ArrowRight') go(current + 1);
      else if (e.key === 'Home') go(-1);
      else if (e.key === 'End') go(total - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, go, total]);

  const view = useMemo(() => {
    if (!data) return null;
    const fen = current < 0 ? data.startFen : (data.moves[current + 1]?.fenBefore ?? data.finalFen);
    const move = current >= 0 ? data.moves[current] : undefined;
    const review = data.reviews.find((r) => r.ply === current);
    const nextReview = data.reviews.find((r) => r.ply === current + 1);
    return { fen, move, review, nextReview };
  }, [data, current]);

  const arrows = useMemo<BoardArrow[]>(() => {
    if (!data || !view?.review?.bestNotation || !view.move) return [];
    if (view.review.bestNotation === view.move.notation) return [];
    // Mostra o melhor lance na posição anterior ao lance jogado.
    const before = Position.fromFen(data.summary.variant, view.move.fenBefore);
    const best = before.legalMoves().find((m) => moveNotation(before.geo, m) === view.review!.bestNotation);
    return best ? [{ path: best.path, tone: 'good' }] : [];
  }, [data, view]);

  if (query.isPending) {
    return (
      <div className={p.page}>
        <Skeleton height={48} width="40%" />
        <Skeleton height={480} />
      </div>
    );
  }
  if (!data || !view) {
    return (
      <div className={p.page}>
        <h1 className={p.title}>Partida não encontrada</h1>
        <Link href="/historico">Voltar ao histórico</Link>
      </div>
    );
  }

  const g = data.summary;
  const you = g.you ?? 'white';
  const boardSide = orientation ?? you;
  const variant = VARIANTS[g.variant];

  const saveStudy = async () => {
    setSaving(true);
    try {
      await api.createStudy({
        variant: g.variant,
        fen: view.fen,
        title: `Posição do lance ${Math.floor((current + 1) / 2) + 1} contra ${g.opponent}`,
        gameId: g.id,
        ply: current + 1,
      });
      toast('Posição salva nos seus estudos', 'success');
      void qc.invalidateQueries({ queryKey: keys.studies });
      void qc.invalidateQueries({ queryKey: keys.me });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível salvar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const outcomeLabel =
    g.outcome === 'win'
      ? 'Vitória'
      : g.outcome === 'loss'
        ? 'Derrota'
        : g.outcome === 'draw'
          ? 'Empate'
          : 'Em andamento';

  return (
    <div className={p.page}>
      <header className={p.header}>
        <div>
          <p className="eyebrow">
            {variant.name} {variant.short} · {g.reason ? REASON_LABEL[g.reason] : 'em andamento'}
          </p>
          <h1 className={p.title}>
            {outcomeLabel} <em>contra {g.opponent}</em>
          </h1>
        </div>
        <div className={p.row}>
          {g.accuracy !== null && <Badge tone="brass">Precisão {g.accuracy.toFixed(0)}%</Badge>}
          <a className={`${ui.button} ${ui.small}`} href={`/api/games/${g.id}/pdn`} download>
            <DownloadSimple aria-hidden="true" /> PDN
          </a>
        </div>
      </header>

      <div className={s.layout}>
        <div className={s.boardCol}>
          <Board
            variant={g.variant}
            fen={view.fen}
            orientation={boardSide}
            movable={null}
            lastMove={view.move ? { path: view.move.path, captures: view.move.captures } : null}
            arrows={arrows}
            label={`Revisão, lance ${current + 1} de ${total}`}
          />
          <div className={s.nav} role="toolbar" aria-label="Navegação">
            <Button variant="ghost" icon onClick={() => go(-1)} aria-label="Início">
              <CaretDoubleLeft aria-hidden="true" />
            </Button>
            <Button variant="ghost" icon onClick={() => go(current - 1)} aria-label="Lance anterior">
              <CaretLeft aria-hidden="true" />
            </Button>
            <span className={`${s.counter} mono`} aria-live="polite">
              {current + 1}/{total}
            </span>
            <Button variant="ghost" icon onClick={() => go(current + 1)} aria-label="Próximo lance">
              <CaretRight aria-hidden="true" />
            </Button>
            <Button variant="ghost" icon onClick={() => go(total - 1)} aria-label="Fim">
              <CaretDoubleRight aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              icon
              onClick={() => setOrientation(boardSide === 'white' ? 'black' : 'white')}
              aria-label="Virar tabuleiro"
            >
              <ArrowsDownUp aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className={s.side}>
          <Card>
            <div className={p.cardBody}>
              <EvalGraph reviews={data.reviews} plies={total} current={Math.max(0, current)} onSelect={go} />
              {view.move ? (
                <div className={s.explain}>
                  <div className={s.explainHead}>
                    <span className={`${s.moveName} mono`}>{view.move.notation}</span>
                    {view.review?.classification && (
                      <ClassificationBadge value={view.review.classification} />
                    )}
                    {view.review && <span className="mono muted">{formatScore(view.review.evalWhite)}</span>}
                  </div>
                  {view.review?.headline && <p className={s.headline}>{view.review.headline}</p>}
                  {view.review?.details && view.review.details.length > 0 && (
                    <ul className={s.details}>
                      {view.review.details.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  )}
                  {view.review?.bestNotation && view.review.bestNotation !== view.move.notation && (
                    <p className={s.best}>
                      Melhor: <strong className="mono">{view.review.bestNotation}</strong>
                      {view.review.bestPv.length > 1 && (
                        <span className="mono muted"> — {view.review.bestPv.slice(1, 6).join('  ')}</span>
                      )}
                    </p>
                  )}
                  {!view.review?.classification && view.move.side !== you && (
                    <p className="muted" style={{ fontSize: 14 }}>
                      Lance do adversário.
                    </p>
                  )}
                </div>
              ) : (
                <p className="muted">Posição inicial. Use as setas ← → para navegar.</p>
              )}
              <div className={p.row}>
                <Button size="small" onClick={saveStudy} loading={saving}>
                  <BookmarkSimple aria-hidden="true" /> Salvar posição como estudo
                </Button>
                <Link
                  href={`/analise?variant=${g.variant}&fen=${encodeURIComponent(view.fen)}`}
                  className={`${ui.button} ${ui.small} ${ui.ghost}`}
                >
                  <MagnifyingGlass aria-hidden="true" /> Analisar daqui
                </Link>
              </div>
            </div>
          </Card>
          <Card>
            <MoveList
              moves={data.moves}
              reviews={data.reviews}
              current={current < 0 ? -1 : current}
              onSelect={go}
              blackStarts={Position.fromFen(g.variant, data.startFen).side === -1}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
