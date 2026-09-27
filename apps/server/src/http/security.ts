import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { ProfileRepo, ProfileRow } from '../db/profiles.ts';

export const SESSION_COOKIE = 'dama_session';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new HttpError(400, 'invalid-input', first ? first.message : 'Dados inválidos');
  }
  return result.data;
}

/**
 * Origem permitida: a mesma do servidor (Host) ou uma das origens extras configuradas.
 * Protege WebSocket e requisições que alteram estado contra sites de terceiros (CSRF / CSWSH).
 */
export function originAllowed(req: FastifyRequest, extra: readonly string[]): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch (err) {
    if (err instanceof TypeError) return false;
    throw err;
  }
  if (extra.includes(parsed.origin)) return true;
  const host = req.headers.host;
  return (
    Boolean(host) && parsed.host === host && (parsed.protocol === 'http:' || parsed.protocol === 'https:')
  );
}

export function sessionToken(req: FastifyRequest): string | null {
  const token = req.cookies[SESSION_COOKIE];
  return token && TOKEN_PATTERN.test(token) ? token : null;
}

export function currentProfile(req: FastifyRequest, profiles: ProfileRepo): ProfileRow | null {
  const token = sessionToken(req);
  return token ? (profiles.byToken(token) ?? null) : null;
}

export function requireProfile(req: FastifyRequest, profiles: ProfileRepo): ProfileRow {
  const profile = currentProfile(req, profiles);
  if (!profile) throw new HttpError(401, 'unauthenticated', 'Crie seu perfil para continuar');
  return profile;
}

export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    // Perfil local: persiste por 5 anos neste navegador.
    maxAge: 60 * 60 * 24 * 365 * 5,
  });
}
