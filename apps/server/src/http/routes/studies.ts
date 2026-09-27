import { moveKey, moveNotation, Position } from '@dama/engine';
import { createStudySchema, studyAttemptSchema, updateStudySchema } from '@dama/protocol/schemas';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context.ts';
import { toStudyView } from '../../db/studies.ts';
import { srsNext } from '../../progress/rewards.ts';
import { HttpError, parse, requireProfile } from '../security.ts';

const idParam = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{8,32}$/) });

export function studyRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/studies', async (req) => {
    const profile = requireProfile(req, ctx.profiles);
    return { studies: ctx.studies.list(profile.id).map(toStudyView), due: ctx.studies.countDue(profile.id) };
  });

  app.get('/api/studies/due', async (req) => {
    const profile = requireProfile(req, ctx.profiles);
    return { studies: ctx.studies.due(profile.id).map(toStudyView) };
  });

  app.post('/api/studies', async (req, reply) => {
    const profile = requireProfile(req, ctx.profiles);
    const input = parse(createStudySchema, req.body);
    let fen: string;
    try {
      const pos = Position.fromFen(input.variant, input.fen);
      if (pos.legalMoves().length === 0)
        throw new HttpError(400, 'no-moves', 'Posição sem lances para estudar');
      fen = pos.fen();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, 'invalid-fen', 'Posição inválida');
    }
    if (input.gameId && !ctx.games.byId(input.gameId))
      throw new HttpError(400, 'not-found', 'Partida não encontrada');
    const study = ctx.studies.create({
      profileId: profile.id,
      variant: input.variant,
      fen,
      title: input.title,
      notes: input.notes,
      source: 'manual',
      gameId: input.gameId ?? null,
      ply: input.ply ?? null,
      playedNotation: null,
      bestNotation: null,
      bestLine: [],
      headline: null,
      classification: null,
    });
    if (!study) throw new HttpError(409, 'duplicate', 'Esta posição já está nos seus estudos');
    return reply.code(201).send({ study: toStudyView(study) });
  });

  app.patch('/api/studies/:id', async (req) => {
    const profile = requireProfile(req, ctx.profiles);
    const { id } = parse(idParam, req.params);
    const input = parse(updateStudySchema, req.body);
    if (!ctx.studies.byId(profile.id, id)) throw new HttpError(404, 'not-found', 'Estudo não encontrado');
    ctx.studies.update(profile.id, id, input);
    return { study: toStudyView(ctx.studies.byId(profile.id, id)!) };
  });

  app.delete('/api/studies/:id', async (req, reply) => {
    const profile = requireProfile(req, ctx.profiles);
    const { id } = parse(idParam, req.params);
    if (!ctx.studies.delete(profile.id, id)) throw new HttpError(404, 'not-found', 'Estudo não encontrado');
    return reply.code(204).send();
  });

  app.post(
    '/api/studies/:id/attempt',
    { config: { rateLimit: { max: 40, timeWindow: '1 minute' } } },
    async (req) => {
      const profile = requireProfile(req, ctx.profiles);
      const { id } = parse(idParam, req.params);
      const { key } = parse(studyAttemptSchema, req.body);
      const study = ctx.studies.byId(profile.id, id);
      if (!study) throw new HttpError(404, 'not-found', 'Estudo não encontrado');
      const pos = Position.fromFen(study.variant, study.fen);
      const move = pos.legalMoves().find((m) => moveKey(m) === key);
      if (!move) throw new HttpError(400, 'illegal-move', 'Lance ilegal nesta posição');

      const big = pos.geo.size > 8;
      const check = await ctx.ai.run({
        kind: 'study-check',
        variant: study.variant,
        fen: study.fen,
        key,
        depth: big ? 10 : 14,
        timeMs: 1500,
      });
      const firstTry = study.reps === 0 && study.lapses === 0;
      const next = srsNext(study, check.correct, new Date());
      ctx.studies.schedule(study.id, { ...next, result: check.correct ? 'correct' : 'incorrect' });
      const reward = ctx.progress.studyAttempt(profile.id, check.correct, firstTry);
      return {
        correct: check.correct,
        playedNotation: moveNotation(pos.geo, move),
        bestNotation: check.review.best.notation,
        bestLine: check.review.best.pv,
        insight: check.review.best.insight,
        xpGained: reward.xp,
        achievements: reward.achievements,
        nextDueAt: next.dueAt.toISOString(),
        study: toStudyView(ctx.studies.byId(profile.id, id)!),
      };
    },
  );
}
