import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { type Params, SqlDatabase } from './sql.ts';

/**
 * SQLite embutido do Node (sem addon nativo). Uma conexão síncrona por processo: as consultas
 * são de microssegundos e o trabalho pesado (IA) roda em threads separadas.
 */
export class Database extends SqlDatabase {
  readonly db: DatabaseSync;

  constructor(path: string) {
    super();
    if (path !== ':memory:') mkdirSync(join(path, '..'), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
    `);
  }

  static open(dataDir: string): Database {
    return new Database(join(dataDir, 'dama.db'));
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  get<T>(sql: string, params: Params = {}): T | undefined {
    return this.db.prepare(sql).get(params) as T | undefined;
  }

  all<T>(sql: string, params: Params = {}): T[] {
    return this.db.prepare(sql).all(params) as T[];
  }

  run(sql: string, params: Params = {}): { changes: number | bigint } {
    return this.db.prepare(sql).run(params);
  }

  close(): void {
    this.db.close();
  }
}
