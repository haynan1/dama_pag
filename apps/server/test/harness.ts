import type { AddressInfo } from 'node:net';
import type { GameView, ServerMessage } from '@dama/protocol';
import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import WebSocket from 'ws';
import { AiPool } from '../src/ai/pool.ts';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { Database } from '../src/db/database.ts';
import { GameRepo } from '../src/db/games.ts';
import { ProfileRepo } from '../src/db/profiles.ts';
import { StudyRepo } from '../src/db/studies.ts';
import { GameManager } from '../src/games/manager.ts';
import { ProgressService } from '../src/progress/service.ts';

export interface TestServer {
  readonly app: FastifyInstance;
  readonly origin: string;
  readonly db: Database;
  close(): Promise<void>;
}

export async function startServer(): Promise<TestServer> {
  const config = loadConfig({ NODE_ENV: 'test', AI_WORKERS: '2', LOG_LEVEL: 'silent', HOST: '127.0.0.1' });
  const log = pino({ level: 'silent' });
  const db = new Database(':memory:');
  db.migrate();
  const ai = new AiPool(config.aiWorkers);
  const profiles = new ProfileRepo(db);
  const games = new GameRepo(db);
  const studies = new StudyRepo(db);
  const progress = new ProgressService(db, profiles, studies);
  const manager = new GameManager({ ai, games, progress, log });
  const app = await buildApp({ config, db, ai, profiles, games, studies, progress, manager }, log);
  await app.listen({ host: '127.0.0.1', port: 0 });
  const { port } = app.server.address() as AddressInfo;
  return {
    app,
    db,
    origin: `http://127.0.0.1:${port}`,
    async close() {
      await app.close();
      manager.shutdown();
      await ai.close();
      db.close();
    },
  };
}

/** Cliente de teste: guarda o cookie de sessão e envia sempre a origem correta. */
let nextIp = 1;

export class TestClient {
  cookie = '';
  /** Cada cliente simula um dispositivo diferente da rede (limites de taxa são por IP). */
  readonly ip = `10.0.${Math.floor(nextIp / 250)}.${(nextIp++ % 250) + 1}`;
  private readonly server: TestServer;

  constructor(server: TestServer) {
    this.server = server;
  }

  async request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const res = await this.server.app.inject({
      method,
      url,
      remoteAddress: this.ip,
      headers: {
        host: new URL(this.server.origin).host,
        origin: this.server.origin,
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { payload: body as object }),
    });
    const setCookie = res.headers['set-cookie'];
    if (setCookie) this.cookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0]!;
    return { status: res.statusCode, json: () => res.json(), headers: res.headers, body: res.body };
  }

  async signUp(name: string): Promise<string> {
    const res = await this.request('POST', '/api/profiles', { name });
    if (res.status !== 201) throw new Error(`signUp falhou: ${res.body}`);
    return (res.json() as { profile: { id: string } }).profile.id;
  }

  connect(origin = this.server.origin): Promise<Socket> {
    const url = `${this.server.origin.replace('http', 'ws')}/ws`;
    const ws = new WebSocket(url, { headers: { origin, cookie: this.cookie } });
    return new Promise((resolve, reject) => {
      ws.once('open', () => resolve(new Socket(ws)));
      ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
      ws.once('error', reject);
    });
  }
}

export class Socket {
  readonly messages: ServerMessage[] = [];
  private readonly ws: WebSocket;
  private waiters: { test: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      this.messages.push(msg);
      this.waiters = this.waiters.filter((w) => {
        if (!w.test(msg)) return true;
        w.resolve(msg);
        return false;
      });
    });
  }

  send(message: unknown): void {
    this.ws.send(JSON.stringify(message));
  }

  /** Espera a próxima mensagem que satisfaz o teste (inclui as já recebidas, se `past`). */
  wait<T = ServerMessage>(test: (m: ServerMessage) => boolean, timeoutMs = 20_000, past = true): Promise<T> {
    if (past) {
      const found = [...this.messages].reverse().find(test);
      if (found) return Promise.resolve(found as unknown as T);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              `Tempo esgotado esperando mensagem. Recebidas: ${this.messages.map((m) => (m.type === 'state' ? `state(${m.game.moves.length},${m.game.status},ai=${m.game.aiThinking})` : m.type === 'error' ? `error(${m.code})` : m.type)).join(' ')}`,
            ),
          ),
        timeoutMs,
      );
      this.waiters.push({
        test,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as unknown as T);
        },
      });
    });
  }

  waitState(test: (g: GameView) => boolean, timeoutMs?: number, past = true): Promise<GameView> {
    return this.wait<{ type: 'state'; game: GameView }>(
      (m) => m.type === 'state' && test(m.game),
      timeoutMs,
      past,
    ).then((m) => m.game);
  }

  close(): void {
    this.ws.close();
  }
}
