import { now } from './clock.ts';
import { algebraic, moveNotation } from './notation.ts';
import { type Color, moveKey, type Position, WHITE } from './position.ts';
import { isMateScore, type Line, mateDistance, type Searcher, type SearchLimits } from './search.ts';

// -------------------------------------------------------------------------------------------------
// Classificação de lances
// -------------------------------------------------------------------------------------------------

export type Classification =
  | 'brilliant'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'forced';

export const CLASSIFICATION_LABEL: Readonly<Record<Classification, string>> = {
  brilliant: 'Golpe brilhante',
  best: 'Melhor lance',
  excellent: 'Excelente',
  good: 'Bom',
  inaccuracy: 'Imprecisão',
  mistake: 'Erro',
  blunder: 'Erro grave',
  forced: 'Forçado',
};

/** Probabilidade esperada de pontos (0..1) para quem joga, a partir da pontuação. */
export function winProbability(score: number): number {
  if (isMateScore(score)) return score > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-score / 180));
}

/** Precisão do lance (0..100) pela perda de probabilidade, no estilo das ferramentas de análise modernas. */
export function moveAccuracy(bestScore: number, playedScore: number): number {
  const loss = Math.max(0, winProbability(bestScore) - winProbability(playedScore)) * 100;
  return Math.max(0, Math.min(100, 103.17 * Math.exp(-0.0435 * loss) - 3.17));
}

export function classify(
  bestScore: number,
  playedScore: number,
  legalMoves: number,
  sacrifice: boolean,
): Classification {
  if (legalMoves === 1) return 'forced';
  const loss = Math.max(0, winProbability(bestScore) - winProbability(playedScore));
  if (loss <= 0.005) return sacrifice && playedScore > -50 ? 'brilliant' : 'best';
  if (loss <= 0.03) return 'excellent';
  if (loss <= 0.07) return 'good';
  if (loss <= 0.13) return 'inaccuracy';
  if (loss <= 0.25) return 'mistake';
  return 'blunder';
}

/** Pontuação legível: `+1.3`, `-0.4`, `V7` (vitória forçada em 7 plies), `D4` (derrota). */
export function formatScore(score: number): string {
  if (isMateScore(score)) {
    const plies = mateDistance(score);
    return plies > 0 ? `V${plies}` : `D${-plies}`;
  }
  const v = Math.round(score / 10) / 10;
  if (v === 0) return '0.0';
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
}

// -------------------------------------------------------------------------------------------------
// Explicações do mentor
// -------------------------------------------------------------------------------------------------

export type InsightTag =
  | 'capture'
  | 'multi-capture'
  | 'promotion'
  | 'sacrifice'
  | 'exchange'
  | 'combination'
  | 'threat'
  | 'hangs'
  | 'wins-material'
  | 'loses-material'
  | 'center'
  | 'weakens-base'
  | 'main-diagonal'
  | 'only-move'
  | 'winning'
  | 'losing'
  | 'forced-win'
  | 'forced-loss';

export interface Insight {
  readonly tags: readonly InsightTag[];
  /** Frase principal, curta. */
  readonly headline: string;
  /** Observações adicionais em ordem de relevância. */
  readonly details: readonly string[];
}

function materialOf(pos: Position, color: Color): number {
  const kingValue = pos.rules.kingValue / 100;
  return color === WHITE
    ? pos.counts[0]! + pos.counts[1]! * kingValue
    : pos.counts[2]! + pos.counts[3]! * kingValue;
}

function balance(pos: Position, color: Color): number {
  return materialOf(pos, color) - materialOf(pos, -color as Color);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Explica um lance a partir de fatos verificáveis do tabuleiro e da linha principal calculada
 * pelo motor. Nada é inventado: cada frase corresponde a uma condição medida.
 */
export function explainMove(root: Position, line: Line, legalMoves: number): Insight {
  const pos = root.clone();
  const geo = pos.geo;
  const mover = pos.side;
  const move = line.move;
  const tags: InsightTag[] = [];
  const details: string[] = [];
  const startBalance = balance(pos, mover);

  const kingsTaken = move.captures.filter((c) => Math.abs(pos.board[c]!) === 2).length;
  const fromRow = geo.row[move.from]!;
  const movedMan = Math.abs(pos.board[move.from]!) === 1;
  const ownBase = mover === WHITE ? 0 : geo.size - 1;

  pos.make(move);
  const opponentMustCapture = pos.hasCapture(pos.side);
  const threatens = !opponentMustCapture && pos.hasCapture(mover);

  // Saldo de material ao longo da linha principal (até 8 plies), medido só em posições
  // quietas: no meio de uma troca o saldo engana.
  let horizon = 0;
  let quietBalance = pos.hasCapture(pos.side) ? Number.NaN : balance(pos, mover);
  let plies = 0;
  for (const m of line.pv.slice(1, 9)) {
    const legal = pos.legalMoves().some((x) => moveKey(x) === moveKey(m));
    if (!legal) break;
    pos.make(m);
    plies++;
    if (!pos.hasCapture(pos.side)) {
      quietBalance = balance(pos, mover);
      horizon = plies;
    }
  }
  const swing = Number.isNaN(quietBalance) ? 0 : Math.round((quietBalance - startBalance) * 10) / 10;

  if (legalMoves === 1) {
    tags.push('only-move');
    details.push(
      move.captures.length > 0 ? 'Captura obrigatória: é o único lance legal.' : 'Único lance legal.',
    );
  }

  if (move.captures.length > 0) {
    tags.push(move.captures.length >= 2 ? 'multi-capture' : 'capture');
    const what =
      kingsTaken > 0
        ? `${plural(move.captures.length, 'peça', 'peças')} (${plural(kingsTaken, 'dama', 'damas')})`
        : plural(move.captures.length, 'pedra', 'pedras');
    details.push(`Captura ${what}.`);
  }
  if (move.promotes) {
    tags.push('promotion');
    details.push(`Coroa em ${algebraic(geo, move.to)}: nova dama.`);
  }

  if (opponentMustCapture && move.captures.length > 0 && swing >= 0) {
    // Capturou e o adversário recaptura sem ganhar material: é troca, não sacrifício.
    tags.push('exchange');
    details.push('Troca de peças: o adversário é obrigado a recapturar.');
  } else if (opponentMustCapture) {
    if (swing >= 0 && line.score > -60) {
      tags.push(swing > 0 ? 'combination' : 'sacrifice');
      details.push(
        swing > 0
          ? `Entrega peça de propósito: o adversário é obrigado a capturar e a linha termina com +${swing} de material.`
          : 'Entrega peça para forçar a troca: o adversário é obrigado a capturar.',
      );
    } else {
      tags.push('hangs');
      details.push('Deixa peça ao alcance: o adversário é obrigado a capturar e sai ganhando material.');
    }
  } else if (threatens) {
    tags.push('threat');
    details.push('Cria uma ameaça de captura para o próximo lance.');
  }

  if (!opponentMustCapture && horizon >= 2) {
    if (swing >= 1) {
      tags.push('wins-material');
      details.push(
        `Ganha material na sequência: ${swing > 0 ? '+' : ''}${swing} em ${plural(horizon, 'lance', 'lances')}.`,
      );
    } else if (swing <= -1) {
      tags.push('loses-material');
      details.push(`A sequência custa material: ${swing} em ${plural(horizon, 'lance', 'lances')}.`);
    }
  }

  if (movedMan && fromRow === ownBase && move.captures.length === 0 && pos.pieceCount(mover) > geo.half * 2) {
    tags.push('weakens-base');
    details.push('Tira uma pedra da base: abre caminho para o adversário coroar.');
  }
  if (!movedMan && geo.mainDiagonal[move.to] === 1 && !geo.mainDiagonal[move.from]) {
    tags.push('main-diagonal');
    details.push('Ocupa a grande diagonal, a linha mais importante para as damas.');
  }
  const col = geo.col[move.to]!;
  const row = geo.row[move.to]!;
  const centerCol = col >= geo.size / 2 - 2 && col <= geo.size / 2 + 1;
  const centerRow = row >= geo.size / 2 - 2 && row <= geo.size / 2 + 1;
  if (movedMan && centerCol && centerRow && move.captures.length === 0) {
    tags.push('center');
    details.push('Reforça o centro, ganhando espaço e mobilidade.');
  }

  if (isMateScore(line.score)) {
    const plies = mateDistance(line.score);
    tags.push(plies > 0 ? 'forced-win' : 'forced-loss');
    details.unshift(
      plies > 0
        ? `Vitória forçada em ${plural(Math.ceil(plies / 2), 'lance', 'lances')}.`
        : `Derrota forçada em ${plural(Math.ceil(-plies / 2), 'lance', 'lances')}, mesmo com a melhor defesa.`,
    );
  } else if (line.score >= 150) tags.push('winning');
  else if (line.score <= -150) tags.push('losing');

  return { tags, headline: headlineFor(tags, line.score), details };
}

function headlineFor(tags: readonly InsightTag[], score: number): string {
  const has = (t: InsightTag) => tags.includes(t);
  if (has('forced-win')) return 'Vitória forçada';
  if (has('combination')) return 'Golpe: sacrifício que ganha material';
  if (has('promotion')) return 'Coroação';
  if (has('multi-capture')) return 'Captura múltipla';
  if (has('hangs')) return 'Entrega material';
  if (has('forced-loss')) return 'Posição perdida';
  if (has('sacrifice')) return 'Sacrifício posicional';
  if (has('exchange')) return 'Troca de peças';
  if (has('wins-material')) return 'Ganha material';
  if (has('threat')) return 'Cria ameaça';
  if (has('capture')) return 'Captura';
  if (has('loses-material')) return 'Perde material';
  if (has('main-diagonal')) return 'Domina a grande diagonal';
  if (has('center')) return 'Controle do centro';
  if (score >= 150) return 'Mantém a vantagem';
  if (score <= -150) return 'Defesa difícil';
  return 'Lance posicional';
}

// -------------------------------------------------------------------------------------------------
// Serviços do mentor
// -------------------------------------------------------------------------------------------------

export interface AnalyzedLine {
  readonly key: string;
  readonly notation: string;
  readonly path: readonly number[];
  readonly captures: readonly number[];
  readonly score: number;
  readonly pv: readonly string[];
  readonly pvKeys: readonly string[];
  readonly insight: Insight;
}

export interface PositionAnalysis {
  readonly depth: number;
  readonly nodes: number;
  readonly timeMs: number;
  readonly legalMoves: number;
  readonly lines: readonly AnalyzedLine[];
}

function describeLines(pos: Position, lines: readonly Line[], legalMoves: number): AnalyzedLine[] {
  return lines.map((line) => {
    const walker = pos.clone();
    const pv: string[] = [];
    const pvKeys: string[] = [];
    for (const m of line.pv) {
      pv.push(moveNotation(walker.geo, m));
      pvKeys.push(moveKey(m));
      walker.make(m);
    }
    return {
      key: moveKey(line.move),
      notation: moveNotation(pos.geo, line.move),
      path: line.move.path,
      captures: line.move.captures,
      score: line.score,
      pv,
      pvKeys,
      insight: explainMove(pos, line, legalMoves),
    };
  });
}

/** Analisa a posição e devolve as melhores linhas explicadas. */
export function analyzePosition(searcher: Searcher, pos: Position, limits: SearchLimits): PositionAnalysis {
  const legal = pos.legalMoves().length;
  const result = searcher.search(pos, limits);
  return {
    depth: result.depth,
    nodes: result.nodes,
    timeMs: result.timeMs,
    legalMoves: legal,
    lines: describeLines(pos, result.lines, legal),
  };
}

export interface MoveReview {
  readonly classification: Classification;
  readonly accuracy: number;
  readonly playedScore: number;
  readonly bestScore: number;
  readonly best: AnalyzedLine;
  readonly played: AnalyzedLine;
  readonly depth: number;
}

/** Avalia o lance jogado comparando com o melhor lance da posição anterior. */
export function reviewMove(
  searcher: Searcher,
  before: Position,
  playedKey: string,
  limits: SearchLimits,
): MoveReview {
  const legal = before.legalMoves();
  const multiPv = Math.min(legal.length, 32);
  const result = searcher.search(before, { ...limits, multiPv });
  let lines = result.lines;
  if (!lines.some((l) => moveKey(l.move) === playedKey)) {
    const move = legal.find((m) => moveKey(m) === playedKey);
    if (!move) throw new Error('Lance não pertence à posição');
    const child = before.clone();
    child.make(move);
    const reply = searcher.search(child, {
      ...limits,
      depth: Math.max(1, (limits.depth ?? result.depth) - 1),
    });
    const score = reply.lines[0] ? -reply.lines[0].score : 0;
    lines = [...lines, { move, score, pv: [move, ...(reply.lines[0]?.pv ?? [])] }];
  }
  const described = describeLines(before, lines, legal.length);
  const best = described[0]!;
  const played = described.find((l) => l.key === playedKey)!;
  const sacrifice = played.insight.tags.includes('combination') || played.insight.tags.includes('sacrifice');
  return {
    classification: classify(best.score, played.score, legal.length, sacrifice),
    accuracy: Math.round(moveAccuracy(best.score, played.score) * 10) / 10,
    playedScore: played.score,
    bestScore: best.score,
    best,
    played,
    depth: result.depth,
  };
}

export interface LookaheadNode {
  readonly key: string;
  readonly notation: string;
  readonly path: readonly number[];
  readonly captures: readonly number[];
  readonly side: Color;
  /** Pontuação do ponto de vista de quem pediu a análise. */
  readonly score: number;
  readonly insight: Insight;
  /**
   * Linha principal do motor depois deste lance (chaves de lance). Nos nós finais da árvore é o
   * que permite encenar a sequência além das três jogadas.
   */
  readonly continuation: readonly string[];
  readonly children: readonly LookaheadNode[];
}

export interface Lookahead {
  readonly rootSide: Color;
  readonly depth: number;
  readonly timeMs: number;
  readonly nodes: readonly LookaheadNode[];
  /** Melhor sequência de três lances (seu, do adversário, seu). */
  readonly bestLine: readonly string[];
  readonly summary: string;
}

export interface LookaheadOptions {
  /** Lances considerados em cada nível: [seus, respostas, seus]. */
  readonly breadth?: readonly [number, number, number];
  readonly depth?: number;
  readonly timeMs?: number;
}

/**
 * Árvore de três jogadas: seus melhores lances, as melhores respostas do adversário a cada um
 * e sua melhor continuação. Cada nó traz pontuação (sempre do seu ponto de vista) e explicação.
 */
export function buildLookahead(
  searcher: Searcher,
  root: Position,
  options: LookaheadOptions = {},
): Lookahead {
  const started = now();
  const [b1, b2, b3] = options.breadth ?? [4, 3, 2];
  const depth = options.depth ?? 10;
  const budget = options.timeMs ?? 3000;
  const me = root.side;

  const level = (
    pos: Position,
    breadth: number,
    d: number,
    time: number,
    remaining: number,
  ): LookaheadNode[] => {
    if (breadth <= 0 || pos.legalMoves().length === 0) return [];
    const analysis = analyzePosition(searcher, pos, {
      depth: Math.max(1, d),
      timeMs: time,
      multiPv: breadth,
    });
    return analysis.lines.map((line) => {
      const child = pos.clone();
      const move = pos.legalMoves().find((m) => moveKey(m) === line.key)!;
      child.make(move);
      const children =
        remaining > 0 ? level(child, remaining === 2 ? b2 : b3, d - 1, time / 2, remaining - 1) : [];
      return {
        key: line.key,
        notation: line.notation,
        path: line.path,
        captures: line.captures,
        side: pos.side,
        score: pos.side === me ? line.score : -line.score,
        insight: line.insight,
        continuation: line.pvKeys.slice(1),
        children,
      };
    });
  };

  const perSearch = budget / (1 + b1 + b1 * b2);
  const nodes = level(root, b1, depth, perSearch * 1.5, 2);

  const bestLine: string[] = [];
  let cursor: readonly LookaheadNode[] = nodes;
  while (cursor.length > 0) {
    const pick = cursor[0]!;
    bestLine.push(pick.notation);
    cursor = pick.children;
  }

  return {
    rootSide: me,
    depth,
    timeMs: Math.round(now() - started),
    nodes,
    bestLine,
    summary: summarize(nodes),
  };
}

function summarize(nodes: readonly LookaheadNode[]): string {
  const best = nodes[0];
  if (!best) return 'Nenhum lance disponível.';
  const reply = best.children[0];
  const parts = [`Melhor plano: ${best.notation} (${formatScore(best.score)}).`];
  if (reply) parts.push(`A resposta mais forte do adversário é ${reply.notation}.`);
  const second = nodes[1];
  if (second && best.score - second.score >= 120) {
    parts.push(`As alternativas são bem piores: ${second.notation} fica em ${formatScore(second.score)}.`);
  } else if (second) {
    parts.push(`${second.notation} é uma alternativa próxima (${formatScore(second.score)}).`);
  }
  const risky = nodes.find((n) => n.insight.tags.includes('hangs'));
  if (risky) parts.push(`Cuidado com ${risky.notation}: entrega material.`);
  return parts.join(' ');
}

export interface Hint {
  /** Primeiro nível: só a peça a mover. */
  readonly square: number;
  readonly squareName: string;
  readonly best: AnalyzedLine;
  readonly alternatives: readonly AnalyzedLine[];
  readonly depth: number;
}

export function hint(searcher: Searcher, pos: Position, limits: SearchLimits): Hint | null {
  const analysis = analyzePosition(searcher, pos, { ...limits, multiPv: 3 });
  const best = analysis.lines[0];
  if (!best) return null;
  const square = best.path[0]!;
  return {
    square,
    squareName: algebraic(pos.geo, square),
    best,
    alternatives: analysis.lines.slice(1),
    depth: analysis.depth,
  };
}
