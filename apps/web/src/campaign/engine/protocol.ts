import type { Baseline, Goal } from '@dama/campaign';

/** Contrato entre a tela da fase e o motor, que roda num Web Worker (fora da thread da interface). */
export type EngineRequest =
  | {
      readonly type: 'judge';
      readonly fen: string;
      readonly key: string;
      readonly goal: Goal;
      readonly base: Baseline;
      readonly depth: number;
    }
  | { readonly type: 'defend'; readonly fen: string; readonly depth: number }
  | { readonly type: 'ai'; readonly fen: string; readonly level: number }
  | { readonly type: 'hint'; readonly fen: string; readonly depth: number };

export interface Explanation {
  readonly headline: string;
  readonly details: readonly string[];
}

export interface JudgeResult {
  readonly accepted: boolean;
  /** Por que o lance foi recusado, medido no tabuleiro. */
  readonly explanation: Explanation | null;
}

export interface HintResult {
  readonly square: number;
  readonly path: readonly number[];
}

export interface EngineResults {
  readonly judge: JudgeResult;
  readonly defend: string | null;
  readonly ai: string | null;
  readonly hint: HintResult | null;
}

export type ResultOf<R extends EngineRequest> = EngineResults[R['type']];

export type WorkerMessage =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly id: number; readonly ok: false; readonly error: string };
