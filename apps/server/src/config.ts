import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5810),
  DATA_DIR: z.string().default('./data'),
  AI_WORKERS: z.coerce.number().int().min(0).max(64).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  EXTRA_ORIGINS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url())),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
});

export interface Config {
  readonly host: string;
  readonly port: number;
  readonly dataDir: string;
  readonly aiWorkers: number;
  readonly logLevel: string;
  readonly extraOrigins: readonly string[];
  readonly production: boolean;
  readonly webDist: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração inválida: ${issues}`);
  }
  const e = parsed.data;
  return {
    host: e.HOST,
    port: e.PORT,
    dataDir: resolve(e.DATA_DIR),
    // Deixa um núcleo livre para o servidor e o sistema; mais que 8 não melhora a latência.
    aiWorkers: e.AI_WORKERS > 0 ? e.AI_WORKERS : Math.max(1, Math.min(8, availableParallelism() - 1)),
    logLevel: e.LOG_LEVEL,
    extraOrigins: e.EXTRA_ORIGINS,
    production: e.NODE_ENV === 'production',
    webDist: resolve(import.meta.dirname, '../../web/dist'),
  };
}
