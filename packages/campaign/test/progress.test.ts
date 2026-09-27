import { describe, expect, it } from 'vitest';
import {
  adRewardsLeft,
  type CampaignState,
  CHAPTERS,
  currentLevel,
  DAILY_AD_REWARDS,
  finishLevel,
  initialState,
  isUnlocked,
  LEVELS,
  LIVES,
  markInterstitial,
  matchStars,
  parseState,
  puzzleStars,
  refill,
  rewardAd,
  shouldShowInterstitial,
  startLevel,
} from '../src/index.ts';

const T0 = Date.UTC(2026, 8, 27, 12);
const paidLevel = CHAPTERS[1]!.levels[0]!.id;

function unlockUpTo(id: string): CampaignState {
  const stars: Record<string, 1 | 2 | 3> = {};
  for (const l of LEVELS) {
    if (l.id === id) break;
    stars[l.id] = 3;
  }
  return { ...initialState(T0), stars };
}

describe('progresso', () => {
  it('só a primeira fase começa liberada; concluir libera a seguinte', () => {
    const s = initialState(T0);
    expect(isUnlocked(s, LEVELS[0]!.id)).toBe(true);
    expect(isUnlocked(s, LEVELS[1]!.id)).toBe(false);
    expect(startLevel(s, LEVELS[1]!.id, T0, false)).toEqual({ ok: false, reason: 'locked' });
    expect(startLevel(s, 'nao-existe', T0, false)).toEqual({ ok: false, reason: 'unknown' });
    const started = startLevel(s, LEVELS[0]!.id, T0, false);
    if (!started.ok) throw new Error('não começou');
    const done = finishLevel(started.state, LEVELS[0]!.id, 2, T0);
    expect(isUnlocked(done, LEVELS[1]!.id)).toBe(true);
    expect(currentLevel(done).id).toBe(LEVELS[1]!.id);
  });

  it('tutorial não custa vida', () => {
    const r = startLevel(initialState(T0), LEVELS[0]!.id, T0, false);
    expect(r.ok && r.state.lives.count).toBe(LIVES.max);
  });

  it('entrar desconta a vida; concluir devolve; perder não', () => {
    const r = startLevel(unlockUpTo(paidLevel), paidLevel, T0, false);
    if (!r.ok) throw new Error('não começou');
    expect(r.state.lives.count).toBe(LIVES.max - 1);
    expect(finishLevel(r.state, paidLevel, 3, T0 + 1).lives.count).toBe(LIVES.max);
    expect(finishLevel(r.state, paidLevel, null, T0 + 1).lives.count).toBe(LIVES.max - 1);
  });

  it('fechar o app no meio da fase não devolve a vida', () => {
    const r = startLevel(unlockUpTo(paidLevel), paidLevel, T0, false);
    if (!r.ok) throw new Error('não começou');
    const again = startLevel(r.state, paidLevel, T0 + 5, false);
    if (!again.ok) throw new Error('não recomeçou');
    expect(again.state.lives.count).toBe(LIVES.max - 2);
  });

  it('concluir uma fase que não foi iniciada não gera vida', () => {
    const s = { ...unlockUpTo(paidLevel), lives: { count: 1, since: T0 } };
    expect(finishLevel(s, paidLevel, 3, T0).lives.count).toBe(1);
  });

  it('sem vidas não entra; premium entra sempre; a recarga libera', () => {
    let s = unlockUpTo(paidLevel);
    for (let i = 0; i < LIVES.max; i++) {
      const r = startLevel(s, paidLevel, T0, false);
      if (!r.ok) throw new Error('não começou');
      s = finishLevel(r.state, paidLevel, null, T0);
    }
    expect(startLevel(s, paidLevel, T0, false)).toEqual({ ok: false, reason: 'no-lives' });
    const premium = startLevel(s, paidLevel, T0, true);
    expect(premium.ok && premium.state.lives.count).toBe(0);
    expect(startLevel(s, paidLevel, T0 + LIVES.regenMs, false).ok).toBe(true);
  });

  it('estrelas guardam a melhor marca', () => {
    const s = unlockUpTo(paidLevel);
    const a = finishLevel({ ...s, active: { levelId: paidLevel, paid: false } }, paidLevel, 3, T0);
    const b = finishLevel({ ...a, active: { levelId: paidLevel, paid: false } }, paidLevel, 1, T0);
    expect(b.stars[paidLevel]).toBe(3);
  });

  it('anúncio dá uma vida, respeita o máximo e o limite diário', () => {
    let s = initialState(T0);
    expect(rewardAd(s, T0)).toBeNull();
    for (let i = 0; i < DAILY_AD_REWARDS; i++) {
      const next = rewardAd({ ...s, lives: { count: 0, since: T0 } }, T0);
      if (!next) throw new Error('anúncio recusado');
      expect(next.lives.count).toBe(1);
      s = next;
    }
    expect(adRewardsLeft(s, T0)).toBe(0);
    expect(rewardAd({ ...s, lives: { count: 0, since: T0 } }, T0)).toBeNull();
    expect(adRewardsLeft(s, T0 + 86_400_000)).toBe(DAILY_AD_REWARDS);
  });

  it('recarga comprada enche as vidas', () => {
    const s = { ...initialState(T0), lives: { count: 0, since: T0 } };
    expect(refill(s, T0).lives.count).toBe(LIVES.max);
  });

  it('intersticial: nunca para premium, nem no começo, e com intervalo mínimo', () => {
    const s = { ...unlockUpTo(LEVELS[12]!.id), sinceInterstitial: 3 };
    expect(shouldShowInterstitial(s, T0, true)).toBe(false);
    expect(shouldShowInterstitial(s, T0, false)).toBe(true);
    const marked = markInterstitial(s, T0);
    expect(shouldShowInterstitial({ ...marked, sinceInterstitial: 3 }, T0 + 60_000, false)).toBe(false);
    expect(shouldShowInterstitial({ ...initialState(T0), sinceInterstitial: 9 }, T0, false)).toBe(false);
  });

  it('estrelas de exercício e de partida', () => {
    expect(puzzleStars({ mistakes: 0, hints: 0 })).toBe(3);
    expect(puzzleStars({ mistakes: 1, hints: 0 })).toBe(2);
    expect(puzzleStars({ mistakes: 1, hints: 1 })).toBe(1);
    expect(matchStars({ result: 'win', assists: 0, goal: 'win' })).toBe(3);
    expect(matchStars({ result: 'win', assists: 2, goal: 'win' })).toBe(2);
    expect(matchStars({ result: 'draw', assists: 0, goal: 'win' })).toBeNull();
    expect(matchStars({ result: 'draw', assists: 0, goal: 'draw' })).toBe(1);
    expect(matchStars({ result: 'loss', assists: 0, goal: 'draw' })).toBeNull();
  });
});

describe('estado salvo', () => {
  it('ida e volta preserva tudo', () => {
    const s = { ...unlockUpTo(paidLevel), active: { levelId: paidLevel, paid: true } };
    expect(parseState(JSON.parse(JSON.stringify(s)), T0)).toEqual(s);
  });

  it('lixo, versões desconhecidas e adulteração voltam ao seguro', () => {
    expect(parseState(null, T0)).toEqual(initialState(T0));
    expect(parseState('x', T0)).toEqual(initialState(T0));
    expect(parseState({ version: 2 }, T0)).toEqual(initialState(T0));
    const tampered = parseState(
      JSON.parse(
        '{"version":1,"lives":{"count":99,"since":9e15},"stars":{"f-01":3,"nao-existe":3,"f-02":7,"__proto__":3},"active":{"levelId":"nao-existe","paid":true},"adRewards":{"day":"hoje","count":-4},"sinceInterstitial":"x"}',
      ),
      T0,
    );
    expect(tampered.lives).toEqual({ count: LIVES.max, since: T0 });
    expect(tampered.stars).toEqual({ 'f-01': 3 });
    expect(tampered.active).toBeNull();
    expect(tampered.adRewards.count).toBe(0);
    expect(tampered.sinceInterstitial).toBe(0);
  });
});
