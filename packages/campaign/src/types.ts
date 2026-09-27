import type { Goal } from './goals.ts';
import type { Setup } from './setup.ts';

export type Side = 'white' | 'black';

interface LevelBase {
  /** Identificador estável: é a chave do progresso salvo. Nunca renomeie um id publicado. */
  readonly id: string;
  readonly title: string;
  /** A lição da fase, em uma ou duas frases. Aparece antes de jogar. */
  readonly brief: string;
  /** Dica exibida depois do primeiro erro. */
  readonly tip?: string;
  /** Fases de tutorial não custam vida: ninguém deve perder vida aprendendo a mover uma pedra. */
  readonly free?: boolean;
}

/** Exercício: posição fixa, objetivo medido, defesa perfeita do motor. */
export interface PuzzleLevel extends LevelBase {
  readonly kind: 'puzzle';
  readonly setup: Setup;
  readonly goal: Goal;
  /** Lances do jogador para cumprir o objetivo. */
  readonly maxMoves: number;
}

/** Partida contra a IA (inteira ou a partir de uma posição). */
export interface MatchLevel extends LevelBase {
  readonly kind: 'match';
  readonly ai: number;
  readonly player: Side;
  /** Sem `setup`, a partida começa da posição inicial. */
  readonly setup?: Setup;
  /** Encerra empatada depois deste número de lances do jogador (fases de final). */
  readonly maxMoves?: number;
  /** `draw`: empatar já conclui a fase (contra os níveis mais fortes). Padrão: vencer. */
  readonly goal?: 'win' | 'draw';
}

export type Level = PuzzleLevel | MatchLevel;

export interface Chapter {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  /** Tom visual da região na trilha. */
  readonly tone: 'dawn' | 'forest' | 'ember' | 'dusk' | 'night' | 'gold';
  readonly levels: readonly Level[];
}

export type Stars = 1 | 2 | 3;
