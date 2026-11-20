import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App Android: o Dama completo (build `--mode app`), servido localmente pela WebView, com o
 * servidor embutido em src/local/ — funciona sem internet, exceto anúncios e compras.
 */
const config: CapacitorConfig = {
  appId: 'app.dama.campanha',
  appName: 'Dama',
  webDir: 'dist-app',
  // Páginas do servidor da rede local não recebem a ponte nativa: é por esta marca que sabem que
  // estão dentro do app (APP_USER_AGENT em src/platform/runtime.ts).
  appendUserAgent: 'DamaApp/1',
  server: {
    // Servidor da rede local caiu ou o Wi-Fi mudou: volta para o app, na folha de rede local, em
    // vez da página de erro crua da WebView.
    errorPath: 'rede-local?falha=1',
  },
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
