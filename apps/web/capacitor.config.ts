import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App Android: a campanha empacotada (build `VITE_TARGET=app`), servida localmente pela WebView —
 * funciona sem internet, exceto anúncios e compras.
 */
const config: CapacitorConfig = {
  appId: 'app.dama.campanha',
  appName: 'Dama',
  webDir: 'dist-app',
  android: {
    // Build de loja nunca aceita depuração remota da WebView.
    webContentsDebuggingEnabled: false,
    allowMixedContent: false,
    backgroundColor: '#0a0a0b',
  },
  plugins: {
    StatusBar: { overlaysWebView: true, style: 'DARK', backgroundColor: '#00000000' },
  },
};

export default config;
