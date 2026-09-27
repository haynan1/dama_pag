import { Game } from '@dama/engine';
import { createGameSchema, roomCodeSchema } from '@dama/protocol/schemas';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context.ts';
import { summarize } from '../../db/games.ts';
import { HttpError, parse, requireProfile } from '../security.ts';

const idParam = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{8,32}$/) });
const listQuery = z.object({
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export function gameRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post(
    '/api/games',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const profile = requireProfile(req, ctx.profiles);
      const input = parse(createGameSchema, req.body);
      let record: ReturnType<AppContext['manager']['create']>;
      try {
        record = ctx.manager.create(profile, input);
      } catch (err) {
        if (err instanceof SyntaxError) throw new HttpError(400, 'invalid-fen', err.message);
        throw err;
      }
      return reply.code(201).send({ id: record.id, roomCode: record.roomCode });
    },
  );

  app.post(
    '/api/rooms/:code/join',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const profile = requireProfile(req, ctx.profiles);
      const code = parse(roomCodeSchema, (req.params as { code?: string }).code);
      const record = ctx.manager.joinRoom(profile, code);
      return { id: record.id };
    },
  );

  app.get('/api/games', async (req) => {
    const profile = requireProfile(req, ctx.profiles);
    const { before, limit } = parse(listQuery, req.query);
    return { games: ctx.games.listForProfile(profile.id, limit, before) };
  });

  app.get('/api/games/:id', async (req) => {
    const profile = requireProfile(req, ctx.profiles);
    const { id } = parse(idParam, req.params);
    const record = ctx.games.byId(id);
    if (!record) throw new HttpError(404, 'not-found', 'Partida não encontrada');
    const game = Game.replay(record.variant, record.startFen, record.moves);
    return {
      summary: summarize(record, profile.id),
      startFen: record.startFen,
      whiteName: record.whiteName,
      blackName: record.blackName,
      moves: game.moves.map((m, ply) => ({
        ply,
        key: m.key,
        notation: m.notation,
        side: m.side === 1 ? 'white' : 'black',
        path: m.move.path,
        captures: m.move.captures,
        fenBefore: m.fenBefore,
      })),
      finalFen: game.position.fen(),
      // Revisões só depois do fim: durante a partida elas entregariam a análise ao adversário.
      reviews: record.status === 'finished' ? ctx.games.reviews(id) : [],
    };
  });

  app.get('/api/games/:id/pdn', async (req, reply) => {
    requireProfile(req, ctx.profiles);
    const { id } = parse(idParam, req.params);
    const record = ctx.games.byId(id);
    if (!record) throw new HttpError(404, 'not-found', 'Partida não encontrada');
    const game = Game.replay(record.variant, record.startFen, record.moves);
    if (record.status === 'finished' && record.endReason && !game.result) {
      game.finish({
        winner: record.winner === 'white' ? 1 : record.winner === 'black' ? -1 : null,
        reason: record.endReason,
      });
    }
    const pdn = game.pdn({
      Event: record.mode === 'ai' ? `Contra IA nível ${record.aiLevel}` : 'Partida na rede local',
      Date: record.createdAt.slice(0, 10).replaceAll('-', '.'),
      White: record.whiteName,
      Black: record.blackName,
    });
    return reply
      .header('content-type', 'application/x-pdn; charset=utf-8')
      .header('content-disposition', `attachment; filename="dama-${id}.pdn"`)
      .send(pdn);
  });
}
