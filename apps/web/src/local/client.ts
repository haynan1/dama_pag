import type { ServerMessage } from '@dama/protocol';
import type { FromServer, ToServer } from './protocol.ts';

/**
 * Ponte da interface com o servidor embutido (src/local/server.worker.ts). Oferece o que a
 * interface já usa com o servidor da rede — um `fetch` e um "WebSocket" — para nenhuma tela
 * precisar saber onde o servidor está.
 */

interface Pending {
  readonly resolve: (res: Response) => void;
  readonly reject: (err: Error) => void;
}

let worker: Worker | null = null;
let nextRequest = 1;
let nextConn = 1;
const pending = new Map<number, Pending>();
const sockets = new Map<number, LocalSocket>();
let persistentListeners: ((persistent: boolean) => void)[] = [];

function fail(reason: string): void {
  for (const p of pending.values()) p.reject(new TypeError(reason));
  pending.clear();
  for (const s of sockets.values()) s.drop();
  sockets.clear();
}

function server(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./server.worker.ts', import.meta.url), { type: 'module', name: 'servidor' });
  w.onmessage = (event: MessageEvent<FromServer>) => {
    const msg = event.data;
    switch (msg.kind) {
      case 'ready':
        for (const l of persistentListeners) l(msg.persistent);
        persistentListeners = [];
        return;
      case 'fatal':
        // Não subiu (banco, WASM): descarta este servidor. O próximo pedido tenta um novo — e a
        // interface mostra "Servidor indisponível" com "Tentar de novo" em vez de ficar esperando.
        w.terminate();
        if (worker === w) worker = null;
        fail(msg.message);
        return;
      case 'response': {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        const headers = new Headers(msg.headers);
        let body: string | null = null;
        if (msg.status !== 204 && msg.body !== null) {
          if (typeof msg.body === 'string') body = msg.body;
          else {
            body = JSON.stringify(msg.body);
            headers.set('content-type', 'application/json; charset=utf-8');
          }
        }
        p.resolve(new Response(body, { status: msg.status, headers }));
        return;
      }
      case 'push':
        sockets.get(msg.conn)?.deliver(msg.message);
        return;
    }
  };
  w.onerror = (event) => {
    event.preventDefault();
    w.terminate();
    if (worker === w) worker = null;
    // Como uma queda do servidor: pedidos falham com erro de rede e as conexões fecham (a
    // interface reconecta, e o próximo pedido sobe um servidor novo sobre o mesmo banco).
    fail('O servidor do app parou. Tente de novo.');
  };
  worker = w;
  return w;
}

function send(message: ToServer): void {
  server().postMessage(message);
}

/** Avisa se o progresso fica salvo no aparelho (OPFS) ou só na memória (WebView muito antiga). */
export function onStorageReady(listener: (persistent: boolean) => void): void {
  persistentListeners.push(listener);
  server();
}

/** `fetch` para caminhos `/api/...` atendidos pelo servidor embutido. */
export async function localFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
  const id = nextRequest++;
  return new Promise<Response>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ kind: 'request', id, method, url: input, body });
  });
}

/**
 * O pedaço da interface do WebSocket que `lib/socket.ts` usa, sobre o servidor embutido.
 * Abre de forma assíncrona como um WebSocket de verdade; mensagens chegam como texto JSON.
 */
export class LocalSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = LocalSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private readonly conn = nextConn++;

  constructor() {
    sockets.set(this.conn, this);
    send({ kind: 'open', conn: this.conn });
    queueMicrotask(() => {
      if (this.readyState !== LocalSocket.CONNECTING) return;
      this.readyState = LocalSocket.OPEN;
      this.onopen?.(new Event('open'));
    });
  }

  send(data: string): void {
    if (this.readyState !== LocalSocket.OPEN) return;
    send({ kind: 'message', conn: this.conn, data: JSON.parse(data) as unknown });
  }

  close(): void {
    if (this.readyState >= LocalSocket.CLOSING) return;
    worker?.postMessage({ kind: 'close', conn: this.conn } satisfies ToServer);
    this.drop();
    sockets.delete(this.conn);
  }

  /** Mensagem do servidor para esta conexão. */
  deliver(message: ServerMessage): void {
    if (this.readyState !== LocalSocket.OPEN) return;
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) }));
  }

  /** Conexão encerrada (por nós ou porque o servidor caiu). */
  drop(): void {
    if (this.readyState === LocalSocket.CLOSED) return;
    this.readyState = LocalSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }
}
