import { Capacitor } from '@capacitor/core';

/** Rodando dentro do app Android (Capacitor), e não num navegador. */
export const isNative = Capacitor.isNativePlatform();

/**
 * Destino do build: `app` = o Dama completo no Android, com o servidor embutido (src/local/);
 * `web` = a interface servida pelo servidor Node (navegador ou páginas da rede local no app).
 */
export const TARGET: 'app' | 'web' = import.meta.env.VITE_TARGET === 'app' ? 'app' : 'web';

/**
 * Marca que o app Android acrescenta ao user agent da WebView (`appendUserAgent` em
 * capacitor.config.ts). As páginas do servidor da rede local não recebem a ponte nativa — é por
 * aqui que sabem que estão dentro do app e oferecem a volta para ele.
 */
export const APP_USER_AGENT = 'DamaApp/1';

/** Origem da interface empacotada no app (padrão do Capacitor no Android: https://localhost). */
export const APP_ORIGIN = 'https://localhost';

export function insideAndroidApp(userAgent: string = navigator.userAgent): boolean {
  return userAgent.includes(APP_USER_AGENT);
}

/**
 * Para onde o item "Campanha" leva fora das rotas internas: só numa página do servidor da rede
 * local aberta dentro do app. Lá a campanha certa é a do aparelho (offline, com o progresso
 * dele), então o link sai do servidor e volta para o app. Na própria interface do app e no
 * navegador, `null`: a campanha é uma rota interna (`/campanha`).
 */
export function deviceCampaignUrl(
  target: 'app' | 'web' = TARGET,
  userAgent: string = navigator.userAgent,
): string | null {
  return target === 'web' && insideAndroidApp(userAgent) ? `${APP_ORIGIN}/campanha` : null;
}
