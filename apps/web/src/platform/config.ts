/**
 * Identificadores de monetização, lidos no build (`.env`). Nada aqui é segredo: IDs de anúncio e a
 * chave pública do SDK da RevenueCat são feitos para ir no app. A chave secreta da RevenueCat e as
 * credenciais da Play Console nunca entram no repositório nem no bundle.
 */
const env = import.meta.env;

/** Blocos de anúncio de teste oficiais do Google: seguros em desenvolvimento, nunca geram receita. */
const TEST_UNITS = {
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
} as const;

function unit(value: string | undefined, fallback: string): string | null {
  if (value) return value;
  // Em produção sem ID configurado: sem anúncio, e não um anúncio de teste que não paga.
  return env.PROD ? null : fallback;
}

export const ADS = {
  rewardedId: unit(env['VITE_ADMOB_REWARDED_ID'], TEST_UNITS.rewarded),
  interstitialId: unit(env['VITE_ADMOB_INTERSTITIAL_ID'], TEST_UNITS.interstitial),
  /** Pedidos marcados como teste: em desenvolvimento, ou forçado para aparelhos de QA. */
  testing: !env.PROD || env['VITE_ADS_TESTING'] === '1',
} as const;

export const BILLING = {
  /** Chave pública do SDK (Android) da RevenueCat: `goog_...`. */
  revenueCatKey: env['VITE_REVENUECAT_ANDROID_KEY'] ?? '',
  /** Entitlement que libera vidas infinitas e remove intersticiais. */
  entitlement: 'pro',
  /** Produtos cadastrados na Play Console (e vinculados na RevenueCat). */
  products: { refill: 'vidas_recarga', pro: 'dama_pro' },
} as const;

/** Política de privacidade publicada (obrigatória na Play Store para apps com anúncios). */
export const PRIVACY_URL = env['VITE_PRIVACY_URL'] ?? '';
