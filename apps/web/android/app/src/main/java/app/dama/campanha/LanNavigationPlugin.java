package app.dama.campanha;

import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Deixa a WebView navegar até o servidor Dama da rede local; todo o resto continua como o
 * Capacitor decide (origem do app dentro, links externos no navegador do sistema).
 *
 * Por que um plugin, e não {@code server.allowNavigation} no capacitor.config: curingas como
 * {@code 192.168.*.*} não são regras de origem válidas para a ponte nativa; o Capacitor então
 * recorre a {@code addJavascriptInterface}, que expõe a ponte a QUALQUER página carregada —
 * inclusive às do servidor, que poderiam disparar compras e anúncios. Decidindo aqui, a lista de
 * origens da ponte continua só com https://localhost.
 */
@CapacitorPlugin(name = "LanNavigation")
public class LanNavigationPlugin extends Plugin {

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        // false = "não intercepte, carregue na WebView"; null = deixa a decisão padrão do Capacitor.
        return LanHosts.isLanUrl(url.getScheme(), url.getHost()) ? Boolean.FALSE : null;
    }
}
