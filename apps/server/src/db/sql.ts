import { MIGRATIONS } from './migrations.ts';

export type SqlValue = null | number | bigint | string | Uint8Array;
export type Params = Record<string, SqlValue>;

/**
 * Acesso ao SQLite independente de onde ele roda: `node:sqlite` no servidor (database.ts) e
 * SQLite WebAssembly no servidor embutido do app Android (apps/web/src/local). Repositórios,
 * migrações e transações dependem só disto — a mesma lógica nos dois lados.
 *
 * Parâmetros nomeados no formato `:nome`, passados sem o prefixo (`{ nome }`).
 */
export abstract class SqlDatabase {
  lastHealthError: string | null = null;

  abstract exec(sql: string): void;
  abstract get<T>(sql: string, params?: Params): T | undefined;
  abstract all<T>(sql: string, params?: Params): T[];
  abstract run(sql: string, params?: Params): { changes: number | bigint };
  abstract close(): void;

  migrate(): number {
    this.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL
    ) STRICT`);
    const applied = new Set(
      this.all<{ version: number }>('SELECT version FROM schema_migrations').map((r) => r.version),
    );
    let count = 0;
    for (const m of MIGRATIONS) {
      if (applied.has(m.version)) continue;
      this.transaction(() => {
        this.exec(m.sql);
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

  transaction<T>(fn: () => T): T {
    this.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.exec('COMMIT');
      return result;
    } catch (err) {
      this.exec('ROLLBACK');
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
}
