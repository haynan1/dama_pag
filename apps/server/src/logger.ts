import { type Logger, pino } from 'pino';
import type { Config } from './config.ts';

export function createLogger(config: Pick<Config, 'logLevel' | 'production'>): Logger {
  if (config.production) return pino({ level: config.logLevel });
  return pino({
    level: config.logLevel,
    transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
  });
}
