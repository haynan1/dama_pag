/// <reference lib="webworker" />
import { Searcher } from '@dama/engine';
import type { AiReply } from '@dama/server/ai/runner';
import { type AiTask, runTask } from '@dama/server/ai/tasks';

/**
 * Uma thread de IA do servidor embutido: a mesma `runTask` das worker threads do servidor.
 * 2^19 entradas na tabela de transposição (≈ 5 MB): metade do servidor, pensando em celular.
 */
const searcher = new Searcher(19);

self.onmessage = (event: MessageEvent<{ id: number; task: AiTask }>) => {
  const { id, task } = event.data;
  let reply: AiReply;
  try {
    reply = { id, ok: true, result: runTask(searcher, task) };
  } catch (err) {
    reply = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(reply);
};
