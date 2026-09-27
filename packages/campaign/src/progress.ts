import { LEVELS, levelById, levelIndex } from './levels.ts';
import { fullLives, grant, LIVES, type Lives, settle, spend } from './lives.ts';
import type { Level, Stars } from './types.ts';

/**
 * Estado da campanha no aparelho. Funções puras: recebem o estado e o relógio, devolvem o novo
 * estado. Quem persiste e quem desenha ficam fora daqui.
 */
export interface CampaignState {
  readonly version: 1;
  readonly lives: Lives;
  /** Melhor resultado por fase concluída. */
  readonly stars: Readonly<Record<string, Stars>>;
  /** Fase em andamento. `paid`: a vida já foi descontada e volta se a fase for concluída. */
  readonly active: { readonly levelId: string; readonly paid: boolean } | null;
  /** Vidas ganhas assistindo anúncio no dia (local), para o limite diário. */
  readonly adRewards: { readonly day: string; readonly count: number };
  /** Fases concluídas desde o último intersticial, e quando ele passou. */
  readonly sinceInterstitial: number;
  readonly lastInterstitialAt: number;
}

/** Vidas por anúncio num mesmo dia. Acima disso o anúncio vira fazenda e o valor da compra some. */
export const DAILY_AD_REWARDS = 5;

/** Intersticial: nunca no tutorial, nunca no meio de uma fase, no máximo a cada 3 fases e 4 min. */
export const INTERSTITIAL = { everyLevels: 3, minGapMs: 4 * 60_000, fromLevel: 8 } as const;

export function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function initialState(now: number): CampaignState {
  return {
    version: 1,
    lives: fullLives(now),
    stars: {},
    active: null,
    adRewards: { day: dayKey(now), count: 0 },
    sinceInterstitial: 0,
    lastInterstitialAt: 0,
  };
}

export function isUnlocked(state: CampaignState, levelId: string): boolean {
  const i = levelIndex(levelId);
  if (i < 0) return false;
  if (i === 0) return true;
  return state.stars[LEVELS[i - 1]!.id] !== undefined;
}

/** A próxima fase a jogar: a primeira ainda não concluída (ou a última, com tudo concluído). */
export function currentLevel(state: CampaignState): Level {
  return LEVELS.find((l) => state.stars[l.id] === undefined) ?? LEVELS[LEVELS.length - 1]!;
}

export function totalStars(state: CampaignState): number {
  return Object.values(state.stars).reduce<number>((sum, s) => sum + s, 0);
}

export function livesNow(state: CampaignState, now: number): Lives {
  return settle(state.lives, now);
}

/** Custa vida entrar nesta fase? */
export function costsLife(level: Level, premium: boolean): boolean {
  return !level.free && !premium;
}

export type StartResult =
  | { readonly ok: true; readonly state: CampaignState }
  | { readonly ok: false; readonly reason: 'locked' | 'no-lives' | 'unknown' };

export function startLevel(
  state: CampaignState,
  levelId: string,
  now: number,
  premium: boolean,
): StartResult {
  const level = levelById(levelId);
  if (!level) return { ok: false, reason: 'unknown' };
  if (!isUnlocked(state, levelId)) return { ok: false, reason: 'locked' };
  // Fase anterior sem desfecho (app fechado no meio): conta como não concluída — a vida fica gasta.
  const base: CampaignState = { ...state, active: null, lives: settle(state.lives, now) };
  if (!costsLife(level, premium)) return { ok: true, state: { ...base, active: { levelId, paid: false } } };
  const lives = spend(base.lives, now);
  if (!lives) return { ok: false, reason: 'no-lives' };
  return { ok: true, state: { ...base, lives, active: { levelId, paid: true } } };
}

/**
 * Fecha a fase em andamento. Concluída: guarda as estrelas (a melhor marca) e devolve a vida.
 * Não concluída (derrota, abandono, limite de lances): a vida descontada na entrada fica gasta.
 */
export function finishLevel(
  state: CampaignState,
  levelId: string,
  stars: Stars | null,
  now: number,
): CampaignState {
  const active = state.active?.levelId === levelId ? state.active : null;
  let lives = settle(state.lives, now);
  if (stars !== null && active?.paid) lives = grant(lives, 1, now);
  if (stars === null) return { ...state, lives, active: null };
  const best = Math.max(stars, state.stars[levelId] ?? 0) as Stars;
  return {
    ...state,
    lives,
    active: null,
    stars: { ...state.stars, [levelId]: best },
    sinceInterstitial: state.sinceInterstitial + 1,
  };
}

export function adRewardsLeft(state: CampaignState, now: number): number {
  const today = dayKey(now);
  const used = state.adRewards.day === today ? state.adRewards.count : 0;
  return Math.max(0, DAILY_AD_REWARDS - used);
}

/** Vida por anúncio recompensado. `null` se as vidas estão cheias ou o limite do dia acabou. */
export function rewardAd(state: CampaignState, now: number): CampaignState | null {
  const lives = settle(state.lives, now);
  if (lives.count >= LIVES.max || adRewardsLeft(state, now) === 0) return null;
  const today = dayKey(now);
  const count = (state.adRewards.day === today ? state.adRewards.count : 0) + 1;
  return { ...state, lives: grant(lives, 1, now), adRewards: { day: today, count } };
}

/** Recarga comprada: vidas cheias. */
export function refill(state: CampaignState, now: number): CampaignState {
  return { ...state, lives: grant(state.lives, LIVES.max, now) };
}

export function shouldShowInterstitial(state: CampaignState, now: number, premium: boolean): boolean {
  if (premium) return false;
  if (Object.keys(state.stars).length < INTERSTITIAL.fromLevel) return false;
  if (state.sinceInterstitial < INTERSTITIAL.everyLevels) return false;
  return now - state.lastInterstitialAt >= INTERSTITIAL.minGapMs;
}

export function markInterstitial(state: CampaignState, now: number): CampaignState {
  return { ...state, sinceInterstitial: 0, lastInterstitialAt: now };
}

// -------------------------------------------------------------------------------------------------
// Estrelas
// -------------------------------------------------------------------------------------------------

export interface PuzzleOutcome {
  readonly mistakes: number;
  readonly hints: number;
}

/** Exercício: 3 sem ajuda e sem erro; 2 com um deslize; 1 concluído com mais ajuda. */
export function puzzleStars({ mistakes, hints }: PuzzleOutcome): Stars {
  const slips = mistakes + hints;
  return slips === 0 ? 3 : slips === 1 ? 2 : 1;
}

/** Erros que encerram um exercício sem conclusão. */
export const MAX_MISTAKES = 3;

export interface MatchOutcome {
  readonly result: 'win' | 'draw' | 'loss';
  /** Dicas e lances desfeitos. */
  readonly assists: number;
  readonly goal: 'win' | 'draw';
}

/** Partida: `null` se não cumpriu o objetivo. Vitória sem ajuda = 3; empate que basta = 1. */
export function matchStars({ result, assists, goal }: MatchOutcome): Stars | null {
  if (result === 'loss') return null;
  if (result === 'draw') return goal === 'draw' ? 1 : null;
  return assists === 0 ? 3 : assists <= 2 ? 2 : 1;
}

// -------------------------------------------------------------------------------------------------
// Persistência: o armazenamento do aparelho é entrada não confiável (corrompida, editada, antiga).
// -------------------------------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Lê o estado salvo sem confiar nele: campos inválidos voltam ao padrão, fases desconhecidas
 * são descartadas, números são limitados. Nunca lança — um save quebrado não pode travar o app.
 */
export function parseState(raw: unknown, now: number): CampaignState {
  const fresh = initialState(now);
  if (!isRecord(raw) || raw['version'] !== 1) return fresh;

  const livesRaw = isRecord(raw['lives']) ? raw['lives'] : {};
  const count = Math.max(0, Math.min(LIVES.max, Math.floor(finite(livesRaw['count'], LIVES.max))));
  // Início da recarga no futuro é adulteração ou relógio mexido: recomeça agora.
  const since = Math.min(now, finite(livesRaw['since'], now));

  const stars: Record<string, Stars> = {};
  if (isRecord(raw['stars'])) {
    for (const [id, value] of Object.entries(raw['stars'])) {
      if (levelById(id) && (value === 1 || value === 2 || value === 3)) stars[id] = value;
    }
  }

  let active: CampaignState['active'] = null;
  const a = raw['active'];
  if (isRecord(a) && typeof a['levelId'] === 'string' && levelById(a['levelId'])) {
    active = { levelId: a['levelId'], paid: a['paid'] === true };
  }

  const ad = isRecord(raw['adRewards']) ? raw['adRewards'] : {};
  const adRewards =
    typeof ad['day'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ad['day'])
      ? { day: ad['day'], count: Math.max(0, Math.floor(finite(ad['count'], 0))) }
      : fresh.adRewards;

  return {
    version: 1,
    lives: { count, since },
    stars,
    active,
    adRewards,
    sinceInterstitial: Math.max(0, Math.floor(finite(raw['sinceInterstitial'], 0))),
    lastInterstitialAt: Math.min(now, finite(raw['lastInterstitialAt'], 0)),
  };
}
