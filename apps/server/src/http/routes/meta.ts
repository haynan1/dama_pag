import { AI_LEVELS, Position, VARIANT_IDS, VARIANTS } from '@dama/engine';
import type { MetaView } from '@dama/protocol';
import { analysisRequestSchema } from '@dama/protocol/schemas';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context.ts';
import { HttpError, parse, requireProfile } from '../security.ts';

export function metaRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/health', async (req, reply) => {
    const db = ctx.db.healthy();
    if (!db) req.log.error({ reason: ctx.db.lastHealthError }, 'banco indisponível');
    const ai = ctx.ai.stats();
    const ok = db && ai.workers > 0;
    return reply.code(ok ? 200 : 503).send({
      status: ok ? 'ok' : 'degraded',
      checks: { database: db ? 'ok' : 'down', ai: ai.workers > 0 ? 'ok' : 'down' },
      ai,
      games: ctx.manager.stats(),
      uptimeSec: Math.round(performance.now() / 1000),
    });
  });

  app.get('/api/meta', async (): Promise<MetaView> => {
    return {
      version: '1.0.0',
      lanUrls: ctx.lanUrls(),
      variants: VARIANT_IDS.map((id) => ({
        id,
        name: VARIANTS[id].name,
        short: VARIANTS[id].short,
        size: VARIANTS[id].size,
      })),
      aiLevels: AI_LEVELS.map((l) => ({ level: l.level, name: l.name, rating: l.rating })),
    };
  });

  app.post('/api/analysis', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    requireProfile(req, ctx.profiles);
    const input = parse(analysisRequestSchema, req.body);
    let pos: Position;
    try {
      pos = Position.fromFen(input.variant, input.fen);
    } catch (err) {
      if (err instanceof SyntaxError) throw new HttpError(400, 'invalid-fen', err.message);
      throw err;
    }
    if (pos.legalMoves().length === 0) return { analysis: null, tree: null };
    const big = pos.geo.size > 8;
    if (input.kind === 'lookahead') {
      const tree = await ctx.ai.run({
        kind: 'lookahead-fen',
        variant: input.variant,
        fen: pos.fen(),
        depth: big ? 8 : 12,
        timeMs: big ? 4000 : 3000,
      });
      return { tree };
    }
    const analysis = await ctx.ai.run({
      kind: 'analyze',
      variant: input.variant,
      fen: pos.fen(),
      multiPv: 5,
      depth: big ? 12 : 18,
      timeMs: 2000,
    });
    return { analysis };
  });
}
