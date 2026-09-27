export {
  type Baseline,
  baseline,
  defend,
  type Goal,
  goalReached,
  judge,
  TOLERANCE,
  type Verdict,
} from './goals.ts';
export { CHAPTERS, chapterOf, LEVELS, levelById, levelIndex } from './levels.ts';
export { fullLives, grant, LIVES, type Lives, type LivesConfig, nextLifeIn, settle, spend } from './lives.ts';
export {
  adRewardsLeft,
  type CampaignState,
  costsLife,
  currentLevel,
  DAILY_AD_REWARDS,
  dayKey,
  finishLevel,
  INTERSTITIAL,
  initialState,
  isUnlocked,
  livesNow,
  MAX_MISTAKES,
  type MatchOutcome,
  markInterstitial,
  matchStars,
  type PuzzleOutcome,
  parseState,
  puzzleStars,
  refill,
  rewardAd,
  type StartResult,
  shouldShowInterstitial,
  startLevel,
  totalStars,
} from './progress.ts';
export { type Setup, setupToFen } from './setup.ts';
export { PUZZLE_DEPTH, type Solution, solve } from './solver.ts';
export type { Chapter, Level, MatchLevel, PuzzleLevel, Side, Stars } from './types.ts';
