import { VARIANTS } from '@dama/engine';
import type { StudyView } from '@dama/protocol';
import { BookOpenText, Lightning, MagnifyingGlass, Trash } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'wouter';
import { Board } from '../components/Board.tsx';
import { useToast } from '../components/Toasts.tsx';
import {
  Badge,
  Button,
  Card,
  ClassificationBadge,
  Empty,
  Segmented,
  Skeleton,
  ui,
} from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { relativeText } from '../lib/format.ts';
import { keys } from '../lib/queries.ts';
import p from './pages.module.css';
import s from './Studies.module.css';

type Filter = 'all' | 'mistake' | 'manual' | 'due';

export default function Studies() {
  const qc = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: keys.studies, queryFn: api.studies });
  const [filter, setFilter] = useState<Filter>('all');
  const remove = useMutation({
    mutationFn: api.deleteStudy,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.studies });
      void qc.invalidateQueries({ queryKey: keys.me });
      toast('Estudo removido', 'success');
    },
    onError: (err) => toast(err.message, 'error'),
  });

  const studies = query.data?.studies ?? [];
  const now = Date.now();
  const visible = studies.filter((st) =>
    filter === 'all' ? true : filter === 'due' ? new Date(st.dueAt).getTime() <= now : st.source === filter,
  );
  const due = query.data?.due ?? 0;

  return (
    <div className={p.page}>
      <header className={p.header}>
        <div>
          <p className="eyebrow">Casos de estudo</p>
          <h1 className={p.title}>
            Aprenda com <em>seus erros</em>
          </h1>
          <p className={p.lede}>
            Cada erro nas suas partidas vira uma posição para treinar. Acertou? A revisão se espaça (1, 3, 8
            dias…). Errou? Ela volta em minutos, até fixar.
          </p>
        </div>
        {due > 0 && (
          <Link href="/estudos/treino" className={`${ui.button} ${ui.primary} ${ui.large}`}>
            <Lightning weight="fill" aria-hidden="true" /> Treinar {due} {due === 1 ? 'posição' : 'posições'}
          </Link>
        )}
      </header>

      <Segmented
        label="Filtro"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: `Todos · ${studies.length}` },
          { value: 'due', label: `Pendentes · ${due}` },
          { value: 'mistake', label: 'Dos erros' },
          { value: 'manual', label: 'Salvos' },
        ]}
      />

      {query.isPending ? (
        <div className={s.grid}>
          <Skeleton height={320} />
          <Skeleton height={320} />
          <Skeleton height={320} />
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <Empty icon={<BookOpenText aria-hidden="true" />} title="Nenhum caso aqui">
            <p>
              Jogue partidas — erros e erros graves viram estudos automaticamente. Você também pode salvar
              qualquer posição na revisão.
            </p>
          </Empty>
        </Card>
      ) : (
        <ul className={s.grid}>
          {visible.map((st) => (
            <li key={st.id}>
              <StudyCard
                study={st}
                onDelete={() => remove.mutate(st.id)}
                deleting={remove.isPending && remove.variables === st.id}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StudyCard({
  study,
  onDelete,
  deleting,
}: {
  study: StudyView;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const due = new Date(study.dueAt).getTime() <= Date.now();
  const side = study.fen.startsWith('W') ? 'white' : 'black';
  return (
    <Card className={s.card}>
      <div className={s.thumb} inert aria-hidden="true">
        <Board variant={study.variant} fen={study.fen} orientation={side} movable={null} label="" />
      </div>
      <div className={s.body}>
        <div className={s.meta}>
          <Badge>{VARIANTS[study.variant].short}</Badge>
          {study.classification && <ClassificationBadge value={study.classification} />}
          {due ? <Badge tone="brass">pendente</Badge> : <Badge>revisão {relativeText(study.dueAt)}</Badge>}
        </div>
        <h2 className={s.title}>{study.title}</h2>
        {study.playedNotation && study.bestNotation && (
          <p className={s.line}>
            Jogado <span className="mono">{study.playedNotation}</span> · melhor{' '}
            <span className="mono">{study.bestNotation}</span>
          </p>
        )}
        <p className={s.stats}>
          {study.reps} {study.reps === 1 ? 'acerto' : 'acertos'} seguidos · {study.lapses}{' '}
          {study.lapses === 1 ? 'erro' : 'erros'}
        </p>
        <div className={s.actions}>
          <Link
            href={`/analise?variant=${study.variant}&fen=${encodeURIComponent(study.fen)}`}
            className={`${ui.button} ${ui.small} ${ui.ghost}`}
          >
            <MagnifyingGlass aria-hidden="true" /> Analisar
          </Link>
          {confirm ? (
            <Button size="small" variant="danger" onClick={onDelete} loading={deleting}>
              Confirmar
            </Button>
          ) : (
            <Button
              size="small"
              variant="ghost"
              onClick={() => setConfirm(true)}
              aria-label={`Remover ${study.title}`}
            >
              <Trash aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
