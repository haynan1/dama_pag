import { useEffect } from 'react';
import { initAds } from '../platform/ads.ts';
import { dispatchBack } from '../platform/back.ts';
import { initBilling } from '../platform/billing.ts';
import { isNative } from '../platform/runtime.ts';
import { CampaignRoutes } from './CampaignRoutes.tsx';
import { loadSettings } from './ui/Settings.tsx';

/**
 * Raiz do app Android: só a campanha, offline, em tela cheia imersiva (feita no nativo, em
 * MainActivity — a Fullscreen API da WebView não segura a barra de navegação do sistema).
 */
export function CampaignApp() {
  useEffect(() => {
    void loadSettings();
    void initBilling();
    // Consentimento e SDK de anúncios depois da primeira pintura: a trilha abre sem esperar a rede.
    const t = setTimeout(initAds, 1200);
    if (!isNative) return () => clearTimeout(t);

    let remove: (() => void) | null = null;
    void import('@capacitor/app').then(({ App }) =>
      App.addListener('backButton', ({ canGoBack }) => {
        if (dispatchBack()) return;
        if (canGoBack && location.pathname !== '/') history.back();
        else void App.minimizeApp();
      }).then((h) => {
        remove = () => void h.remove();
      }),
    );
    return () => {
      clearTimeout(t);
      remove?.();
    };
  }, []);

  return (
    <main className="campaign-root">
      <CampaignRoutes />
    </main>
  );
}
