import type { VariantId } from '@dama/engine';
import type { AchievementView, ProfileView } from '@dama/protocol';
import { ACHIEVEMENTS, levelFromXp } from '../progress/rewards.ts';
import type { Database } from './database.ts';
import { hashToken, newId, newToken, nowIso } from './ids.ts';

export interface ProfileRow {
  id: string;
  name: string;
  xp: number;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  current_streak: number;
  best_streak: number;
  study_streak: number;
  last_study_day: string | null;
  studies_solved: number;
  created_at: string;
  last_seen_at: string;
}

const COLUMNS = `id, name, xp, rating, games, wins, losses, draws, current_streak, best_streak,
  study_streak, last_study_day, studies_solved, created_at, last_seen_at`;

export class ProfileRepo {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  create(name: string): { profile: ProfileRow; token: string } {
    const token = newToken();
    const now = nowIso();
    const id = newId();
    this.db.run(
      `INSERT INTO profiles (id, name, token_hash, created_at, last_seen_at) VALUES (:id, :name, :hash, :now, :now)`,
      { id, name, hash: hashToken(token), now },
    );
    return { profile: this.byId(id)!, token };
  }

  byId(id: string): ProfileRow | undefined {
    return this.db.get<ProfileRow>(`SELECT ${COLUMNS} FROM profiles WHERE id = :id`, { id });
  }

  /** Busca pelo hash do token: o token em si nunca é armazenado. */
  byToken(token: string): ProfileRow | undefined {
    return this.db.get<ProfileRow>(`SELECT ${COLUMNS} FROM profiles WHERE token_hash = :hash`, {
      hash: hashToken(token),
    });
  }

  rename(id: string, name: string): void {
    this.db.run('UPDATE profiles SET name = :name WHERE id = :id', { id, name });
  }

  touch(id: string): void {
    this.db.run('UPDATE profiles SET last_seen_at = :now WHERE id = :id', { id, now: nowIso() });
  }

  update(id: string, fields: Partial<Omit<ProfileRow, 'id' | 'created_at'>>): void {
    const entries = Object.entries(fields);
    if (entries.length === 0) return;
    const allowed = new Set([
      'name',
      'xp',
      'rating',
      'games',
      'wins',
      'losses',
      'draws',
      'current_streak',
      'best_streak',
      'study_streak',
      'last_study_day',
      'studies_solved',
      'last_seen_at',
    ]);
    for (const [k] of entries) if (!allowed.has(k)) throw new Error(`Campo não atualizável: ${k}`);
    const sets = entries.map(([k]) => `${k} = :${k}`).join(', ');
    this.db.run(`UPDATE profiles SET ${sets} WHERE id = :id`, {
      ...(fields as Record<string, string | number | null>),
      id,
    });
  }

  addXp(id: string, amount: number, reason: string, gameId: string | null): void {
    if (amount === 0) return;
    this.db.run('UPDATE profiles SET xp = MAX(0, xp + :amount) WHERE id = :id', { id, amount });
    this.db.run(
      'INSERT INTO xp_events (profile_id, amount, reason, game_id, created_at) VALUES (:id, :amount, :reason, :gameId, :now)',
      { id, amount, reason, gameId, now: nowIso() },
    );
  }

  recordRating(id: string, rating: number, gameId: string | null): void {
    this.db.run(
      'INSERT INTO rating_history (profile_id, rating, game_id, created_at) VALUES (:id, :rating, :gameId, :now)',
      {
        id,
        rating,
        gameId,
        now: nowIso(),
      },
    );
  }

  ratingHistory(id: string): { rating: number; at: string }[] {
    return this.db
      .all<{ rating: number; at: string }>(
        'SELECT rating, created_at AS at FROM rating_history WHERE profile_id = :id ORDER BY id DESC LIMIT 200',
        { id },
      )
      .reverse();
  }

  variantsPlayed(id: string): Set<VariantId> {
    const rows = this.db.all<{ variant: VariantId }>(
      `SELECT DISTINCT variant FROM games WHERE status = 'finished' AND (white_id = :id OR black_id = :id) LIMIT 10`,
      { id },
    );
    return new Set(rows.map((r) => r.variant));
  }

  unlockedAchievements(id: string): Map<string, string> {
    const rows = this.db.all<{ key: string; unlocked_at: string }>(
      'SELECT key, unlocked_at FROM achievements WHERE profile_id = :id LIMIT 500',
      { id },
    );
    return new Map(rows.map((r) => [r.key, r.unlocked_at]));
  }

  unlock(id: string, key: string): boolean {
    const res = this.db.run(
      'INSERT OR IGNORE INTO achievements (profile_id, key, unlocked_at) VALUES (:id, :key, :now)',
      { id, key, now: nowIso() },
    );
    return Number(res.changes) > 0;
  }

  achievements(id: string): AchievementView[] {
    const unlocked = this.unlockedAchievements(id);
    return ACHIEVEMENTS.map((a) => ({
      key: a.key,
      title: a.title,
      description: a.description,
      tier: a.tier,
      xp: a.xp,
      unlockedAt: unlocked.get(a.key) ?? null,
    }));
  }

  toView(row: ProfileRow): ProfileView {
    return {
      id: row.id,
      name: row.name,
      xp: row.xp,
      level: levelFromXp(row.xp),
      rating: row.rating,
      stats: {
        games: row.games,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        currentStreak: row.current_streak,
        bestStreak: row.best_streak,
        studyStreak: row.study_streak,
        studiesSolved: row.studies_solved,
      },
      createdAt: row.created_at,
    };
  }
}
