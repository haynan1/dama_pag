import { z } from 'zod';
import { profileNameError, ROOM_CODE_PATTERN } from './index.ts';

/**
 * Schemas de entrada (cliente → servidor). Tudo que chega da rede passa por aqui.
 * Módulo separado para o zod não entrar no bundle do navegador.
 */

export const variantSchema = z.enum(['brazilian', 'international', 'canadian']);
export const colorChoiceSchema = z.enum(['white', 'black', 'random']);
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{8,32}$/);
const moveKeySchema = z.string().regex(/^\d{1,3}(-\d{1,3}|x\d{1,3}:\d{1,3}(\.\d{1,3}){0,40})$/);
const fenSchema = z
  .string()
  .max(600)
  .regex(/^[WB]:[WBK0-9,:\-.\s]*$/i);

export const timeControlSchema = z
  .object({
    initialSec: z
      .number()
      .int()
      .min(60)
      .max(60 * 90),
    incrementSec: z.number().int().min(0).max(60),
  })
  .nullable();

export const profileNameSchema = z
  .string()
  .trim()
  .superRefine((name, ctx) => {
    const error = profileNameError(name);
    if (error) ctx.addIssue({ code: 'custom', message: error });
  });

export const createProfileSchema = z.object({ name: profileNameSchema });
export const updateProfileSchema = z.object({ name: profileNameSchema });

export const createGameSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('ai'),
    variant: variantSchema,
    level: z.number().int().min(1).max(10),
    color: colorChoiceSchema,
    mentor: z.boolean(),
    timeControl: timeControlSchema,
    startFen: fenSchema.optional(),
  }),
  z.object({
    mode: z.literal('lan'),
    variant: variantSchema,
    color: colorChoiceSchema,
    timeControl: timeControlSchema,
  }),
]);
export type CreateGameInput = z.infer<typeof createGameSchema>;

export const roomCodeSchema = z.string().trim().toUpperCase().regex(ROOM_CODE_PATTERN, 'Código inválido');

export const analysisRequestSchema = z.object({
  variant: variantSchema,
  fen: fenSchema,
  kind: z.enum(['analyze', 'lookahead']),
});
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;

export const createStudySchema = z.object({
  variant: variantSchema,
  fen: fenSchema,
  title: z.string().trim().min(1).max(80),
  notes: z.string().trim().max(2000).default(''),
  gameId: idSchema.optional(),
  ply: z.number().int().min(0).max(2000).optional(),
});
export const updateStudySchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export const studyAttemptSchema = z.object({ key: moveKeySchema });

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), gameId: idSchema }),
  z.object({ type: z.literal('unsubscribe'), gameId: idSchema }),
  z.object({ type: z.literal('move'), gameId: idSchema, ply: z.number().int().min(0), key: moveKeySchema }),
  z.object({ type: z.literal('undo'), gameId: idSchema }),
  z.object({ type: z.literal('resign'), gameId: idSchema }),
  z.object({ type: z.literal('draw'), gameId: idSchema, action: z.enum(['offer', 'accept', 'decline']) }),
  z.object({ type: z.literal('pause'), gameId: idSchema, paused: z.boolean() }),
  z.object({ type: z.literal('mentor'), gameId: idSchema, enabled: z.boolean() }),
  z.object({ type: z.literal('hint'), gameId: idSchema }),
  z.object({ type: z.literal('lookahead'), gameId: idSchema }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
