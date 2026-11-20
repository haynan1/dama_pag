package app.dama.campanha;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Quais endereços contam como "rede local". Espelha {@code isLanHost} em
 * apps/web/src/platform/lan.ts e as faixas que o servidor anuncia: IPv4 privado (10/8,
 * 172.16/12, 192.168/16) e nomes mDNS terminados em {@code .local}.
 *
 * Java puro, sem Android: testável na JVM (LanHostsTest).
 */
final class LanHosts {

    private static final Pattern PRIVATE_V4 = Pattern.compile(
        "^(10\\.\\d{1,3}|172\\.(1[6-9]|2\\d|3[01])|192\\.168)\\.\\d{1,3}\\.\\d{1,3}$"
    );
    private static final Pattern MDNS = Pattern.compile(
        "^(?=.{1,253}\\.local$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+local$"
    );

    private LanHosts() {}

    static boolean isLanHost(String host) {
        if (host == null || host.isEmpty()) return false;
        String h = host.toLowerCase(Locale.ROOT);
        if (MDNS.matcher(h).matches()) return true;
        if (!PRIVATE_V4.matcher(h).matches()) return false;
        for (String octet : h.split("\\.")) {
            // Sem zeros à esquerda (010 é ambíguo: octal em alguns parsers) e nada acima de 255.
            if (octet.length() > 1 && octet.charAt(0) == '0') return false;
            if (Integer.parseInt(octet) > 255) return false;
        }
        return true;
    }

    /** Só http e https: nada de file:, intent:, javascript: saindo do app. */
    static boolean isLanUrl(String scheme, String host) {
        return ("http".equals(scheme) || "https".equals(scheme)) && isLanHost(host);
    }
}
