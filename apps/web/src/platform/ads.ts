import { ADS } from './config.ts';
import { isNative } from './runtime.ts';

/**
 * Anúncios (AdMob no Android).
 *
 * - Consentimento primeiro: o formulário do Google (UMP) aparece quando a lei exige (EEE/Reino
 *   Unido/estados dos EUA). Sem consentimento suficiente, nenhum pedido de anúncio é feito.
 * - Recompensado: só por escolha do jogador, em troca de uma vida. A recompensa só vale quando o
 *   SDK confirma (`Rewarded`); fechar antes do fim não dá vida.
 * - Intersticial: nunca no meio de uma fase — só na volta para a trilha, com limite de frequência
 *   decidido em `@dama/campaign`.
 *
 * No navegador em desenvolvimento, um anúncio simulado permite testar o fluxo inteiro; no
 * navegador em produção não há anúncio (o botão some).
 */
export type RewardOutcome = 'rewarded' | 'dismissed' | 'unavailable';

type AdMobModule = typeof import('@capacitor-community/admob');

let ready: Promise<AdMobModule | null> | null = null;
let privacyRequired = false;

async function setup(): Promise<AdMobModule | null> {
  const mod = await import('@capacitor-community/admob');
  const { AdMob, AdmobConsentStatus } = mod;
  let info = await AdMob.requestConsentInfo();
  if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) {
    info = await AdMob.showConsentForm();
  }
  privacyRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
  if (!info.canRequestAds) return null;
  await AdMob.initialize({ initializeForTesting: ADS.testing });
  return mod;
}

/** Inicializa uma vez (consentimento + SDK). Seguro chamar várias vezes. */
function admob(): Promise<AdMobModule | null> {
  if (!isNative) return Promise.resolve(null);
  ready ??= setup().catch((err: unknown) => {
    console.warn('[anúncios] inicialização falhou', err);
    ready = null; // tenta de novo no próximo pedido (rede instável na abertura do app)
    return null;
  });
  return ready;
}

export function initAds(): void {
  void admob();
}

export function rewardedAvailable(): boolean {
  if (isNative) return ADS.rewardedId !== null;
  return import.meta.env.DEV;
}

export async function showRewarded(): Promise<RewardOutcome> {
  if (!isNative) return import.meta.env.DEV ? simulate() : 'unavailable';
  const adId = ADS.rewardedId;
  const mod = adId ? await admob() : null;
  if (!mod || !adId) return 'unavailable';
  const { AdMob, RewardAdPluginEvents } = mod;
  let rewarded = false;
  const handle = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
    rewarded = true;
  });
  try {
    await AdMob.prepareRewardVideoAd({ adId, isTesting: ADS.testing, immersiveMode: true });
    await AdMob.showRewardVideoAd();
    return rewarded ? 'rewarded' : 'dismissed';
  } catch (err) {
    console.warn('[anúncios] recompensado indisponível', err);
    return rewarded ? 'rewarded' : 'unavailable';
  } finally {
    await handle.remove();
  }
}

export async function showInterstitial(): Promise<boolean> {
  const adId = ADS.interstitialId;
  const mod = isNative && adId ? await admob() : null;
  if (!mod || !adId) return false;
  try {
    await mod.AdMob.prepareInterstitial({ adId, isTesting: ADS.testing, immersiveMode: true });
    await mod.AdMob.showInterstitial();
    return true;
  } catch (err) {
    console.warn('[anúncios] intersticial indisponível', err);
    return false;
  }
}

/** A lei exige um ponto de entrada para rever o consentimento (configurações). */
export function privacyOptionsRequired(): boolean {
  return privacyRequired;
}

export async function showPrivacyOptions(): Promise<void> {
  const mod = await admob();
  await mod?.AdMob.showPrivacyOptionsForm();
}

// -------------------------------------------------------------------------------------------------
// Anúncio simulado (só no navegador em desenvolvimento)
// -------------------------------------------------------------------------------------------------

type Listener = () => void;
let simulated: ((outcome: RewardOutcome) => void) | null = null;
const listeners = new Set<Listener>();

function simulate(): Promise<RewardOutcome> {
  simulated?.('dismissed');
  return new Promise((resolve) => {
    simulated = (outcome) => {
      simulated = null;
      for (const l of listeners) l();
      resolve(outcome);
    };
    for (const l of listeners) l();
  });
}

export const simulatedAd = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  open(): boolean {
    return simulated !== null;
  },
  finish(outcome: RewardOutcome): void {
    simulated?.(outcome);
  },
};
