import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '../../components/ui.tsx';
import { simulatedAd } from '../../platform/ads.ts';
import s from './campaign.module.css';

const SECONDS = 5;

/** Só em desenvolvimento no navegador: imita um anúncio recompensado para testar o fluxo. */
export function SimulatedAd() {
  const open = useSyncExternalStore(simulatedAd.subscribe, simulatedAd.open, () => false);
  const [left, setLeft] = useState(SECONDS);

  useEffect(() => {
    if (!open) return;
    setLeft(SECONDS);
    const t = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [open]);

  if (!open) return null;
  return (
    <div className={s.simAd} role="dialog" aria-modal="true" aria-labelledby="anuncio-titulo">
      <p className="eyebrow">Desenvolvimento</p>
      <h2 id="anuncio-titulo" className="display">
        Anúncio simulado
      </h2>
      <p className="mono">{left > 0 ? `recompensa em ${left}s` : 'recompensa liberada'}</p>
      <div className={s.sheetActions}>
        <Button variant="primary" disabled={left > 0} onClick={() => simulatedAd.finish('rewarded')}>
          Receber recompensa
        </Button>
        <Button variant="ghost" onClick={() => simulatedAd.finish('dismissed')}>
          Fechar sem recompensa
        </Button>
      </div>
    </div>
  );
}
