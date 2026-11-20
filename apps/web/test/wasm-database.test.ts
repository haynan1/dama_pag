// @vitest-environment node
import type { AiRunner } from '@dama/server/ai/runner';
import { createEmbeddedServer } from '@dama/server/embedded';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { describe, expect, it } from 'vitest';
import { WasmDatabase } from '../src/local/wasm-database.ts';

/**
 * O SQLite WebAssembly do app (o mesmo pacote; aqui sem OPFS, em memória) com as migrações,
 * repositórios e rotas do servidor. O fluxo completo com IA está em
 * apps/server/test/embedded.test.ts; aqui o foco é o adaptador de banco.
 */

const noAi: AiRunner = {
  run: () => Promise.reject(new Error('sem IA neste teste')),
  stats: () => ({ workers: 0, busy: 0, queued: 0 }),
  close: async () => {},
};
const silent = { info() {}, warn() {}, error() {} };

async function memoryDb(): Promise<WasmDatabase> {
  const sqlite3 = await sqlite3InitModule();
  return new WasmDatabase(new sqlite3.oo1.DB(':memory:', 'c'));
}

describe('WasmDatabase', () => {
  it('migra, liga parâmetros nomeados e conta alterações', async () => {
    const db = await memoryDb();
    expect(db.migrate()).toBeGreaterThan(0);
    expect(db.migrate()).toBe(0);
    expect(db.healthy()).toBe(true);
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL) STRICT');
    expect(db.run('INSERT INTO t (name) VALUES (:name)', { name: 'a' }).changes).toBe(1);
    db.run('INSERT INTO t (name) VALUES (:name)', { name: 'b' });
    expect(db.get<{ name: string }>('SELECT name FROM t WHERE id = :id', { id: 2 })).toEqual({ name: 'b' });
    expect(db.get('SELECT name FROM t WHERE id = :id', { id: 99 })).toBeUndefined();
    expect(db.all<{ n: number }>('SELECT COUNT(*) AS n FROM t')).toEqual([{ n: 2 }]);
    expect(db.run('UPDATE t SET name = :name', { name: 'c' }).changes).toBe(2);
    expect(db.run('DELETE FROM t').changes).toBe(2);
  });

  it('transação desfaz tudo quando falha; chave estrangeira é aplicada', async () => {
    const db = await memoryDb();
    db.exec('CREATE TABLE p (id INTEGER PRIMARY KEY) STRICT');
    db.exec('CREATE TABLE c (pid INTEGER NOT NULL REFERENCES p (id)) STRICT');
    expect(() =>
      db.transaction(() => {
        db.run('INSERT INTO p (id) VALUES (:id)', { id: 1 });
        db.run('INSERT INTO c (pid) VALUES (:pid)', { pid: 2 });
      }),
    ).toThrow();
    expect(db.all('SELECT * FROM p')).toEqual([]);
  });

  it('serve as rotas do servidor: perfil, sessão, estudos e histórico', async () => {
    const server = createEmbeddedServer({ db: await memoryDb(), ai: noAi, log: silent });
    expect((await server.handle({ method: 'GET', url: '/api/me' })).status).toBe(401);
    expect(
      (await server.handle({ method: 'POST', url: '/api/profiles', body: { name: 'Bia' } })).status,
    ).toBe(201);
    const me = await server.handle({ method: 'GET', url: '/api/me' });
    expect(me.body).toMatchObject({ profile: { name: 'Bia' }, activeGames: [] });
    const study = await server.handle({
      method: 'POST',
      url: '/api/studies',
      body: { variant: 'brazilian', fen: 'W:W22,23:B18', title: 'Captura' },
    });
    expect(study.status).toBe(201);
    expect((await server.handle({ method: 'GET', url: '/api/studies' })).body).toMatchObject({
      studies: [{ title: 'Captura' }],
    });
    expect((await server.handle({ method: 'GET', url: '/api/games' })).body).toEqual({ games: [] });
    await server.shutdown();
  });
});
