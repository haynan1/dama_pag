import { AiPool } from './ai/pool.ts';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { Database } from './db/database.ts';
import { GameRepo } from './db/games.ts';
import { ProfileRepo } from './db/profiles.ts';
import { StudyRepo } from './db/studies.ts';
import { GameManager } from './games/manager.ts';
import { lanUrls } from './http/routes/meta.ts';
import { createLogger } from './logger.ts';
import { ProgressService } from './progress/service.ts';

const config = loadConfig();
const log = createLogger(config);
const db = Database.open(config.dataDir);
const applied = db.migrate();
const ai = new AiPool(config.aiWorkers);
const profiles = new ProfileRepo(db);
const games = new GameRepo(db);
const studies = new StudyRepo(db);
const progress = new ProgressService(db, profiles, studies);
const manager = new GameManager({ ai, games, progress, log });

const app = await buildApp({ config, db, ai, profiles, games, studies, progress, manager }, log);
await app.listen({ host: config.host, port: config.port });

log.info({ migrations: applied, aiWorkers: config.aiWorkers, data: config.dataDir }, 'servidor pronto');
log.info(`Neste PC:        http://localhost:${config.port}`);
if (config.host !== '127.0.0.1') for (const url of lanUrls(config.port)) log.info(`Na rede local:   ${url}`);

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  log.info({ signal }, 'encerrando');
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  try {
    await app.close();
    manager.shutdown();
    await ai.close();
    db.close();
  } finally {
    process.exit(0);
  }
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
