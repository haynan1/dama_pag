import type { SocketLike } from '../lib/transport.ts';
import { LocalSocket, localFetch } from './client.ts';

export { onStorageReady } from './client.ts';
/** Build do app Android: a API e as partidas vão para o servidor embutido (ver lib/transport.ts). */
export type { SocketLike };

export function serverFetch(path: string, init: RequestInit): Promise<Response> {
  return localFetch(path, init);
}

export function openSocket(): SocketLike {
  return new LocalSocket();
}
