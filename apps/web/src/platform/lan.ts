import { CapacitorHttp } from '@capacitor/core';
import { isNative } from './runtime.ts';
import { storage } from './storage.ts';

/**
 * Rede local no app Android: o app abre o servidor Dama de um computador da mesma Wi-Fi na própria
 * WebView. Navegar até a origem do servidor (em vez de chamar a API de longe) mantém tudo como no
 * navegador — cookie de sessão SameSite=Strict, CSP e checagem de origem do servidor intactos.
 *
 * Segurança: a ponte nativa (anúncios, compras, armazenamento) só existe na origem do app. Páginas
 * do servidor não a recebem, e o nativo (`LanNavigationPlugin`) só deixa a WebView sair para
 * endereços privados — qualquer outro link abre no navegador do sistema.
 */

/** Porta padrão do servidor (`PORT` em apps/server/src/config.ts). */
export const DEFAULT_PORT = 5810;
const RECENT_KEY = 'dama:lan-servers';
const MAX_RECENT = 4;
const PROBE_TIMEOUT_MS = 5000;

/** Mesmas faixas que o servidor anuncia (`lanUrls`) e que o nativo aceita (`LanHosts.java`). */
const PRIVATE_V4 = /^(10\.\d{1,3}|172\.(1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}$/;
const MDNS = /^(?=.{1,253}\.local$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+local$/;

export function isLanHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (MDNS.test(host)) return true;
  if (!PRIVATE_V4.test(host)) return false;
  return host.split('.').every((octet) => Number(octet) <= 255 && String(Number(octet)) === octet);
}

export type AddressResult =
  | { readonly ok: true; readonly origin: string }
  | { readonly ok: false; readonly message: string };

/**
 * Aceita o que a pessoa digita de verdade — `192.168.0.12`, `192.168.0.12:5810`, a URL inteira
 * copiada da tela do computador, até com caminho (`/sala/ABCD`) — e devolve só a origem.
 */
export function parseServerAddress(input: string): AddressResult {
  const raw = input.trim();
  if (!raw) return { ok: false, message: 'Digite o endereço que aparece no computador.' };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`);
  } catch (err) {
    if (!(err instanceof TypeError)) throw err;
    return { ok: false, message: 'Endereço inválido. Exemplo: 192.168.0.12:5810' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, message: 'Use um endereço http://.' };
  }
  if (url.username || url.password) return { ok: false, message: 'Endereço inválido.' };
  if (!isLanHost(url.hostname)) {
    return {
      ok: false,
      message: 'O servidor precisa estar na sua rede local (ex.: 192.168.0.12 ou meupc.local).',
    };
  }
  if (!url.port && url.protocol === 'http:') url.port = String(DEFAULT_PORT);
  return { ok: true, origin: url.origin };
}

export type ProbeResult =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly reason: 'unreachable' | 'not-dama' };

/** Formato mínimo de `/api/meta` (MetaView): o bastante para saber que é um servidor Dama. */
function looksLikeDama(data: unknown): data is { version: string } {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d['version'] === 'string' && Array.isArray(d['variants']) && Array.isArray(d['aiLevels']);
}

/**
 * Confirma que há um servidor Dama no endereço antes de sair do app: um IP errado vira uma
 * mensagem clara na folha, e não a página de erro da WebView.
 *
 * No Android a sondagem vai pelo HTTP nativo — a página do app é https://localhost e um `fetch`
 * para http:// seria bloqueado como conteúdo misto (e o servidor não libera CORS, de propósito).
 */
export async function probeServer(origin: string): Promise<ProbeResult> {
  const url = `${origin}/api/meta`;
  let status: number;
  let data: unknown;
  try {
    if (isNative) {
      const res = await CapacitorHttp.get({
        url,
        connectTimeout: PROBE_TIMEOUT_MS,
        readTimeout: PROBE_TIMEOUT_MS,
        responseType: 'json',
      });
      status = res.status;
      data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    } else {
      const res = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), credentials: 'omit' });
      status = res.status;
      data = await res.json();
    }
  } catch (err) {
    // Resposta que não é JSON: existe algo no endereço, mas não é o Dama.
    if (err instanceof SyntaxError) return { ok: false, reason: 'not-dama' };
    return { ok: false, reason: 'unreachable' };
  }
  if (status !== 200 || !looksLikeDama(data)) return { ok: false, reason: 'not-dama' };
  return { ok: true, version: data.version };
}

/** Servidores usados por último, do mais recente ao mais antigo. Leitura defensiva. */
export async function recentServers(): Promise<string[]> {
  const raw = await storage.get(RECENT_KEY);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: string[] = [];
  for (const item of parsed) {
    if (typeof item !== 'string') continue;
    const r = parseServerAddress(item);
    if (r.ok && !out.includes(r.origin)) out.push(r.origin);
    if (out.length === MAX_RECENT) break;
  }
  return out;
}

export async function rememberServer(origin: string): Promise<void> {
  const list = [origin, ...(await recentServers()).filter((o) => o !== origin)].slice(0, MAX_RECENT);
  await storage.set(RECENT_KEY, JSON.stringify(list));
}

export async function forgetServer(origin: string): Promise<void> {
  const list = (await recentServers()).filter((o) => o !== origin);
  await storage.set(RECENT_KEY, JSON.stringify(list));
}

/** Endereço sem esquema nem porta padrão, como a pessoa reconhece. */
export function displayAddress(origin: string): string {
  return origin.replace(/^http:\/\//, '').replace(new RegExp(`:${DEFAULT_PORT}$`), '');
}

/** Sai do app para o servidor. O histórico fica: o botão voltar na tela inicial dele traz de volta. */
export function openServer(origin: string): void {
  location.assign(`${origin}/`);
}
