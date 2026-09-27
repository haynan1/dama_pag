import { judge as judgeMove } from '@dama/campaign';
import { chooseMove, explainMove, hint, moveKey, Position, Searcher } from '@dama/engine';
import type { EngineRequest, EngineResults, ResultOf } from './protocol.ts';

/**
 * Execução das requisições do motor. Roda dentro do Worker; em ambiente sem Worker (testes),
 * roda na mesma thread. Uma única tabela de transposição (~2,5 MB) atende a fase inteira.
 */
let searcher: Searcher | null = null;

function engine(): Searcher {
  searcher ??= new Searcher(18);
  return searcher;
}

export function handle<R extends EngineRequest>(req: R): ResultOf<R> {
  return run(req) as ResultOf<R>;
}

function run(req: EngineRequest): EngineResults[EngineRequest['type']] {
  const pos = Position.fromFen('brazilian', req.fen);
  switch (req.type) {
    case 'judge': {
      const v = judgeMove(engine(), pos, req.key, req.goal, req.base, req.depth);
      if (v.accepted) return { accepted: true, explanation: null };
      const move = pos.legalMoves().find((m) => moveKey(m) === req.key)!;
      const line = { move, score: v.playedScore, pv: [move, ...(v.reply?.pv ?? [])] };
      const insight = explainMove(pos, line, pos.legalMoves().length);
      return { accepted: false, explanation: { headline: insight.headline, details: insight.details } };
    }
    case 'defend': {
      const line = engine().search(pos, { depth: req.depth }).lines[0];
      return line ? moveKey(line.move) : null;
    }
    case 'ai': {
      const decision = chooseMove(engine(), pos, req.level);
      return decision ? moveKey(decision.move) : null;
    }
    case 'hint': {
      const h = hint(engine(), pos, { depth: req.depth });
      return h ? { square: h.square, path: h.best.path } : null;
    }
  }
}
