import type { AiRunner } from './ai/pool.ts';
import type { Config } from './config.ts';
import type { Database } from './db/database.ts';
import type { GameRepo } from './db/games.ts';
import type { ProfileRepo } from './db/profiles.ts';
import type { StudyRepo } from './db/studies.ts';
import type { GameManager } from './games/manager.ts';
import type { ProgressService } from './progress/service.ts';

/** Dependências compartilhadas pelas rotas. Montado uma vez no boot. */
export interface AppContext {
  readonly config: Config;
  readonly db: Database;
  readonly ai: AiRunner;
  readonly profiles: ProfileRepo;
  readonly games: GameRepo;
  readonly studies: StudyRepo;
  readonly progress: ProgressService;
  readonly manager: GameManager;
}
