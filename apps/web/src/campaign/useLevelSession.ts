import {
  type Baseline,
  baseline,
  goalReached,
  type Level,
  MAX_MISTAKES,
  matchStars,
  PUZZLE_DEPTH,
  puzzleStars,
  type Side,
  type Stars,
  setupToFen,
} from '@dama/campaign';
import { type Color, Game, Position } from '@dama/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Pace } from '../components/Board.tsx';
import { haptic } from '../platform/haptics.ts';
import { storage } from '../platform/storage.ts';
import { ask } from './engine/client.ts';
import type { Explanation, HintResult } from './engine/protocol.ts';
import { campaign } from './store.ts';

export type Phase = 'loading' | 'player' | 'thinking' | 'refuted' | 'over';

export interface Feedback {
  readonly tone: 'good' | 'bad' | 'info';
  readonly title: string;
  readonly details?: readonly string[];
}

export interface Outcome {
  readonly completed: boolean;
  readonly stars: Stars | null;
  readonly title: string;
  readonly reason: string;
}

export interface LevelSession {
  readonly phase: Phase;
  readonly fen: string;
  readonly lastMove: { readonly path: readonly number[]; readonly captures: readonly number[] } | null;
  readonly pace: Pace;
  readonly player: Side;
  readonly mistakes: number;
  readonly assists: number;
  readonly movesPlayed: number;
  readonly maxMoves: number | null;
  readonly feedback: Feedback | null;
  readonly hint: HintResult | null;
  readonly hintStage: 0 | 1 | 2;
  readonly outcome: Outcome | null;
  readonly canUndo: boolean;
  move(key: string): void;
  requestHint(): void;
  undo(): void;
  /** Abandonar: a fase termina sem conclusão. */
  resign(): void;
}

const SESSION_KEY = 'dama:session';
/** Tempo que o lance recusado fica no tabuleiro antes de voltar (ler o motivo). */
const REFUTE_MS = 1400;
const MATCH_HINT_DEPTH = 10;

interface Saved {
  readonly levelId: string;
  readonly keys: readonly string[];
  readonly mistakes: number;
  readonly assists: number;
}

function startFen(level: Level): string {
  if (level.setup) return setupToFen(level.setup);
  return Position.initial('brazilian').fen();
}

function colorOf(side: Side): Color {
  return side === 'white' ? 1 : -1;
}

function sideOf(level: Level): Side {
  return level.kind === 'puzzle' ? level.setup.toMove : level.player;
}

async function readSaved(levelId: string): Promise<Saved | null> {
  try {
    const raw = await storage.get(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Saved>;
    if (s.levelId !== levelId || !Array.isArray(s.keys)) return null;
    return {
      levelId,
      keys: s.keys.filter((k): k is string => typeof k === 'string').slice(0, 400),
      mistakes: Math.max(0, Math.min(MAX_MISTAKES, Number(s.mistakes) || 0)),
      assists: Math.max(0, Number(s.assists) || 0),
    };
  } catch {
    return null;
  }
}

export function clearSavedSession(): Promise<void> {
  return storage.remove(SESSION_KEY);
}

/**
 * Conduz uma fase: exercício (juiz do motor, defesa perfeita, limite de erros e de lances) ou
 * partida (IA do nível da fase). O resultado é gravado na campanha exatamente uma vez.
 *
 * A partida em andamento é salva a cada lance assentado: se o Android encerrar o app em segundo
 * plano, a fase continua de onde parou — a vida já paga não se perde por isso.
 */
export function useLevelSession(level: Level): LevelSession {
  const player = sideOf(level);
  const me = colorOf(player);
  const fen0 = useMemo(() => startFen(level), [level]);
  const base = useMemo<Baseline>(() => baseline(Position.fromFen('brazilian', fen0)), [fen0]);

  const game = useRef<Game>(Game.create('brazilian', fen0));
  // Geração: respostas do motor de uma jogada anterior (ou de antes de desmontar) são ignoradas.
  const gen = useRef(0);
  const finished = useRef(false);

  const [phase, setPhase] = useState<Phase>('loading');
  const [fen, setFen] = useState(fen0);
  const [lastMove, setLastMove] = useState<LevelSession['lastMove']>(null);
  const [pace, setPace] = useState<Pace>('quick');
  const [mistakes, setMistakes] = useState(0);
  const [assists, setAssists] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hint, setHint] = useState<HintResult | null>(null);
  const [hintStage, setHintStage] = useState<0 | 1 | 2>(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const counters = useRef({ mistakes: 0, assists: 0 });
  counters.current = { mistakes, assists };

  const movesPlayed = game.current.moves.filter((m) => m.side === me).length;
  const maxMoves = level.maxMoves ?? null;

  const sync = useCallback((p: Pace) => {
    const g = game.current;
    const last = g.moves.at(-1);
    setFen(g.position.fen());
    setLastMove(last ? { path: last.move.path, captures: last.move.captures } : null);
    setPace(p);
    setHint(null);
    setHintStage(0);
  }, []);

  const persist = useCallback(() => {
    const saved: Saved = {
      levelId: level.id,
      keys: game.current.moves.map((m) => m.key),
      ...counters.current,
    };
    void storage.set(SESSION_KEY, JSON.stringify(saved));
  }, [level.id]);

  const finish = useCallback(
    (result: Outcome) => {
      if (finished.current) return;
      finished.current = true;
      gen.current++;
      setOutcome(result);
      setPhase('over');
      campaign.finish(level.id, result.completed ? result.stars : null);
      void clearSavedSession();
      haptic(result.completed ? 'success' : 'error');
    },
    [level.id],
  );

  /** Fim natural do jogo (sem lances, empate por regra). */
  const settleGameOver = useCallback((): boolean => {
    const r = game.current.result;
    if (!r) return false;
    const { mistakes: m, assists: a } = counters.current;
    if (level.kind === 'puzzle') {
      const won = r.winner === me;
      finish({
        completed: won,
        stars: won ? puzzleStars({ mistakes: m, hints: a }) : null,
        title: won ? 'Exercício resolvido' : 'Não foi dessa vez',
        reason: won ? 'O adversário ficou sem lances.' : 'A partida terminou antes do objetivo.',
      });
      return true;
    }
    const result = r.winner === null ? 'draw' : r.winner === me ? 'win' : 'loss';
    const stars = matchStars({ result, assists: a, goal: level.goal ?? 'win' });
    finish({
      completed: stars !== null,
      stars,
      title: result === 'win' ? 'Vitória' : result === 'draw' ? 'Empate' : 'Derrota',
      reason:
        result === 'draw'
          ? stars
            ? 'Empate contra um adversário deste nível: objetivo cumprido.'
            : 'Nesta fase é preciso vencer.'
          : result === 'win'
            ? 'O adversário ficou sem lances.'
            : 'Você ficou sem lances.',
    });
    return true;
  }, [finish, level, me]);

  const outOfMoves = useCallback((): boolean => {
    if (maxMoves === null) return false;
    if (game.current.moves.filter((m) => m.side === me).length < maxMoves) return false;
    if (level.kind === 'match') {
      const stars = matchStars({
        result: 'draw',
        assists: counters.current.assists,
        goal: level.goal ?? 'win',
      });
      finish({
        completed: stars !== null,
        stars,
        title: 'Tempo esgotado',
        reason: `O limite de ${maxMoves} lances acabou sem vitória.`,
      });
    } else {
      finish({
        completed: false,
        stars: null,
        title: 'Acabaram os lances',
        reason: `O objetivo precisava ser cumprido em ${maxMoves} ${maxMoves === 1 ? 'lance' : 'lances'}.`,
      });
    }
    return true;
  }, [finish, level, maxMoves, me]);

  const puzzleDone = useCallback((): boolean => {
    if (level.kind !== 'puzzle') return false;
    if (!goalReached(level.goal, game.current.position, base)) return false;
    const { mistakes: m, assists: a } = counters.current;
    finish({
      completed: true,
      stars: puzzleStars({ mistakes: m, hints: a }),
      title: 'Exercício resolvido',
      reason: m + a === 0 ? 'Sem erros e sem ajuda.' : 'Objetivo cumprido.',
    });
    return true;
  }, [base, finish, level]);

  /** Vez do adversário: melhor defesa (exercício) ou IA do nível (partida). */
  const opponent = useCallback(async () => {
    const g = game.current;
    if (g.result || g.turn === me) return;
    const my = ++gen.current;
    setPhase('thinking');
    try {
      const fenNow = g.position.fen();
      const key =
        level.kind === 'puzzle'
          ? await ask({ type: 'defend', fen: fenNow, depth: PUZZLE_DEPTH })
          : await ask({ type: 'ai', fen: fenNow, level: level.ai });
      if (my !== gen.current) return;
      if (key) {
        g.play(key);
        sync('opponent');
      }
      if (puzzleDone() || settleGameOver() || outOfMoves()) return;
      persist();
      setPhase('player');
    } catch (err) {
      if (my !== gen.current) return;
      console.error('[fase] motor falhou', err);
      setFeedback({
        tone: 'bad',
        title: 'O motor não respondeu',
        details: ['Toque em um lance para tentar de novo.'],
      });
      setPhase('player');
    }
  }, [level, me, outOfMoves, persist, puzzleDone, settleGameOver, sync]);

  // Início (ou retomada) da fase. A fase é a identidade da sessão; o resto é estável dentro dela.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reinicia só quando a fase muda.
  useEffect(() => {
    let alive = true;
    finished.current = false;
    void readSaved(level.id).then((saved) => {
      if (!alive) return;
      if (saved && saved.keys.length > 0) {
        try {
          game.current = Game.replay('brazilian', fen0, saved.keys);
          setMistakes(saved.mistakes);
          setAssists(saved.assists);
          counters.current = { mistakes: saved.mistakes, assists: saved.assists };
        } catch {
          // Conteúdo da fase mudou numa atualização: recomeça do início.
          game.current = Game.create('brazilian', fen0);
        }
      } else {
        game.current = Game.create('brazilian', fen0);
      }
      sync('quick');
      if (settleGameOver()) return;
      setPhase('player');
      if (game.current.turn !== me) void opponent();
    });
    return () => {
      alive = false;
      gen.current++;
    };
  }, [level.id]);

  const move = useCallback(
    (key: string) => {
      if (phase !== 'player' || finished.current) return;
      const g = game.current;
      const before = g.position.fen();
      try {
        g.play(key);
      } catch {
        return;
      }
      setFeedback(null);
      sync('own');

      if (level.kind === 'match') {
        if (settleGameOver() || outOfMoves()) return;
        persist();
        void opponent();
        return;
      }

      const my = ++gen.current;
      setPhase('thinking');
      void ask({ type: 'judge', fen: before, key, goal: level.goal, base, depth: PUZZLE_DEPTH })
        .then((verdict) => {
          if (my !== gen.current) return;
          if (verdict.accepted) {
            haptic('tap');
            if (puzzleDone() || settleGameOver()) return;
            void opponent();
            return;
          }
          refute(verdict.explanation, my);
        })
        .catch((err: unknown) => {
          if (my !== gen.current) return;
          console.error('[fase] juiz falhou', err);
          g.undo(1);
          sync('quick');
          setFeedback({ tone: 'bad', title: 'O motor não respondeu', details: ['Tente o lance de novo.'] });
          setPhase('player');
        });

      function refute(explanation: Explanation | null, my: number) {
        const m = counters.current.mistakes + 1;
        setMistakes(m);
        counters.current = { ...counters.current, mistakes: m };
        haptic('error');
        setPhase('refuted');
        setFeedback({
          tone: 'bad',
          title: explanation?.headline ?? 'Há um lance melhor',
          details: [
            ...(explanation?.details.slice(0, 2) ?? []),
            m >= MAX_MISTAKES
              ? 'Terceiro erro: o exercício acabou.'
              : `${MAX_MISTAKES - m} ${MAX_MISTAKES - m === 1 ? 'tentativa restante' : 'tentativas restantes'}.`,
          ],
        });
        setTimeout(() => {
          if (my !== gen.current) return;
          if (m >= MAX_MISTAKES) {
            finish({
              completed: false,
              stars: null,
              title: 'Três erros',
              reason: 'Revise a posição com calma e tente de novo.',
            });
            return;
          }
          g.undo(1);
          sync('quick');
          persist();
          setPhase('player');
        }, REFUTE_MS);
      }
    },
    [base, finish, level, opponent, outOfMoves, persist, phase, puzzleDone, settleGameOver, sync],
  );

  const requestHint = useCallback(() => {
    if (phase !== 'player') return;
    if (hint) {
      setHintStage(2);
      return;
    }
    const my = gen.current;
    const a = counters.current.assists + 1;
    setAssists(a);
    counters.current = { ...counters.current, assists: a };
    const depth = level.kind === 'puzzle' ? PUZZLE_DEPTH : MATCH_HINT_DEPTH;
    void ask({ type: 'hint', fen: game.current.position.fen(), depth })
      .then((h) => {
        if (my !== gen.current || !h) return;
        setHint(h);
        setHintStage(1);
        persist();
      })
      .catch((err: unknown) => console.error('[fase] dica falhou', err));
  }, [hint, level.kind, persist, phase]);

  const canUndo =
    level.kind === 'match' && phase === 'player' && game.current.moves.some((m) => m.side === me);

  const undo = useCallback(() => {
    if (!canUndo) return;
    const g = game.current;
    // Volta até antes do seu último lance (e da resposta da IA, se houver).
    let count = 0;
    for (let i = g.moves.length - 1; i >= 0; i--) {
      count++;
      if (g.moves[i]!.side === me) break;
    }
    g.undo(count);
    const a = counters.current.assists + 1;
    setAssists(a);
    counters.current = { ...counters.current, assists: a };
    gen.current++;
    sync('quick');
    setFeedback(null);
    persist();
  }, [canUndo, me, persist, sync]);

  const resign = useCallback(() => {
    finish({
      completed: false,
      stars: null,
      title: 'Fase abandonada',
      reason: 'A vida desta tentativa foi usada.',
    });
  }, [finish]);

  return {
    phase,
    fen,
    lastMove,
    pace,
    player,
    mistakes,
    assists,
    movesPlayed,
    maxMoves,
    feedback,
    hint,
    hintStage,
    outcome,
    canUndo,
    move,
    requestHint,
    undo,
    resign,
  };
}
