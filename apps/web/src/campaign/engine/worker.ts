import { handle } from './handlers.ts';
import type { EngineRequest, WorkerMessage } from './protocol.ts';

// Tipagem mínima do escopo do Worker: a lib "webworker" conflita com a "dom" do resto do app.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ id: number; req: EngineRequest }>) => void) | null;
  postMessage(message: WorkerMessage): void;
};

scope.onmessage = (event) => {
  const { id, req } = event.data;
  let message: WorkerMessage;
  try {
    message = { id, ok: true, value: handle(req) };
  } catch (err) {
    message = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  scope.postMessage(message);
};
