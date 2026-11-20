import { ArrowRight, ClockCounterClockwise, X } from '@phosphor-icons/react';
import { type FormEvent, useEffect, useId, useState } from 'react';
import ui from '../../components/ui.module.css';
import { Button } from '../../components/ui.tsx';
import { haptic } from '../../platform/haptics.ts';
import {
  displayAddress,
  forgetServer,
  openServer,
  parseServerAddress,
  probeServer,
  recentServers,
  rememberServer,
} from '../../platform/lan.ts';
import s from './campaign.module.css';
import { Sheet } from './Sheet.tsx';

type Phase = { kind: 'idle' } | { kind: 'probing'; origin: string } | { kind: 'opening' };

/**
 * Folha da rede local: leva o app até o servidor Dama de um computador na mesma Wi-Fi, para jogar
 * com outras pessoas. O endereço é conferido antes de sair do app, e o último usado fica a um toque.
 */
export function LanSheet({
  open,
  onClose,
  lost = false,
}: {
  open: boolean;
  onClose: () => void;
  /** Voltou para cá porque a conexão com o servidor caiu (errorPath do Capacitor). */
  lost?: boolean;
}) {
  const inputId = useId();
  const errorId = useId();
  const [recent, setRecent] = useState<string[]>([]);
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setPhase({ kind: 'idle' });
    void recentServers().then((list) => {
      if (!alive) return;
      setRecent(list);
      setAddress((current) => current || (list[0] ? displayAddress(list[0]) : ''));
    });
    // Voltou do servidor pelo botão voltar com a página restaurada do cache: destrava a folha.
    const restored = (e: PageTransitionEvent) => e.persisted && setPhase({ kind: 'idle' });
    window.addEventListener('pageshow', restored);
    return () => {
      alive = false;
      window.removeEventListener('pageshow', restored);
    };
  }, [open]);

  const connect = async (input: string) => {
    const parsed = parseServerAddress(input);
    if (!parsed.ok) {
      setError(parsed.message);
      haptic('error');
      return;
    }
    setError(null);
    setPhase({ kind: 'probing', origin: parsed.origin });
    const result = await probeServer(parsed.origin);
    if (!result.ok) {
      const where = displayAddress(parsed.origin);
      setError(
        result.reason === 'unreachable'
          ? `Nada respondeu em ${where}. Confira se o servidor está aberto no computador e se o celular está na mesma Wi-Fi.`
          : `Há algo em ${where}, mas não é um servidor Dama.`,
      );
      setPhase({ kind: 'idle' });
      haptic('error');
      return;
    }
    await rememberServer(parsed.origin);
    setPhase({ kind: 'opening' });
    openServer(parsed.origin);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void connect(address);
  };

  const forget = async (origin: string) => {
    await forgetServer(origin);
    setRecent((list) => list.filter((o) => o !== origin));
  };

  const busy = phase.kind !== 'idle';
  const probing = phase.kind === 'probing' ? phase.origin : null;

  return (
    <Sheet open={open} onClose={onClose} labelledBy="rede-titulo">
      <p className="eyebrow">Rede local</p>
      <h2 id="rede-titulo" className={s.sheetTitle}>
        Na mesma <em>Wi-Fi</em>
      </h2>
      {lost ? (
        <p className={`${s.sheetLead} ${s.lanLost}`} role="alert">
          A conexão com o servidor caiu. Confira se ele continua aberto no computador e se o celular está na
          mesma rede.
        </p>
      ) : (
        <p className={s.sheetLead}>
          Para jogar com outra pessoa, conecte-se ao servidor Dama de um computador nesta rede. O endereço
          aparece na tela inicial dele.
        </p>
      )}

      {recent.length > 0 && (
        <ul className={s.lanRecent} aria-label="Servidores recentes">
          {recent.map((origin) => (
            <li key={origin} className={s.lanRecentItem}>
              <button
                type="button"
                className={s.settingRow}
                onClick={() => void connect(origin)}
                disabled={busy}
                aria-busy={probing === origin || undefined}
              >
                <span className={s.settingLabel}>
                  <ClockCounterClockwise aria-hidden="true" />
                  <span className="mono">{displayAddress(origin)}</span>
                </span>
                <span className={s.settingHint}>
                  {probing === origin ? 'Procurando…' : <ArrowRight aria-hidden="true" />}
                </span>
              </button>
              <button
                type="button"
                className={s.lanForget}
                onClick={() => void forget(origin)}
                disabled={busy}
                aria-label={`Esquecer ${displayAddress(origin)}`}
              >
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className={s.lanForm} onSubmit={submit} noValidate>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={inputId}>
            Endereço do servidor
          </label>
          <input
            id={inputId}
            className={`${ui.input} mono`}
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              if (error) setError(null);
            }}
            placeholder="192.168.0.12:5810"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            disabled={busy}
          />
          {error && (
            <p id={errorId} className={ui.error} role="alert">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" variant="primary" size="large" block loading={busy}>
          {phase.kind === 'opening' ? 'Abrindo…' : probing ? 'Procurando o servidor…' : 'Conectar'}
        </Button>
      </form>
      <p className={s.fine}>Suas partidas, estudos e campanha deste aparelho continuam aqui.</p>
    </Sheet>
  );
}
