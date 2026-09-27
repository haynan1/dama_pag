import type { ServerMessage } from '@dama/protocol';
import { clientMessageSchema } from '@dama/protocol/schemas';
import type { FastifyInstance } from 'fastify';
import { AiBusyError } from '../ai/pool.ts';
import type { AppContext } from '../context.ts';
import type { Client } from '../games/session.ts';
import { SessionError } from '../games/session.ts';
import { currentProfile, originAllowed } from './security.ts';

const MAX_MESSAGE_BYTES = 4096;
/** Balde de fichas por conexão: rajada de 30 mensagens, recarga de 10/s. */
const BUCKET_SIZE = 30;
const REFILL_PER_SEC = 10;

let nextClientId = 1;

export function wsRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get(
    '/ws',
    {
      websocket: true,
      preValidation: async (req, reply) => {
        if (!originAllowed(req, ctx.config.extraOrigins)) {
          await reply
            .code(403)
            .send({ error: { code: 'forbidden-origin', message: 'Origem não permitida' } });
        }
      },
    },
    (socket, req) => {
      const profile = currentProfile(req, ctx.profiles);
      const client: Client = {
        id: nextClientId++,
        profileId: profile?.id ?? null,
        send(message: ServerMessage) {
          if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
        },
      };
      let tokens = BUCKET_SIZE;
      let last = Date.now();
      let alive = true;

      const heartbeat = setInterval(() => {
        if (!alive) {
          socket.terminate();
          return;
        }
        alive = false;
        socket.ping();
      }, 30_000);
      socket.on('pong', () => {
        alive = true;
      });

      socket.on('message', (raw, isBinary) => {
        const now = Date.now();
        tokens = Math.min(BUCKET_SIZE, tokens + ((now - last) / 1000) * REFILL_PER_SEC);
        last = now;
        if (tokens < 1) {
          client.send({
            type: 'error',
            code: 'rate-limited',
            message: 'Muitas mensagens. Aguarde um instante.',
          });
          return;
        }
        tokens -= 1;
        const size = Array.isArray(raw) ? raw.reduce((a, b) => a + b.length, 0) : (raw as Buffer).byteLength;
        if (isBinary || size > MAX_MESSAGE_BYTES) {
          socket.close(1009, 'Mensagem inválida');
          return;
        }
        let data: unknown;
        try {
          data = JSON.parse(raw.toString());
        } catch (err) {
          if (!(err instanceof SyntaxError)) throw err;
          client.send({ type: 'error', code: 'invalid-json', message: 'Mensagem inválida' });
          return;
        }
        const parsed = clientMessageSchema.safeParse(data);
        if (!parsed.success) {
          client.send({ type: 'error', code: 'invalid-message', message: 'Mensagem inválida' });
          return;
        }
        ctx.manager.handle(client, parsed.data).catch((err: unknown) => {
          if (err instanceof SessionError) {
            client.send({ type: 'error', code: err.code, message: err.message });
          } else if (err instanceof AiBusyError) {
            client.send({ type: 'error', code: 'ai-busy', message: err.message });
          } else {
            req.log.error({ err }, 'erro ao processar mensagem');
            client.send({ type: 'error', code: 'internal', message: 'Erro interno. Tente novamente.' });
          }
        });
      });

      socket.on('close', () => {
        clearInterval(heartbeat);
        ctx.manager.disconnect(client);
      });
    },
  );
}
