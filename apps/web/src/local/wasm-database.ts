import { type Params, SqlDatabase } from '@dama/server/sql';
import type { Database as Sqlite } from '@sqlite.org/sqlite-wasm';

/**
 * SQLite WebAssembly com a mesma interface do `node:sqlite` do servidor: repositórios, migrações
 * e transações do servidor rodam sem mudança no app.
 *
 * Os parâmetros chegam sem prefixo (`{ id }`, como no node:sqlite) e são ligados como `:id`.
 */
/** `undefined` sem parâmetros: o SQLite WASM recusa ligar `{}` a um comando sem marcadores. */
function bindings(params: Params): Record<string, Params[string]> | undefined {
  const entries = Object.entries(params);
  if (entries.length === 0) return undefined;
  const out: Record<string, Params[string]> = {};
  for (const [key, value] of entries) out[`:${key}`] = value;
  return out;
}

export class WasmDatabase extends SqlDatabase {
  private readonly db: Sqlite;

  constructor(db: Sqlite) {
    super();
    this.db = db;
    // Sem WAL: o VFS de OPFS do app (opfs-sahpool) não tem memória compartilhada. Um processo só
    // escreve, então o journal padrão basta.
    this.exec('PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;');
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  get<T>(sql: string, params: Params = {}): T | undefined {
    return this.db.selectObject(sql, bindings(params)) as T | undefined;
  }

  all<T>(sql: string, params: Params = {}): T[] {
    return this.db.selectObjects(sql, bindings(params)) as T[];
  }

  run(sql: string, params: Params = {}): { changes: number } {
    const bind = bindings(params);
    if (bind) this.db.exec({ sql, bind });
    else this.db.exec(sql);
    return { changes: Number(this.db.changes()) };
  }

  close(): void {
    this.db.close();
  }
}
