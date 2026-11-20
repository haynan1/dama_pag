/// <reference lib="webworker" />
import { type AiReply, type AiWorkerHandle, WorkerPool } from '@dama/server/ai/runner';
import { createEmbeddedServer, type EmbeddedConnection, type EmbeddedServer } from '@dama/server/embedded';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { FromServer, ToServer } from './protocol.ts';
import { WasmDatabase } from './wasm-database.ts';

/**
 * O servidor do Dama dentro do app: um Web Worker com o SQLite (WebAssembly, persistido no OPFS)
 * e a IA em Web Workers próprios. A interface fala com ele como falaria com o servidor da rede.
 */

const post = (message: FromServer) => self.postMessage(message);

const log = {
  info() {},
  warn: (obj: unknown, msg?: string) => console.warn(msg ?? 'aviso', obj),
  error: (obj: unknown, msg?: string) => console.error(msg ?? 'erro', obj),
};

function spawnAiWorker(): AiWorkerHandle {
  const worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module', name: 'ia' });
  let live = true;
  return {
    post: (message) => worker.postMessage(message),
    onMessage(listener) {
      worker.addEventListener('message', (e: MessageEvent<AiReply>) => live && listener(e.data));
    },
    onFailure(listener) {
      worker.addEventListener('error', (e) => {
        e.preventDefault();
        if (live) listener(new Error(e.message || 'A IA parou inesperadamente'));
      });
    },
    async terminate() {
      live = false;
      worker.terminate();
    },
  };
}

/** Celular: 1–2 threads de IA. Deixa núcleos para a interface e para o próprio servidor. */
function aiThreads(): number {
  const cores = navigator.hardwareConcurrency || 2;
  return Math.max(1, Math.min(2, cores - 2));
}

async function openDatabase(): Promise<{ db: WasmDatabase; persistent: boolean }> {
  const sqlite3 = await sqlite3InitModule();
  try {
    const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'dama', preserveOnInitFailure: true });
    return { db: new WasmDatabase(new pool.OpfsSAHPoolDb('/dama.db')), persistent: true };
  } catch (err) {
    // WebView antiga sem OPFS: o app funciona, mas o progresso vale só até fechar. A interface avisa.
    console.error('OPFS indisponível; usando banco em memória', err);
    return { db: new WasmDatabase(new sqlite3.oo1.DB(':memory:', 'c')), persistent: false };
  }
}

const queue: ToServer[] = [];
let server: EmbeddedServer | null = null;
const connections = new Map<number, EmbeddedConnection>();

async function handle(msg: ToServer): Promise<void> {
  const s = server!;
  switch (msg.kind) {
    case 'request': {
      const res = await s.handle({ method: msg.method, url: msg.url, body: msg.body });
      post({ kind: 'response', id: msg.id, ...res });
      return;
    }
    case 'open': {
      const conn = msg.conn;
      connections.set(
        conn,
        s.connect((message) => post({ kind: 'push', conn, message })),
      );
      return;
    }
    case 'message':
      connections.get(msg.conn)?.receive(msg.data);
      return;
    case 'close':
      connections.get(msg.conn)?.close();
      connections.delete(msg.conn);
      return;
  }
}

self.onmessage = (event: MessageEvent<ToServer>) => {
  if (!server) queue.push(event.data);
  else void handle(event.data);
};

try {
  const { db, persistent } = await openDatabase();
  server = createEmbeddedServer({ db, ai: new WorkerPool(spawnAiWorker, aiThreads()), log });
  post({ kind: 'ready', persistent });
  for (const msg of queue.splice(0)) void handle(msg);
} catch (err) {
  console.error('servidor embutido não iniciou', err);
  post({ kind: 'fatal', message: err instanceof Error ? err.message : String(err) });
}
