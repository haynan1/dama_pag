import { moveKey, Position } from '@dama/engine';
import type { GameView, RewardSummary } from '@dama/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, TestClient, type TestServer } from './harness.ts';

let server: TestServer;

beforeAll(async () => {
  server = await startServer();
});
afterAll(async () => {
  await server.close();
});

const firstLegalKey = (g: GameView) => moveKey(Position.fromFen(g.variant, g.fen).legalMoves()[0]!);

describe('saúde e segurança HTTP', () => {
  it('health verifica banco e threads da IA', async () => {
    const res = await new TestClient(server).request('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', checks: { database: 'ok', ai: 'ok' } });
  });

  it('envia cabeçalhos de segurança e CSP restritiva', async () => {
    const res = await new TestClient(server).request('GET', '/api/meta');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('bloqueia requisição que altera estado vinda de outra origem (CSRF)', async () => {
    const client = new TestClient(server);
    const res = await client.request(
      'POST',
      '/api/profiles',
      { name: 'Intruso' },
      { origin: 'http://evil.example' },
    );
    expect(res.status).toBe(403);
    const noOrigin = await client.request('POST', '/api/profiles', { name: 'Intruso' }, { origin: '' });
    expect(noOrigin.status).toBe(403);
  });

  it('exige perfil nas rotas privadas', async () => {
    const res = await new TestClient(server).request('GET', '/api/games');
    expect(res.status).toBe(401);
  });

  it('rejeita cookie forjado', async () => {
    const client = new TestClient(server);
    client.cookie = `dama_session=${'A'.repeat(43)}`;
    expect((await client.request('GET', '/api/me')).status).toBe(401);
  });

  it('limita criação de perfis por dispositivo', async () => {
    const client = new TestClient(server);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++)
      statuses.push((await client.request('POST', '/api/profiles', { name: `Spam ${i}` })).status);
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('valida entrada com mensagens claras', async () => {
    const client = new TestClient(server);
    const res = await client.request('POST', '/api/profiles', { name: '<script>' });
    expect(res.status).toBe(400);
    expect(res.json().error.code).toBe('invalid-input');
  });
});

describe('perfil', () => {
  it('cria perfil com cookie HttpOnly SameSite=Strict e lê /api/me', async () => {
    const client = new TestClient(server);
    const res = await client.request('POST', '/api/profiles', { name: 'Ana Souza' });
    expect(res.status).toBe(201);
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    const me = await client.request('GET', '/api/me');
    expect(me.json().profile).toMatchObject({ name: 'Ana Souza', xp: 0, rating: 1000, level: { level: 1 } });
  });

  it('não guarda o token em texto puro', async () => {
    const client = new TestClient(server);
    await client.signUp('Token Test');
    const token = client.cookie.split('=')[1]!;
    const rows = server.db.all<{ token_hash: string }>('SELECT token_hash FROM profiles');
    expect(rows.some((r) => r.token_hash === token)).toBe(false);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.token_hash))).toBe(true);
  });
});

describe('partida contra a IA', () => {
  it('joga, recebe resposta da IA, desfaz e abandona com recompensas', async () => {
    const client = new TestClient(server);
    await client.signUp('Jogador');
    const created = await client.request('POST', '/api/games', {
      mode: 'ai',
      variant: 'brazilian',
      level: 1,
      color: 'white',
      mentor: true,
      timeControl: null,
    });
    expect(created.status).toBe(201);
    const { id } = created.json();

    const ws = await client.connect();
    ws.send({ type: 'subscribe', gameId: id });
    let game = await ws.waitState((g) => g.id === id);
    expect(game).toMatchObject({
      you: 'white',
      turn: 'white',
      status: 'active',
      mentor: true,
      mentorAllowed: true,
    });

    // Lance, resposta da IA.
    ws.send({ type: 'move', gameId: id, ply: 0, key: firstLegalKey(game) });
    game = await ws.waitState((g) => g.moves.length === 2);
    expect(game.turn).toBe('white');
    expect(game.players.black.kind).toBe('ai');

    // Revisão do mentor em tempo real.
    const review = await ws.wait<{ type: 'review'; review: { ply: number; classification: string } }>(
      (m) => m.type === 'review',
    );
    expect(review.review.ply).toBe(0);
    expect(review.review.classification).toBeTruthy();

    // Dica do mentor.
    ws.send({ type: 'hint', gameId: id });
    const hint = await ws.wait<{ type: 'hint'; hint: { notation: string } }>((m) => m.type === 'hint');
    expect(hint.hint.notation).toMatch(/^[a-h]\d[-x]/);

    // Desfazer volta para antes do seu lance e marca a partida como assistida.
    ws.send({ type: 'undo', gameId: id });
    game = await ws.waitState((g) => g.moves.length === 0, undefined, false);
    expect(game.assisted).toBe(true);

    // Lance com ply desatualizado é rejeitado.
    ws.send({ type: 'move', gameId: id, ply: 5, key: firstLegalKey(game) });
    const stale = await ws.wait<{ type: 'error'; code: string }>((m) => m.type === 'error');
    expect(stale.code).toBe('stale');

    // Lance ilegal é rejeitado.
    ws.send({ type: 'move', gameId: id, ply: 0, key: '0-31' });
    await ws.wait((m) => m.type === 'error' && m.code === 'illegal-move', 5000, false);

    // Joga alguns lances e abandona.
    for (let i = 0; i < 4; i++) {
      const ply = game.moves.length;
      ws.send({ type: 'move', gameId: id, ply, key: firstLegalKey(game) });
      game = await ws.waitState(
        (g) => g.moves.length === ply + 2 || g.status === 'finished',
        undefined,
        false,
      );
      if (game.status === 'finished') break;
    }
    ws.send({ type: 'resign', gameId: id });
    game = await ws.waitState((g) => g.status === 'finished');
    expect(game.result).toMatchObject({ winner: 'black', reason: 'resign' });
    const rewards = await ws.wait<{ type: 'rewards'; rewards: RewardSummary }>((m) => m.type === 'rewards');
    expect(rewards.rewards.achievements.map((a) => a.key)).toContain('first-game');
    // Partida assistida não altera o rating.
    expect(rewards.rewards.ratingAfter).toBe(rewards.rewards.ratingBefore);

    const history = await client.request('GET', '/api/games');
    expect(history.json().games[0]).toMatchObject({ id, outcome: 'loss', assisted: true });
    const detail = await client.request('GET', `/api/games/${id}`);
    expect(detail.json().reviews.length).toBeGreaterThan(0);
    const pdn = await client.request('GET', `/api/games/${id}/pdn`);
    expect(pdn.body).toContain('[GameType "26"]');
    expect(pdn.body).toContain('0-2');
    ws.close();
  });

  it('espectador não pode jogar e WebSocket de outra origem é recusado', async () => {
    const owner = new TestClient(server);
    await owner.signUp('Dono');
    const { id } = (
      await owner.request('POST', '/api/games', {
        mode: 'ai',
        variant: 'international',
        level: 2,
        color: 'white',
        mentor: false,
        timeControl: null,
      })
    ).json();
    const viewer = new TestClient(server);
    await viewer.signUp('Visitante');
    const ws = await viewer.connect();
    ws.send({ type: 'subscribe', gameId: id });
    const game = await ws.waitState((g) => g.id === id);
    expect(game.you).toBeNull();
    ws.send({ type: 'move', gameId: id, ply: 0, key: firstLegalKey(game) });
    const err = await ws.wait<{ type: 'error'; code: string }>((m) => m.type === 'error');
    expect(err.code).toBe('forbidden');
    ws.send({ type: 'hack', gameId: id });
    await ws.wait((m) => m.type === 'error' && m.code === 'invalid-message', 5000, false);
    ws.close();

    await expect(viewer.connect('http://evil.example')).rejects.toThrow('HTTP 403');
  });
});

describe('partida na rede local', () => {
  it('cria sala, adversário entra pelo código, relógio corre e empate por acordo', async () => {
    const host = new TestClient(server);
    await host.signUp('Anfitrião');
    const guest = new TestClient(server);
    await guest.signUp('Convidado');

    const created = (
      await host.request('POST', '/api/games', {
        mode: 'lan',
        variant: 'brazilian',
        color: 'white',
        timeControl: { initialSec: 300, incrementSec: 3 },
      })
    ).json();
    expect(created.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    const hostWs = await host.connect();
    hostWs.send({ type: 'subscribe', gameId: created.id });
    await hostWs.waitState((g) => g.status === 'waiting' && g.roomCode === created.roomCode);

    const join = await guest.request('POST', `/api/rooms/${created.roomCode.toLowerCase()}/join`);
    expect(join.status).toBe(200);
    expect(join.json().id).toBe(created.id);
    // Código não pode ser reutilizado.
    const third = new TestClient(server);
    await third.signUp('Terceiro');
    expect((await third.request('POST', `/api/rooms/${created.roomCode}/join`)).status).toBe(404);

    let game = await hostWs.waitState((g) => g.status === 'active');
    expect(game.clock).toMatchObject({ running: 'white', whiteMs: expect.any(Number) });
    expect(game.mentorAllowed).toBe(false);

    const guestWs = await guest.connect();
    guestWs.send({ type: 'subscribe', gameId: created.id });
    await guestWs.waitState((g) => g.you === 'black');

    hostWs.send({ type: 'move', gameId: created.id, ply: 0, key: firstLegalKey(game) });
    game = await guestWs.waitState((g) => g.moves.length === 1);
    expect(game.clock?.running).toBe('black');
    // Incremento aplicado: brancas têm até 5min + 3s.
    expect(game.clock!.whiteMs).toBeGreaterThan(300_000);

    // Mentor é bloqueado na rede.
    guestWs.send({ type: 'hint', gameId: created.id });
    expect((await guestWs.wait<{ type: 'error'; code: string }>((m) => m.type === 'error')).code).toBe(
      'forbidden',
    );

    guestWs.send({ type: 'draw', gameId: created.id, action: 'offer' });
    await hostWs.waitState((g) => g.drawOffer === 'black');
    hostWs.send({ type: 'draw', gameId: created.id, action: 'accept' });
    game = await guestWs.waitState((g) => g.status === 'finished');
    expect(game.result).toEqual({ winner: null, reason: 'agreement' });
    hostWs.close();
    guestWs.close();
  });
});

describe('casos de estudo', () => {
  it('cria estudo manual, verifica tentativa com o motor e agenda revisão', async () => {
    const client = new TestClient(server);
    await client.signUp('Estudante');
    // Brancas capturam c3xe5: única resposta correta.
    const fen = 'W:W22,23:B18';
    const created = await client.request('POST', '/api/studies', {
      variant: 'brazilian',
      fen,
      title: 'Captura obrigatória',
    });
    expect(created.status).toBe(201);
    const study = created.json().study;
    const dup = await client.request('POST', '/api/studies', { variant: 'brazilian', fen, title: 'x' });
    expect([201, 409]).toContain(dup.status);

    const pos = Position.fromFen('brazilian', study.fen);
    const key = moveKey(pos.legalMoves()[0]!);
    const attempt = await client.request('POST', `/api/studies/${study.id}/attempt`, { key });
    expect(attempt.status).toBe(200);
    expect(attempt.json()).toMatchObject({ correct: true, xpGained: 15 });
    expect(new Date(attempt.json().nextDueAt).getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);

    const other = new TestClient(server);
    await other.signUp('Outro');
    // Estudos são privados.
    expect((await other.request('POST', `/api/studies/${study.id}/attempt`, { key })).status).toBe(404);
    expect((await client.request('DELETE', `/api/studies/${study.id}`)).status).toBe(204);
  });

  it('análise livre devolve linhas explicadas', async () => {
    const client = new TestClient(server);
    await client.signUp('Analista');
    const res = await client.request('POST', '/api/analysis', {
      variant: 'brazilian',
      fen: Position.initial('brazilian').fen(),
      kind: 'analyze',
    });
    expect(res.status).toBe(200);
    const { analysis } = res.json();
    expect(analysis.lines.length).toBe(5);
    expect(analysis.lines[0].insight.headline).toBeTruthy();
  });
});

describe('autorização e validação (QA)', () => {
  it('outro perfil não edita nem apaga seus estudos (IDOR)', async () => {
    const owner = new TestClient(server);
    await owner.signUp('Dono Estudo');
    const study = (
      await owner.request('POST', '/api/studies', { variant: 'brazilian', fen: 'W:W22:B18', title: 'Meu' })
    ).json().study;
    const intruder = new TestClient(server);
    await intruder.signUp('Intruso');
    expect((await intruder.request('PATCH', `/api/studies/${study.id}`, { title: 'hackeado' })).status).toBe(
      404,
    );
    expect((await intruder.request('DELETE', `/api/studies/${study.id}`)).status).toBe(404);
    expect((await intruder.request('GET', '/api/studies')).json().studies).toEqual([]);
    const mine = (await owner.request('GET', '/api/studies')).json().studies;
    expect(mine[0].title).toBe('Meu');
  });

  it('rejeita posição inicial encerrada, impossível ou malformada', async () => {
    const client = new TestClient(server);
    await client.signUp('Posições');
    const base = {
      mode: 'ai',
      variant: 'brazilian',
      level: 3,
      color: 'white',
      mentor: false,
      timeControl: null,
    };
    // Brancas sem lances (pedra bloqueada na borda por duas pretas).
    const blocked = await client.request('POST', '/api/games', { ...base, startFen: 'W:W28:B24,19' });
    expect(blocked.status).toBe(400);
    const impossible = await client.request('POST', '/api/games', { ...base, startFen: 'W:W1:B20' });
    expect(impossible.status).toBe(400);
    const injection = await client.request('POST', '/api/games', {
      ...base,
      startFen: "W:W1'; DROP TABLE games;--",
    });
    expect(injection.status).toBe(400);
    const ok = await client.request('POST', '/api/games', { ...base, startFen: 'W:W22,24:B18,11' });
    expect(ok.status).toBe(201);
  });

  it('revisões de partida em andamento não vazam pela API para quem não joga', async () => {
    const owner = new TestClient(server);
    await owner.signUp('Jogando');
    const { id } = (
      await owner.request('POST', '/api/games', {
        mode: 'ai',
        variant: 'brazilian',
        level: 1,
        color: 'white',
        mentor: true,
        timeControl: null,
      })
    ).json();
    const ws = await owner.connect();
    ws.send({ type: 'subscribe', gameId: id });
    const game = await ws.waitState((g) => g.id === id);
    ws.send({ type: 'move', gameId: id, ply: 0, key: firstLegalKey(game) });
    await ws.wait((m) => m.type === 'review');
    const other = new TestClient(server);
    await other.signUp('Curioso');
    const res = await other.request('GET', `/api/games/${id}`);
    expect(res.status).toBe(200);
    expect(res.json().reviews).toEqual([]);
    expect(res.json().summary.you).toBeNull();
    ws.close();
  });

  it('rejeita ids e códigos com formato inválido', async () => {
    const client = new TestClient(server);
    await client.signUp('Formato');
    expect((await client.request('GET', '/api/games/..%2F..%2Fetc%2Fpasswd')).status).toBe(400);
    expect((await client.request('POST', '/api/rooms/ABC/join')).status).toBe(400);
    expect((await client.request('GET', '/api/games?limit=100000')).status).toBe(400);
  });
});
