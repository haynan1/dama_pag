import type { ClientMessage, ServerMessage } from '@dama/protocol';

type Listener = (message: ServerMessage) => void;
export type ConnectionState = 'connecting' | 'open' | 'closed';

/**
 * Conexão WebSocket única por aba, com reconexão exponencial e reassinatura automática
 * das partidas abertas. O cookie de sessão autentica o handshake.
 */
class Socket {
  private ws: WebSocket | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly stateListeners = new Set<(s: ConnectionState) => void>();
  private readonly subscriptions = new Map<string, number>();
  private readonly outbox: ClientMessage[] = [];
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  state: ConnectionState = 'closed';

  private url(): string {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  private setState(s: ConnectionState): void {
    this.state = s;
    for (const l of this.stateListeners) l(s);
  }

  connect(): void {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    this.setState('connecting');
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.setState('open');
      for (const gameId of this.subscriptions.keys()) this.raw({ type: 'subscribe', gameId });
      for (const m of this.outbox.splice(0)) this.raw(m);
      this.heartbeat = setInterval(() => this.raw({ type: 'ping' }), 25_000);
    };
    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(event.data)) as ServerMessage;
      } catch (err) {
        if (err instanceof SyntaxError) return;
        throw err;
      }
      for (const l of this.listeners) l(msg);
    };
    ws.onclose = () => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      this.ws = null;
      this.setState('closed');
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.timer || (this.subscriptions.size === 0 && this.listeners.size === 0)) return;
    const delay = Math.min(10_000, 400 * 2 ** this.attempt) * (0.7 + Math.random() * 0.6);
    this.attempt++;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }

  private raw(message: ClientMessage): void {
    this.ws?.send(JSON.stringify(message));
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.raw(message);
    else {
      if (message.type !== 'ping' && message.type !== 'subscribe') this.outbox.push(message);
      this.connect();
    }
  }

  /** Assina uma partida; devolve a função para cancelar. Conta referências por partida. */
  subscribe(gameId: string): () => void {
    const count = this.subscriptions.get(gameId) ?? 0;
    this.subscriptions.set(gameId, count + 1);
    if (count === 0) this.send({ type: 'subscribe', gameId });
    this.connect();
    return () => {
      const n = (this.subscriptions.get(gameId) ?? 1) - 1;
      if (n <= 0) {
        this.subscriptions.delete(gameId);
        if (this.ws?.readyState === WebSocket.OPEN) this.raw({ type: 'unsubscribe', gameId });
      } else this.subscriptions.set(gameId, n);
    };
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onState(listener: (s: ConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }
}

export const socket = new Socket();
