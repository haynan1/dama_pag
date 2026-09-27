import { Position } from '@dama/engine';
import { profileNameError } from '@dama/protocol';
import { ArrowRight } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useId, useState } from 'react';
import { Board } from '../components/Board.tsx';
import { Button, ui } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { keys } from '../lib/queries.ts';
import s from './Onboarding.module.css';

/** Posição decorativa de meio-jogo, só para ambientar. */
const HERO_FEN = 'W:W21,22,24,25,27,28,29,30,31,K14:B1,2,3,5,6,8,11,12,16';
const HERO_ARROW = Position.fromFen('brazilian', HERO_FEN).legalMoves()[0]!.path;

export function Onboarding() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const errorId = useId();
  const validationError = profileNameError(name);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (validationError) return;
    setBusy(true);
    setError(null);
    try {
      await api.createProfile(name.trim());
      await qc.invalidateQueries({ queryKey: keys.me });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o perfil');
      setBusy(false);
    }
  };

  const fieldError = touched && validationError ? validationError : error;

  return (
    <main className={s.wrap}>
      <section className={s.copy}>
        <p className="eyebrow">Damas · regras brasileiras</p>
        <h1 className={s.title}>
          Jogue. Estude.
          <br />
          <em>Domine o tabuleiro.</em>
        </h1>
        <p className={s.lede}>
          Um adversário que calcula dezenas de lances à frente, um mentor que mostra o porquê de cada jogada e
          um diário de estudo que transforma seus erros em treino.
        </p>
        <form className={s.form} onSubmit={submit} noValidate>
          <div className={ui.field}>
            <label htmlFor={inputId} className={ui.label}>
              Como você quer ser chamado?
            </label>
            <input
              id={inputId}
              className={ui.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
              autoComplete="nickname"
              maxLength={24}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? errorId : undefined}
              placeholder="Seu nome ou apelido"
              // biome-ignore lint/a11y/noAutofocus: campo único da tela de entrada.
              autoFocus
            />
            {fieldError && (
              <p id={errorId} className={ui.error} role="alert">
                {fieldError}
              </p>
            )}
          </div>
          <Button type="submit" variant="primary" size="large" loading={busy}>
            Começar
            <ArrowRight weight="bold" aria-hidden="true" />
          </Button>
          <p className={ui.help}>
            Seu perfil fica salvo neste navegador e no servidor deste PC. Nada sai da sua rede.
          </p>
        </form>
      </section>
      <div className={s.hero} aria-hidden="true" inert>
        <div className={s.heroBoard}>
          <Board
            variant="brazilian"
            fen={HERO_FEN}
            orientation="white"
            movable={null}
            label="Tabuleiro decorativo"
            arrows={[{ path: HERO_ARROW, tone: 'brass' }]}
          />
        </div>
      </div>
    </main>
  );
}
