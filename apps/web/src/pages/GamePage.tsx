import { Position, VARIANTS } from '@dama/engine';
import type { Side } from '@dama/protocol';
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowsDownUp,
  CircleNotch,
  Copy,
  CornersIn,
  CornersOut,
  Flag,
  Handshake,
  WifiSlash,
} from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Board, type BoardArrow } from '../components/Board.tsx';
import { EvalBar } from '../components/game/EvalBar.tsx';
import { MentorPanel } from '../components/game/MentorPanel.tsx';
import { MoveList } from '../components/game/MoveList.tsx';
import { PlayerCard } from '../components/game/PlayerCard.tsx';
import { ResultDialog } from '../components/game/ResultDialog.tsx';
import { useToast } from '../components/Toasts.tsx';
import { Badge, Button, Card, Segmented, Skeleton } from '../components/ui.tsx';
import { copyText } from '../lib/clipboard.ts';
import { REASON_LABEL, SIDE_LABEL } from '../lib/format.ts';
import { useFullscreen } from '../lib/fullscreen.ts';
import { useMeta } from '../lib/queries.ts';
import { useGame } from '../lib/useGame.ts';
import s from './GamePage.module.css';

type Tab = 'mentor' | 'moves';

export function GamePage({ id }: { id: string }) {
  const live = useGame(id);
  const { game, display } = live;
  const meta = useMeta();
  const toast = useToast();
  const [flipped, setFlipped] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null);
  const [hintStage, setHintStage] = useState<0 | 1 | 2>(0);
  const [preview, setPreview] = useState<BoardArrow[] | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [dialogClosed, setDialogClosed] = useState(false);
  const fullscreen = useFullscreen({ restore: true });

  // Atalho "F" alterna a tela cheia (fora de campos de texto).
  useEffect(() => {
    if (!fullscreen.supported) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'f' && e.key !== 'F') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      fullscreen.toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen.supported, fullscreen.toggle]);

  // Nova posição: zera dica e prévia.
  const ply = game?.moves.length ?? 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reinicia a cada lance.
  useEffect(() => {
    setHintStage(0);
    setPreview(null);
    setConfirmResign(false);
  }, [ply]);

  const counts = useMemo(() => {
    if (!display || !game) return null;
    const pos = Position.fromFen(game.variant, display.fen);
    return {
      white: { men: pos.counts[0]!, kings: pos.counts[1]! },
      black: { men: pos.counts[2]!, kings: pos.counts[3]! },
    };
  }, [display, game]);

  if (!game || !display || !counts) {
    return (
      <div className={s.layout} aria-busy="true">
        <div className={s.boardCol}>
          <Skeleton height={60} />
          <Skeleton height="min(80vw, 640px)" />
          <Skeleton height={60} />
        </div>
      </div>
    );
  }

  const you = game.you;
  const baseOrientation: Side = you ?? 'white';
  const orientation: Side = flipped ? (baseOrientation === 'white' ? 'black' : 'white') : baseOrientation;
  const top: Side = orientation === 'white' ? 'black' : 'white';
  const bottom: Side = orientation;
  const active = game.status === 'active';
  const yourTurn = active && you !== null && game.turn === you && !game.paused;
  const activeTab: Tab = tab ?? (game.mentor ? 'mentor' : 'moves');
  const lastEval = game.reviews.at(-1)?.evalWhite ?? live.lastReview?.evalWhite ?? 0;
  const showEval = game.mentor || game.status === 'finished';

  const hintArrows: BoardArrow[] =
    live.hint && hintStage === 2 ? [{ path: live.hint.path, tone: 'hint' }] : [];
  const arrows = preview ?? hintArrows;
  const highlight = live.hint && hintStage >= 1 ? [live.hint.square] : [];

  const statusText = (() => {
    if (game.status === 'waiting') return 'Aguardando adversário';
    if (game.result) {
      const r = game.result;
      return r.winner
        ? `${SIDE_LABEL[r.winner]} venceram por ${REASON_LABEL[r.reason]}`
        : `Empate por ${REASON_LABEL[r.reason]}`;
    }
    if (game.paused) return 'Modo estudo — partida pausada';
    if (yourTurn) return 'Sua vez';
    if (game.aiThinking) return 'IA pensando…';
    return `Vez das ${SIDE_LABEL[game.turn].toLowerCase()}`;
  })();

  const player = (side: Side) => (
    <PlayerCard
      side={side}
      player={game.players[side]}
      isYou={you === side}
      toMove={active && game.turn === side}
      thinking={game.aiThinking && game.turn === side}
      pieces={counts[side]}
      clock={game.clock}
      receivedAt={live.receivedAt}
      paused={game.paused}
    />
  );

  const inviteUrls = (meta.data?.lanUrls ?? [location.origin]).map((u) => `${u}/sala/${game.roomCode}`);

  return (
    <div className={s.layout}>
      <div className={s.boardCol}>
        <div className={s.topBar}>
          <Link href="/" className={s.back} aria-label="Voltar ao início">
            <ArrowLeft aria-hidden="true" />
          </Link>
          <div className={s.status} role="status" aria-live="polite">
            <span className={`${s.statusDot} ${yourTurn ? s.statusYou : ''}`} aria-hidden="true" />
            {statusText}
          </div>
          <Badge>
            {VARIANTS[game.variant].name} {VARIANTS[game.variant].short}
          </Badge>
          {live.connection !== 'open' && (
            <Badge tone="warn">
              <WifiSlash aria-hidden="true" /> reconectando
            </Badge>
          )}
          {fullscreen.supported && (
            <button
              type="button"
              className={s.iconButton}
              onClick={fullscreen.toggle}
              aria-pressed={fullscreen.active}
              aria-label="Tela cheia"
              aria-keyshortcuts="F"
              title={fullscreen.active ? 'Sair da tela cheia (F)' : 'Tela cheia (F)'}
            >
              {fullscreen.active ? <CornersIn aria-hidden="true" /> : <CornersOut aria-hidden="true" />}
            </button>
          )}
        </div>

        <div className={s.playerTop}>{player(top)}</div>
        <div className={s.boardRow}>
          {showEval && <EvalBar evalWhite={lastEval} orientation={orientation} />}
          <div className={`${s.boardWrap} ${game.paused ? s.pausedBoard : ''}`}>
            <Board
              variant={game.variant}
              fen={display.fen}
              orientation={orientation}
              movable={yourTurn ? you : null}
              onMove={(key) => live.move(key)}
              lastMove={display.lastMove}
              pace={display.lastMoveByOpponent ? 'opponent' : 'own'}
              arrows={arrows}
              highlight={highlight}
              label={`Tabuleiro ${VARIANTS[game.variant].short}. ${statusText}.`}
            />
            {game.status === 'waiting' && (
              <div className={s.waiting}>
                <p className="eyebrow">Convide alguém da sua rede</p>
                <p className={s.roomCode}>
                  <span className="visually-hidden">Código da sala: </span>
                  {game.roomCode}
                </p>
                <div className={s.inviteList}>
                  {inviteUrls.map((u) => (
                    <button
                      key={u}
                      type="button"
                      className={`${s.invite} mono`}
                      onClick={() =>
                        void copyText(u).then((ok) =>
                          toast(
                            ok ? 'Link copiado' : 'Não foi possível copiar. Selecione e copie manualmente.',
                            ok ? 'success' : 'error',
                          ),
                        )
                      }
                    >
                      {u}
                      <Copy aria-hidden="true" />
                    </button>
                  ))}
                </div>
                <p className={s.waitingNote}>
                  <CircleNotch className={s.spin} aria-hidden="true" /> Aguardando o adversário entrar…
                </p>
                <Button variant="ghost" onClick={() => live.send({ type: 'resign' })}>
                  Cancelar sala
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className={s.playerBottom}>{player(bottom)}</div>

        <div className={s.controls} role="toolbar" aria-label="Ações da partida">
          <Button variant="ghost" onClick={() => setFlipped((f) => !f)} aria-label="Virar tabuleiro">
            <ArrowsDownUp aria-hidden="true" />
            <span className={s.controlLabel}>Virar</span>
          </Button>
          {game.canUndo && (
            <Button variant="ghost" onClick={() => live.send({ type: 'undo' })} aria-label="Desfazer lance">
              <ArrowCounterClockwise aria-hidden="true" />
              <span className={s.controlLabel}>Desfazer</span>
            </Button>
          )}
          {active && you && (
            <>
              <Button
                variant="ghost"
                onClick={() =>
                  live.send({
                    type: 'draw',
                    action: game.drawOffer && game.drawOffer !== you ? 'accept' : 'offer',
                  })
                }
                disabled={game.drawOffer === you}
                aria-label={game.drawOffer && game.drawOffer !== you ? 'Aceitar empate' : 'Propor empate'}
              >
                <Handshake aria-hidden="true" />
                <span className={s.controlLabel}>
                  {game.drawOffer === you ? 'Empate proposto' : game.drawOffer ? 'Aceitar empate' : 'Empate'}
                </span>
              </Button>
              {confirmResign ? (
                <Button variant="danger" onClick={() => live.send({ type: 'resign' })} autoFocus>
                  <Flag weight="fill" aria-hidden="true" /> Confirmar abandono
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmResign(true)} aria-label="Abandonar partida">
                  <Flag aria-hidden="true" />
                  <span className={s.controlLabel}>Abandonar</span>
                </Button>
              )}
            </>
          )}
          {game.drawOffer && game.drawOffer !== you && active && (
            <Button variant="ghost" onClick={() => live.send({ type: 'draw', action: 'decline' })}>
              Recusar empate
            </Button>
          )}
        </div>
      </div>

      <Card className={s.panel}>
        {game.mentorAllowed && (
          <div className={s.tabs}>
            <Segmented
              label="Painel"
              value={activeTab}
              onChange={setTab}
              options={[
                { value: 'mentor', label: 'Mentor' },
                { value: 'moves', label: `Lances · ${Math.ceil(game.moves.length / 2)}` },
              ]}
            />
          </div>
        )}
        {activeTab === 'mentor' && game.mentorAllowed ? (
          <MentorPanel
            game={game}
            yourTurn={yourTurn}
            hint={live.hint}
            tree={live.tree}
            busy={live.busy}
            lastReview={live.lastReview}
            hintStage={hintStage}
            onHintStage={setHintStage}
            onRequestHint={() => live.send({ type: 'hint' })}
            onRequestTree={() => live.send({ type: 'lookahead' })}
            onToggleMentor={(enabled) => live.send({ type: 'mentor', enabled })}
            onPause={(paused) => live.send({ type: 'pause', paused })}
            onPreview={setPreview}
          />
        ) : (
          <MoveList
            moves={game.moves}
            reviews={game.reviews}
            blackStarts={Position.fromFen(game.variant, game.startFen).side === -1}
          />
        )}
        {game.status === 'finished' && (
          <div className={s.finishedBar}>
            <Link href={`/historico/${game.id}`}>Revisão completa com gráfico e explicações →</Link>
          </div>
        )}
      </Card>

      {game.status === 'finished' && game.result && !dialogClosed && (
        <ResultDialog game={game} rewards={live.rewards} onClose={() => setDialogClosed(true)} />
      )}
    </div>
  );
}
