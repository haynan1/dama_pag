import { CheckCircle, Info, WarningCircle, X } from '@phosphor-icons/react';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import s from './Toasts.module.css';

type Tone = 'info' | 'success' | 'error';
interface Toast {
  readonly id: number;
  readonly tone: Tone;
  readonly message: string;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (message: string, tone: Tone = 'info') => {
      const id = next.current++;
      setToasts((list) => [...list.filter((t) => t.message !== message).slice(-2), { id, tone, message }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 4000);
    },
    [dismiss],
  );
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={s.region} aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`${s.toast} ${s[t.tone]}`}
            role={t.tone === 'error' ? 'alert' : 'status'}
          >
            {t.tone === 'success' ? (
              <CheckCircle weight="fill" aria-hidden="true" />
            ) : t.tone === 'error' ? (
              <WarningCircle weight="fill" aria-hidden="true" />
            ) : (
              <Info weight="fill" aria-hidden="true" />
            )}
            <span>{t.message}</span>
            <button type="button" className={s.close} onClick={() => dismiss(t.id)} aria-label="Fechar aviso">
              <X aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
