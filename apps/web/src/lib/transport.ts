/**
 * Como a interface alcança o servidor. Este arquivo é o do navegador: o servidor da rede local, na
 * mesma origem. No build do app Android (`--mode app`), o alias `@dama/transport` do vite.config
 * aponta para src/local/transport.ts — o servidor embutido no aparelho, com a mesma interface.
 */

/** A parte do WebSocket que lib/socket.ts usa. */
export interface SocketLike {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string): void;
  close(): void;
}

export function serverFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(path, init);
}

/** Se os dados ficam salvos de forma durável. No navegador, quem guarda é o servidor da rede. */
export function onStorageReady(listener: (persistent: boolean) => void): void {
  listener(true);
}

export function openSocket(): SocketLike {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return new WebSocket(`${proto}//${location.host}/ws`);
}
