import { AiBusyError } from '../ai/runner.ts';
import { SessionError } from '../games/session.ts';
import { HttpError } from './security.ts';

export interface ErrorResponse {
  readonly status: number;
  readonly body: { readonly error: { readonly code: string; readonly message: string } };
  readonly headers?: Readonly<Record<string, string>>;
}

const body = (code: string, message: string) => ({ error: { code, message } });

/**
 * Erro → resposta HTTP. Uma tabela só, usada pelo servidor (Fastify) e pelo servidor embutido no
 * app: os dois respondem igual. `null` = erro inesperado (500, e vai para o log).
 */
export function errorResponse(err: unknown): ErrorResponse | null {
  if (err instanceof HttpError) return { status: err.status, body: body(err.code, err.message) };
  if (err instanceof AiBusyError) {
    return { status: 503, body: body('ai-busy', err.message), headers: { 'retry-after': '5' } };
  }
  if (err instanceof SessionError) {
    const status =
      err.code === 'not-found'
        ? 404
        : err.code === 'forbidden'
          ? 403
          : err.code === 'invalid-position'
            ? 400
            : 409;
    return { status, body: body(err.code, err.message) };
  }
  const status = (err as { statusCode?: number } | null)?.statusCode;
  if (status === 429) {
    return { status: 429, body: body('rate-limited', 'Muitas requisições. Aguarde um pouco.') };
  }
  if (status && status >= 400 && status < 500) {
    return { status, body: body('bad-request', 'Requisição inválida') };
  }
  return null;
}

export const INTERNAL_ERROR: ErrorResponse = { status: 500, body: body('internal', 'Erro interno') };
