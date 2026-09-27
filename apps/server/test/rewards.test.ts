import { describe, expect, it } from 'vitest';
import {
  eloUpdate,
  gameXp,
  levelFromXp,
  nextStudyStreak,
  type PlayerGameSummary,
  srsNext,
} from '../src/progress/rewards.ts';
import { sideAccuracy } from '../src/progress/service.ts';

const base: PlayerGameSummary = {
  mode: 'ai',
  variant: 'brazilian',
  outcome: 'win',
  aiLevel: 5,
  assisted: false,
  plies: 60,
  accuracy: 85,
  classifications: [],
  maxCaptureInMove: 1,
  promotions: 0,
  worstEval: 0,
};

describe('progressão', () => {
  it('níveis crescem com XP e títulos mudam', () => {
    expect(levelFromXp(0)).toMatchObject({ level: 1, title: 'Iniciante', current: 0, required: 120 });
    expect(levelFromXp(120).level).toBe(2);
    expect(levelFromXp(5000).level).toBeGreaterThan(5);
    expect(levelFromXp(10 ** 9).required).toBe(0);
  });

  it('Elo: vencer adversário mais forte rende mais', () => {
    const vsStrong = eloUpdate(1200, 1600, 1, 50) - 1200;
    const vsWeak = eloUpdate(1200, 800, 1, 50) - 1200;
    expect(vsStrong).toBeGreaterThan(vsWeak);
    expect(eloUpdate(1200, 1200, 0.5, 50)).toBe(1200);
  });

  it('XP premia nível da IA e precisão, e corta pela metade com ajuda', () => {
    const plain = gameXp(base).reduce((a, b) => a + b.xp, 0);
    const assisted = gameXp({ ...base, assisted: true }).reduce((a, b) => a + b.xp, 0);
    expect(plain).toBe(20 + 50 + 10);
    expect(assisted).toBe(plain - Math.floor(plain / 2));
    expect(gameXp({ ...base, plies: 3 })).toEqual([]);
  });

  it('repetição espaçada: acerto espaça, erro volta logo', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const first = srsNext({ intervalDays: 0, ease: 2.5, reps: 0, lapses: 0 }, true, now);
    expect(first.intervalDays).toBe(1);
    const second = srsNext(first, true, now);
    expect(second.intervalDays).toBe(3);
    const third = srsNext(second, true, now);
    expect(third.intervalDays).toBeGreaterThan(6);
    const miss = srsNext(third, false, now);
    expect(miss.reps).toBe(0);
    expect(miss.lapses).toBe(1);
    expect(miss.dueAt.getTime() - now.getTime()).toBe(10 * 60_000);
  });

  it('sequência de estudo diária', () => {
    const now = new Date(2026, 0, 10, 15);
    expect(nextStudyStreak('2026-01-09', 4, now)).toBe(5);
    expect(nextStudyStreak('2026-01-10', 5, now)).toBe(5);
    expect(nextStudyStreak('2026-01-01', 9, now)).toBe(1);
    expect(nextStudyStreak(null, 0, now)).toBe(1);
  });

  it('precisão da partida pune erros graves mais que a média simples', () => {
    const reviews = [100, 100, 100, 10].map((accuracy, ply) => ({
      ply,
      side: 'white' as const,
      notation: '',
      classification: null,
      accuracy,
      evalWhite: 0,
      bestNotation: null,
      bestPv: [],
      headline: null,
      details: [],
    }));
    const acc = sideAccuracy(reviews, 'white')!;
    expect(acc).toBeLessThan(77.5);
    expect(sideAccuracy(reviews, 'black')).toBeNull();
  });
});
