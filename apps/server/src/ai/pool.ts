import { Worker } from 'node:worker_threads';
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

interface Job {
  readonly id: number;
  readonly task: AiTask;
  readonly priority: Priority;
  readonly resolve: (value: unknown) => void;
  readonly reject: (err: Error) => void;
}

interface Slot {
  worker: Worker;
  job: Job | null;
  timer: NodeJS.Timeout | null;
}

export interface AiRunner {
  run<T extends AiTask>(task: T): Promise<AiResult<T['kind']>>;
  stats(): { workers: number; busy: number; queued: number };
  close(): Promise<void>;
}

/**
 * Pool fixo de worker threads. A busca é síncrona e limitada por tempo dentro da thread;
 * se uma thread não responde dentro do limite + margem, ela é substituída.
 */
export class AiPool implements AiRunner {
  private readonly slots: Slot[] = [];
  private readonly queue: Job[] = [];
  private nextId = 1;
  private closed = false;
  private readonly workerUrl = new URL('./worker.ts', import.meta.url);

  private readonly maxQueue: number;

  constructor(size: number, maxQueue = size * 16) {
    this.maxQueue = maxQueue;
    for (let i = 0; i < size; i++) this.slots.push(this.spawn());
  }

  private spawn(): Slot {
    const slot: Slot = { worker: new Worker(this.workerUrl), job: null, timer: null };
    slot.worker.on('message', (msg: { id: number; ok: boolean; result?: unknown; error?: string }) => {
      const job = slot.job;
      if (!job || job.id !== msg.id) return;
      this.release(slot);
      if (msg.ok) job.resolve(msg.result);
      else job.reject(new Error(msg.error ?? 'Falha na IA'));
      this.pump();
    });
    slot.worker.on('error', (err) => this.replace(slot, err instanceof Error ? err : new Error(String(err))));
    slot.worker.on('exit', (code) => {
      if (!this.closed && code !== 0) this.replace(slot, new Error(`Thread da IA saiu com código ${code}`));
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
    slot.worker.removeAllListeners();
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
      slot.worker.postMessage({ id: job.id, task: job.task });
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
