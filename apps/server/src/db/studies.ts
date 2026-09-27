import type { Classification, VariantId } from '@dama/engine';
import type { StudyView } from '@dama/protocol';
import type { Database } from './database.ts';
import { newId, nowIso } from './ids.ts';

interface StudyRow {
  id: string;
  profile_id: string;
  variant: VariantId;
  fen: string;
  title: string;
  notes: string;
  source: 'mistake' | 'manual';
  game_id: string | null;
  ply: number | null;
  played_notation: string | null;
  best_notation: string | null;
  best_line: string;
  headline: string | null;
  classification: Classification | null;
  due_at: string;
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
  last_result: 'correct' | 'incorrect' | null;
  created_at: string;
}

export interface StudyRecord extends StudyView {
  readonly profileId: string;
  readonly intervalDays: number;
  readonly ease: number;
}

function fromRow(r: StudyRow): StudyRecord {
  return {
    id: r.id,
    profileId: r.profile_id,
    variant: r.variant,
    fen: r.fen,
    title: r.title,
    notes: r.notes,
    source: r.source,
    gameId: r.game_id,
    ply: r.ply,
    playedNotation: r.played_notation,
    bestNotation: r.best_notation,
    bestLine: JSON.parse(r.best_line) as string[],
    headline: r.headline,
    classification: r.classification,
    dueAt: r.due_at,
    reps: r.reps,
    lapses: r.lapses,
    lastResult: r.last_result,
    createdAt: r.created_at,
    intervalDays: r.interval_days,
    ease: r.ease,
  };
}

export function toStudyView(s: StudyRecord): StudyView {
  const { profileId: _p, intervalDays: _i, ease: _e, ...view } = s;
  return view;
}

export interface NewStudy {
  readonly profileId: string;
  readonly variant: VariantId;
  readonly fen: string;
  readonly title: string;
  readonly notes: string;
  readonly source: 'mistake' | 'manual';
  readonly gameId: string | null;
  readonly ply: number | null;
  readonly playedNotation: string | null;
  readonly bestNotation: string | null;
  readonly bestLine: readonly string[];
  readonly headline: string | null;
  readonly classification: Classification | null;
}

export class StudyRepo {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /** Cria o caso. Retorna `null` se a mesma posição da mesma partida já está salva. */
  create(s: NewStudy): StudyRecord | null {
    const id = newId();
    const now = nowIso();
    const res = this.db.run(
      `INSERT OR IGNORE INTO study_cases (id, profile_id, variant, fen, title, notes, source, game_id, ply,
         played_notation, best_notation, best_line, headline, classification, due_at, created_at)
       VALUES (:id, :profileId, :variant, :fen, :title, :notes, :source, :gameId, :ply,
         :playedNotation, :bestNotation, :bestLine, :headline, :classification, :now, :now)`,
      {
        id,
        profileId: s.profileId,
        variant: s.variant,
        fen: s.fen,
        title: s.title,
        notes: s.notes,
        source: s.source,
        gameId: s.gameId,
        ply: s.ply,
        playedNotation: s.playedNotation,
        bestNotation: s.bestNotation,
        bestLine: JSON.stringify(s.bestLine),
        headline: s.headline,
        classification: s.classification,
        now,
      },
    );
    return Number(res.changes) > 0 ? this.byId(s.profileId, id)! : null;
  }

  byId(profileId: string, id: string): StudyRecord | undefined {
    const row = this.db.get<StudyRow>(
      'SELECT * FROM study_cases WHERE id = :id AND profile_id = :profileId',
      {
        id,
        profileId,
      },
    );
    return row ? fromRow(row) : undefined;
  }

  list(profileId: string): StudyRecord[] {
    return this.db
      .all<StudyRow>(
        'SELECT * FROM study_cases WHERE profile_id = :profileId ORDER BY created_at DESC LIMIT 500',
        {
          profileId,
        },
      )
      .map(fromRow);
  }

  due(profileId: string, limit = 20): StudyRecord[] {
    return this.db
      .all<StudyRow>(
        'SELECT * FROM study_cases WHERE profile_id = :profileId AND due_at <= :now ORDER BY due_at LIMIT :limit',
        { profileId, now: nowIso(), limit },
      )
      .map(fromRow);
  }

  countDue(profileId: string): number {
    return (
      this.db.get<{ n: number }>(
        'SELECT COUNT(*) AS n FROM study_cases WHERE profile_id = :profileId AND due_at <= :now',
        {
          profileId,
          now: nowIso(),
        },
      )?.n ?? 0
    );
  }

  update(
    profileId: string,
    id: string,
    fields: { title?: string | undefined; notes?: string | undefined },
  ): void {
    this.db.run(
      `UPDATE study_cases SET title = COALESCE(:title, title), notes = COALESCE(:notes, notes)
       WHERE id = :id AND profile_id = :profileId`,
      { id, profileId, title: fields.title ?? null, notes: fields.notes ?? null },
    );
  }

  schedule(
    id: string,
    s: {
      dueAt: Date;
      intervalDays: number;
      ease: number;
      reps: number;
      lapses: number;
      result: 'correct' | 'incorrect';
    },
  ): void {
    this.db.run(
      `UPDATE study_cases SET due_at = :dueAt, interval_days = :intervalDays, ease = :ease, reps = :reps,
         lapses = :lapses, last_result = :result WHERE id = :id`,
      {
        id,
        dueAt: s.dueAt.toISOString(),
        intervalDays: s.intervalDays,
        ease: s.ease,
        reps: s.reps,
        lapses: s.lapses,
        result: s.result,
      },
    );
  }

  delete(profileId: string, id: string): boolean {
    const res = this.db.run('DELETE FROM study_cases WHERE id = :id AND profile_id = :profileId', {
      id,
      profileId,
    });
    return Number(res.changes) > 0;
  }
}
