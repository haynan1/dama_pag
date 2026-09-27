import type { MoveView, ReviewView } from '@dama/protocol';
import { useEffect, useRef } from 'react';
import { CLASSIFICATION_META } from '../../lib/format.ts';
import s from './game.module.css';

interface Props {
  readonly moves: readonly MoveView[];
  readonly reviews: readonly ReviewView[];
  /** Ply selecionado (revisão); `null` segue o último lance. */
  readonly current?: number | null;
  readonly onSelect?: (ply: number) => void;
  /** Se as pretas começam, a numeração desloca. */
  readonly blackStarts?: boolean;
}

export function MoveList({ moves, reviews, current = null, onSelect, blackStarts = false }: Props) {
  const byPly = new Map(reviews.map((r) => [r.ply, r]));
  const endRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: rola quando chega lance novo ou muda a seleção.
  useEffect(() => {
    if (current === null) endRef.current?.scrollIntoView({ block: 'nearest' });
    else activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [moves.length, current]);

  if (moves.length === 0) return <p className={s.emptyMoves}>Nenhum lance ainda.</p>;

  const offset = blackStarts ? 1 : 0;
  const rows: { n: number; white?: MoveView; black?: MoveView }[] = [];
  for (const m of moves) {
    const idx = m.ply + offset;
    const n = Math.floor(idx / 2) + 1;
    let row = rows.at(-1);
    if (!row || row.n !== n) {
      row = { n };
      rows.push(row);
    }
    if (idx % 2 === 0) row.white = m;
    else row.black = m;
  }

  const cell = (m?: MoveView) => {
    if (!m) return <span className={s.moveCell} />;
    const review = byPly.get(m.ply);
    const meta = review?.classification ? CLASSIFICATION_META[review.classification] : null;
    const active = current === m.ply || (current === null && m.ply === moves.length - 1);
    const content = (
      <>
        <span className="mono">{m.notation}</span>
        {meta && (
          <span className={`${s.glyph} ${s[`glyph_${meta.tone}`] ?? ''}`} title={meta.label}>
            {meta.glyph}
            <span className="visually-hidden">{meta.label}</span>
          </span>
        )}
      </>
    );
    return onSelect ? (
      <button
        type="button"
        ref={active ? activeRef : undefined}
        className={`${s.moveCell} ${active ? s.moveActive : ''}`}
        aria-current={active || undefined}
        onClick={() => onSelect(m.ply)}
      >
        {content}
      </button>
    ) : (
      <span className={`${s.moveCell} ${active ? s.moveActive : ''}`}>{content}</span>
    );
  };

  return (
    <div className={s.moves}>
      <ol className={s.moveRows}>
        {rows.map((r) => (
          <li key={r.n} className={s.moveRow}>
            <span className={`${s.moveNumber} mono`}>{r.n}.</span>
            {cell(r.white)}
            {cell(r.black)}
          </li>
        ))}
      </ol>
      <div ref={endRef} />
    </div>
  );
}
