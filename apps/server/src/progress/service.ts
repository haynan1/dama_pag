import { aiLevel, CLASSIFICATION_LABEL, type Classification, type Game } from '@dama/engine';
import type { AchievementView, ReviewView, RewardSummary, Side } from '@dama/protocol';
import type { Database } from '../db/database.ts';
import type { GameRecord } from '../db/games.ts';
import type { ProfileRepo, ProfileRow } from '../db/profiles.ts';
import type { StudyRepo } from '../db/studies.ts';
import {
  ACHIEVEMENTS,
  eloUpdate,
  gameXp,
  levelFromXp,
  localDay,
  nextStudyStreak,
  type PlayerGameSummary,
  type ProfileSnapshot,
} from './rewards.ts';

const STUDY_WORTHY: ReadonlySet<Classification> = new Set(['mistake', 'blunder']);
const MAX_STUDIES_PER_GAME = 5;

export function sideAccuracy(reviews: readonly ReviewView[], side: Side): number | null {
  const values = reviews.filter((r) => r.side === side && r.accuracy !== null).map((r) => r.accuracy!);
  if (values.length === 0) return null;
  // Média harmônica suavizada: um erro grave pesa mais do que dez lances perfeitos compensam.
  const harmonic = values.length / values.reduce((acc, v) => acc + 1 / Math.max(v, 5), 0);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(((harmonic + mean) / 2) * 10) / 10;
}

export class ProgressService {
  private readonly db: Database;
  private readonly profiles: ProfileRepo;
  private readonly studies: StudyRepo;

  constructor(db: Database, profiles: ProfileRepo, studies: StudyRepo) {
    this.db = db;
    this.profiles = profiles;
    this.studies = studies;
  }

  /**
   * Aplica o resultado de uma partida encerrada a cada jogador humano: estatísticas, rating, XP,
   * conquistas e casos de estudo a partir dos erros. Tudo em uma transação.
   */
  finishGame(record: GameRecord, game: Game, reviews: readonly ReviewView[]): Map<string, RewardSummary> {
    const out = new Map<string, RewardSummary>();
    const players: { side: Side; id: string }[] = [];
    if (record.whiteId) players.push({ side: 'white', id: record.whiteId });
    if (record.blackId) players.push({ side: 'black', id: record.blackId });
    if (players.length === 0 || record.status !== 'finished') return out;

    const ratingsBefore = new Map(players.map((p) => [p.id, this.profiles.byId(p.id)?.rating ?? 1000]));

    this.db.transaction(() => {
      for (const { side, id } of players) {
        const profile = this.profiles.byId(id);
        if (!profile) continue;
        const outcome: PlayerGameSummary['outcome'] =
          record.winner === null ? 'draw' : record.winner === side ? 'win' : 'loss';
        const summary = this.summarize(record, game, reviews, side, outcome);

        // Rating: contra a IA, só partidas sem ajuda; na rede, contra o rating do oponente.
        let opponentRating: number | null = null;
        if (record.mode === 'ai' && !record.assisted && record.aiLevel)
          opponentRating = aiLevel(record.aiLevel).rating;
        if (record.mode === 'lan') {
          const other = players.find((p) => p.id !== id);
          opponentRating = other ? ratingsBefore.get(other.id)! : null;
        }
        const countsForRating = opponentRating !== null && summary.plies >= 6;
        const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
        const ratingAfter = countsForRating
          ? eloUpdate(profile.rating, opponentRating!, score, profile.games)
          : profile.rating;

        const streak = outcome === 'win' ? profile.current_streak + 1 : 0;
        this.profiles.update(id, {
          games: profile.games + 1,
          wins: profile.wins + (outcome === 'win' ? 1 : 0),
          losses: profile.losses + (outcome === 'loss' ? 1 : 0),
          draws: profile.draws + (outcome === 'draw' ? 1 : 0),
          current_streak: streak,
          best_streak: Math.max(profile.best_streak, streak),
          rating: ratingAfter,
        });
        if (countsForRating) this.profiles.recordRating(id, ratingAfter, record.id);

        const breakdown = gameXp(summary);
        const snapshot: ProfileSnapshot = {
          games: profile.games + 1,
          wins: profile.wins + (outcome === 'win' ? 1 : 0),
          currentStreak: streak,
          studiesSolved: profile.studies_solved,
          studyStreak: profile.study_streak,
          variantsPlayed: this.profiles.variantsPlayed(id),
        };
        const unlocked: AchievementView[] = [];
        for (const a of ACHIEVEMENTS) {
          if (!a.onGame?.(summary, snapshot)) continue;
          if (!this.profiles.unlock(id, a.key)) continue;
          unlocked.push({
            key: a.key,
            title: a.title,
            description: a.description,
            tier: a.tier,
            xp: a.xp,
            unlockedAt: new Date().toISOString(),
          });
          breakdown.push({ label: `Conquista: ${a.title}`, xp: a.xp });
        }
        const xpGained = Math.max(
          0,
          breakdown.reduce((acc, b) => acc + b.xp, 0),
        );
        this.profiles.addXp(id, xpGained, 'game', record.id);

        const studiesCreated = this.createStudies(id, record, game, reviews, side);

        out.set(id, {
          xpGained,
          breakdown,
          ratingBefore: profile.rating,
          ratingAfter,
          levelBefore: levelFromXp(profile.xp).level,
          levelAfter: levelFromXp(profile.xp + xpGained).level,
          achievements: unlocked,
          accuracy: summary.accuracy,
          studiesCreated,
        });
      }
    });
    return out;
  }

  private summarize(
    record: GameRecord,
    game: Game,
    reviews: readonly ReviewView[],
    side: Side,
    outcome: PlayerGameSummary['outcome'],
  ): PlayerGameSummary {
    const color = side === 'white' ? 1 : -1;
    const mine = game.moves.filter((m) => m.side === color);
    const sideReviews = reviews.filter((r) => r.side === side);
    const evals = reviews.map((r) => (side === 'white' ? r.evalWhite : -r.evalWhite));
    return {
      mode: record.mode,
      variant: record.variant,
      outcome,
      aiLevel: record.aiLevel,
      assisted: record.assisted,
      plies: game.moves.length,
      accuracy: sideAccuracy(reviews, side),
      classifications: sideReviews.flatMap((r) => (r.classification ? [r.classification] : [])),
      maxCaptureInMove: mine.reduce((acc, m) => Math.max(acc, m.move.captures.length), 0),
      promotions: mine.filter((m) => m.move.promotes).length,
      worstEval: evals.length > 0 ? Math.min(...evals) : 0,
    };
  }

  private createStudies(
    profileId: string,
    record: GameRecord,
    game: Game,
    reviews: readonly ReviewView[],
    side: Side,
  ): number {
    const worst = reviews
      .filter((r) => r.side === side && r.classification && STUDY_WORTHY.has(r.classification))
      .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
      .slice(0, MAX_STUDIES_PER_GAME);
    let created = 0;
    for (const r of worst) {
      const played = game.moves[r.ply];
      if (!played) continue;
      const study = this.studies.create({
        profileId,
        variant: record.variant,
        fen: played.fenBefore,
        title: `Lance ${Math.floor(r.ply / 2) + 1}: ${CLASSIFICATION_LABEL[r.classification!].toLowerCase()} contra ${side === 'white' ? record.blackName : record.whiteName}`,
        notes: '',
        source: 'mistake',
        gameId: record.id,
        ply: r.ply,
        playedNotation: r.notation,
        bestNotation: r.bestNotation,
        bestLine: r.bestPv,
        headline: r.headline,
        classification: r.classification,
      });
      if (study) created++;
    }
    return created;
  }

  /** Registra uma tentativa de estudo: XP, sequência diária e conquistas de estudo. */
  studyAttempt(
    profileId: string,
    correct: boolean,
    firstTry: boolean,
  ): { xp: number; achievements: AchievementView[] } {
    return this.db.transaction(() => {
      const profile = this.profiles.byId(profileId) as ProfileRow;
      const now = new Date();
      const streak = nextStudyStreak(profile.last_study_day, profile.study_streak, now);
      const solved = profile.studies_solved + (correct ? 1 : 0);
      this.profiles.update(profileId, {
        studies_solved: solved,
        study_streak: streak,
        last_study_day: localDay(now),
      });
      let xp = correct ? (firstTry ? 15 : 10) : 2;
      const snapshot: ProfileSnapshot = {
        games: profile.games,
        wins: profile.wins,
        currentStreak: profile.current_streak,
        studiesSolved: solved,
        studyStreak: streak,
        variantsPlayed: new Set(),
      };
      const unlocked: AchievementView[] = [];
      for (const a of ACHIEVEMENTS) {
        if (!a.onStudy?.(snapshot)) continue;
        if (!this.profiles.unlock(profileId, a.key)) continue;
        unlocked.push({
          key: a.key,
          title: a.title,
          description: a.description,
          tier: a.tier,
          xp: a.xp,
          unlockedAt: now.toISOString(),
        });
        xp += a.xp;
      }
      this.profiles.addXp(profileId, xp, 'study', null);
      return { xp, achievements: unlocked };
    });
  }
}
