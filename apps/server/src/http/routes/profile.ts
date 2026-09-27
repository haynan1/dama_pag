import { createProfileSchema, updateProfileSchema } from '@dama/protocol/schemas';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context.ts';
import { currentProfile, parse, requireProfile, setSessionCookie } from '../security.ts';

export function profileRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/me', async (req, reply) => {
    const profile = currentProfile(req, ctx.profiles);
    if (!profile) return reply.code(401).send({ error: { code: 'unauthenticated', message: 'Sem perfil' } });
    ctx.profiles.touch(profile.id);
    return {
      profile: ctx.profiles.toView(profile),
      activeGames: ctx.games.activeForProfile(profile.id),
      studiesDue: ctx.studies.countDue(profile.id),
    };
  });

  app.post(
    '/api/profiles',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const { name } = parse(createProfileSchema, req.body);
      const { profile, token } = ctx.profiles.create(name);
      setSessionCookie(reply, token, req.protocol === 'https');
      return reply.code(201).send({ profile: ctx.profiles.toView(profile) });
    },
  );

  app.patch('/api/me', async (req) => {
    const profile = requireProfile(req, ctx.profiles);
    const { name } = parse(updateProfileSchema, req.body);
    ctx.profiles.rename(profile.id, name);
    return { profile: ctx.profiles.toView(ctx.profiles.byId(profile.id)!) };
  });

  app.get('/api/me/progress', async (req) => {
    const profile = requireProfile(req, ctx.profiles);
    return {
      profile: ctx.profiles.toView(profile),
      achievements: ctx.profiles.achievements(profile.id),
      ratingHistory: ctx.profiles.ratingHistory(profile.id),
    };
  });
}
