import type { EngineRequest, ResultOf, WorkerMessage } from './protocol.ts';

/**
 * Cliente do motor: uma fila de requisições para um Worker dedicado, criado sob demanda.
 * A interface nunca trava — a busca mais longa (nível 10, 5 s) acontece fora da thread principal.
 * Se o Worker morrer (memória, erro), o próximo pedido cria outro; pedidos pendentes falham.
 */
const TIMEOUT_MS = 20_000;

interface Pending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (err: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function failAll(reason: string): void {
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new Error(reason));
    pending.delete(id);
  }
}

function spawn(): Worker {
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'motor' });
  w.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const msg = event.data;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.value);
    else p.reject(new Error(msg.error));
  };
  w.onerror = (event) => {
    event.preventDefault();
    w.terminate();
    if (worker === w) worker = null;
    failAll('O motor parou inesperadamente');
  };
  return w;
}

export function ask<R extends EngineRequest>(req: R): Promise<ResultOf<R>> {
  if (typeof Worker === 'undefined') {
    // Testes (jsdom) e navegadores sem Worker: mesma lógica, na mesma thread.
    return import('./handlers.ts').then((m) => m.handle(req));
  }
  worker ??= spawn();
  const w = worker;
  const id = nextId++;
  return new Promise<ResultOf<R>>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('O motor demorou demais para responder'));
      // Busca travada: descarta o Worker (e o que estava na fila dele) em vez de acumular trabalho fantasma.
      w.terminate();
      if (worker === w) worker = null;
      failAll('O motor foi reiniciado');
    }, TIMEOUT_MS);
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    w.postMessage({ id, req });
  });
}

/** Libera a memória do motor (ao sair da campanha). */
export function releaseEngine(): void {
  failAll('Motor liberado');
  worker?.terminate();
  worker = null;
}
