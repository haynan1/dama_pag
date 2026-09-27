package app.dama.campanha;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Tela cheia imersiva de verdade: barras de status e de navegação escondidas, reaparecendo só
 * com um deslize da borda (e sumindo sozinhas depois). A Fullscreen API da WebView não controla
 * as barras do sistema — por isso isto é feito aqui, no nativo, e não no JavaScript.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Conteúdo por baixo das barras: a interface usa env(safe-area-inset-*) para não colidir.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        immerse();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Anúncios, folha de compra e diálogos do sistema devolvem as barras: reaplica ao voltar.
        if (hasFocus) immerse();
    }

    private void immerse() {
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }
}
