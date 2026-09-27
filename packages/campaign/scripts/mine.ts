/**
 * Mineração de táticas para a trilha: partidas IA × IA com sorteio (semente fixa, reproduzível)
 * e, em cada posição, a pergunta "existe um único lance que ganha material?".
 *   node scripts/mine.ts [partidas] [semente]
 * Saída: JSON com a posição em casas algébricas, o lance-solução e o tema, pronto para curadoria.
 */
import { algebraic, analyzePosition, chooseMove, Game, type Position, Searcher } from '@dama/engine';

const games = Number(process.argv[2] ?? 60);
let seed = Number(process.argv[3] ?? 7);
const random = () => {
  // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function toSetup(pos: Position) {
  const w: string[] = [];
  const b: string[] = [];
  for (let sq = 0; sq < pos.geo.squares; sq++) {
    const p = pos.board[sq]!;
    if (p === 0) continue;
    const name = `${Math.abs(p) === 2 ? 'K' : ''}${algebraic(pos.geo, sq)}`;
    (p > 0 ? w : b).push(name);
  }
  return { white: w.join(' '), black: b.join(' '), toMove: pos.side === 1 ? 'white' : 'black' };
}

const quick = new Searcher(18);
const deep = new Searcher(20);
const found: unknown[] = [];
const seen = new Set<string>();

for (let g = 0; g < games; g++) {
  const game = Game.create('brazilian');
  const levels = [3 + Math.floor(random() * 3), 3 + Math.floor(random() * 3)];
  while (!game.result && game.ply < 120) {
    const pos = game.position;
    const legal = pos.legalMoves();
    if (legal.length >= 3 && !pos.hasCapture() && game.ply >= 6) {
      const q = quick.search(pos, { depth: 7, multiPv: 2 });
      const [a, b] = q.lines;
      if (a && b && a.score - b.score >= 150 && a.score >= 120 && a.score < 2000) {
        const fen = pos.fen();
        if (!seen.has(fen)) {
          seen.add(fen);
          const an = analyzePosition(deep, pos, { depth: 14, multiPv: 2 });
          const [best, second] = an.lines;
          const tags = best?.insight.tags ?? [];
          if (
            best &&
            second &&
            best.score - second.score >= 150 &&
            best.score >= 150 &&
            (tags.includes('combination') || tags.includes('wins-material') || tags.includes('forced-win'))
          ) {
            found.push({
              ...toSetup(pos),
              solution: best.notation,
              pv: best.pv.slice(0, 8).join(' '),
              score: best.score,
              gap: best.score - second.score,
              theme: best.insight.headline,
              pieces: pos.counts[0]! + pos.counts[1]! + pos.counts[2]! + pos.counts[3]!,
            });
          }
        }
      }
    }
    const side = pos.side === 1 ? 0 : 1;
    const d = chooseMove(quick, pos, levels[side]!, random);
    if (!d) break;
    game.play(d.move);
  }
  process.stderr.write(`partida ${g + 1}/${games}: ${found.length} táticas\n`);
}
console.log(JSON.stringify(found, null, 1));
