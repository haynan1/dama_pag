import {
  algebraic,
  type Lookahead,
  type LookaheadNode,
  moveKey,
  Position,
  type VariantId,
} from '@dama/engine';
import { moveDuration, type Pace } from './motion.ts';

/**
 * Encenação de linhas do mentor: em vez de ler "c3-d4, f6-e5", o jogador vê as peças andarem —
 * seu lance, a resposta, a continuação — e o tabuleiro volta sozinho para a posição atual.
 *
 * Tudo aqui é puro (roteiro → quadros); o relógio fica em `usePlayback`.
 */

/** Uma linha a encenar: chaves de lance a partir da posição de origem. */
export interface WatchLine {
  readonly title: string;
  readonly keys: readonly string[];
  /** Explicação do motor para cada lance, quando existir (os três primeiros da árvore). */
  readonly notes?: readonly (string | undefined)[];
}

export type Actor = 'you' | 'them';

export interface Ply {
  readonly actor: Actor;
  readonly piece: 'pedra' | 'dama';
  readonly path: readonly number[];
  readonly captures: readonly number[];
  /** Casas do caminho em notação algébrica (`c3`, `e5`…), para casar com o tabuleiro. */
  readonly squares: readonly string[];
  readonly promotes: boolean;
  readonly note?: string | undefined;
}

export interface Frame {
  readonly fen: string;
  readonly lastMove: { readonly path: readonly number[]; readonly captures: readonly number[] } | null;
  readonly pace: Pace;
  /** Quanto o quadro fica na tela antes do próximo (ms, velocidade normal). */
  readonly hold: number;
  /** Lance em destaque (índice em `Scene.plies`); -1 = posição de origem. */
  readonly ply: number;
  readonly phase: 'intro' | 'play' | 'rewind';
}

export interface Scene {
  readonly title: string;
  readonly plies: readonly Ply[];
  readonly frames: readonly Frame[];
}

/** Lances encenados por linha: três seus e três do adversário. */
export const MAX_PLIES = 6;

const INTRO_HOLD = 900;
const READ_HOLD = 1300;
const END_HOLD = 1100;

/** Folga entre o fim do rebobinar de um lance e o próximo. */
const REWIND_GAP = 60;

export function buildScene(variant: VariantId, fen: string, line: WatchLine, maxPlies = MAX_PLIES): Scene {
  const pos = Position.fromFen(variant, fen);
  const me = pos.side;
  const plies: Ply[] = [];
  const fens = [pos.fen()];

  for (const [i, key] of line.keys.slice(0, maxPlies).entries()) {
    const move = pos.legalMoves().find((m) => moveKey(m) === key);
    // Linha que não se encaixa mais na posição (chegou atrasada): encena até onde é legal.
    if (!move) break;
    const before = pos.board[move.from]!;
    const actor: Actor = pos.side === me ? 'you' : 'them';
    pos.make(move);
    plies.push({
      actor,
      piece: Math.abs(before) === 2 ? 'dama' : 'pedra',
      path: move.path,
      captures: move.captures,
      squares: move.path.map((sq) => algebraic(pos.geo, sq)),
      promotes: Math.abs(before) === 1 && Math.abs(pos.board[move.to]!) === 2,
      note: line.notes?.[i],
    });
    fens.push(pos.fen());
  }

  const frames: Frame[] = [
    { fen: fens[0]!, lastMove: null, pace: 'quick', hold: INTRO_HOLD, ply: -1, phase: 'intro' },
  ];
  plies.forEach((ply, i) => {
    const pace: Pace = ply.actor === 'them' ? 'opponent' : 'own';
    const moving = moveDuration(pace, ply.path.length - 1, ply.captures.length > 0);
    frames.push({
      fen: fens[i + 1]!,
      lastMove: { path: ply.path, captures: ply.captures },
      pace,
      hold: moving + READ_HOLD + (i === plies.length - 1 ? END_HOLD : 0),
      ply: i,
      phase: 'play',
    });
  });
  // Rebobina lance a lance, rápido: o jogador vê de onde cada peça veio até a posição atual.
  for (let i = plies.length - 1; i >= 0; i--) {
    const ply = plies[i]!;
    frames.push({
      fen: fens[i]!,
      lastMove: { path: [...ply.path].reverse(), captures: [] },
      pace: 'quick',
      // O rebobinar não tem capturas a sumir: só o trajeto de volta.
      hold: moveDuration('quick', ply.path.length - 1, false) + REWIND_GAP,
      ply: i,
      phase: 'rewind',
    });
  }
  return { title: line.title, plies, frames };
}

/** Linha completa a partir de um lance de resposta: resposta → sua melhor continuação → … */
function lineThrough(chain: readonly LookaheadNode[]): Pick<WatchLine, 'keys' | 'notes'> {
  const keys = chain.map((n) => n.key);
  const notes: (string | undefined)[] = chain.map((n) => n.insight.headline);
  let tail = chain.at(-1)!;
  while (tail.children[0]) {
    tail = tail.children[0];
    keys.push(tail.key);
    notes.push(tail.insight.headline);
  }
  keys.push(...tail.continuation);
  return { keys, notes };
}

/** Um plano seu contra cada resposta que o motor considerou para o adversário. */
export function linesForCandidate(node: LookaheadNode): WatchLine[] {
  if (node.children.length === 0) return [{ title: `Você joga ${node.notation}`, ...lineThrough([node]) }];
  return node.children.map((reply) => ({
    title: `Se o adversário responder ${reply.notation}`,
    ...lineThrough([node, reply]),
  }));
}

export function lineForReply(node: LookaheadNode, reply: LookaheadNode): WatchLine {
  return { title: `Se o adversário responder ${reply.notation}`, ...lineThrough([node, reply]) };
}

export function lineForFollowUp(node: LookaheadNode, reply: LookaheadNode, follow: LookaheadNode): WatchLine {
  return { title: `Você continua com ${follow.notation}`, ...lineThrough([node, reply, follow]) };
}

/** O que o botão principal assiste: o melhor plano contra todas as respostas do adversário. */
export function bestPlanLines(tree: Lookahead): WatchLine[] {
  const best = tree.nodes[0];
  return best ? linesForCandidate(best) : [];
}
