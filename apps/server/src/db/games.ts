import type { EndReason, VariantId } from '@dama/engine';
import type { GameStatus, GameSummaryView, ReviewView, Side } from '@dama/protocol';
import type { Database } from './database.ts';
import { nowIso } from './ids.ts';

export interface TimeControl {
  readonly initialSec: number;
  readonly incrementSec: number;
}

export interface ClockState {
  whiteMs: number;
  blackMs: number;
}

export interface GameRecord {
  id: string;
  variant: VariantId;
  mode: 'ai' | 'lan';
  status: GameStatus;
  roomCode: string | null;
  whiteId: string | null;
  blackId: string | null;
  whiteName: string;
  blackName: string;
  aiLevel: number | null;
  aiSide: Side | null;
  startFen: string;
  moves: string[];
  timeControl: TimeControl | null;
  clock: ClockState | null;
  mentor: boolean;
  assisted: boolean;
  hints: number;
  takebacks: number;
  winner: Side | null;
  endReason: EndReason | null;
  whiteAccuracy: number | null;
  blackAccuracy: number | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

interface GameRow {
  id: string;
  variant: VariantId;
  mode: 'ai' | 'lan';
  status: GameStatus;
  room_code: string | null;
  white_id: string | null;
  black_id: string | null;
  white_name: string;
  black_name: string;
  ai_level: number | null;
  ai_side: Side | null;
  start_fen: string;
  moves: string;
  time_control: string | null;
  clock: string | null;
  mentor: number;
  assisted: number;
  hints: number;
  takebacks: number;
  winner: Side | null;
  end_reason: EndReason | null;
  white_accuracy: number | null;
  black_accuracy: number | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

function fromRow(r: GameRow): GameRecord {
  return {
    id: r.id,
    variant: r.variant,
    mode: r.mode,
    status: r.status,
    roomCode: r.room_code,
    whiteId: r.white_id,
    blackId: r.black_id,
    whiteName: r.white_name,
    blackName: r.black_name,
    aiLevel: r.ai_level,
    aiSide: r.ai_side,
    startFen: r.start_fen,
    moves: JSON.parse(r.moves) as string[],
    timeControl: r.time_control ? (JSON.parse(r.time_control) as TimeControl) : null,
    clock: r.clock ? (JSON.parse(r.clock) as ClockState) : null,
    mentor: r.mentor === 1,
    assisted: r.assisted === 1,
    hints: r.hints,
    takebacks: r.takebacks,
    winner: r.winner,
    endReason: r.end_reason,
    whiteAccuracy: r.white_accuracy,
    blackAccuracy: r.black_accuracy,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    finishedAt: r.finished_at,
  };
}

function toParams(g: GameRecord): Record<string, string | number | null> {
  return {
    id: g.id,
    variant: g.variant,
    mode: g.mode,
    status: g.status,
    room_code: g.roomCode,
    white_id: g.whiteId,
    black_id: g.blackId,
    white_name: g.whiteName,
    black_name: g.blackName,
    ai_level: g.aiLevel,
    ai_side: g.aiSide,
    start_fen: g.startFen,
    moves: JSON.stringify(g.moves),
    time_control: g.timeControl ? JSON.stringify(g.timeControl) : null,
    clock: g.clock ? JSON.stringify(g.clock) : null,
    mentor: g.mentor ? 1 : 0,
    assisted: g.assisted ? 1 : 0,
    hints: g.hints,
    takebacks: g.takebacks,
    winner: g.winner,
    end_reason: g.endReason,
    white_accuracy: g.whiteAccuracy,
    black_accuracy: g.blackAccuracy,
    created_at: g.createdAt,
    updated_at: g.updatedAt,
    finished_at: g.finishedAt,
  };
}

const FIELDS = [
  'id',
  'variant',
  'mode',
  'status',
  'room_code',
  'white_id',
  'black_id',
  'white_name',
  'black_name',
  'ai_level',
  'ai_side',
  'start_fen',
  'moves',
  'time_control',
  'clock',
  'mentor',
  'assisted',
  'hints',
  'takebacks',
  'winner',
  'end_reason',
  'white_accuracy',
  'black_accuracy',
  'created_at',
  'updated_at',
  'finished_at',
] as const;

interface ReviewRow {
  ply: number;
  side: Side;
  notation: string;
  classification: ReviewView['classification'];
  accuracy: number | null;
  eval_white: number;
  best_notation: string | null;
  best_pv: string;
  headline: string | null;
  details: string;
}

export class GameRepo {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  insert(g: GameRecord): void {
    const cols = FIELDS.join(', ');
    const vals = FIELDS.map((f) => `:${f}`).join(', ');
    this.db.run(`INSERT INTO games (${cols}) VALUES (${vals})`, toParams(g));
  }

  save(g: GameRecord): void {
    g.updatedAt = nowIso();
    const sets = FIELDS.filter((f) => f !== 'id' && f !== 'created_at')
      .map((f) => `${f} = :${f}`)
      .join(', ');
    const params = toParams(g);
    delete params['created_at'];
    this.db.run(`UPDATE games SET ${sets} WHERE id = :id`, params);
  }

  byId(id: string): GameRecord | undefined {
    const row = this.db.get<GameRow>('SELECT * FROM games WHERE id = :id', { id });
    return row ? fromRow(row) : undefined;
  }

  byRoomCode(code: string): GameRecord | undefined {
    const row = this.db.get<GameRow>(`SELECT * FROM games WHERE room_code = :code AND status = 'waiting'`, {
      code,
    });
    return row ? fromRow(row) : undefined;
  }

  listForProfile(profileId: string, limit: number, before?: string): GameSummaryView[] {
    const rows = this.db.all<GameRow>(
      `SELECT * FROM games
       WHERE (white_id = :pid OR black_id = :pid) AND status != 'waiting'
         AND (:before IS NULL OR created_at < :before)
       ORDER BY created_at DESC LIMIT :limit`,
      { pid: profileId, limit, before: before ?? null },
    );
    return rows.map((r) => summarize(fromRow(r), profileId));
  }

  activeForProfile(profileId: string): GameSummaryView[] {
    const rows = this.db.all<GameRow>(
      `SELECT * FROM games WHERE (white_id = :pid OR black_id = :pid) AND status IN ('active', 'waiting')
       ORDER BY updated_at DESC LIMIT 10`,
      { pid: profileId },
    );
    return rows.map((r) => summarize(fromRow(r), profileId));
  }

  upsertReview(gameId: string, r: ReviewView): void {
    this.db.run(
      `INSERT INTO move_reviews (game_id, ply, side, notation, classification, accuracy, eval_white, best_notation, best_pv, headline, details)
       VALUES (:gameId, :ply, :side, :notation, :classification, :accuracy, :evalWhite, :bestNotation, :bestPv, :headline, :details)
       ON CONFLICT (game_id, ply) DO UPDATE SET
         side = excluded.side, notation = excluded.notation, classification = excluded.classification,
         accuracy = excluded.accuracy, eval_white = excluded.eval_white, best_notation = excluded.best_notation,
         best_pv = excluded.best_pv, headline = excluded.headline, details = excluded.details`,
      {
        gameId,
        ply: r.ply,
        side: r.side,
        notation: r.notation,
        classification: r.classification,
        accuracy: r.accuracy,
        evalWhite: r.evalWhite,
        bestNotation: r.bestNotation,
        bestPv: JSON.stringify(r.bestPv),
        headline: r.headline,
        details: JSON.stringify(r.details),
      },
    );
  }

  /** Remove revisões de lances desfeitos. */
  truncateReviews(gameId: string, fromPly: number): void {
    this.db.run('DELETE FROM move_reviews WHERE game_id = :gameId AND ply >= :fromPly', { gameId, fromPly });
  }

  reviews(gameId: string): ReviewView[] {
    return this.db
      .all<ReviewRow>('SELECT * FROM move_reviews WHERE game_id = :gameId ORDER BY ply LIMIT 4000', {
        gameId,
      })
      .map((r) => ({
        ply: r.ply,
        side: r.side,
        notation: r.notation,
        classification: r.classification,
        accuracy: r.accuracy,
        evalWhite: r.eval_white,
        bestNotation: r.best_notation,
        bestPv: JSON.parse(r.best_pv) as string[],
        headline: r.headline,
        details: JSON.parse(r.details) as string[],
      }));
  }
}

export function summarize(g: GameRecord, profileId: string): GameSummaryView {
  const you: Side | null = g.whiteId === profileId ? 'white' : g.blackId === profileId ? 'black' : null;
  const outcome =
    g.status !== 'finished' || !you ? null : g.winner === null ? 'draw' : g.winner === you ? 'win' : 'loss';
  return {
    id: g.id,
    variant: g.variant,
    mode: g.mode,
    status: g.status,
    you,
    opponent: you === 'white' ? g.blackName : g.whiteName,
    aiLevel: g.aiLevel,
    outcome,
    reason: g.endReason,
    plies: g.moves.length,
    accuracy: you === 'white' ? g.whiteAccuracy : you === 'black' ? g.blackAccuracy : null,
    assisted: g.assisted,
    createdAt: g.createdAt,
    finishedAt: g.finishedAt,
  };
}
