import {
  type CampaignState,
  finishLevel,
  initialState,
  markInterstitial,
  parseState,
  refill,
  rewardAd,
  type Stars,
  type StartResult,
  startLevel,
} from '@dama/campaign';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { isPremium } from '../platform/billing.ts';
import { storage } from '../platform/storage.ts';

/**
 * Estado da campanha na interface: uma fonte única, persistida a cada mudança.
 * As regras (vidas, desbloqueio, estrelas) moram em `@dama/campaign`; aqui só se guarda e avisa.
 */
const KEY = 'dama:campaign';

let state: CampaignState = initialState(Date.now());
let loaded = false;
const listeners = new Set<() => void>();
let writing: Promise<void> = Promise.resolve();

function emit(): void {
  for (const l of listeners) l();
}

function commit(next: CampaignState): void {
  state = next;
  emit();
  const json = JSON.stringify(next);
  // Gravações em fila: a última sempre vence, mesmo com escrita assíncrona no Android.
  writing = writing
    .then(() => storage.set(KEY, json))
    .catch((err: unknown) => {
      console.error('[campanha] não foi possível salvar o progresso', err);
    });
}

export async function loadCampaign(): Promise<void> {
  if (loaded) return;
  const raw = await storage.get(KEY);
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('[campanha] progresso salvo ilegível; recomeçando');
    }
  }
  state = parseState(parsed, Date.now());
  loaded = true;
  emit();
}

export function useCampaign(): CampaignState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export function getCampaign(): CampaignState {
  return state;
}

export const campaign = {
  start(levelId: string): StartResult {
    const r = startLevel(state, levelId, Date.now(), isPremium());
    if (r.ok) commit(r.state);
    return r;
  },
  finish(levelId: string, stars: Stars | null): void {
    commit(finishLevel(state, levelId, stars, Date.now()));
  },
  rewardAd(): boolean {
    const next = rewardAd(state, Date.now());
    if (next) commit(next);
    return next !== null;
  },
  refill(): void {
    commit(refill(state, Date.now()));
  },
  markInterstitial(): void {
    commit(markInterstitial(state, Date.now()));
  },
};

/** Relógio que avança sozinho (contagem da próxima vida). Pausa com a aba escondida. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      setNow(Date.now());
      timer ??= setInterval(() => setNow(Date.now()), intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);
  return now;
}
