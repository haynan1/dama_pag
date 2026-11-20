import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  displayAddress,
  forgetServer,
  isLanHost,
  parseServerAddress,
  probeServer,
  recentServers,
  rememberServer,
} from '../src/platform/lan.ts';
import { deviceCampaignUrl, insideAndroidApp } from '../src/platform/runtime.ts';

const META = { version: '1.0.0', lanUrls: [], variants: [], aiLevels: [] };

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('isLanHost', () => {
  it('aceita só faixas privadas e mDNS — as mesmas do nativo (LanHostsTest)', () => {
    for (const ok of [
      '192.168.0.12',
      '10.0.0.1',
      '172.16.4.2',
      '172.31.255.255',
      'meupc.local',
      'Sala-PC.local',
    ])
      expect(isLanHost(ok), ok).toBe(true);
    for (const bad of [
      '8.8.8.8',
      '172.32.0.1',
      '172.15.0.1',
      '127.0.0.1',
      'localhost',
      '192.168.0.256',
      '192.168.010.1',
      '192.168.0.1.evil.com',
      'evil.com',
      'local',
      '',
    ])
      expect(isLanHost(bad), bad).toBe(false);
  });
});

describe('parseServerAddress', () => {
  it('entende o que a pessoa digita e devolve só a origem', () => {
    expect(parseServerAddress('192.168.0.12')).toEqual({ ok: true, origin: 'http://192.168.0.12:5810' });
    expect(parseServerAddress(' 192.168.0.12:8080 ')).toEqual({
      ok: true,
      origin: 'http://192.168.0.12:8080',
    });
    expect(parseServerAddress('http://192.168.0.12:5810/sala/ABCD?x=1')).toEqual({
      ok: true,
      origin: 'http://192.168.0.12:5810',
    });
    expect(parseServerAddress('HTTP://MeuPC.local')).toEqual({ ok: true, origin: 'http://meupc.local:5810' });
  });

  it('recusa vazio, lixo, internet, credenciais e esquemas estranhos', () => {
    for (const bad of [
      '',
      '   ',
      'http://',
      'exemplo.com',
      'https://8.8.8.8',
      'http://user:senha@192.168.0.12',
      'ftp://192.168.0.12',
      'javascript:alert(1)',
    ]) {
      const r = parseServerAddress(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.message.length).toBeGreaterThan(0);
    }
  });
});

describe('displayAddress', () => {
  it('esconde o esquema e só a porta padrão', () => {
    expect(displayAddress('http://192.168.0.12:5810')).toBe('192.168.0.12');
    expect(displayAddress('http://192.168.0.1:58101')).toBe('192.168.0.1:58101');
    expect(displayAddress('http://192.168.0.12:8080')).toBe('192.168.0.12:8080');
  });
});

describe('probeServer', () => {
  it('reconhece um servidor Dama pelo /api/meta', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(META), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(probeServer('http://192.168.0.12:5810')).resolves.toEqual({ ok: true, version: '1.0.0' });
    expect(fetchMock).toHaveBeenCalledWith('http://192.168.0.12:5810/api/meta', expect.anything());
  });

  it('distingue "ninguém respondeu" de "não é o Dama"', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(probeServer('http://192.168.0.12:5810')).resolves.toEqual({
      ok: false,
      reason: 'unreachable',
    });

    vi.stubGlobal('fetch', async () => new Response('<html>roteador</html>', { status: 200 }));
    await expect(probeServer('http://192.168.0.1:5810')).resolves.toEqual({ ok: false, reason: 'not-dama' });

    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ version: 1 }), { status: 200 }));
    await expect(probeServer('http://192.168.0.1:5810')).resolves.toEqual({ ok: false, reason: 'not-dama' });

    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(META), { status: 503 }));
    await expect(probeServer('http://192.168.0.1:5810')).resolves.toEqual({ ok: false, reason: 'not-dama' });
  });
});

describe('servidores recentes', () => {
  it('mais recente primeiro, sem repetição, no máximo 4', async () => {
    for (const n of [1, 2, 3, 4, 5]) await rememberServer(`http://192.168.0.${n}:5810`);
    await rememberServer('http://192.168.0.3:5810');
    expect(await recentServers()).toEqual([
      'http://192.168.0.3:5810',
      'http://192.168.0.5:5810',
      'http://192.168.0.4:5810',
      'http://192.168.0.2:5810',
    ]);
    await forgetServer('http://192.168.0.5:5810');
    expect(await recentServers()).toEqual([
      'http://192.168.0.3:5810',
      'http://192.168.0.4:5810',
      'http://192.168.0.2:5810',
    ]);
  });

  it('save corrompido ou adulterado não quebra e não vira destino', async () => {
    localStorage.setItem('dama:lan-servers', '{nao é json');
    expect(await recentServers()).toEqual([]);
    localStorage.setItem('dama:lan-servers', JSON.stringify({ a: 1 }));
    expect(await recentServers()).toEqual([]);
    localStorage.setItem(
      'dama:lan-servers',
      JSON.stringify([42, 'https://evil.com', 'javascript:alert(1)', 'http://10.0.0.2:5810']),
    );
    expect(await recentServers()).toEqual(['http://10.0.0.2:5810']);
  });
});

describe('insideAndroidApp', () => {
  it('reconhece a marca que o app acrescenta ao user agent', () => {
    expect(
      insideAndroidApp('Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile Safari/537.36 DamaApp/1'),
    ).toBe(true);
    expect(insideAndroidApp('Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile Safari/537.36')).toBe(false);
  });
});

describe('deviceCampaignUrl', () => {
  const inApp = 'Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile Safari/537.36 DamaApp/1';
  const browser = 'Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile Safari/537.36';

  it('na interface do próprio app a campanha é rota interna (não volta para o início)', () => {
    expect(deviceCampaignUrl('app', inApp)).toBeNull();
  });

  it('página da rede local dentro do app volta para a campanha do aparelho', () => {
    expect(deviceCampaignUrl('web', inApp)).toBe('https://localhost/campanha');
  });

  it('no navegador a campanha é rota interna', () => {
    expect(deviceCampaignUrl('web', browser)).toBeNull();
  });
});
