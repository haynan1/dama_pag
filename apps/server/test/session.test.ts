import { moveKey, Position } from '@dama/engine';
import type { ServerMessage } from '@dama/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiRunner } from '../src/ai/pool.ts';
import type { AiTask } from '../src/ai/tasks.ts';
import { Database } from '../src/db/database.ts';
import { type GameRecord, GameRepo } from '../src/db/games.ts';
import { ProfileRepo } from '../src/db/profiles.ts';
import { type Client, GameSession, SessionError } from '../src/games/session.ts';

/** IA de teste: resolve manualmente, para controlar a ordem dos eventos. */
class ManualAi implements AiRunner {
  readonly calls: { task: AiTask; resolve: (v: unknown) => void; reject: (e: Error) => void }[] = [];
  run<T extends AiTask>(task: T) {
    return new Promise((resolve, reject) => this.calls.push({ task, resolve, reject })) as never;
  }
  stats() {
    return { workers: 1, busy: 0, queued: this.calls.length };
  }
  async close() {}
  /** Responde a tarefa de lance da IA pendente com o primeiro lance legal. */
  answerMove(): void {
    const i = this.calls.findIndex((c) => c.task.kind === 'ai-move');
    const call = this.calls.splice(i, 1)[0]!;
    const t = call.task as Extract<AiTask, { kind: 'ai-move' }>;
    const pos = Position.fromFen(t.variant, t.startFen);
    // Replay simples: a posição atual vem do FEN inicial + lances.
    for (const k of t.moves) pos.make(pos.legalMoves().find((m) => moveKey(m) === k)!);
    const m = pos.legalMoves()[0]!;
    call.resolve({ key: moveKey(m), notation: '', pdn: '', score: 0, depth: 1, nodes: 1, timeMs: 1 });
  }
}

let db: Database;
let games: GameRepo;
let ai: ManualAi;
let finished: GameSession[];
let white: string;
let black: string;

function record(overrides: Partial<GameRecord>): GameRecord {
  const now = new Date().toISOString();
  const r: GameRecord = {
    id: `game${Math.random().toString(36).slice(2, 10)}`,
    variant: 'brazilian',
    mode: 'lan',
    status: 'active',
    roomCode: null,
    whiteId: white,
    blackId: black,
    whiteName: 'Branco',
    blackName: 'Preto',
    aiLevel: null,
    aiSide: null,
    startFen: Position.initial('brazilian').fen(),
    moves: [],
    timeControl: { initialSec: 60, incrementSec: 2 },
    clock: { whiteMs: 60_000, blackMs: 60_000 },
    mentor: false,
    assisted: false,
    hints: 0,
    takebacks: 0,
    winner: null,
    endReason: null,
    whiteAccuracy: null,
    blackAccuracy: null,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    ...overrides,
  };
  games.insert(r);
  return r;
}

function session(r: GameRecord): GameSession {
  return new GameSession(r, {
    ai,
    games,
    onFinished: (s) => finished.push(s),
    log: { warn: () => {}, error: () => {} },
  });
}

const firstKey = (s: GameSession) => moveKey(s.game.legalMoves()[0]!);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  db = new Database(':memory:');
  db.migrate();
  games = new GameRepo(db);
  const profiles = new ProfileRepo(db);
  white = profiles.create('Branco').profile.id;
  black = profiles.create('Preto').profile.id;
  ai = new ManualAi();
  finished = [];
});

afterEach(() => {
  vi.useRealTimers();
  db.close();
});

describe('relógio autoritativo', () => {
  it('tempo esgotado encerra a partida a favor do adversário', async () => {
    const s = session(record({}));
    await vi.advanceTimersByTimeAsync(60_100);
    expect(s.record.status).toBe('finished');
    expect(s.record.endReason).toBe('timeout');
    expect(s.record.winner).toBe('black');
    await vi.runAllTimersAsync();
    expect(finished).toHaveLength(1);
  });

  it('desconta o tempo gasto e aplica o incremento', async () => {
    const s = session(record({}));
    await vi.advanceTimersByTimeAsync(10_000);
    s.move(white, 0, firstKey(s));
    expect(s.record.clock!.whiteMs).toBe(60_000 - 10_000 + 2_000);
    expect(s.view(white).clock?.running).toBe('black');
  });

  it('lance depois do tempo esgotado perde por tempo, não é aplicado', async () => {
    const s = session(record({}));
    // Relógio avança sem disparar o temporizador (ex.: event loop ocupado).
    vi.setSystemTime(Date.now() + 61_000);
    s.move(white, 0, firstKey(s));
    expect(s.record.endReason).toBe('timeout');
    expect(s.record.moves).toHaveLength(0);
  });

  it('modo estudo congela o relógio e a IA', async () => {
    const s = session(record({ mode: 'ai', blackId: null, aiSide: 'black', aiLevel: 3, mentor: true }));
    s.pause(white, true);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(s.record.status).toBe('active');
    expect(() => s.move(white, 0, firstKey(s))).toThrow(SessionError);
    s.pause(white, false);
    await vi.advanceTimersByTimeAsync(60_100);
    expect(s.record.endReason).toBe('timeout');
  });
});

describe('IA e desfazer', () => {
  it('descarta o lance da IA que chega depois de um desfazer', async () => {
    const s = session(
      record({ mode: 'ai', blackId: null, aiSide: 'black', aiLevel: 3, clock: null, timeControl: null }),
    );
    s.move(white, 0, firstKey(s));
    expect(s.view(white).aiThinking).toBe(true);
    s.undo(white);
    expect(s.game.ply).toBe(0);
    expect(s.record.assisted).toBe(true);
    ai.answerMove();
    await vi.runAllTimersAsync();
    expect(s.game.ply).toBe(0);
  });

  it('IA joga quando é a vez dela', async () => {
    const s = session(
      record({ mode: 'ai', blackId: null, aiSide: 'black', aiLevel: 3, clock: null, timeControl: null }),
    );
    s.move(white, 0, firstKey(s));
    ai.answerMove();
    await vi.runAllTimersAsync();
    expect(s.game.ply).toBe(2);
    expect(s.game.turn).toBe(1);
  });

  it('IA joga primeiro quando fica com as brancas', async () => {
    const s = session(
      record({ mode: 'ai', whiteId: null, aiSide: 'white', aiLevel: 3, clock: null, timeControl: null }),
    );
    expect(ai.calls.some((c) => c.task.kind === 'ai-move')).toBe(true);
    ai.answerMove();
    await vi.runAllTimersAsync();
    expect(s.game.ply).toBe(1);
  });
});

describe('permissões', () => {
  it('só quem está na partida joga, e só na sua vez', () => {
    const s = session(record({ clock: null, timeControl: null }));
    expect(() => s.move('intruso', 0, firstKey(s))).toThrow(/assistindo/);
    expect(() => s.move(black, 0, firstKey(s))).toThrow(/Não é sua vez/);
  });

  it('mentor, pausa e desfazer não existem na rede', async () => {
    const s = session(record({ clock: null, timeControl: null }));
    expect(() => s.pause(white, true)).toThrow(SessionError);
    expect(() => s.setMentor(white, true)).toThrow(SessionError);
    await expect(s.mentor(white, 'hint')).rejects.toThrow(SessionError);
    s.move(white, 0, firstKey(s));
    expect(() => s.undo(white)).toThrow(/desfazer/);
  });

  it('espectador não recebe revisões nem dicas de partida em andamento', () => {
    const s = session(
      record({
        mode: 'ai',
        blackId: null,
        aiSide: 'black',
        aiLevel: 3,
        mentor: true,
        clock: null,
        timeControl: null,
      }),
    );
    const received: ServerMessage[] = [];
    const spectator: Client = { id: 99, profileId: 'outro', send: (m) => received.push(m) };
    s.attach(spectator);
    s.move(white, 0, firstKey(s));
    const states = received.filter((m) => m.type === 'state');
    expect(states.length).toBeGreaterThan(0);
    for (const m of states) if (m.type === 'state') expect(m.game.reviews).toEqual([]);
  });

  it('empate por acordo exige a proposta do outro lado', () => {
    const s = session(record({ clock: null, timeControl: null }));
    s.draw(white, 'accept');
    expect(s.record.status).toBe('active');
    s.draw(white, 'offer');
    s.draw(white, 'accept');
    expect(s.record.status).toBe('active');
    s.draw(black, 'accept');
    expect(s.record.endReason).toBe('agreement');
  });
});
