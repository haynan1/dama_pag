import type { AiResult, AiTask } from './tasks.ts';

export class AiBusyError extends Error {
  constructor() {
    super('A IA está ocupada analisando outras posições. Tente de novo em instantes.');
    this.name = 'AiBusyError';
  }
}

/** Prioridade: lance da IA > pedidos do mentor > revisões em segundo plano. */
export type Priority = 0 | 1 | 2;

const PRIORITY: Readonly<Record<AiTask['kind'], Priority>> = {
  'ai-move': 0,
  hint: 1,
  lookahead: 1,
  'lookahead-fen': 1,
  analyze: 1,
  'study-check': 1,
  review: 2,
};

export interface AiRunner {
  run<T extends AiTask>(task: T): Promise<AiResult<T['kind']>>;
  stats(): { workers: number; busy: number; queued: number };
  close(): Promise<void>;
}

export interface AiReply {
  readonly id: number;
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: string;
}

/**
 * Uma thread de IA, seja `worker_threads` (servidor) ou Web Worker (app). Depois de `terminate`,
 * nenhum callback dispara mais.
 */
export interface AiWorkerHandle {
  post(message: { id: number; task: AiTask }): void;
  onMessage(listener: (reply: AiReply) => void): void;
  /** Erro não tratado ou saída inesperada da thread. */
  onFailure(listener: (err: Error) => void): void;
  terminate(): Promise<void>;
}

interface Job {
  readonly id: number;
  readonly task: AiTask;
  readonly priority: Priority;
  readonly resolve: (value: unknown) => void;
  readonly reject: (err: Error) => void;
}

interface Slot {
  worker: AiWorkerHandle;
  job: Job | null;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Pool fixo de threads. A busca é síncrona e limitada por tempo dentro da thread; se uma thread
 * não responde dentro do limite + margem, ela é substituída.
 */
export class WorkerPool implements AiRunner {
  private readonly slots: Slot[] = [];
  private readonly queue: Job[] = [];
  private nextId = 1;
  private closed = false;
  private readonly spawnWorker: () => AiWorkerHandle;
  private readonly maxQueue: number;

  constructor(spawnWorker: () => AiWorkerHandle, size: number, maxQueue = size * 16) {
    this.spawnWorker = spawnWorker;
    this.maxQueue = maxQueue;
    for (let i = 0; i < size; i++) this.slots.push(this.spawn());
  }

  private spawn(): Slot {
    const slot: Slot = { worker: this.spawnWorker(), job: null, timer: null };
    slot.worker.onMessage((msg) => {
      const job = slot.job;
      if (!job || job.id !== msg.id) return;
      this.release(slot);
      if (msg.ok) job.resolve(msg.result);
      else job.reject(new Error(msg.error ?? 'Falha na IA'));
      this.pump();
    });
    slot.worker.onFailure((err) => {
      if (!this.closed) this.replace(slot, err);
    });
    return slot;
  }

  private release(slot: Slot): void {
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = null;
    slot.job = null;
  }

  private replace(slot: Slot, err: Error): void {
    const job = slot.job;
    this.release(slot);
    if (job) job.reject(err);
    const index = this.slots.indexOf(slot);
    if (index < 0 || this.closed) return;
    slot.worker.terminate().catch(() => {
      // A thread já está morta ou travada; a substituta abaixo assume o trabalho.
    });
    this.slots[index] = this.spawn();
    this.pump();
  }

  run<T extends AiTask>(task: T): Promise<AiResult<T['kind']>> {
    if (this.closed) return Promise.reject(new Error('Pool da IA encerrado'));
    // Lances da IA nunca são recusados; análises sob sobrecarga recebem "ocupado".
    if (task.kind !== 'ai-move' && this.queue.length >= this.maxQueue)
      return Promise.reject(new AiBusyError());
    return new Promise((resolve, reject) => {
      const job: Job = {
        id: this.nextId++,
        task,
        priority: PRIORITY[task.kind],
        resolve: resolve as (v: unknown) => void,
        reject,
      };
      // Fila estável por prioridade.
      const at = this.queue.findIndex((j) => j.priority > job.priority);
      if (at < 0) this.queue.push(job);
      else this.queue.splice(at, 0, job);
      this.pump();
    });
  }

  private pump(): void {
    for (const slot of this.slots) {
      if (slot.job) continue;
      const job = this.queue.shift();
      if (!job) return;
      slot.job = job;
      const limit = ('timeMs' in job.task ? job.task.timeMs : 5000) * 3 + 15_000;
      slot.timer = setTimeout(() => this.replace(slot, new Error('Tempo esgotado na IA')), limit);
      slot.worker.post({ id: job.id, task: job.task });
    }
  }

  stats(): { workers: number; busy: number; queued: number } {
    return {
      workers: this.slots.length,
      busy: this.slots.filter((s) => s.job).length,
      queued: this.queue.length,
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.queue.splice(0)) job.reject(new Error('Pool da IA encerrado'));
    await Promise.all(
      this.slots.map(async (slot) => {
        slot.job?.reject(new Error('Pool da IA encerrado'));
        this.release(slot);
        await slot.worker.terminate();
      }),
    );
  }
}
