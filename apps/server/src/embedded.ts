import type { ServerMessage } from '@dama/protocol';
import type { FastifyInstance } from 'fastify';
import type { AiRunner } from './ai/runner.ts';
import type { Config } from './config.ts';
import type { AppContext } from './context.ts';
import { GameRepo } from './db/games.ts';
import { ProfileRepo } from './db/profiles.ts';
import type { SqlDatabase } from './db/sql.ts';
import { StudyRepo } from './db/studies.ts';
import { GameManager, type ManagerDeps } from './games/manager.ts';
import type { Client } from './games/session.ts';
import { errorResponse, INTERNAL_ERROR } from './http/errors.ts';
import { gameRoutes } from './http/routes/games.ts';
import { metaRoutes } from './http/routes/meta.ts';
import { profileRoutes } from './http/routes/profile.ts';
import { studyRoutes } from './http/routes/studies.ts';
import { SESSION_COOKIE } from './http/security.ts';
import { dispatchClientMessage, newClientId } from './http/ws.ts';
import { ProgressService } from './progress/service.ts';

/**
 * O servidor do Dama sem HTTP: as MESMAS rotas, repositórios, sessões de partida e serviço de
 * progresso, atendidos em processo. É o que roda dentro do app Android (num Web Worker, com SQLite
 * WebAssembly e a IA em Web Workers), para o sistema completo funcionar sem computador nem rede.
 *
 * Nada de lógica paralela: as rotas de `http/routes` são registradas aqui num roteador mínimo que
 * implementa só a parte da API do Fastify que elas usam (ver `Router`). O que é específico de um
 * servidor exposto na rede (CSP, CSRF por Origin, limite de taxa, arquivos estáticos) não se aplica
 * a um processo que só a própria interface do app alcança.
 */

export type Log = ManagerDeps['log'];

export interface EmbeddedRequest {
  readonly method: string;
  /** Caminho com query string, como `/api/games?before=...`. */
  readonly url: string;
  readonly body?: unknown;
}

export interface EmbeddedResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  /** Valor JSON, texto (ex.: PDN) ou `null` (204). */
  readonly body: unknown;
}

export interface EmbeddedConnection {
  receive(data: unknown): void;
  close(): void;
}

export interface EmbeddedServer {
  handle(request: EmbeddedRequest): Promise<EmbeddedResponse>;
  /** Equivalente a abrir o WebSocket: mensagens da partida chegam por `send`. */
  connect(send: (message: ServerMessage) => void): EmbeddedConnection;
  shutdown(): Promise<void>;
}

const ORIGIN = 'https://localhost';

/** Configuração de um servidor que não escuta em porta nenhuma. */
const EMBEDDED_CONFIG: Config = {
  host: 'embedded',
  port: 0,
  dataDir: '',
  aiWorkers: 0,
  logLevel: 'warn',
  extraOrigins: [],
  production: true,
  webDist: '',
};

/**
 * Sessão do único perfil do aparelho. O token fica no próprio banco, ao lado do perfil: backup,
 * restauração e "limpar dados" tratam os dois juntos, sem cookie órfão nem perfil sem dono.
 */
class SessionStore {
  private readonly db: SqlDatabase;

  constructor(db: SqlDatabase) {
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS embedded_session (
      id INTEGER PRIMARY KEY CHECK (id = 1), token TEXT NOT NULL
    ) STRICT`);
  }

  get(): string | null {
    return this.db.get<{ token: string }>('SELECT token FROM embedded_session WHERE id = 1')?.token ?? null;
  }

  set(token: string): void {
    this.db.run(
      'INSERT INTO embedded_session (id, token) VALUES (1, :token) ON CONFLICT (id) DO UPDATE SET token = :token',
      { token },
    );
  }
}

type Handler = (req: Request, reply: Reply) => unknown;

interface Request {
  readonly method: string;
  readonly url: string;
  readonly params: Record<string, string>;
  readonly query: Record<string, string>;
  readonly body: unknown;
  readonly headers: Record<string, string>;
  readonly cookies: Record<string, string>;
  readonly protocol: 'https';
  readonly log: Log;
}

class Reply {
  statusCode = 200;
  sent = false;
  payload: unknown = null;
  readonly headerMap: Record<string, string> = {};
  private readonly sessions: SessionStore;

  constructor(sessions: SessionStore) {
    this.sessions = sessions;
  }

  code(status: number): this {
    this.statusCode = status;
    return this;
  }

  header(name: string, value: string): this {
    this.headerMap[name.toLowerCase()] = value;
    return this;
  }

  getHeader(name: string): string | undefined {
    return this.headerMap[name.toLowerCase()];
  }

  setCookie(name: string, value: string): this {
    if (name === SESSION_COOKIE) this.sessions.set(value);
    return this;
  }

  send(payload?: unknown): this {
    this.payload = payload ?? null;
    this.sent = true;
    return this;
  }
}

interface Route {
  readonly method: string;
  readonly segments: readonly string[];
  readonly handler: Handler;
}

/**
 * Roteador com a fatia da API do Fastify que as rotas usam: `get/post/patch/delete(path, [opts],
 * handler)`, `req.params/query/body/cookies` e `reply.code/header/send/setCookie`. Semântica igual:
 * valor devolvido pelo handler vira o corpo, salvo se ele já chamou `reply.send`.
 */
class Router {
  private readonly routes: Route[] = [];

  private add(method: string, path: string, a: unknown, b?: unknown): void {
    const handler = (typeof a === 'function' ? a : b) as Handler;
    this.routes.push({ method, segments: path.split('/').filter(Boolean), handler });
  }

  get(path: string, a: unknown, b?: unknown): void {
    this.add('GET', path, a, b);
  }
  post(path: string, a: unknown, b?: unknown): void {
    this.add('POST', path, a, b);
  }
  patch(path: string, a: unknown, b?: unknown): void {
    this.add('PATCH', path, a, b);
  }
  delete(path: string, a: unknown, b?: unknown): void {
    this.add('DELETE', path, a, b);
  }

  match(method: string, pathname: string): { route: Route; params: Record<string, string> } | null {
    const parts = pathname.split('/').filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method || route.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < parts.length && ok; i++) {
        const seg = route.segments[i]!;
        const part = parts[i]!;
        if (seg.startsWith(':')) {
          try {
            params[seg.slice(1)] = decodeURIComponent(part);
          } catch {
            ok = false;
          }
        } else ok = seg === part;
      }
      if (ok) return { route, params };
    }
    return null;
  }
}

export function createEmbeddedServer(deps: { db: SqlDatabase; ai: AiRunner; log: Log }): EmbeddedServer {
  const { db, ai, log } = deps;
  db.migrate();
  const sessions = new SessionStore(db);
  const profiles = new ProfileRepo(db);
  const games = new GameRepo(db);
  const studies = new StudyRepo(db);
  const progress = new ProgressService(db, profiles, studies);
  const manager = new GameManager({ ai, games, progress, log });
  const ctx: AppContext = {
    config: EMBEDDED_CONFIG,
    db,
    ai,
    profiles,
    games,
    studies,
    progress,
    manager,
    // Ninguém de fora alcança este servidor: sem convite pela rede.
    lanUrls: () => [],
  };

  const router = new Router();
  // As rotas tipam o parâmetro como FastifyInstance; o roteador implementa a parte que elas usam
  // (coberto por test/embedded.test.ts, que exercita todas).
  const app = router as unknown as FastifyInstance;
  profileRoutes(app, ctx);
  gameRoutes(app, ctx);
  studyRoutes(app, ctx);
  metaRoutes(app, ctx);

  const cookies = (): Record<string, string> => {
    const token = sessions.get();
    return token ? { [SESSION_COOKIE]: token } : {};
  };

  return {
    async handle(request) {
      const url = new URL(request.url, ORIGIN);
      const method = request.method.toUpperCase();
      const found = router.match(method, url.pathname);
      if (!found) {
        return {
          status: 404,
          headers: {},
          body: { error: { code: 'not-found', message: 'Rota não encontrada' } },
        };
      }
      const reply = new Reply(sessions);
      const req: Request = {
        method,
        url: url.pathname + url.search,
        params: found.params,
        query: Object.fromEntries(url.searchParams),
        body: request.body ?? null,
        headers: { host: 'localhost', origin: ORIGIN },
        cookies: cookies(),
        protocol: 'https',
        log,
      };
      try {
        const result = await found.route.handler(req, reply);
        if (!reply.sent) reply.send(result === reply ? null : result);
        return { status: reply.statusCode, headers: { ...reply.headerMap }, body: reply.payload };
      } catch (err) {
        const res = errorResponse(err);
        if (!res) log.error({ err, url: req.url }, 'erro não tratado');
        const { status, body, headers } = res ?? INTERNAL_ERROR;
        return { status, headers: { ...headers }, body };
      }
    },

    connect(send) {
      const token = sessions.get();
      const profile = token ? profiles.byToken(token) : undefined;
      const client: Client = { id: newClientId(), profileId: profile?.id ?? null, send };
      let open = true;
      return {
        receive(data) {
          if (open) dispatchClientMessage(ctx, client, data, log);
        },
        close() {
          if (!open) return;
          open = false;
          manager.disconnect(client);
        },
      };
    },

    async shutdown() {
      manager.shutdown();
      await ai.close();
      db.close();
    },
  };
}
