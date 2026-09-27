import {
  buildLookahead,
  chooseMove,
  formatScore,
  Game,
  Position,
  Searcher,
  type VariantId,
} from '../src/index.ts';

const searcher = new Searcher(20);
for (const variant of ['brazilian', 'international', 'canadian'] as VariantId[]) {
  const pos = Position.initial(variant);
  const r = searcher.search(pos, { timeMs: 2000 });
  console.log(
    `${variant}: depth ${r.depth} nodes ${r.nodes} ${r.timeMs}ms ${Math.round(r.nodes / r.timeMs)}k nps score ${r.lines[0]?.score}`,
  );
}

const t = performance.now();
const la = buildLookahead(searcher, Position.initial('brazilian'), { timeMs: 3000 });
console.log(`lookahead ${Math.round(performance.now() - t)}ms: ${la.summary}`);
for (const n of la.nodes)
  console.log(
    `  ${n.notation} ${formatScore(n.score)} ${n.insight.headline} -> ${n.children.map((c) => `${c.notation}(${formatScore(c.score)})[${c.children.map((g) => g.notation).join(',')}]`).join(' ')}`,
  );

// Partidas IA forte vs fraca: a forte deve vencer.
let strong = 0,
  weak = 0,
  draws = 0;
for (let g = 0; g < 4; g++) {
  const game = Game.create('brazilian');
  const strongIsWhite = g % 2 === 0;
  while (!game.result && game.ply < 200) {
    const whiteToMove = game.turn === 1;
    const level = whiteToMove === strongIsWhite ? 7 : 3;
    const d = chooseMove(searcher, game.position, level)!;
    game.play(d.move);
  }
  const w = game.result?.winner ?? null;
  if (w === null) draws++;
  else if ((w === 1) === strongIsWhite) strong++;
  else weak++;
  console.log(`game ${g}: ${game.result?.reason ?? 'limit'} winner=${w} plies=${game.ply}`);
}
console.log({ strong, weak, draws });
