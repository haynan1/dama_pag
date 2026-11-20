package app.dama.campanha;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class LanHostsTest {

    @Test
    public void aceitaFaixasPrivadasEMdns() {
        assertTrue(LanHosts.isLanHost("192.168.0.12"));
        assertTrue(LanHosts.isLanHost("10.0.0.1"));
        assertTrue(LanHosts.isLanHost("172.16.4.2"));
        assertTrue(LanHosts.isLanHost("172.31.255.255"));
        assertTrue(LanHosts.isLanHost("meupc.local"));
        assertTrue(LanHosts.isLanHost("Sala-PC.local"));
    }

    @Test
    public void recusaInternetELoopbackEFormatosAmbiguos() {
        assertFalse(LanHosts.isLanHost("8.8.8.8"));
        assertFalse(LanHosts.isLanHost("172.32.0.1"));
        assertFalse(LanHosts.isLanHost("172.15.0.1"));
        assertFalse(LanHosts.isLanHost("127.0.0.1"));
        assertFalse(LanHosts.isLanHost("localhost"));
        assertFalse(LanHosts.isLanHost("192.168.0.256"));
        assertFalse(LanHosts.isLanHost("192.168.010.1"));
        assertFalse(LanHosts.isLanHost("192.168.0.1.evil.com"));
        assertFalse(LanHosts.isLanHost("evil.com"));
        assertFalse(LanHosts.isLanHost("local"));
        assertFalse(LanHosts.isLanHost(""));
        assertFalse(LanHosts.isLanHost(null));
    }

    @Test
    public void soHttpEHttps() {
        assertTrue(LanHosts.isLanUrl("http", "192.168.0.12"));
        assertTrue(LanHosts.isLanUrl("https", "192.168.0.12"));
        assertFalse(LanHosts.isLanUrl("file", "192.168.0.12"));
        assertFalse(LanHosts.isLanUrl("intent", "192.168.0.12"));
        assertFalse(LanHosts.isLanUrl("javascript", null));
    }
}
