import {
  isVariantId,
  type Lookahead,
  type Move,
  moveNotation,
  Position,
  type PositionAnalysis,
  VARIANTS,
  type VariantId,
} from '@dama/engine';
import type { Side } from '@dama/protocol';
import {
  ArrowCounterClockwise,
  ArrowsDownUp,
  BookmarkSimple,
  Broom,
  Cpu,
  TreeStructure,
} from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Board, type BoardArrow } from '../components/Board.tsx';
import g from '../components/game/game.module.css';
import { LookaheadTree } from '../components/game/LookaheadTree.tsx';
import { useToast } from '../components/Toasts.tsx';
import { Button, Card, Segmented, Skeleton, ui } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { formatScore } from '../lib/format.ts';
import { keys } from '../lib/queries.ts';
import s from './Analysis.module.css';
import p from './pages.module.css';

interface Step {
  readonly fen: string;
  readonly move: Move | null;
  readonly notation: string | null;
}

function initialFromUrl(): { variant: VariantId; fen: string } {
  const params = new URLSearchParams(location.search);
  const v = params.get('variant');
  const variant: VariantId = isVariantId(v) ? v : 'brazilian';
  const fen = params.get('fen');
  if (fen) {
    try {
      return { variant, fen: Position.fromFen(variant, fen).fen() };
    } catch (err) {
      // FEN inválido na URL: cai para a posição inicial.
      if (!(err instanceof SyntaxError)) throw err;
    }
  }
  return { variant, fen: Position.initial(variant).fen() };
}

/** Tabuleiro livre: jogue os dois lados, peça a análise do motor e a árvore de 3 jogadas. */
export default function Analysis() {
  const toast = useToast();
  const qc = useQueryClient();
  const [start] = useState(initialFromUrl);
  const [variant, setVariant] = useState<VariantId>(start.variant);
  const [steps, setSteps] = useState<Step[]>([{ fen: start.fen, move: null, notation: null }]);
  const [orientation, setOrientation] = useState<Side>(start.fen.startsWith('B') ? 'black' : 'white');
  const [analysis, setAnalysis] = useState<{ fen: string; data: PositionAnalysis } | null>(null);
  const [tree, setTree] = useState<{ fen: string; data: Lookahead } | null>(null);
  const [busy, setBusy] = useState<'analyze' | 'lookahead' | null>(null);
  const [preview, setPreview] = useState<BoardArrow[] | null>(null);
  const [fenInput, setFenInput] = useState('');

  const current = steps.at(-1)!;
  const position = useMemo(() => Position.fromFen(variant, current.fen), [variant, current.fen]);
  const side: Side = position.side === 1 ? 'white' : 'black';
  const over = position.legalMoves().length === 0;
  const liveAnalysis = analysis?.fen === current.fen ? analysis.data : null;
  const liveTree = tree?.fen === current.fen ? tree.data : null;

  const reset = (v: VariantId, fen = Position.initial(v).fen()) => {
    setVariant(v);
    setSteps([{ fen, move: null, notation: null }]);
    setAnalysis(null);
    setTree(null);
    setPreview(null);
  };

  const play = (_key: string, move: Move) => {
    const next = position.clone();
    const notation = moveNotation(position.geo, move);
    next.make(move);
    setSteps((list) => [...list, { fen: next.fen(), move, notation }]);
    setPreview(null);
  };

  const run = async (kind: 'analyze' | 'lookahead') => {
    setBusy(kind);
    try {
      const res = await api.analyze(variant, current.fen, kind);
      if (kind === 'analyze' && res.analysis) setAnalysis({ fen: current.fen, data: res.analysis });
      if (kind === 'lookahead' && res.tree) setTree({ fen: current.fen, data: res.tree });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha na análise', 'error');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    try {
      await api.createStudy({
        variant,
        fen: current.fen,
        title: `Análise livre · ${VARIANTS[variant].name}`,
      });
      toast('Posição salva nos estudos', 'success');
      void qc.invalidateQueries({ queryKey: keys.studies });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível salvar', 'error');
    }
  };

  const loadFen = () => {
    try {
      reset(variant, Position.fromFen(variant, fenInput.trim()).fen());
      setFenInput('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'FEN inválido', 'error');
    }
  };

  const engineArrows: BoardArrow[] = liveAnalysis
    ? liveAnalysis.lines
        .slice(0, 3)
        .map((l, i) => ({ path: l.path, tone: i === 0 ? 'good' : 'brass', faint: i > 0 }))
    : [];

  return (
    <div className={p.page}>
      <header className={p.header}>
        <div>
          <p className="eyebrow">Análise livre</p>
          <h1 className={p.title}>
            Laboratório <em>de posições</em>
          </h1>
          <p className={p.lede}>
            Mova os dois lados, teste ideias e pergunte ao motor. Nada aqui conta para rating.
          </p>
        </div>
        <Segmented
          label="Variante"
          value={variant}
          onChange={(v) => reset(v)}
          options={(['brazilian', 'international', 'canadian'] as const).map((v) => ({
            value: v,
            label: VARIANTS[v].short,
          }))}
        />
      </header>

      <div className={s.layout}>
        <div className={s.boardCol}>
          <Board
            variant={variant}
            fen={current.fen}
            orientation={orientation}
            movable={side}
            onMove={play}
            lastMove={current.move ? { path: current.move.path, captures: current.move.captures } : null}
            arrows={preview ?? engineArrows}
            label={`Tabuleiro de análise. ${side === 'white' ? 'Brancas' : 'Pretas'} jogam.`}
          />
          <div className={s.toolbar} role="toolbar" aria-label="Ferramentas">
            <Button
              variant="ghost"
              onClick={() => setSteps((l) => (l.length > 1 ? l.slice(0, -1) : l))}
              disabled={steps.length < 2}
            >
              <ArrowCounterClockwise aria-hidden="true" /> Voltar
            </Button>
            <Button
              variant="ghost"
              onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
            >
              <ArrowsDownUp aria-hidden="true" /> Virar
            </Button>
            <Button variant="ghost" onClick={() => reset(variant)}>
              <Broom aria-hidden="true" /> Reiniciar
            </Button>
            <Button variant="ghost" onClick={save}>
              <BookmarkSimple aria-hidden="true" /> Salvar
            </Button>
          </div>
        </div>

        <div className={s.side}>
          <Card>
            <div className={p.cardBody}>
              <p className={s.turn}>
                <span className={s.turnDot} data-side={side} aria-hidden="true" />
                {over ? 'Fim: sem lances' : `${side === 'white' ? 'Brancas' : 'Pretas'} jogam`}
              </p>
              <div className={p.row}>
                <Button
                  onClick={() => void run('analyze')}
                  loading={busy === 'analyze'}
                  disabled={over || busy !== null}
                >
                  <Cpu aria-hidden="true" /> Melhores lances
                </Button>
                <Button
                  onClick={() => void run('lookahead')}
                  loading={busy === 'lookahead'}
                  disabled={over || busy !== null}
                >
                  <TreeStructure aria-hidden="true" /> 3 jogadas à frente
                </Button>
              </div>
              {busy === 'analyze' && <Skeleton height={160} />}
              {liveAnalysis && (
                <ol className={s.lines}>
                  {liveAnalysis.lines.map((l) => (
                    <li key={l.key}>
                      <button
                        type="button"
                        className={s.line}
                        onMouseEnter={() => setPreview([{ path: l.path, tone: 'good' }])}
                        onMouseLeave={() => setPreview(null)}
                        onFocus={() => setPreview([{ path: l.path, tone: 'good' }])}
                        onBlur={() => setPreview(null)}
                        onClick={() => {
                          const m = position
                            .legalMoves()
                            .find((x) => moveNotation(position.geo, x) === l.notation);
                          if (m) play(l.key, m);
                        }}
                      >
                        <span
                          className={`${g.score} ${l.score >= 60 ? g.score_good : l.score <= -60 ? g.score_bad : ''} mono`}
                        >
                          {formatScore(l.score)}
                        </span>
                        <span className={s.lineMain}>
                          <strong className="mono">{l.notation}</strong> {l.insight.headline}
                          <span className={s.pv}>{l.pv.slice(1, 7).join('  ')}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              {liveAnalysis && (
                <p className={s.foot}>
                  Profundidade {liveAnalysis.depth} · {(liveAnalysis.nodes / 1000).toFixed(0)} mil posições ·{' '}
                  {(liveAnalysis.timeMs / 1000).toFixed(1)}s
                </p>
              )}
              {busy === 'lookahead' && <Skeleton height={200} />}
              {liveTree && <LookaheadTree tree={liveTree} onPreview={setPreview} />}
            </div>
          </Card>

          {steps.length > 1 && (
            <Card>
              <div className={p.cardBody}>
                <p className="eyebrow">Sequência</p>
                <p className={`${s.sequence} mono`}>
                  {steps
                    .slice(1)
                    .map((st) => st.notation)
                    .join('  ')}
                </p>
              </div>
            </Card>
          )}

          <Card>
            <div className={p.cardBody}>
              <label htmlFor="fen" className={ui.label}>
                Carregar posição (FEN PDN)
              </label>
              <div className={p.row}>
                <input
                  id="fen"
                  className={`${ui.input} mono ${p.grow}`}
                  value={fenInput}
                  onChange={(e) => setFenInput(e.target.value)}
                  placeholder="W:W21-32:B1-12"
                  spellCheck={false}
                />
                <Button onClick={loadFen} disabled={!fenInput.trim()}>
                  Carregar
                </Button>
              </div>
              <p className={`${ui.help} mono`} style={{ overflowWrap: 'anywhere' }}>
                Atual: {current.fen}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
