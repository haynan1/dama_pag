/** Smoke test ponta a ponta contra um servidor rodando: `node scripts/smoke.ts http://localhost:5810` */
import { moveKey, Position } from '@dama/engine';
import WebSocket from 'ws';

const base = process.argv[2] ?? 'http://localhost:5810';
const headers = { origin: base, 'content-type': 'application/json' };
const res = await fetch(`${base}/api/profiles`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ name: 'Smoke' }),
});
const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
const game = await (
  await fetch(`${base}/api/games`, {
    method: 'POST',
    headers: { ...headers, cookie },
    body: JSON.stringify({
      mode: 'ai',
      variant: 'brazilian',
      level: 10,
      color: 'white',
      mentor: true,
      timeControl: null,
    }),
  })
).json();
const ws = new WebSocket(`${base.replace('http', 'ws')}/ws`, { headers: { origin: base, cookie } });
await new Promise((r) => ws.once('open', r));
const t0 = { v: 0 };
let fen = '';
let plies = 0;
const done = new Promise<void>((resolve) => {
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (
      m.type === 'state' &&
      m.game.turn === 'white' &&
      m.game.moves.length > plies - 1 &&
      m.game.moves.length % 2 === 0 &&
      m.game.fen !== fen
    ) {
      if (plies > 0)
        console.log(`IA (nível 10) respondeu ${m.game.moves.at(-1).notation} em ${Date.now() - t0.v}ms`);
      fen = m.game.fen;
      if (m.game.moves.length >= 6) {
        t0.v = Date.now();
        ws.send(JSON.stringify({ type: 'lookahead', gameId: game.id }));
        return;
      }
      const key = moveKey(Position.fromFen('brazilian', fen).legalMoves()[0]!);
      plies = m.game.moves.length + 2;
      t0.v = Date.now();
      ws.send(JSON.stringify({ type: 'move', gameId: game.id, ply: m.game.moves.length, key }));
    }
    if (m.type === 'review')
      console.log(`revisão do lance ${m.review.ply}: ${m.review.classification} — ${m.review.headline}`);
    if (m.type === 'lookahead') {
      console.log(
        `árvore de 3 jogadas em ${Date.now() - t0.v}ms (profundidade ${m.tree.depth}): ${m.tree.summary}`,
      );
      console.log(`  melhor linha: ${m.tree.bestLine.join(' → ')}`);
      resolve();
    }
    if (m.type === 'error') console.log('erro', m);
  });
});
ws.send(JSON.stringify({ type: 'subscribe', gameId: game.id }));
await done;
ws.close();
