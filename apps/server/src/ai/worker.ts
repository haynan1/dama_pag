import { parentPort } from 'node:worker_threads';
import { Searcher } from '@dama/engine';
import { type AiTask, runTask } from './tasks.ts';

if (!parentPort) throw new Error('worker.ts deve rodar como worker thread');
const port = parentPort;

// 2^20 entradas ≈ 10 MB por thread. A tabela persiste entre tarefas da mesma thread.
const searcher = new Searcher(20);

port.on('message', (msg: { id: number; task: AiTask }) => {
  try {
    const result = runTask(searcher, msg.task);
    port.postMessage({ id: msg.id, ok: true, result });
  } catch (err) {
    port.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
