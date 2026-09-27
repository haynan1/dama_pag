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
  readonly label: string;
}

interface Ghost {
  readonly id: string;
  readonly sq: number;
  readonly piece: number;
  readonly delay: number;
}

const PIECE_NAMES: Record<string, string> = {
  '1': 'pedra branca',
  '2': 'dama branca',
  '-1': 'pedra preta',
  '-2': 'dama preta',
};

export function Board(props: BoardProps) {
  const { variant, fen, orientation, movable, onMove, lastMove, arrows = [], highlight = [], label } = props;
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
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const reducedMotion = useMemo(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: dispara só na troca de posição.
  useLayoutEffect(() => {
    const lastMove = lastMoveRef.current;
    const prev = prevRef.current;
    prevRef.current = { fen, board: position.board.slice() };
    if (!prev || prev.fen === fen || !lastMove || reducedMotion) return;
    const from = lastMove.path[0]!;
    const to = lastMove.path[lastMove.path.length - 1]!;
    // Só anima se a transição corresponde de fato ao último lance.
    if (prev.board[from] === 0 || position.board[to] === 0 || (from !== to && position.board[from] !== 0))
      return;
    const el = pieceRefs.current.get(to);
    const board = boardRef.current;
    if (!el || !board) return;
    const cell = board.clientWidth / size;
    const end = visual(to);
    const hopMs = lastMove.captures.length > 0 ? 190 : 230;
    const frames = lastMove.path.map((sq) => {
      const v = visual(sq);
      return { transform: `translate(${(v.x - end.x) * cell}px, ${(v.y - end.y) * cell}px) scale(1)` };
    });
    // Leve "salto" em cada captura.
    const withLift = frames.flatMap((f, i) =>
      i === 0 || lastMove.captures.length === 0
        ? [f]
        : [{ ...f, transform: f.transform.replace('scale(1)', 'scale(1.08)') }, f],
    );
    const anim = el.animate(withLift, {
      duration: hopMs * (lastMove.path.length - 1),
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    });
    if (lastMove.captures.length > 0) {
      setGhosts(
        lastMove.captures.map((sq, i) => ({
          id: `${fen}:${sq}`,
          sq,
          piece: prev.board[sq]!,
          delay: hopMs * (i + 0.6),
        })),
      );
      const t = setTimeout(() => setGhosts([]), hopMs * (lastMove.captures.length + 2));
      return () => {
        clearTimeout(t);
        anim.cancel();
      };
    }
    return () => anim.cancel();
  }, [fen]);

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
      if (options.length === 1) commit(options[0]!);
      else if (options.length > 1) setCandidates(options);
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
              style={{ ...pieceStyle(g.sq), animationDelay: `${g.delay}ms` }}
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

        <div className={styles.files} aria-hidden="true">
          {files.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
        <div className={styles.ranks} aria-hidden="true">
          {ranks.map((r) => (
            <span key={r}>{r}</span>
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
