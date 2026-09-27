import type { Classification, VariantId } from '@dama/engine';
import type { LevelInfo } from '@dama/protocol';

// -------------------------------------------------------------------------------------------------
// Níveis
// -------------------------------------------------------------------------------------------------

const TITLES = [
  'Iniciante',
  'Aprendiz',
  'Praticante',
  'Jogador de Clube',
  'Competidor',
  'Expert',
  'Candidato a Mestre',
  'Mestre Regional',
  'Mestre Nacional',
  'Mestre Internacional',
  'Grande Mestre',
] as const;

/** XP para sair do nível `level` (1-based): cresce de forma suave, ~1,35× por nível. */
function xpForLevel(level: number): number {
  return Math.round(120 * 1.35 ** (level - 1));
}

export const MAX_LEVEL = 30;

export function levelFromXp(xp: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, Math.floor(xp));
  while (level < MAX_LEVEL && remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  const titleIndex = Math.min(TITLES.length - 1, Math.floor((level - 1) / 3));
  return {
    level,
    title: TITLES[titleIndex]!,
    current: remaining,
    required: level >= MAX_LEVEL ? 0 : xpForLevel(level),
  };
}

// -------------------------------------------------------------------------------------------------
// Rating
// -------------------------------------------------------------------------------------------------

/** Elo clássico. K maior nas primeiras partidas para o rating convergir rápido. */
export function eloUpdate(rating: number, opponent: number, score: 0 | 0.5 | 1, gamesPlayed: number): number {
  const k = gamesPlayed < 20 ? 40 : rating >= 2100 ? 16 : 24;
  const expected = 1 / (1 + 10 ** ((opponent - rating) / 400));
  return Math.round(rating + k * (score - expected));
}

// -------------------------------------------------------------------------------------------------
// Resumo de partida para recompensas
// -------------------------------------------------------------------------------------------------

export interface PlayerGameSummary {
  readonly mode: 'ai' | 'lan';
  readonly variant: VariantId;
  readonly outcome: 'win' | 'loss' | 'draw';
  readonly aiLevel: number | null;
  /** Partida com dicas, desfazer ou mentor ligado. */
  readonly assisted: boolean;
  readonly plies: number;
  readonly accuracy: number | null;
  readonly classifications: readonly Classification[];
  readonly maxCaptureInMove: number;
  readonly promotions: number;
  /** Pior avaliação (do seu ponto de vista) durante a partida. */
  readonly worstEval: number;
}

export interface ProfileSnapshot {
  readonly games: number;
  readonly wins: number;
  readonly currentStreak: number;
  readonly studiesSolved: number;
  readonly studyStreak: number;
  readonly variantsPlayed: ReadonlySet<VariantId>;
}

export function gameXp(s: PlayerGameSummary): { label: string; xp: number }[] {
  const items: { label: string; xp: number }[] = [];
  // Partidas curtíssimas (abandono imediato) não rendem XP.
  if (s.plies < 6) return items;
  if (s.mode === 'ai') {
    const level = s.aiLevel ?? 1;
    const base = s.outcome === 'win' ? 20 + level * 10 : s.outcome === 'draw' ? 8 + level * 4 : 5;
    items.push({
      label:
        s.outcome === 'win'
          ? `Vitória contra IA nível ${level}`
          : s.outcome === 'draw'
            ? 'Empate'
            : 'Participação',
      xp: base,
    });
  } else {
    items.push({
      label:
        s.outcome === 'win' ? 'Vitória na rede' : s.outcome === 'draw' ? 'Empate na rede' : 'Participação',
      xp: s.outcome === 'win' ? 60 : s.outcome === 'draw' ? 25 : 10,
    });
  }
  if (s.accuracy !== null && s.accuracy >= 90)
    items.push({ label: `Precisão ${s.accuracy.toFixed(0)}%`, xp: 25 });
  else if (s.accuracy !== null && s.accuracy >= 80)
    items.push({ label: `Precisão ${s.accuracy.toFixed(0)}%`, xp: 10 });
  const brilliant = s.classifications.filter((c) => c === 'brilliant').length;
  if (brilliant > 0)
    items.push({
      label: `${brilliant} golpe${brilliant > 1 ? 's' : ''} brilhante${brilliant > 1 ? 's' : ''}`,
      xp: 15 * brilliant,
    });
  if (s.assisted) {
    const total = items.reduce((a, b) => a + b.xp, 0);
    items.push({ label: 'Partida assistida (−50%)', xp: -Math.floor(total / 2) });
  }
  return items;
}

// -------------------------------------------------------------------------------------------------
// Conquistas
// -------------------------------------------------------------------------------------------------

export interface AchievementDef {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  readonly xp: number;
  /** Condição avaliada ao fim de cada partida. */
  readonly onGame?: (game: PlayerGameSummary, profile: ProfileSnapshot) => boolean;
  /** Condição avaliada após cada estudo resolvido. */
  readonly onStudy?: (profile: ProfileSnapshot) => boolean;
}

const unassistedWinVsLevel = (min: number) => (g: PlayerGameSummary) =>
  g.mode === 'ai' && g.outcome === 'win' && !g.assisted && (g.aiLevel ?? 0) >= min;

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    key: 'first-game',
    title: 'Primeiro lance',
    description: 'Conclua sua primeira partida.',
    tier: 'bronze',
    xp: 10,
    onGame: () => true,
  },
  {
    key: 'first-win',
    title: 'Primeira vitória',
    description: 'Vença uma partida.',
    tier: 'bronze',
    xp: 20,
    onGame: (g) => g.outcome === 'win',
  },
  {
    key: 'beat-3',
    title: 'Casual superado',
    description: 'Vença a IA nível 3 ou superior sem ajuda.',
    tier: 'bronze',
    xp: 30,
    onGame: unassistedWinVsLevel(3),
  },
  {
    key: 'beat-5',
    title: 'Competidor',
    description: 'Vença a IA nível 5 ou superior sem ajuda.',
    tier: 'silver',
    xp: 60,
    onGame: unassistedWinVsLevel(5),
  },
  {
    key: 'beat-7',
    title: 'Nível nacional',
    description: 'Vença a IA nível 7 ou superior sem ajuda.',
    tier: 'gold',
    xp: 120,
    onGame: unassistedWinVsLevel(7),
  },
  {
    key: 'beat-9',
    title: 'Mestre das damas',
    description: 'Vença a IA nível 9 ou superior sem ajuda.',
    tier: 'platinum',
    xp: 250,
    onGame: unassistedWinVsLevel(9),
  },
  {
    key: 'beat-10',
    title: 'Implacável derrotado',
    description: 'Vença a IA nível 10 sem ajuda.',
    tier: 'platinum',
    xp: 400,
    onGame: unassistedWinVsLevel(10),
  },
  {
    key: 'flawless',
    title: 'Partida limpa',
    description: 'Vença sem nenhum erro ou erro grave (mínimo de 20 lances).',
    tier: 'gold',
    xp: 80,
    onGame: (g) =>
      g.outcome === 'win' &&
      g.plies >= 40 &&
      g.classifications.length > 0 &&
      !g.classifications.some((c) => c === 'mistake' || c === 'blunder'),
  },
  {
    key: 'sharpshooter',
    title: 'Precisão cirúrgica',
    description: 'Vença com precisão de 90% ou mais.',
    tier: 'gold',
    xp: 70,
    onGame: (g) => g.outcome === 'win' && (g.accuracy ?? 0) >= 90,
  },
  {
    key: 'combination',
    title: 'Golpe de mestre',
    description: 'Jogue um lance classificado como golpe brilhante.',
    tier: 'silver',
    xp: 40,
    onGame: (g) => g.classifications.includes('brilliant'),
  },
  {
    key: 'triple',
    title: 'Tomada tripla',
    description: 'Capture 3 ou mais peças em um único lance.',
    tier: 'silver',
    xp: 30,
    onGame: (g) => g.maxCaptureInMove >= 3,
  },
  {
    key: 'coronation',
    title: 'Coroação',
    description: 'Promova 3 damas na mesma partida.',
    tier: 'silver',
    xp: 30,
    onGame: (g) => g.promotions >= 3,
  },
  {
    key: 'comeback',
    title: 'Virada',
    description: 'Vença depois de estar claramente perdido (−2,0 ou pior).',
    tier: 'gold',
    xp: 90,
    onGame: (g) => g.outcome === 'win' && g.worstEval <= -200,
  },
  {
    key: 'streak-3',
    title: 'Embalado',
    description: 'Vença 3 partidas seguidas.',
    tier: 'silver',
    xp: 40,
    onGame: (_g, p) => p.currentStreak >= 3,
  },
  {
    key: 'streak-10',
    title: 'Invicto',
    description: 'Vença 10 partidas seguidas.',
    tier: 'platinum',
    xp: 200,
    onGame: (_g, p) => p.currentStreak >= 10,
  },
  {
    key: 'lan-win',
    title: 'Rei da rede',
    description: 'Vença uma partida contra outra pessoa na rede local.',
    tier: 'silver',
    xp: 50,
    onGame: (g) => g.mode === 'lan' && g.outcome === 'win',
  },
  {
    key: 'globetrotter',
    title: 'Três escolas',
    description: 'Jogue as variantes brasileira, internacional e canadense.',
    tier: 'silver',
    xp: 50,
    onGame: (_g, p) => p.variantsPlayed.size >= 3,
  },
  {
    key: 'veteran',
    title: 'Veterano',
    description: 'Conclua 50 partidas.',
    tier: 'gold',
    xp: 100,
    onGame: (_g, p) => p.games >= 50,
  },
  {
    key: 'student',
    title: 'Estudante',
    description: 'Resolva 10 casos de estudo.',
    tier: 'bronze',
    xp: 30,
    onStudy: (p) => p.studiesSolved >= 10,
  },
  {
    key: 'scholar',
    title: 'Estudioso',
    description: 'Resolva 50 casos de estudo.',
    tier: 'gold',
    xp: 120,
    onStudy: (p) => p.studiesSolved >= 50,
  },
  {
    key: 'dedication',
    title: 'Disciplina',
    description: 'Estude 7 dias seguidos.',
    tier: 'gold',
    xp: 100,
    onStudy: (p) => p.studyStreak >= 7,
  },
];

export const ACHIEVEMENT_BY_KEY: ReadonlyMap<string, AchievementDef> = new Map(
  ACHIEVEMENTS.map((a) => [a.key, a]),
);

// -------------------------------------------------------------------------------------------------
// Repetição espaçada (SM-2 simplificado) para casos de estudo
// -------------------------------------------------------------------------------------------------

export interface SrsState {
  readonly intervalDays: number;
  readonly ease: number;
  readonly reps: number;
  readonly lapses: number;
}

export function srsNext(state: SrsState, correct: boolean, now: Date): SrsState & { dueAt: Date } {
  if (!correct) {
    const ease = Math.max(1.3, state.ease - 0.2);
    // Errou: volta em 10 minutos, na mesma sessão de estudo.
    return {
      intervalDays: 0,
      ease,
      reps: 0,
      lapses: state.lapses + 1,
      dueAt: new Date(now.getTime() + 10 * 60_000),
    };
  }
  const reps = state.reps + 1;
  const intervalDays =
    reps === 1 ? 1 : reps === 2 ? 3 : Math.round(state.intervalDays * state.ease * 10) / 10;
  const ease = Math.min(3, state.ease + 0.05);
  return {
    intervalDays,
    ease,
    reps,
    lapses: state.lapses,
    dueAt: new Date(now.getTime() + intervalDays * 86_400_000),
  };
}

/** Dia local (AAAA-MM-DD) para sequência de estudos. */
export function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function nextStudyStreak(lastDay: string | null, currentStreak: number, now: Date): number {
  const today = localDay(now);
  if (lastDay === today) return Math.max(1, currentStreak);
  const yesterday = localDay(new Date(now.getTime() - 86_400_000));
  return lastDay === yesterday ? currentStreak + 1 : 1;
}
