import { algebraic, geometry, type Move, moveKey, Position, VARIANTS, type VariantId } from '@dama/engine';
import type { Side } from '@dama/protocol';
import { Crown } from '@phosphor-icons/react';
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styles from './Board.module.css';

export type ArrowTone = 'brass' | 'steel' | 'hint' | 'good' | 'bad';

export interface BoardArrow {
  readonly path: readonly number[];
  readonly tone: ArrowTone;
  readonly faint?: boolean;
}

export interface BoardProps {
  readonly variant: VariantId;
  readonly fen: string;
  readonly orientation: Side;
  /** Lado que o usuário pode mover agora (`null` = só visualização). */
  readonly movable: Side | null;
  readonly onMove?: (key: string, move: Move) => void;
  readonly lastMove?: { readonly path: readonly number[]; readonly captures: readonly number[] } | null;
  readonly arrows?: readonly BoardArrow[];
  /** Casas destacadas com anel (ex.: peça sugerida pelo mentor). */
  readonly highlight?: readonly number[];
  /**
   * Ritmo da animação do último lance. Numa partida os lances são encenados: a peça se ergue,
   * percorre cada salto e as capturas somem em sequência. `opponent` ainda dá um respiro antes,
   * separando o lance do adversário do seu; `own` sai na hora, para não parecer atraso ao toque.
   * `quick` é para navegar por lances (revisão, análise).
   */
  readonly pace?: Pace;
  readonly label: string;
}

interface Tempo {
  /** Respiro antes de a peça sair: separa o lance do adversário do seu. */
  readonly beat: number;
  readonly lift: number;
  readonly hop: number;
  /** Parada em cada casa de pouso entre capturas. */
  readonly rest: number;
  readonly land: number;
  readonly vanish: number;
}

export type Pace = 'quick' | 'own' | 'opponent';

const STAGED = {
  simple: { beat: 0, lift: 170, hop: 460, rest: 0, land: 190, vanish: 360 },
  capture: { beat: 0, lift: 170, hop: 400, rest: 130, land: 190, vanish: 360 },
} satisfies Record<string, Tempo>;

const TEMPO: Record<Pace, { simple: Tempo; capture: Tempo }> = {
  quick: {
    simple: { beat: 0, lift: 0, hop: 230, rest: 0, land: 0, vanish: 260 },
    capture: { beat: 0, lift: 0, hop: 190, rest: 0, land: 0, vanish: 260 },
  },
  own: STAGED,
  opponent: {
    simple: { ...STAGED.simple, beat: 260 },
    capture: { ...STAGED.capture, beat: 260 },
  },
};

/** Quanto falta para a animação acabar (ms), incluindo o atraso inicial. */
function remaining(anim: Animation): number {
  const end = Number(anim.effect?.getComputedTiming().endTime ?? 0);
  return Math.max(0, end - Number(anim.currentTime ?? 0));
}

const REST = 'drop-shadow(0 0 0 rgb(0 0 0 / 0))';
const LIFTED = 'drop-shadow(0 14px 12px rgb(0 0 0 / 0.5))';

interface Ghost {
  readonly id: string;
  readonly sq: number;
  readonly piece: number;
  readonly delay: number;
  readonly duration: number;
}

const PIECE_NAMES: Record<string, string> = {
  '1': 'pedra branca',
  '2': 'dama branca',
  '-1': 'pedra preta',
  '-2': 'dama preta',
};

export function Board(props: BoardProps) {
  const {
    variant,
    fen,
    orientation,
    movable,
    onMove,
    lastMove,
    arrows = [],
    highlight = [],
    pace = 'quick',
    label,
  } = props;
  const size = VARIANTS[variant].size;
  const geo = geometry(size);
  const position = useMemo(() => Position.fromFen(variant, fen), [variant, fen]);
  const sideToMove: Side = position.side === 1 ? 'white' : 'black';
  const legal = useMemo(
    () => (movable && movable === sideToMove ? position.legalMoves() : []),
    [position, movable, sideToMove],
  );
  const mustCapture = legal.length > 0 && legal[0]!.captures.length > 0;
  const movableFrom = useMemo(() => new Set(legal.map((m) => m.from)), [legal]);

  const [selected, setSelected] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Move[] | null>(null);
  const [focusSq, setFocusSq] = useState<number>(() => (orientation === 'white' ? 0 : geo.squares - 1));
  const [drag, setDrag] = useState<{ sq: number; x: number; y: number; active: boolean } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const pieceRefs = useRef(new Map<number, HTMLDivElement>());

  // Reinicia seleção quando a posição muda.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `fen` é o gatilho, não um valor lido.
  useEffect(() => {
    setSelected(null);
    setCandidates(null);
  }, [fen]);

  // --- Coordenadas visuais ------------------------------------------------------------------
  const flip = orientation === 'black';
  const visual = useCallback(
    (sq: number) => {
      const r = geo.row[sq]!;
      const c = geo.col[sq]!;
      return flip ? { x: size - 1 - c, y: r } : { x: c, y: size - 1 - r };
    },
    [geo, size, flip],
  );
  const center = (sq: number) => {
    const v = visual(sq);
    return { x: v.x + 0.5, y: v.y + 0.5 };
  };

  // --- Animação do último lance ---------------------------------------------------------------
  const prevRef = useRef<{ fen: string; board: Int8Array } | null>(null);
  // Lido por ref: a animação só deve reiniciar quando a posição muda, não a cada render.
  const lastMoveRef = useRef(lastMove);
  lastMoveRef.current = lastMove;
  const paceRef = useRef(pace);
  paceRef.current = pace;
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  // Animações em curso: o lance seguinte espera o anterior terminar em vez de cortá-lo.
  const animsRef = useRef(new Set<Animation>());
  const ghostTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  // Lance feito arrastando: a peça já está no destino, não volta para refazer o caminho.
  const droppedRef = useRef(false);
  const reducedMotion = useMemo(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useEffect(() => {
    const timers = ghostTimers.current;
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, []);

  const addGhosts = (batch: Ghost[], lifetime: number) => {
    setGhosts((g) => [...g, ...batch]);
    const ids = new Set(batch.map((b) => b.id));
    const timer = setTimeout(() => {
      ghostTimers.current.delete(timer);
      setGhosts((g) => g.filter((x) => !ids.has(x.id)));
    }, lifetime);
    ghostTimers.current.add(timer);
  };

  const finishAll = () => {
    for (const a of animsRef.current) a.finish();
    animsRef.current.clear();
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: dispara só na troca de posição.
  useLayoutEffect(() => {
    const lastMove = lastMoveRef.current;
    const prev = prevRef.current;
    const dropped = droppedRef.current;
    droppedRef.current = false;
    prevRef.current = { fen, board: position.board.slice() };
    if (!prev || prev.fen === fen || !lastMove || reducedMotion) return;
    const from = lastMove.path[0]!;
    const to = lastMove.path[lastMove.path.length - 1]!;
    const el = pieceRefs.current.get(to);
    const board = boardRef.current;
    // Só anima se a transição corresponde de fato ao último lance (desfazer, carregar posição: salta).
    if (
      prev.board[from] === 0 ||
      position.board[to] === 0 ||
      (from !== to && position.board[from] !== 0) ||
      !el ||
      !board
    ) {
      finishAll();
      return;
    }

    const capturing = lastMove.captures.length > 0;
    const captured = (delay: (i: number) => number, vanish: number, lifetime: number) =>
      addGhosts(
        lastMove.captures.map((sq, i) => ({
          id: `${fen}:${sq}`,
          sq,
          piece: prev.board[sq]!,
          delay: delay(i),
          duration: vanish,
        })),
        lifetime,
      );

    if (dropped) {
      finishAll();
      if (capturing) captured(() => 0, 260, 300);
      return;
    }

    // A mesma peça de novo (análise, lances seguidos): encerra a anterior; outra peça: entra na fila.
    let wait = 0;
    for (const a of animsRef.current) {
      if ((a.effect as KeyframeEffect | null)?.target === el) {
        a.finish();
        animsRef.current.delete(a);
      } else wait = Math.max(wait, remaining(a));
    }

    const tempo = TEMPO[paceRef.current][capturing ? 'capture' : 'simple'];
    const hops = lastMove.path.length - 1;
    const cell = board.clientWidth / size;
    const end = visual(to);
    const at = (sq: number, scale: number) => {
      const v = visual(sq);
      return `translate(${(v.x - end.x) * cell}px, ${(v.y - end.y) * cell}px) scale(${scale})`;
    };
    // A peça erguida flutua acima das outras; no ritmo rápido só as capturas dão um leve salto.
    const up = tempo.lift > 0 ? 1.1 : capturing ? 1.08 : 1;

    // Linha do tempo em ms; os offsets saem dela no final.
    const timeline: { t: number; transform: string; filter: string; easing: string }[] = [];
    let t = 0;
    const mark = (transform: string, lifted: boolean, easing: string) =>
      timeline.push({ t, transform, filter: lifted ? LIFTED : REST, easing });
    const HOP_EASE = tempo.lift > 0 ? 'cubic-bezier(0.45, 0, 0.2, 1)' : 'cubic-bezier(0.22, 1, 0.36, 1)';

    if (tempo.lift > 0) {
      mark(at(from, 1), false, 'cubic-bezier(0.2, 0, 0, 1)');
      t += tempo.lift;
    }
    mark(at(from, up), tempo.lift > 0, HOP_EASE);
    const passOver: number[] = [];
    for (let i = 1; i <= hops; i++) {
      passOver.push(t + tempo.hop * 0.55);
      t += tempo.hop;
      const landing = i === hops;
      mark(at(lastMove.path[i]!, landing && tempo.land === 0 ? 1 : up), tempo.lift > 0, HOP_EASE);
      if (!landing && tempo.rest > 0) {
        t += tempo.rest;
        mark(at(lastMove.path[i]!, up), true, HOP_EASE);
      }
    }
    if (tempo.land > 0) {
      timeline[timeline.length - 1]!.easing = 'cubic-bezier(0.34, 1.5, 0.64, 1)';
      t += tempo.land;
      mark(at(to, 1), false, 'linear');
    }

    const duration = Math.max(t, 1);
    const delay = wait + tempo.beat;
    const anim = el.animate(
      timeline.map((f) => ({
        offset: f.t / duration,
        transform: f.transform,
        filter: f.filter,
        easing: f.easing,
        zIndex: 6,
      })),
      // `backwards`: na fila e no respiro inicial a peça segue visível na casa de origem.
      { duration, delay, fill: 'backwards' },
    );
    animsRef.current.add(anim);
    const done = () => animsRef.current.delete(anim);
    anim.onfinish = done;
    anim.oncancel = done;

    if (capturing) captured((i) => delay + (passOver[i] ?? t), tempo.vanish, delay + duration + tempo.vanish);
  }, [fen]);

  // Qualquer interação do usuário tem prioridade: conclui a encenação na hora.
  const skipAnimation = () => {
    if (animsRef.current.size === 0) return;
    finishAll();
    setGhosts([]);
  };

  // --- Interação -------------------------------------------------------------------------------
  const commit = useCallback(
    (move: Move) => {
      setSelected(null);
      setCandidates(null);
      onMove?.(moveKey(move), move);
    },
    [onMove],
  );

  const activate = useCallback(
    (sq: number) => {
      if (candidates) {
        const narrowed = candidates.filter(
          (m) => m.path.slice(1, -1).includes(sq) || m.captures.includes(sq),
        );
        if (narrowed.length === 1) commit(narrowed[0]!);
        else if (narrowed.length > 1) setCandidates(narrowed);
        else setCandidates(null);
        return;
      }
      if (selected !== null) {
        const options = legal.filter((m) => m.from === selected && m.to === sq);
        if (options.length === 1) return commit(options[0]!);
        if (options.length > 1) return setCandidates(options);
      }
      if (movableFrom.has(sq)) setSelected(sq === selected ? null : sq);
      else setSelected(null);
    },
    [candidates, selected, legal, movableFrom, commit],
  );

  const targets = useMemo(() => {
    if (candidates) return new Set(candidates.flatMap((m) => [...m.path.slice(1, -1), ...m.captures]));
    if (selected === null) return new Set<number>();
    return new Set(legal.filter((m) => m.from === selected).map((m) => m.to));
  }, [candidates, selected, legal]);

  const squareFromPoint = (clientX: number, clientY: number): number => {
    const rect = boardRef.current!.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * size);
    const y = Math.floor(((clientY - rect.top) / rect.height) * size);
    const col = flip ? size - 1 - x : x;
    const row = flip ? y : size - 1 - y;
    return geo.squareAt(row, col);
  };

  // Toda interação acontece nos botões das casas (alvo único e semântico); a peça só acompanha
  // o arraste visualmente. Após um arraste, o clique sintético do botão é ignorado.
  const suppressClick = useRef(false);
  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, sq: number) => {
    if (!movableFrom.has(sq) || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ sq, x: e.clientX, y: e.clientY, active: false });
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (!drag.active && moved < 6) return;
    if (!drag.active) setSelected(drag.sq);
    const el = pieceRefs.current.get(drag.sq);
    if (el) el.style.transform = `translate(${e.clientX - drag.x}px, ${e.clientY - drag.y}px) scale(1.08)`;
    if (!drag.active) setDrag({ ...drag, active: true });
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const el = pieceRefs.current.get(drag.sq);
    if (el) el.style.transform = '';
    if (drag.active) {
      suppressClick.current = true;
      const target = squareFromPoint(e.clientX, e.clientY);
      const options = legal.filter((m) => m.from === drag.sq && m.to === target);
      if (options.length === 1) {
        droppedRef.current = true;
        commit(options[0]!);
      } else if (options.length > 1) setCandidates(options);
    }
    setDrag(null);
  };

  // Navegação por teclado entre casas escuras (roving tabindex).
  const squareRefs = useRef(new Map<number, HTMLButtonElement>());
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, sq: number) => {
    const v = visual(sq);
    const step: Record<string, [number, number][]> = {
      ArrowUp: [
        [1, -1],
        [-1, -1],
      ],
      ArrowDown: [
        [1, 1],
        [-1, 1],
      ],
      ArrowLeft: [
        [-2, 0],
        [-1, -1],
        [-1, 1],
      ],
      ArrowRight: [
        [2, 0],
        [1, -1],
        [1, 1],
      ],
    };
    if (e.key === 'Escape') {
      setSelected(null);
      setCandidates(null);
      return;
    }
    const options = step[e.key];
    if (!options) return;
    e.preventDefault();
    for (const [dx, dy] of options) {
      const x = v.x + dx;
      const y = v.y + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const col = flip ? size - 1 - x : x;
      const row = flip ? y : size - 1 - y;
      const next = geo.squareAt(row, col);
      if (next >= 0) {
        setFocusSq(next);
        squareRefs.current.get(next)?.focus();
        return;
      }
    }
  };

  // --- Render ----------------------------------------------------------------------------------
  const last = new Set(lastMove ? [lastMove.path[0]!, lastMove.path[lastMove.path.length - 1]!] : []);
  const highlightSet = new Set(highlight);
  const cells = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const col = flip ? size - 1 - x : x;
      const row = flip ? y : size - 1 - y;
      const sq = geo.squareAt(row, col);
      if (sq < 0) {
        cells.push(<div key={`${x}-${y}`} className={styles.light} aria-hidden="true" />);
        continue;
      }
      const piece = position.board[sq]!;
      const name = `${algebraic(geo, sq)}${piece ? `, ${PIECE_NAMES[String(piece)]}` : ''}`;
      const isTarget = targets.has(sq);
      cells.push(
        <button
          key={sq}
          ref={(el) => {
            if (el) squareRefs.current.set(sq, el);
            else squareRefs.current.delete(sq);
          }}
          type="button"
          className={[
            styles.dark,
            last.has(sq) && styles.last,
            selected === sq && styles.selected,
            isTarget && styles.target,
            isTarget && piece === 0 && styles.targetEmpty,
            movableFrom.has(sq) && styles.grab,
          ]
            .filter(Boolean)
            .join(' ')}
          tabIndex={sq === focusSq ? 0 : -1}
          aria-label={`${name}${selected === sq ? ', selecionada' : ''}${isTarget ? ', destino possível' : ''}`}
          aria-pressed={selected === sq}
          onFocus={() => setFocusSq(sq)}
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            activate(sq);
          }}
          onPointerDown={(e) => onPointerDown(e, sq)}
          onKeyDown={(e) => onKeyDown(e, sq)}
        />,
      );
    }
  }

  const pct = 100 / size;
  const pieceStyle = (sq: number) => {
    const v = visual(sq);
    return { left: `${v.x * pct}%`, top: `${v.y * pct}%`, width: `${pct}%`, height: `${pct}%` };
  };

  const pieceNodes: ReactNode[] = [];
  for (let sq = 0; sq < position.board.length; sq++) {
    const p = position.board[sq]!;
    if (p === 0) continue;
    pieceNodes.push(
      <div
        key={`${sq}:${p}`}
        ref={(el) => {
          if (el) pieceRefs.current.set(sq, el);
          else pieceRefs.current.delete(sq);
        }}
        className={[
          styles.cell,
          movableFrom.has(sq) && mustCapture && styles.mustCapture,
          highlightSet.has(sq) && styles.hinted,
          drag?.sq === sq && drag.active && styles.lifted,
        ]
          .filter(Boolean)
          .join(' ')}
        style={pieceStyle(sq)}
      >
        <Piece value={p} />
      </div>,
    );
  }

  const files = Array.from({ length: size }, (_, i) => 'abcdefghijklmnop'[flip ? size - 1 - i : i]);
  const ranks = Array.from({ length: size }, (_, i) => (flip ? i + 1 : size - i));

  return (
    <div className={styles.frame} data-size={size}>
      <div
        ref={boardRef}
        className={`${styles.board} ${drag?.active ? styles.dragging : ''}`}
        style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
        role="group"
        aria-label={label}
        onPointerDownCapture={skipAnimation}
        onKeyDownCapture={skipAnimation}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
      >
        {cells}

        <div className={styles.pieces} aria-hidden="true">
          {ghosts.map((g) => (
            <div
              key={g.id}
              className={`${styles.cell} ${styles.ghost}`}
              style={{
                ...pieceStyle(g.sq),
                animationDelay: `${g.delay}ms`,
                animationDuration: `${g.duration}ms`,
              }}
            >
              <Piece value={g.piece} />
            </div>
          ))}
          {pieceNodes}
        </div>

        {arrows.length > 0 && (
          <svg className={styles.arrows} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
            <defs>
              {(['brass', 'steel', 'hint', 'good', 'bad'] as const).map((tone) => (
                <marker
                  key={tone}
                  id={`head-${tone}`}
                  viewBox="0 0 10 10"
                  refX="5"
                  refY="5"
                  markerWidth="3.2"
                  markerHeight="3.2"
                  orient="auto-start-reverse"
                >
                  <path d="M0 0 L10 5 L0 10 z" className={styles[`fill_${tone}`]} />
                </marker>
              ))}
            </defs>
            {arrows.map((a, i) => {
              const pts = a.path.map(center);
              const d = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
              return (
                <path
                  // biome-ignore lint/suspicious/noArrayIndexKey: setas podem repetir o mesmo caminho; a ordem é estável.
                  key={`${i}-${a.path.join('.')}`}
                  d={d}
                  className={`${styles.arrow} ${styles[`stroke_${a.tone}`]} ${a.faint ? styles.faint : ''}`}
                  markerEnd={`url(#head-${a.tone})`}
                />
              );
            })}
          </svg>
        )}

        {/* Cor em contraste com a casa sob o rótulo: o canto inferior esquerdo é sempre escuro. */}
        <div className={styles.files} aria-hidden="true">
          {files.map((f, x) => (
            <span key={f} className={x % 2 === 0 ? styles.onDark : styles.onLight}>
              {f}
            </span>
          ))}
        </div>
        <div className={styles.ranks} aria-hidden="true">
          {ranks.map((r, y) => (
            <span key={r} className={(y + size - 1) % 2 === 0 ? styles.onDark : styles.onLight}>
              {r}
            </span>
          ))}
        </div>
      </div>
      {candidates && (
        <p className={styles.disambiguate} role="status">
          Mais de um caminho de captura chega aqui. Toque em uma casa do caminho desejado.
        </p>
      )}
    </div>
  );
}

export function Piece({ value }: { value: number }) {
  const white = value > 0;
  const king = Math.abs(value) === 2;
  return (
    <div className={`${styles.piece} ${white ? styles.ivory : styles.ebony}`}>
      <div className={styles.inner}>{king && <Crown weight="fill" className={styles.crown} />}</div>
    </div>
  );
}
