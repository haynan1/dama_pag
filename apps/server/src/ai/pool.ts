import { Worker } from 'node:worker_threads';
import { type AiReply, type AiWorkerHandle, WorkerPool } from './runner.ts';

export { AiBusyError, type AiRunner, type Priority } from './runner.ts';

const WORKER_URL = new URL('./worker.ts', import.meta.url);

function spawnThread(): AiWorkerHandle {
  const worker = new Worker(WORKER_URL);
  let live = true;
  return {
    post: (message) => worker.postMessage(message),
    onMessage(listener) {
      worker.on('message', (msg: AiReply) => live && listener(msg));
    },
    onFailure(listener) {
      worker.on('error', (err) => live && listener(err instanceof Error ? err : new Error(String(err))));
      worker.on('exit', (code) => {
        if (live && code !== 0) listener(new Error(`Thread da IA saiu com código ${code}`));
      });
    },
    async terminate() {
      live = false;
      worker.removeAllListeners();
      await worker.terminate();
    },
  };
}

/** Pool de `worker_threads` do servidor. */
export class AiPool extends WorkerPool {
  constructor(size: number, maxQueue = size * 16) {
    super(spawnThread, size, maxQueue);
  }
}
