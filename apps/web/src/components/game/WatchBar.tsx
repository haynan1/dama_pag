import { ArrowCounterClockwise, Pause, Play, SkipBack, SkipForward, X } from '@phosphor-icons/react';
import { Fragment } from 'react';
import type { Ply } from '../../lib/playback.ts';
import type { Playback } from '../../lib/usePlayback.ts';
import s from './WatchBar.module.css';

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Frase em português simples, com as casas como etiquetas iguais às do tabuleiro. */
function Narration({ ply }: { ply: Ply }) {
  const who = ply.actor === 'you' ? 'Você' : 'O adversário';
  const capture = ply.captures.length > 0;
  const verb = capture
    ? `captura ${plural(ply.captures.length, 'peça', 'peças')} com a ${ply.piece}`
    : `move a ${ply.piece}`;
  return (
    <p className={s.narration}>
      <span className={s.who}>{who}</span> {verb}{' '}
      <span className={s.route}>
        {ply.squares.map((sq, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a mesma casa pode repetir no caminho de uma dama.
          <Fragment key={`${sq}-${i}`}>
            {i > 0 && (
              <>
                <span className={s.arrow} aria-hidden="true">
                  →
                </span>
                <span className="visually-hidden">{capture ? ' até ' : ' para '}</span>
              </>
            )}
            <span className={`${s.square} mono`}>{sq}</span>
          </Fragment>
        ))}
      </span>
      {ply.promotes && <span className={s.promote}> e vira dama!</span>}
    </p>
  );
}

/**
 * Narração da encenação: quem joga, de onde para onde, por quê — e os controles de um player.
 * Fica no lugar dos controles da partida enquanto a encenação roda.
 */
export function WatchBar({ playback }: { playback: Playback }) {
  const { scene, frame, scenes, sceneIndex, paused, speed } = playback;
  if (!scene || !frame) return null;
  const ply = frame.ply >= 0 ? scene.plies[frame.ply] : undefined;
  const actor = frame.phase === 'play' && ply ? ply.actor : 'none';

  return (
    <section className={s.bar} data-actor={actor} aria-label="Assistindo a linha do mentor">
      <header className={s.head}>
        <p className={s.title}>
          <span className={s.eyebrow}>
            {scenes.length > 1 ? `Linha ${sceneIndex + 1} de ${scenes.length}` : 'Assistindo'}
          </span>{' '}
          {scene.title}
        </p>
        <button type="button" className={s.close} onClick={playback.stop} aria-label="Parar e voltar ao jogo">
          <X aria-hidden="true" />
        </button>
      </header>

      <div className={s.stage} aria-live="polite">
        {frame.phase === 'intro' && (
          <p className={s.narration}>
            <span className={s.who}>Observe o tabuleiro.</span> A sequência começa a partir da posição atual.
          </p>
        )}
        {frame.phase === 'play' && ply && (
          <>
            <Narration ply={ply} />
            {ply.note && <p className={s.note}>{ply.note}</p>}
          </>
        )}
        {frame.phase === 'rewind' && (
          <p className={`${s.narration} ${s.rewind}`}>
            <ArrowCounterClockwise aria-hidden="true" /> Voltando à posição atual…
          </p>
        )}
      </div>

      <div className={s.controls}>
        <button
          type="button"
          className={s.control}
          onClick={playback.previous}
          aria-label="Linha anterior"
          title="Linha anterior"
        >
          <SkipBack weight="fill" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`${s.control} ${s.primary}`}
          onClick={playback.togglePause}
          aria-label={paused ? 'Continuar' : 'Pausar'}
          aria-pressed={paused}
        >
          {paused ? <Play weight="fill" aria-hidden="true" /> : <Pause weight="fill" aria-hidden="true" />}
        </button>
        <button
          type="button"
          className={s.control}
          onClick={playback.next}
          disabled={sceneIndex >= scenes.length - 1}
          aria-label="Próxima linha"
          title="Próxima linha"
        >
          <SkipForward weight="fill" aria-hidden="true" />
        </button>
        <ol className={s.pips} aria-label={`Lance ${Math.max(0, frame.ply + 1)} de ${scene.plies.length}`}>
          {scene.plies.map((p, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: os lances da cena são fixos e ordenados.
              key={i}
              className={s.pip}
              data-actor={p.actor}
              data-state={
                frame.phase === 'rewind'
                  ? i < frame.ply
                    ? 'done'
                    : 'idle'
                  : i < frame.ply
                    ? 'done'
                    : i === frame.ply
                      ? 'now'
                      : 'idle'
              }
            />
          ))}
        </ol>

        <button
          type="button"
          className={s.speed}
          onClick={() => playback.setSpeed(speed === 'slow' ? 'normal' : 'slow')}
          aria-pressed={speed === 'slow'}
          title="Mais tempo para ler entre os lances"
        >
          {speed === 'slow' ? 'Devagar' : 'Normal'}
        </button>
      </div>
    </section>
  );
}
