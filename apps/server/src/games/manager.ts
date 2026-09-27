import { aiLevel, Game, Position, VARIANTS } from '@dama/engine';
import type { ClientMessage, CreateGameInput, Side } from '@dama/protocol';
import type { AiRunner } from '../ai/pool.ts';
import type { GameRecord, GameRepo } from '../db/games.ts';
import { newId, newRoomCode, nowIso } from '../db/ids.ts';
import type { ProfileRow } from '../db/profiles.ts';
import { type ProgressService, sideAccuracy } from '../progress/service.ts';
import { type Client, GameSession, SessionError } from './session.ts';

export interface ManagerDeps {
  readonly ai: AiRunner;
  readonly games: GameRepo;
  readonly progress: ProgressService;
  readonly log: {
    info(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
    error(obj: unknown, msg?: string): void;
  };
}

const IDLE_EVICT_MS = 10 * 60_000;

/** Registro de partidas ao vivo em memória, carregadas sob demanda do banco. */
export class GameManager {
  private readonly deps: ManagerDeps;
  private readonly sessions = new Map<string, GameSession>();
  private readonly subscriptions = new Map<Client, Set<string>>();
  private readonly sweeper: NodeJS.Timeout;

  constructor(deps: ManagerDeps) {
    this.deps = deps;
    this.sweeper = setInterval(() => this.evictIdle(), IDLE_EVICT_MS);
    this.sweeper.unref();
  }

  create(profile: ProfileRow, input: CreateGameInput): GameRecord {
    const side: Side = input.color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : input.color;
    const variant = VARIANTS[input.variant];
    let startFen = Position.initial(input.variant).fen();
    if (input.mode === 'ai' && input.startFen) {
      const custom = Game.create(input.variant, input.startFen);
      if (custom.result)
        throw new SessionError('invalid-position', 'Posição já encerrada: sem lances ou empatada');
      startFen = custom.startFen;
    }
    const now = nowIso();
    const clockMs = input.timeControl ? input.timeControl.initialSec * 1000 : null;
    const aiSide: Side | null = input.mode === 'ai' ? (side === 'white' ? 'black' : 'white') : null;
    const aiName = input.mode === 'ai' ? `IA ${aiLevel(input.level).name}` : '';
    const record: GameRecord = {
      id: newId(),
      variant: variant.id,
      mode: input.mode,
      status: input.mode === 'ai' ? 'active' : 'waiting',
      roomCode: input.mode === 'lan' ? this.uniqueRoomCode() : null,
      whiteId: side === 'white' ? profile.id : null,
      blackId: side === 'black' ? profile.id : null,
      whiteName: side === 'white' ? profile.name : input.mode === 'ai' ? aiName : 'Aguardando…',
      blackName: side === 'black' ? profile.name : input.mode === 'ai' ? aiName : 'Aguardando…',
      aiLevel: input.mode === 'ai' ? input.level : null,
      aiSide,
      startFen,
      moves: [],
      timeControl: input.timeControl,
      clock: clockMs === null ? null : { whiteMs: clockMs, blackMs: clockMs },
      mentor: input.mode === 'ai' ? input.mentor : false,
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
    };
    this.deps.games.insert(record);
    this.sessions.set(record.id, this.newSession(record));
    return record;
  }

  private uniqueRoomCode(): string {
    for (let i = 0; i < 20; i++) {
      const code = newRoomCode();
      if (!this.deps.games.byRoomCode(code)) return code;
    }
    throw new SessionError('room-code', 'Não foi possível gerar um código de sala');
  }

  joinRoom(profile: ProfileRow, code: string): GameRecord {
    const stored = this.deps.games.byRoomCode(code);
    if (!stored) throw new SessionError('not-found', 'Sala não encontrada ou já iniciada');
    const session = this.get(stored.id)!;
    const r = session.record;
    if (r.whiteId === profile.id || r.blackId === profile.id) return r;
    if (r.status !== 'waiting') throw new SessionError('not-found', 'Sala não encontrada ou já iniciada');
    if (r.whiteId === null) {
      r.whiteId = profile.id;
      r.whiteName = profile.name;
    } else {
      r.blackId = profile.id;
      r.blackName = profile.name;
    }
    r.status = 'active';
    r.roomCode = null;
    this.deps.games.save(r);
    session.start();
    return r;
  }

  /** Sessão ao vivo (carrega do banco se preciso). */
  get(id: string): GameSession | undefined {
    const live = this.sessions.get(id);
    if (live) return live;
    const record = this.deps.games.byId(id);
    if (!record) return undefined;
    const session = this.newSession(record);
    this.sessions.set(id, session);
    return session;
  }

  private newSession(record: GameRecord): GameSession {
    return new GameSession(
      record,
      {
        ai: this.deps.ai,
        games: this.deps.games,
        log: this.deps.log,
        onFinished: (s) => this.onFinished(s),
      },
      this.deps.games.reviews(record.id),
    );
  }

  private onFinished(session: GameSession): void {
    const r = session.record;
    const reviews = session.reviewList();
    r.whiteAccuracy = sideAccuracy(reviews, 'white');
    r.blackAccuracy = sideAccuracy(reviews, 'black');
    this.deps.games.save(r);
    const rewards = this.deps.progress.finishGame(r, session.game, reviews);
    for (const [profileId, summary] of rewards) {
      session.notify(profileId, { type: 'rewards', gameId: r.id, rewards: summary });
    }
    this.deps.log.info({ game: r.id, winner: r.winner, reason: r.endReason }, 'partida encerrada');
  }

  // ---------------------------------------------------------------------------------------------
  // Mensagens do WebSocket
  // ---------------------------------------------------------------------------------------------

  async handle(client: Client, msg: ClientMessage): Promise<void> {
    if (msg.type === 'ping') {
      client.send({ type: 'pong' });
      return;
    }
    const session = this.get(msg.gameId);
    if (!session) throw new SessionError('not-found', 'Partida não encontrada');
    switch (msg.type) {
      case 'subscribe': {
        let set = this.subscriptions.get(client);
        if (!set) {
          set = new Set();
          this.subscriptions.set(client, set);
        }
        if (set.size >= 8 && !set.has(msg.gameId))
          throw new SessionError('limit', 'Muitas partidas abertas nesta conexão');
        set.add(msg.gameId);
        session.attach(client);
        return;
      }
      case 'unsubscribe':
        this.subscriptions.get(client)?.delete(msg.gameId);
        session.detach(client);
        return;
      case 'move':
        return session.move(client.profileId, msg.ply, msg.key);
      case 'undo':
        return session.undo(client.profileId);
      case 'resign':
        return session.resign(client.profileId);
      case 'draw':
        return session.draw(client.profileId, msg.action);
      case 'pause':
        return session.pause(client.profileId, msg.paused);
      case 'mentor':
        return session.setMentor(client.profileId, msg.enabled);
      case 'hint':
      case 'lookahead':
        return session.mentor(client.profileId, msg.type);
    }
  }

  disconnect(client: Client): void {
    for (const id of this.subscriptions.get(client) ?? []) this.sessions.get(id)?.detach(client);
    this.subscriptions.delete(client);
  }

  private evictIdle(): void {
    for (const [id, s] of this.sessions) {
      // Partidas ativas contra a IA sem ninguém assistindo podem sair da memória: o estado está no banco.
      if (s.idle) {
        s.dispose();
        this.sessions.delete(id);
      }
    }
  }

  stats(): { live: number } {
    return { live: this.sessions.size };
  }

  shutdown(): void {
    clearInterval(this.sweeper);
    for (const s of this.sessions.values()) s.dispose();
    this.sessions.clear();
  }
}
