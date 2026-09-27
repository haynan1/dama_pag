import type {
  Classification,
  Color,
  EndReason,
  Insight,
  Lookahead,
  PositionAnalysis,
  VariantId,
} from '@dama/engine';

// =================================================================================================
// Validações puras (sem dependências): usadas pelo cliente e pelos schemas do servidor.
// =================================================================================================

export const PROFILE_NAME = { min: 2, max: 24, pattern: /^[\p{L}\p{N} ._-]+$/u } as const;

/** Retorna a mensagem de erro, ou `null` se o nome é válido. */
export function profileNameError(raw: string): string | null {
  const name = raw.trim();
  if (name.length < PROFILE_NAME.min) return `Use ao menos ${PROFILE_NAME.min} caracteres`;
  if (name.length > PROFILE_NAME.max) return `Use no máximo ${PROFILE_NAME.max} caracteres`;
  if (!PROFILE_NAME.pattern.test(name)) return 'Use letras, números, espaço, ponto, hífen ou sublinhado';
  return null;
}

export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export type { AnalysisRequest, ClientMessage, CreateGameInput } from './schemas.ts';

// =================================================================================================
// Saídas (servidor → cliente)
// =================================================================================================

export type Side = 'white' | 'black';

export function sideOf(color: Color): Side {
  return color === 1 ? 'white' : 'black';
}

export interface ProfileView {
  readonly id: string;
  readonly name: string;
  readonly xp: number;
  readonly level: LevelInfo;
  readonly rating: number;
  readonly stats: {
    readonly games: number;
    readonly wins: number;
    readonly losses: number;
    readonly draws: number;
    readonly currentStreak: number;
    readonly bestStreak: number;
    readonly studyStreak: number;
    readonly studiesSolved: number;
  };
  readonly createdAt: string;
}

export interface LevelInfo {
  readonly level: number;
  readonly title: string;
  /** XP acumulado no nível atual. */
  readonly current: number;
  /** XP necessário para o próximo nível (0 no nível máximo). */
  readonly required: number;
}

export interface PlayerView {
  readonly kind: 'human' | 'ai';
  readonly name: string;
  readonly profileId: string | null;
  readonly level: number | null;
  readonly connected: boolean;
}

export interface MoveView {
  readonly ply: number;
  readonly key: string;
  readonly notation: string;
  readonly side: Side;
  readonly path: readonly number[];
  readonly captures: readonly number[];
}

export interface ClockView {
  readonly whiteMs: number;
  readonly blackMs: number;
  readonly running: Side | null;
  /** Momento (epoch ms, relógio do servidor) em que os valores acima foram medidos. */
  readonly measuredAt: number;
}

export interface ResultView {
  readonly winner: Side | null;
  readonly reason: EndReason;
}

export type GameStatus = 'waiting' | 'active' | 'finished';

export interface ReviewView {
  readonly ply: number;
  readonly side: Side;
  readonly notation: string;
  readonly classification: Classification | null;
  readonly accuracy: number | null;
  /** Avaliação após o lance, do ponto de vista das brancas. */
  readonly evalWhite: number;
  readonly bestNotation: string | null;
  readonly bestPv: readonly string[];
  readonly headline: string | null;
  readonly details: readonly string[];
}

export interface GameView {
  readonly id: string;
  readonly variant: VariantId;
  readonly mode: 'ai' | 'lan';
  readonly status: GameStatus;
  readonly roomCode: string | null;
  readonly startFen: string;
  readonly fen: string;
  readonly turn: Side;
  readonly moves: readonly MoveView[];
  readonly players: { readonly white: PlayerView; readonly black: PlayerView };
  readonly you: Side | null;
  readonly result: ResultView | null;
  readonly clock: ClockView | null;
  readonly paused: boolean;
  readonly mentor: boolean;
  readonly mentorAllowed: boolean;
  readonly canUndo: boolean;
  readonly drawOffer: Side | null;
  readonly aiThinking: boolean;
  readonly assisted: boolean;
  /** Revisões visíveis para você: todas ao fim da partida, as suas em tempo real no modo mentor. */
  readonly reviews: readonly ReviewView[];
}

export interface HintView {
  readonly square: number;
  readonly squareName: string;
  readonly key: string;
  readonly notation: string;
  readonly path: readonly number[];
  readonly score: number;
  readonly insight: Insight;
  readonly pv: readonly string[];
  readonly alternatives: readonly { notation: string; score: number; headline: string }[];
}

export interface AchievementView {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  readonly xp: number;
  readonly unlockedAt: string | null;
}

export interface RewardSummary {
  readonly xpGained: number;
  readonly breakdown: readonly { label: string; xp: number }[];
  readonly ratingBefore: number;
  readonly ratingAfter: number;
  readonly levelBefore: number;
  readonly levelAfter: number;
  readonly achievements: readonly AchievementView[];
  readonly accuracy: number | null;
  readonly studiesCreated: number;
}

export type ServerMessage =
  | { readonly type: 'state'; readonly game: GameView }
  | { readonly type: 'review'; readonly gameId: string; readonly review: ReviewView }
  | { readonly type: 'hint'; readonly gameId: string; readonly hint: HintView | null }
  | { readonly type: 'lookahead'; readonly gameId: string; readonly tree: Lookahead }
  | { readonly type: 'mentor-busy'; readonly gameId: string; readonly task: 'hint' | 'lookahead' }
  | { readonly type: 'rewards'; readonly gameId: string; readonly rewards: RewardSummary }
  | { readonly type: 'error'; readonly code: string; readonly message: string }
  | { readonly type: 'pong' };

export interface GameSummaryView {
  readonly id: string;
  readonly variant: VariantId;
  readonly mode: 'ai' | 'lan';
  readonly status: GameStatus;
  readonly you: Side | null;
  readonly opponent: string;
  readonly aiLevel: number | null;
  readonly outcome: 'win' | 'loss' | 'draw' | null;
  readonly reason: EndReason | null;
  readonly plies: number;
  readonly accuracy: number | null;
  readonly assisted: boolean;
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

export interface StudyView {
  readonly id: string;
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
  readonly dueAt: string;
  readonly reps: number;
  readonly lapses: number;
  readonly lastResult: 'correct' | 'incorrect' | null;
  readonly createdAt: string;
}

export interface StudyAttemptResult {
  readonly correct: boolean;
  readonly playedNotation: string;
  readonly bestNotation: string;
  readonly bestLine: readonly string[];
  readonly insight: Insight;
  readonly xpGained: number;
  readonly nextDueAt: string;
  readonly study: StudyView;
}

export interface MetaView {
  readonly version: string;
  readonly lanUrls: readonly string[];
  readonly variants: readonly { id: VariantId; name: string; short: string; size: number }[];
  readonly aiLevels: readonly { level: number; name: string; rating: number }[];
}

export interface AnalysisResponse {
  readonly analysis?: PositionAnalysis;
  readonly tree?: Lookahead;
}

export interface ApiError {
  readonly error: { readonly code: string; readonly message: string };
}
