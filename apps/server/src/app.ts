import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { AppContext } from './context.ts';
import { errorResponse, INTERNAL_ERROR } from './http/errors.ts';
import { gameRoutes } from './http/routes/games.ts';
import { metaRoutes } from './http/routes/meta.ts';
import { profileRoutes } from './http/routes/profile.ts';
import { studyRoutes } from './http/routes/studies.ts';
import { originAllowed } from './http/security.ts';
import { wsRoutes } from './http/ws.ts';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function buildApp(ctx: AppContext, logger: FastifyBaseLogger): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: 16 * 1024,
    trustProxy: false,
  });

  await app.register(helmet, {
    // HTTP puro na rede local: sem HSTS nem upgrade forçado para HTTPS.
    hsts: false,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute' });
  await app.register(websocket, { options: { maxPayload: 4096 } });

  // CSRF: requisições que alteram estado precisam vir da própria origem (ou de uma origem extra).
  app.addHook('onRequest', async (req, reply) => {
    if (
      MUTATING.has(req.method) &&
      req.url.startsWith('/api/') &&
      !originAllowed(req, ctx.config.extraOrigins)
    ) {
      await reply.code(403).send({ error: { code: 'forbidden-origin', message: 'Origem não permitida' } });
    }
  });
  app.addHook('onSend', async (_req, reply, payload) => {
    if (!reply.getHeader('cache-control')) reply.header('cache-control', 'no-store');
    return payload;
  });

  app.setErrorHandler((err, req, reply) => {
    const res = errorResponse(err);
    if (!res) req.log.error({ err }, 'erro não tratado');
    const { status, body, headers } = res ?? INTERNAL_ERROR;
    if (headers) reply.headers(headers);
    return reply.code(status).send(body);
  });

  profileRoutes(app, ctx);
  gameRoutes(app, ctx);
  studyRoutes(app, ctx);
  metaRoutes(app, ctx);
  wsRoutes(app, ctx);

  const dist = ctx.config.webDist;
  if (existsSync(join(dist, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: dist,
      wildcard: false,
      setHeaders(res, path) {
        // Arquivos com hash no nome são imutáveis; o index sempre revalida.
        res.header(
          'cache-control',
          path.includes(`${join('assets', '')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/ws')) {
        return reply.header('cache-control', 'no-cache').sendFile('index.html');
      }
      return reply.code(404).send({ error: { code: 'not-found', message: 'Rota não encontrada' } });
    });
  } else {
    app.setNotFoundHandler((_req, reply) =>
      reply.code(404).send({ error: { code: 'not-found', message: 'Rota não encontrada' } }),
    );
  }

  return app;
}
