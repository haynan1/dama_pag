import { type Color, Game, GameError, type GameResult, type MoveReview } from '@dama/engine';
import type { ClockView, GameView, PlayerView, ReviewView, ServerMessage, Side } from '@dama/protocol';
import type { AiRunner } from '../ai/pool.ts';
import type { GameRecord, GameRepo } from '../db/games.ts';
import { nowIso } from '../db/ids.ts';

export interface Client {
  readonly id: number;
  readonly profileId: string | null;
  send(message: ServerMessage): void;
}

export interface SessionDeps {
  readonly ai: AiRunner;
  readonly games: GameRepo;
  /** Chamado uma vez quando a partida termina, depois das revisões pendentes. */
  readonly onFinished: (session: GameSession) => void;
  readonly log: { warn(obj: unknown, msg?: string): void; error(obj: unknown, msg?: string): void };
}

const colorOf = (side: Side): Color => (side === 'white' ? 1 : -1);
const sideOfColor = (color: Color): Side => (color === 1 ? 'white' : 'black');
const other = (side: Side): Side => (side === 'white' ? 'black' : 'white');

/** Profundidade/tempo das análises por tamanho de tabuleiro (tabuleiros maiores ramificam mais). */
function budget(size: number, kind: 'review' | 'hint' | 'lookahead'): { depth: number; timeMs: number } {
  const big = size > 8;
  switch (kind) {
    case 'review':
      return { depth: big ? 8 : 12, timeMs: big ? 1200 : 1000 };
    case 'hint':
      return { depth: big ? 10 : 16, timeMs: 1500 };
    case 'lookahead':
      return { depth: big ? 8 : 12, timeMs: big ? 4000 : 3000 };
  }
}

/** Frase sobre o melhor lance coerente com a classificação (sem "melhor era X" num lance ótimo). */
function compareWithBest(review: MoveReview): string[] {
  if (review.played.key === review.best.key) return [];
  const best = `${review.best.notation} (${review.best.insight.headline.toLowerCase()})`;
  switch (review.classification) {
    case 'best':
    case 'brilliant':
    case 'forced':
      return [`${review.best.notation} era equivalente.`];
    case 'excellent':
    case 'good':
      return [`Um pouco mais preciso: ${best}.`];
    default:
      return [`Melhor era ${best}.`];
  }
}

export class SessionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Uma partida ao vivo. Estado autoritativo: posição, relógio, IA, mentor e revisões.
 * Toda operação assíncrona carrega a "geração" em que começou; se a partida mudou
 * (desfazer, fim), o resultado é descartado.
 */
export class GameSession {
  readonly record: GameRecord;
  readonly game: Game;
  private readonly deps: SessionDeps;
  private readonly clients = new Set<Client>();
  private readonly reviews = new Map<number, ReviewView>();
  private readonly pending = new Set<Promise<unknown>>();
  private generation = 0;
  private aiThinking = false;
  private aiFailures = 0;
  private lastAiScore: number | null = null;
  private paused = false;
  private drawOffer: Side | null = null;
  private runningSince: number | null = null;
  private flagTimer: NodeJS.Timeout | null = null;
  private readonly mentorBusy = new Set<string>();
  private finishing = false;

  constructor(record: GameRecord, deps: SessionDeps, reviews: readonly ReviewView[] = []) {
    this.record = record;
    this.deps = deps;
    this.game = Game.replay(record.variant, record.startFen, record.moves);
    for (const r of reviews) this.reviews.set(r.ply, r);
    if (record.status === 'finished' && !this.game.result && record.endReason) {
      this.game.finish({ winner: record.winner ? colorOf(record.winner) : null, reason: record.endReason });
    }
    if (record.status === 'active') {
      this.startClock();
      this.maybeAiMove();
    }
  }

  get id(): string {
    return this.record.id;
  }

  get idle(): boolean {
    return this.clients.size === 0 && !this.aiThinking && this.pending.size === 0;
  }

  // ---------------------------------------------------------------------------------------------
  // Assinantes
  // ---------------------------------------------------------------------------------------------

  attach(client: Client): void {
    this.clients.add(client);
    this.broadcast();
  }

  detach(client: Client): void {
    if (this.clients.delete(client)) this.broadcast();
  }

  sideOf(profileId: string | null): Side | null {
    if (!profileId) return null;
    if (this.record.whiteId === profileId) return 'white';
    if (this.record.blackId === profileId) return 'black';
    return null;
  }

  private isAi(side: Side): boolean {
    return this.record.mode === 'ai' && this.record.aiSide === side;
  }

  private broadcast(): void {
    for (const c of this.clients) c.send({ type: 'state', game: this.view(c.profileId) });
  }

  private sendTo(profileId: string, message: ServerMessage): void {
    for (const c of this.clients) if (c.profileId === profileId) c.send(message);
  }

  // ---------------------------------------------------------------------------------------------
  // Visão
  // ---------------------------------------------------------------------------------------------

  view(profileId: string | null): GameView {
    const r = this.record;
    const you = this.sideOf(profileId);
    const connected = (id: string | null) => id !== null && [...this.clients].some((c) => c.profileId === id);
    const player = (side: Side): PlayerView => {
      const id = side === 'white' ? r.whiteId : r.blackId;
      const ai = this.isAi(side);
      return {
        kind: ai ? 'ai' : 'human',
        name: side === 'white' ? r.whiteName : r.blackName,
        profileId: id,
        level: ai ? r.aiLevel : null,
        connected: ai || connected(id),
      };
    };
    const finished = r.status === 'finished';
    const reviews = finished
      ? [...this.reviews.values()]
      : r.mentor && you
        ? [...this.reviews.values()].filter((rv) => rv.side === you)
        : [];
    return {
      id: r.id,
      variant: r.variant,
      mode: r.mode,
      status: r.status,
      roomCode: r.status === 'waiting' ? r.roomCode : null,
      startFen: r.startFen,
      fen: this.game.position.fen(),
      turn: sideOfColor(this.game.turn),
      moves: this.game.moves.map((m, ply) => ({
        ply,
        key: m.key,
        notation: m.notation,
        side: sideOfColor(m.side),
        path: m.move.path,
        captures: m.move.captures,
      })),
      players: { white: player('white'), black: player('black') },
      you,
      result: finished && r.endReason ? { winner: r.winner, reason: r.endReason } : null,
      clock: this.clockView(),
      paused: this.paused,
      mentor: r.mentor,
      mentorAllowed: r.mode === 'ai',
      canUndo: this.canUndo(you),
      drawOffer: this.drawOffer,
      aiThinking: this.aiThinking,
      assisted: r.assisted,
      reviews: reviews.sort((a, b) => a.ply - b.ply),
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Relógio (autoritativo no servidor)
  // ---------------------------------------------------------------------------------------------

  private clockView(): ClockView | null {
    const clock = this.record.clock;
    if (!clock) return null;
    const now = Date.now();
    const running = this.runningSince !== null ? sideOfColor(this.game.turn) : null;
    const elapsed = this.runningSince !== null ? now - this.runningSince : 0;
    return {
      whiteMs: Math.max(0, clock.whiteMs - (running === 'white' ? elapsed : 0)),
      blackMs: Math.max(0, clock.blackMs - (running === 'black' ? elapsed : 0)),
      running,
      measuredAt: now,
    };
  }

  private startClock(): void {
    if (!this.record.clock || this.record.status !== 'active' || this.paused) return;
    this.runningSince = Date.now();
    this.armFlag();
  }

  /** Para o relógio e desconta o tempo gasto por quem estava jogando. */
  private stopClock(): void {
    const clock = this.record.clock;
    if (this.flagTimer) clearTimeout(this.flagTimer);
    this.flagTimer = null;
    if (!clock || this.runningSince === null) return;
    const elapsed = Date.now() - this.runningSince;
    if (this.game.turn === 1) clock.whiteMs -= elapsed;
    else clock.blackMs -= elapsed;
    this.runningSince = null;
  }

  private armFlag(): void {
    const clock = this.record.clock;
    if (!clock) return;
    if (this.flagTimer) clearTimeout(this.flagTimer);
    const remaining = this.game.turn === 1 ? clock.whiteMs : clock.blackMs;
    this.flagTimer = setTimeout(() => this.checkFlag(), Math.max(0, remaining) + 25);
  }

  private checkFlag(): void {
    const clock = this.record.clock;
    if (!clock || this.runningSince === null || this.record.status !== 'active') return;
    const view = this.clockView()!;
    const side = sideOfColor(this.game.turn);
    if ((side === 'white' ? view.whiteMs : view.blackMs) <= 0) {
      this.stopClock();
      this.finish({ winner: colorOf(other(side)), reason: 'timeout' });
    } else this.armFlag();
  }

  // ---------------------------------------------------------------------------------------------
  // Ações
  // ---------------------------------------------------------------------------------------------

  private requirePlayer(profileId: string | null): Side {
    const side = this.sideOf(profileId);
    if (!side) throw new SessionError('forbidden', 'Você está assistindo esta partida');
    return side;
  }

  private requireActive(): void {
    if (this.record.status === 'waiting') throw new SessionError('waiting', 'Aguardando o adversário entrar');
    if (this.record.status !== 'active') throw new SessionError('game-over', 'A partida já terminou');
  }

  /** Adversário humano entrou na sala. */
  start(): void {
    this.startClock();
    this.broadcast();
    this.maybeAiMove();
  }

  move(profileId: string | null, ply: number, key: string): void {
    const side = this.requirePlayer(profileId);
    this.requireActive();
    if (this.paused) throw new SessionError('paused', 'Partida pausada para estudo. Retome para jogar.');
    if (sideOfColor(this.game.turn) !== side || this.isAi(side))
      throw new SessionError('not-your-turn', 'Não é sua vez');
    if (ply !== this.game.ply) throw new SessionError('stale', 'O tabuleiro mudou. Atualizando…');
    this.applyMove(key, null);
  }

  private applyMove(key: string, aiScore: number | null): void {
    const before = [...this.record.moves];
    const clock = this.record.clock;
    const mover = sideOfColor(this.game.turn);
    if (clock && this.runningSince !== null) {
      const elapsed = Date.now() - this.runningSince;
      const remaining = (mover === 'white' ? clock.whiteMs : clock.blackMs) - elapsed;
      if (remaining <= 0) {
        this.stopClock();
        this.finish({ winner: colorOf(other(mover)), reason: 'timeout' });
        return;
      }
    }
    let played: ReturnType<Game['play']>;
    try {
      played = this.game.play(key);
    } catch (err) {
      if (err instanceof GameError) throw new SessionError(err.code, err.message);
      throw err;
    }
    this.stopClockAfterMove(mover);
    this.record.moves.push(played.key);
    this.drawOffer = null;
    const ply = this.game.ply - 1;

    if (aiScore !== null) {
      // Lance da IA: guarda só a avaliação para o gráfico da partida.
      this.lastAiScore = aiScore;
      this.storeReview({
        ply,
        side: mover,
        notation: played.notation,
        classification: null,
        accuracy: null,
        evalWhite: mover === 'white' ? aiScore : -aiScore,
        bestNotation: null,
        bestPv: [],
        headline: null,
        details: [],
      });
    } else {
      this.scheduleReview(before, played.key, ply, mover, played.notation);
    }

    if (this.game.result) {
      this.finish(this.game.result);
      return;
    }
    this.deps.games.save(this.record);
    this.startClock();
    this.broadcast();
    this.maybeAiMove();
  }

  private stopClockAfterMove(mover: Side): void {
    const clock = this.record.clock;
    if (!clock || this.runningSince === null) return;
    const elapsed = Date.now() - this.runningSince;
    const inc = (this.record.timeControl?.incrementSec ?? 0) * 1000;
    if (mover === 'white') clock.whiteMs += inc - elapsed;
    else clock.blackMs += inc - elapsed;
    this.runningSince = null;
    if (this.flagTimer) clearTimeout(this.flagTimer);
    this.flagTimer = null;
  }

  private maybeAiMove(): void {
    if (this.record.status !== 'active' || this.paused || this.aiThinking || this.game.result) return;
    const side = sideOfColor(this.game.turn);
    if (!this.isAi(side)) return;
    this.aiThinking = true;
    const generation = this.generation;
    const ply = this.game.ply;
    this.broadcast();
    const task = this.deps.ai
      .run({
        kind: 'ai-move',
        variant: this.record.variant,
        startFen: this.record.startFen,
        moves: [...this.record.moves],
        level: this.record.aiLevel ?? 5,
        seed: (Date.now() ^ (ply * 2654435761)) >>> 0,
      })
      .then((decision) => {
        this.aiThinking = false;
        if (generation !== this.generation || ply !== this.game.ply || this.record.status !== 'active') {
          this.broadcast();
          this.maybeAiMove();
          return;
        }
        if (this.paused) {
          this.broadcast();
          return;
        }
        this.aiFailures = 0;
        if (!decision) return;
        this.applyMove(decision.key, decision.score);
      })
      .catch((err: unknown) => {
        this.aiThinking = false;
        this.aiFailures++;
        this.deps.log.error({ err, game: this.id, attempt: this.aiFailures }, 'falha no lance da IA');
        this.broadcast();
        // Thread substituída pelo pool: tenta de novo algumas vezes antes de desistir.
        if (this.aiFailures < 3) setTimeout(() => this.maybeAiMove(), 500 * this.aiFailures);
      });
    this.track(task);
  }

  private scheduleReview(
    movesBefore: string[],
    playedKey: string,
    ply: number,
    side: Side,
    notation: string,
  ): void {
    const generation = this.generation;
    const size = this.game.position.geo.size;
    const task = this.deps.ai
      .run({
        kind: 'review',
        variant: this.record.variant,
        startFen: this.record.startFen,
        moves: movesBefore,
        playedKey,
        ...budget(size, 'review'),
      })
      .then((review: MoveReview) => {
        if (generation !== this.generation) return;
        const view: ReviewView = {
          ply,
          side,
          notation,
          classification: review.classification,
          accuracy: review.accuracy,
          evalWhite: side === 'white' ? review.playedScore : -review.playedScore,
          bestNotation: review.best.notation,
          bestPv: review.best.pv,
          headline: review.played.insight.headline,
          details: [...review.played.insight.details, ...compareWithBest(review)],
        };
        this.storeReview(view);
        const profileId = side === 'white' ? this.record.whiteId : this.record.blackId;
        if (profileId && this.record.mentor && this.record.status === 'active') {
          this.sendTo(profileId, { type: 'review', gameId: this.id, review: view });
        }
      })
      .catch((err: unknown) => this.deps.log.warn({ err, game: this.id }, 'falha na revisão'));
    this.track(task);
  }

  private storeReview(view: ReviewView): void {
    this.reviews.set(view.ply, view);
    this.deps.games.upsertReview(this.id, view);
  }

  private track(p: Promise<unknown>): void {
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p));
  }

  private canUndo(side: Side | null): boolean {
    if (!side || this.record.mode !== 'ai' || this.record.status !== 'active') return false;
    return this.game.moves.some((m) => sideOfColor(m.side) === side);
  }

  /** Desfaz até voltar à sua vez (só contra a IA). Marca a partida como assistida. */
  undo(profileId: string | null): void {
    const side = this.requirePlayer(profileId);
    this.requireActive();
    if (!this.canUndo(side)) throw new SessionError('cannot-undo', 'Não há lance seu para desfazer');
    this.generation++;
    this.aiThinking = false;
    this.stopClock();
    // Volta até o seu último lance, inclusive.
    let count = 0;
    const moves = this.game.moves;
    for (let i = moves.length - 1; i >= 0; i--) {
      count++;
      if (sideOfColor(moves[i]!.side) === side) break;
    }
    this.game.undo(count);
    this.record.moves.splice(this.record.moves.length - count);
    const fromPly = this.game.ply;
    for (const ply of [...this.reviews.keys()]) if (ply >= fromPly) this.reviews.delete(ply);
    this.deps.games.truncateReviews(this.id, fromPly);
    this.record.takebacks++;
    this.record.assisted = true;
    this.deps.games.save(this.record);
    this.startClock();
    this.broadcast();
  }

  resign(profileId: string | null): void {
    const side = this.requirePlayer(profileId);
    if (this.record.status === 'waiting') {
      // Sala sem adversário: cancelar é só remover o convite.
      this.record.status = 'finished';
      this.record.endReason = 'abandon';
      this.record.roomCode = null;
      this.record.finishedAt = nowIso();
      this.deps.games.save(this.record);
      this.broadcast();
      return;
    }
    this.requireActive();
    this.stopClock();
    this.finish({ winner: colorOf(other(side)), reason: 'resign' });
  }

  draw(profileId: string | null, action: 'offer' | 'accept' | 'decline'): void {
    const side = this.requirePlayer(profileId);
    this.requireActive();
    if (this.record.mode === 'ai') {
      if (action !== 'offer') return;
      // A IA aceita empate quando não se vê melhor e a partida já saiu da abertura.
      const accepts = this.game.ply >= 20 && this.lastAiScore !== null && this.lastAiScore <= 10;
      if (accepts) {
        this.stopClock();
        this.finish({ winner: null, reason: 'agreement' });
      } else {
        const profile = side === 'white' ? this.record.whiteId : this.record.blackId;
        if (profile)
          this.sendTo(profile, { type: 'error', code: 'draw-declined', message: 'A IA recusou o empate.' });
      }
      return;
    }
    if (action === 'offer') {
      this.drawOffer = side;
    } else if (this.drawOffer === other(side)) {
      if (action === 'accept') {
        this.stopClock();
        this.finish({ winner: null, reason: 'agreement' });
        return;
      }
      this.drawOffer = null;
    }
    this.broadcast();
  }

  pause(profileId: string | null, paused: boolean): void {
    this.requirePlayer(profileId);
    this.requireActive();
    if (this.record.mode !== 'ai') throw new SessionError('forbidden', 'Pausa para estudo só contra a IA');
    if (paused === this.paused) return;
    if (paused) {
      this.stopClock();
      this.paused = true;
    } else {
      this.paused = false;
      this.startClock();
      this.maybeAiMove();
    }
    this.broadcast();
  }

  setMentor(profileId: string | null, enabled: boolean): void {
    this.requirePlayer(profileId);
    if (this.record.mode !== 'ai')
      throw new SessionError('forbidden', 'O mentor só está disponível contra a IA');
    this.record.mentor = enabled;
    this.deps.games.save(this.record);
    this.broadcast();
  }

  async mentor(profileId: string | null, task: 'hint' | 'lookahead'): Promise<void> {
    const side = this.requirePlayer(profileId);
    this.requireActive();
    if (this.record.mode !== 'ai')
      throw new SessionError('forbidden', 'O mentor só está disponível contra a IA');
    if (!this.record.mentor) throw new SessionError('mentor-off', 'Ative o modo mentor primeiro');
    if (sideOfColor(this.game.turn) !== side)
      throw new SessionError('not-your-turn', 'O mentor analisa na sua vez');
    const busyKey = `${task}:${this.game.ply}`;
    if (this.mentorBusy.has(busyKey)) return;
    this.mentorBusy.add(busyKey);
    this.sendTo(profileId!, { type: 'mentor-busy', gameId: this.id, task });
    this.record.hints++;
    this.record.assisted = true;
    this.deps.games.save(this.record);
    const generation = this.generation;
    const ply = this.game.ply;
    const ref = {
      variant: this.record.variant,
      startFen: this.record.startFen,
      moves: [...this.record.moves],
    };
    const size = this.game.position.geo.size;
    try {
      if (task === 'hint') {
        const h = await this.deps.ai.run({ kind: 'hint', ...ref, ...budget(size, 'hint') });
        if (generation !== this.generation || ply !== this.game.ply) return;
        this.sendTo(profileId!, {
          type: 'hint',
          gameId: this.id,
          hint: h && {
            square: h.square,
            squareName: h.squareName,
            key: h.best.key,
            notation: h.best.notation,
            path: h.best.path,
            score: h.best.score,
            insight: h.best.insight,
            pv: h.best.pv,
            alternatives: h.alternatives.map((a) => ({
              notation: a.notation,
              score: a.score,
              headline: a.insight.headline,
            })),
          },
        });
      } else {
        const tree = await this.deps.ai.run({ kind: 'lookahead', ...ref, ...budget(size, 'lookahead') });
        if (generation !== this.generation || ply !== this.game.ply) return;
        this.sendTo(profileId!, { type: 'lookahead', gameId: this.id, tree });
      }
    } finally {
      this.mentorBusy.delete(busyKey);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Fim
  // ---------------------------------------------------------------------------------------------

  private finish(result: GameResult): void {
    if (this.finishing || this.record.status === 'finished') return;
    this.finishing = true;
    this.generation++;
    this.aiThinking = false;
    this.paused = false;
    if (this.flagTimer) clearTimeout(this.flagTimer);
    this.flagTimer = null;
    this.runningSince = null;
    this.game.finish(result);
    const r = this.record;
    r.status = 'finished';
    r.winner = result.winner === null ? null : sideOfColor(result.winner);
    r.endReason = result.reason;
    r.finishedAt = nowIso();
    r.roomCode = null;
    this.deps.games.save(r);
    this.broadcast();
    // Espera as revisões em andamento (limitadas pelo tempo da IA) para calcular precisão e prêmios.
    void Promise.allSettled([...this.pending]).then(() => {
      try {
        this.deps.onFinished(this);
      } catch (err) {
        this.deps.log.error({ err, game: this.id }, 'falha ao concluir partida');
      }
      this.broadcast();
    });
  }

  reviewList(): ReviewView[] {
    return [...this.reviews.values()].sort((a, b) => a.ply - b.ply);
  }

  notify(profileId: string, message: ServerMessage): void {
    this.sendTo(profileId, message);
  }

  dispose(): void {
    if (this.flagTimer) clearTimeout(this.flagTimer);
    this.flagTimer = null;
    this.generation++;
  }
}
