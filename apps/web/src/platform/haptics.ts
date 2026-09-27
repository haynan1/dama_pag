import { isNative } from './runtime.ts';

/**
 * Vibração curta em momentos que importam (lance aceito, erro, fase concluída). Nunca em todo
 * toque: vibração demais vira ruído. Desligável nas configurações.
 */
type Kind = 'tap' | 'success' | 'error';

let enabled = true;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export function haptic(kind: Kind): void {
  if (!enabled) return;
  if (isNative) {
    void import('@capacitor/haptics')
      .then(({ Haptics, ImpactStyle, NotificationType }) => {
        if (kind === 'tap') return Haptics.impact({ style: ImpactStyle.Light });
        return Haptics.notification({
          type: kind === 'success' ? NotificationType.Success : NotificationType.Error,
        });
      })
      .catch(() => {
        // Aparelho sem motor de vibração: nada a fazer.
      });
    return;
  }
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(kind === 'tap' ? 8 : kind === 'success' ? [12, 60, 18] : [30, 40, 30]);
    } catch {
      // Bloqueado pelo navegador (sem gesto do usuário).
    }
  }
}
