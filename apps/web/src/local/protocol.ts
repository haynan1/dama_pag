import type { ServerMessage } from '@dama/protocol';

/**
 * Mensagens entre a interface (thread principal) e o servidor embutido (Web Worker).
 * O desenho imita HTTP + WebSocket para a interface não saber a diferença: `request` é uma
 * chamada da API, `open/message/close` são uma conexão de partida.
 */
export type ToServer =
  | {
      readonly kind: 'request';
      readonly id: number;
      readonly method: string;
      readonly url: string;
      readonly body?: unknown;
    }
  | { readonly kind: 'open'; readonly conn: number }
  | { readonly kind: 'message'; readonly conn: number; readonly data: unknown }
  | { readonly kind: 'close'; readonly conn: number };

export type FromServer =
  | { readonly kind: 'ready'; readonly persistent: boolean }
  | { readonly kind: 'fatal'; readonly message: string }
  | {
      readonly kind: 'response';
      readonly id: number;
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly body: unknown;
    }
  | { readonly kind: 'push'; readonly conn: number; readonly message: ServerMessage };
