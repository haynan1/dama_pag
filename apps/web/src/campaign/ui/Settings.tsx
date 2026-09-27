import { ArrowSquareOut, ShieldCheck, Vibrate } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useToast } from '../../components/Toasts.tsx';
import { Switch } from '../../components/ui.tsx';
import { privacyOptionsRequired, showPrivacyOptions } from '../../platform/ads.ts';
import { restorePurchases } from '../../platform/billing.ts';
import { PRIVACY_URL } from '../../platform/config.ts';
import { setHapticsEnabled } from '../../platform/haptics.ts';
import { storage } from '../../platform/storage.ts';
import s from './campaign.module.css';
import { Sheet } from './Sheet.tsx';

const HAPTICS_KEY = 'dama:haptics';

export async function loadSettings(): Promise<void> {
  setHapticsEnabled((await storage.get(HAPTICS_KEY)) !== '0');
}

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [haptics, setHaptics] = useState(true);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (open) void storage.get(HAPTICS_KEY).then((v) => setHaptics(v !== '0'));
  }, [open]);

  const toggleHaptics = (on: boolean) => {
    setHaptics(on);
    setHapticsEnabled(on);
    void storage.set(HAPTICS_KEY, on ? '1' : '0');
  };

  const restore = async () => {
    setRestoring(true);
    try {
      const pro = await restorePurchases();
      toast(
        pro ? 'Dama Pro restaurado' : 'Nenhuma compra encontrada nesta conta Google',
        pro ? 'success' : 'info',
      );
    } catch {
      toast('Não foi possível falar com a Play Store agora.', 'error');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} labelledBy="config-titulo">
      <p className="eyebrow">Ajustes</p>
      <h2 id="config-titulo" className={s.sheetTitle}>
        Configurações
      </h2>
      <div className={s.settings}>
        <Switch
          checked={haptics}
          onChange={toggleHaptics}
          label={
            <span className={s.settingLabel}>
              <Vibrate aria-hidden="true" /> Vibração
            </span>
          }
          description="Toque sutil ao acertar, errar e concluir."
        />
        <button type="button" className={s.settingRow} onClick={() => void restore()} disabled={restoring}>
          Restaurar compras
          <span className={s.settingHint}>{restoring ? 'Consultando…' : 'Trocou de aparelho?'}</span>
        </button>
        {privacyOptionsRequired() && (
          <button type="button" className={s.settingRow} onClick={() => void showPrivacyOptions()}>
            <span className={s.settingLabel}>
              <ShieldCheck aria-hidden="true" /> Privacidade dos anúncios
            </span>
            <span className={s.settingHint}>Rever consentimento</span>
          </button>
        )}
        {PRIVACY_URL && (
          <a className={s.settingRow} href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
            Política de privacidade
            <ArrowSquareOut aria-hidden="true" />
          </a>
        )}
      </div>
      <p className={s.fine}>Dama · versão {import.meta.env.VITE_APP_VERSION ?? 'dev'}</p>
    </Sheet>
  );
}
