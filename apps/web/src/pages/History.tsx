import { VARIANTS } from '@dama/engine';
import type { GameSummaryView } from '@dama/protocol';
import { CaretRight, ClockCounterClockwise, Cpu, WifiHigh } from '@phosphor-icons/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Badge, Button, Card, Empty, Skeleton } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { dateText, REASON_LABEL } from '../lib/format.ts';
import { keys } from '../lib/queries.ts';
import p from './pages.module.css';

const OUTCOME: Record<'win' | 'loss' | 'draw', { label: string; tone: string }> = {
  win: { label: 'Vitória', tone: 'good' },
  loss: { label: 'Derrota', tone: 'bad' },
  draw: { label: 'Empate', tone: 'neutral' },
};

export default function History() {
  const query = useInfiniteQuery({
    queryKey: keys.games,
    queryFn: ({ pageParam }) => api.games(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.games.length >= 30 ? last.games.at(-1)?.createdAt : undefined),
  });
  const games = query.data?.pages.flatMap((pg) => pg.games) ?? [];

  return (
    <div className={p.page}>
      <header className={p.header}>
        <div>
          <p className="eyebrow">Histórico</p>
          <h1 className={p.title}>Suas partidas</h1>
          <p className={p.lede}>
            Revise lance a lance com a avaliação do motor e transforme posições em estudo.
          </p>
        </div>
      </header>

      <Card>
        {query.isPending ? (
          <div style={{ display: 'grid', gap: 12, padding: 24 }}>
            <Skeleton height={48} />
            <Skeleton height={48} />
            <Skeleton height={48} />
          </div>
        ) : games.length === 0 ? (
          <Empty icon={<ClockCounterClockwise aria-hidden="true" />} title="Nenhuma partida ainda">
            <Link href="/">Jogue a primeira</Link>
          </Empty>
        ) : (
          <ul className={p.list}>
            {games.map((g) => (
              <li key={g.id}>
                <GameRow game={g} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      {query.hasNextPage && (
        <Button onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
          Carregar mais
        </Button>
      )}
    </div>
  );
}

function GameRow({ game: g }: { game: GameSummaryView }) {
  const outcome = g.outcome ? OUTCOME[g.outcome] : null;
  return (
    <Link href={g.status === 'finished' ? `/historico/${g.id}` : `/partida/${g.id}`} className={p.listItem}>
      {g.mode === 'ai' ? (
        <Cpu aria-hidden="true" width={20} height={20} />
      ) : (
        <WifiHigh aria-hidden="true" width={20} height={20} />
      )}
      <span className={p.listMain}>
        <strong>
          {g.you === 'white' ? 'Brancas' : 'Pretas'} contra {g.opponent}
        </strong>
        <span className={p.listMeta}>
          {VARIANTS[g.variant].name} · {Math.ceil(g.plies / 2)} lances · {dateText(g.createdAt)}
          {g.reason && ` · ${REASON_LABEL[g.reason]}`}
        </span>
      </span>
      {g.accuracy !== null && (
        <span className="mono" style={{ fontSize: 13, color: 'var(--text-2)' }} title="Precisão">
          {g.accuracy.toFixed(0)}%
        </span>
      )}
      {g.assisted && <Badge tone="brilliant">mentor</Badge>}
      {outcome ? (
        <Badge tone={outcome.tone}>{outcome.label}</Badge>
      ) : (
        <Badge tone="brass">em andamento</Badge>
      )}
      <CaretRight aria-hidden="true" />
    </Link>
  );
}
