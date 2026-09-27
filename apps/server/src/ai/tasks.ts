import {
  type AiDecision,
  analyzePosition,
  buildLookahead,
  chooseMove,
  Game,
  type Hint,
  hint,
  type Lookahead,
  type MoveReview,
  moveKey,
  moveNotation,
  movePdn,
  Position,
  type PositionAnalysis,
  reviewMove,
  type Searcher,
  type VariantId,
} from '@dama/engine';

/** Posição identificada pelo início + lances, para preservar o histórico de repetições. */
interface GameRef {
  readonly variant: VariantId;
  readonly startFen: string;
  readonly moves: readonly string[];
}

export type AiTask =
  | ({ readonly kind: 'ai-move'; readonly level: number; readonly seed: number } & GameRef)
  | ({
      readonly kind: 'review';
      readonly playedKey: string;
      readonly depth: number;
      readonly timeMs: number;
    } & GameRef)
  | ({ readonly kind: 'hint'; readonly depth: number; readonly timeMs: number } & GameRef)
  | ({ readonly kind: 'lookahead'; readonly depth: number; readonly timeMs: number } & GameRef)
  | {
      readonly kind: 'analyze';
      readonly variant: VariantId;
      readonly fen: string;
      readonly multiPv: number;
      readonly depth: number;
      readonly timeMs: number;
    }
  | {
      readonly kind: 'lookahead-fen';
      readonly variant: VariantId;
      readonly fen: string;
      readonly depth: number;
      readonly timeMs: number;
    }
  | {
      readonly kind: 'study-check';
      readonly variant: VariantId;
      readonly fen: string;
      readonly key: string;
      readonly depth: number;
      readonly timeMs: number;
    };

export interface AiMoveResult extends Omit<AiDecision, 'move'> {
  readonly key: string;
  readonly notation: string;
  readonly pdn: string;
}

export interface StudyCheckResult {
  readonly correct: boolean;
  readonly review: MoveReview;
}

export interface AiResults {
  'ai-move': AiMoveResult | null;
  review: MoveReview;
  hint: Hint | null;
  lookahead: Lookahead;
  'lookahead-fen': Lookahead;
  analyze: PositionAnalysis;
  'study-check': StudyCheckResult;
}

export type AiResult<K extends AiTask['kind']> = AiResults[K];

function positionOf(ref: GameRef): Position {
  return Game.replay(ref.variant, ref.startFen, ref.moves).position;
}

function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lance "tão bom quanto o melhor" em um estudo: até 0,3 pedra de diferença e mesmo resultado. */
const STUDY_TOLERANCE = 30;

/** Executa uma tarefa. Puro e síncrono: roda dentro de uma worker thread. */
export function runTask(searcher: Searcher, task: AiTask): AiResults[AiTask['kind']] {
  switch (task.kind) {
    case 'ai-move': {
      const pos = positionOf(task);
      const decision = chooseMove(searcher, pos, task.level, seeded(task.seed));
      if (!decision) return null;
      const { move, ...rest } = decision;
      return {
        ...rest,
        key: moveKey(move),
        notation: moveNotation(pos.geo, move),
        pdn: movePdn(pos.geo, move),
      };
    }
    case 'review':
      return reviewMove(searcher, positionOf(task), task.playedKey, {
        depth: task.depth,
        timeMs: task.timeMs,
      });
    case 'hint':
      return hint(searcher, positionOf(task), { depth: task.depth, timeMs: task.timeMs });
    case 'lookahead':
      return buildLookahead(searcher, positionOf(task), { depth: task.depth, timeMs: task.timeMs });
    case 'lookahead-fen':
      return buildLookahead(searcher, Position.fromFen(task.variant, task.fen), {
        depth: task.depth,
        timeMs: task.timeMs,
      });
    case 'analyze':
      return analyzePosition(searcher, Position.fromFen(task.variant, task.fen), {
        depth: task.depth,
        timeMs: task.timeMs,
        multiPv: task.multiPv,
      });
    case 'study-check': {
      const review = reviewMove(searcher, Position.fromFen(task.variant, task.fen), task.key, {
        depth: task.depth,
        timeMs: task.timeMs,
      });
      const correct =
        review.played.key === review.best.key ||
        (review.bestScore - review.playedScore <= STUDY_TOLERANCE &&
          Math.sign(Math.round(review.bestScore / 100)) === Math.sign(Math.round(review.playedScore / 100)));
      return { correct, review };
    }
  }
}
