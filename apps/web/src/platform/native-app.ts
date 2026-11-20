import { onStorageReady } from '@dama/transport';
import { useEffect } from 'react';
import { loadSettings } from '../campaign/ui/Settings.tsx';
import { useToast } from '../components/Toasts.tsx';
import { initAds } from './ads.ts';
import { dispatchBack } from './back.ts';
import { initBilling } from './billing.ts';
import { isNative, TARGET } from './runtime.ts';

/**
 * Inicialização do app Android: ajustes, compras, anúncios (depois da primeira pintura, para a
 * tela abrir sem esperar a rede), botão voltar e o aviso de armazenamento. No navegador, nada.
 */
export function useNativeApp(): void {
  const toast = useToast();

  useEffect(() => {
    if (TARGET !== 'app') return;
    void loadSettings();
    void initBilling();
    const t = setTimeout(initAds, 1200);

    onStorageReady((persistent) => {
      if (!persistent) {
        toast(
          'Este aparelho não permite salvar dados do app. Atualize o Android System WebView pela Play Store.',
          'error',
        );
      }
    });

    if (!isNative) return () => clearTimeout(t);
    let remove: (() => void) | null = null;
    void import('@capacitor/app').then(({ App }) =>
      App.addListener('backButton', ({ canGoBack }) => {
        // Folha aberta fecha → a tela decide (ex.: sair da fase) → volta no histórico → na raiz,
        // minimiza, como todo app Android.
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
  }, [toast]);
}
