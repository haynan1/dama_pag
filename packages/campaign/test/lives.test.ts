import { describe, expect, it } from 'vitest';
import { fullLives, grant, LIVES, nextLifeIn, settle, spend } from '../src/index.ts';

const H = LIVES.regenMs;

describe('vidas', () => {
  it('gasta, recarrega uma por hora e para no máximo', () => {
    let l = fullLives(0);
    l = spend(l, 0)!;
    l = spend(l, 10)!;
    l = spend(l, 20)!;
    expect(l.count).toBe(0);
    expect(spend(l, 30)).toBeNull();
    expect(nextLifeIn(l, 30)).toBe(H - 30);
    expect(settle(l, H - 1).count).toBe(0);
    expect(settle(l, H).count).toBe(1);
    expect(settle(l, 2 * H + 5).count).toBe(2);
    expect(settle(l, 10 * H).count).toBe(LIVES.max);
    expect(nextLifeIn(settle(l, 10 * H), 10 * H)).toBeNull();
  });

  it('o relógio da recarga continua ao gastar abaixo do máximo', () => {
    let l = spend(fullLives(0), 0)!;
    l = spend(l, H / 2)!;
    expect(settle(l, H).count).toBe(2);
    expect(nextLifeIn(l, H)).toBe(H);
  });

  it('relógio voltando no tempo não gera vidas', () => {
    const l = spend(spend(fullLives(1_000_000), 1_000_000)!, 1_000_000)!;
    const back = settle(l, 0);
    expect(back.count).toBe(1);
    expect(back.since).toBe(0);
    expect(settle(back, H - 1).count).toBe(1);
  });

  it('prêmios nunca passam do máximo nem aceitam valores estranhos', () => {
    const l = spend(fullLives(0), 0)!;
    expect(grant(l, 5, 1).count).toBe(LIVES.max);
    expect(grant(l, -3, 1).count).toBe(l.count);
    expect(grant(l, 1.9, 1).count).toBe(LIVES.max);
  });
});
