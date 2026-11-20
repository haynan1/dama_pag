import { moveKey, Position } from '@dama/engine';
import type { GameView, RewardSummary, ServerMessage } from '@dama/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AiPool } from '../src/ai/pool.ts';
import { Database } from '../src/db/database.ts';
import { createEmbeddedServer, type EmbeddedServer } from '../src/embedded.ts';

/**
 * O servidor embutido do app Android com o banco e a IA do Node: as mesmas rotas e sessões do
 * servidor HTTP, sem rede. No app, só o SQLite (WebAssembly) e as threads (Web Workers) mudam.
 */

const silent = { info() {}, warn() {}, error() {} };
let db: Database;
let server: EmbeddedServer;

beforeAll(() => {
  db = new Database(':memory:');
  server = createEmbeddedServer({ db, ai: new AiPool(1), log: silent });
});
afterAll(async () => {
  await server.shutdown();
});

const call = (method: string, url: string, body?: unknown) => server.handle({ method, url, body });
const firstLegalKey = (g: GameView) => moveKey(Position.fromFen(g.variant, g.fen).legalMoves()[0]!);

function socket() {
  const messages: ServerMessage[] = [];
  const waiters: { test: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
  const conn = server.connect((m) => {
    // Como no WebSocket: o que chega é uma cópia serializada, nunca o objeto do servidor.
    const msg = structuredClone(m);
    messages.push(msg);
    for (const w of waiters.splice(0)) {
      if (w.test(msg)) w.resolve(msg);
      else waiters.push(w);
    }
  });
  const wait = <T = ServerMessage>(test: (m: ServerMessage) => boolean, fresh = false): Promise<T> => {
    const found = fresh ? undefined : [...messages].reverse().find(test);
    if (found) return Promise.resolve(found as T);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              `Tempo esgotado. Recebidas: ${messages.map((m) => (m.type === 'error' ? `error(${m.code})` : m.type === 'state' ? `state(${m.game.moves.length},${m.game.status})` : m.type)).join(' ')}`,
            ),
          ),
        20_000,
      );
      waiters.push({
        test,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as T);
        },
      });
    });
  };
  const state = (test: (g: GameView) => boolean, fresh = false) =>
    wait<{ type: 'state'; game: GameView }>((m) => m.type === 'state' && test(m.game), fresh).then(
      (m) => m.game,
    );
  return { send: (m: unknown) => conn.receive(m), wait, state, close: () => conn.close() };
}

describe('servidor embutido (app Android)', () => {
  it('sem perfil: 401 nas rotas privadas, meta pública sem endereços de rede', async () => {
    expect((await call('GET', '/api/me')).status).toBe(401);
    const meta = await call('GET', '/api/meta');
    expect(meta.status).toBe(200);
    expect(meta.body).toMatchObject({ version: '1.0.0', lanUrls: [] });
  });

  it('rota ou método inexistente é 404; entrada inválida é 400 com mensagem clara', async () => {
    expect((await call('GET', '/api/nada')).status).toBe(404);
    expect((await call('PUT', '/api/me')).status).toBe(404);
    const bad = await call('POST', '/api/profiles', { name: '' });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ error: { code: 'invalid-input' } });
  });

  it('cria o perfil do aparelho e a sessão persiste no banco, sem token em texto puro', async () => {
    const created = await call('POST', '/api/profiles', { name: 'Ana' });
    expect(created.status).toBe(201);
    const me = await call('GET', '/api/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ profile: { name: 'Ana' }, activeGames: [], studiesDue: 0 });

    // Sessão sobrevive a reabrir o servidor sobre o mesmo banco (app fechado e aberto de novo).
    const token = db.get<{ token: string }>('SELECT token FROM embedded_session')?.token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const hashes = db.all<{ token_hash: string }>('SELECT token_hash FROM profiles');
    expect(hashes.some((r) => r.token_hash === token)).toBe(false);

    const renamed = await call('PATCH', '/api/me', { name: 'Ana Clara' });
    expect(renamed.body).toMatchObject({ profile: { name: 'Ana Clara' } });
  });

  it('partida contra a IA com mentor: lance, resposta, revisão, dica, abandono, recompensas e PDN', async () => {
    const created = await call('POST', '/api/games', {
      mode: 'ai',
      variant: 'brazilian',
      level: 1,
      color: 'white',
      mentor: true,
      timeControl: null,
    });
    expect(created.status).toBe(201);
    const { id } = created.body as { id: string };

    const ws = socket();
    ws.send({ type: 'subscribe', gameId: id });
    let game = await ws.state((g) => g.id === id);
    expect(game).toMatchObject({ you: 'white', turn: 'white', status: 'active', mentor: true });

    ws.send({ type: 'move', gameId: id, ply: 0, key: firstLegalKey(game) });
    game = await ws.state((g) => g.moves.length === 2);
    expect(game.players.black.kind).toBe('ai');
    await ws.wait((m) => m.type === 'review');

    ws.send({ type: 'hint', gameId: id });
    const hint = await ws.wait<{ type: 'hint'; hint: { notation: string } }>((m) => m.type === 'hint');
    expect(hint.hint.notation).toMatch(/^[a-h]\d[-x]/);

    // Erros chegam como no WebSocket, sem derrubar a conexão.
    ws.send({ type: 'move', gameId: id, ply: 0, key: '0-31' });
    await ws.wait((m) => m.type === 'error' && m.code === 'stale');
    ws.send({ hello: 'lixo' });
    await ws.wait((m) => m.type === 'error' && m.code === 'invalid-message');

    ws.send({ type: 'resign', gameId: id });
    game = await ws.state((g) => g.status === 'finished');
    expect(game.result).toMatchObject({ winner: 'black', reason: 'resign' });
    const rewards = await ws.wait<{ type: 'rewards'; rewards: RewardSummary }>((m) => m.type === 'rewards');
    expect(rewards.rewards.achievements.map((a) => a.key)).toContain('first-game');
    ws.close();

    const history = await call('GET', '/api/games?limit=10');
    expect((history.body as { games: { id: string }[] }).games[0]).toMatchObject({ id, outcome: 'loss' });
    const detail = await call('GET', `/api/games/${id}`);
    expect((detail.body as { reviews: unknown[] }).reviews.length).toBeGreaterThan(0);
    const pdn = await call('GET', `/api/games/${id}/pdn`);
    expect(pdn.headers['content-type']).toContain('application/x-pdn');
    expect(pdn.body).toContain('[GameType "26"]');
    expect((await call('GET', '/api/games/xx')).status).toBe(400);
    expect((await call('GET', '/api/games/AAAAAAAAAAAAAAAA')).status).toBe(404);
  });

  it('estudos: cria, tenta com o motor, lista, apaga (204) e análise livre', async () => {
    const created = await call('POST', '/api/studies', {
      variant: 'brazilian',
      fen: 'W:W22,23:B18',
      title: 'Captura obrigatória',
    });
    expect(created.status).toBe(201);
    const study = (created.body as { study: { id: string; fen: string } }).study;
    const key = moveKey(Position.fromFen('brazilian', study.fen).legalMoves()[0]!);
    const attempt = await call('POST', `/api/studies/${study.id}/attempt`, { key });
    expect(attempt.body).toMatchObject({ correct: true, xpGained: 15 });
    expect((await call('GET', '/api/studies')).body).toMatchObject({ studies: [{ id: study.id }] });
    const removed = await call('DELETE', `/api/studies/${encodeURIComponent(study.id)}`);
    expect(removed).toMatchObject({ status: 204, body: null });

    const analysis = await call('POST', '/api/analysis', {
      variant: 'brazilian',
      fen: Position.initial('brazilian').fen(),
      kind: 'analyze',
    });
    expect(analysis.status).toBe(200);
    expect((analysis.body as { analysis: { lines: unknown[] } }).analysis.lines.length).toBe(5);

    const progress = await call('GET', '/api/me/progress');
    expect(progress.body).toMatchObject({ profile: { name: 'Ana Clara' } });
  });
});
