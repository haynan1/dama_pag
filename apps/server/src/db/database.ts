import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { MIGRATIONS } from './migrations.ts';

export type Row = Record<string, SQLInputValue>;
export type Params = Record<string, SQLInputValue>;

/**
 * SQLite embutido do Node (sem addon nativo). Uma conexão síncrona por processo: as consultas
 * são de microssegundos e o trabalho pesado (IA) roda em threads separadas.
 */
export class Database {
  readonly db: DatabaseSync;
  lastHealthError: string | null = null;

  constructor(path: string) {
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

  migrate(): number {
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL
    ) STRICT`);
    const applied = new Set(
      this.all<{ version: number }>('SELECT version FROM schema_migrations').map((r) => r.version),
    );
    let count = 0;
    for (const m of MIGRATIONS) {
      if (applied.has(m.version)) continue;
      this.transaction(() => {
        this.db.exec(m.sql);
        this.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (:v, :n, :t)', {
          v: m.version,
          n: m.name,
          t: new Date().toISOString(),
        });
      });
      count++;
    }
    return count;
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

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  healthy(): boolean {
    try {
      return this.get<{ ok: number }>('SELECT 1 AS ok')?.ok === 1;
    } catch (err) {
      // Sonda de saúde: qualquer falha do SQLite significa "indisponível"; o motivo vai no log.
      this.lastHealthError = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  close(): void {
    this.db.close();
  }
}
