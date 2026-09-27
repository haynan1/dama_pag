import { X } from '@phosphor-icons/react';
import { type ReactNode, useEffect, useRef } from 'react';
import s from './campaign.module.css';

/**
 * Folha modal: sobe da base no celular (alcance do polegar), centralizada em telas grandes.
 * `<dialog>` nativo: foco preso, Esc fecha, leitor de tela anuncia — sem reinventar nada.
 * Toque fora fecha. O botão voltar do Android fecha a folha antes de sair da tela (ver backButton).
 */
export function Sheet({
  open,
  onClose,
  labelledBy,
  tone,
  children,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  tone?: 'win' | 'loss' | undefined;
  children: ReactNode;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: o clique é só no fundo; pelo teclado, Esc fecha (nativo do <dialog>).
    <dialog
      ref={ref}
      className={`${s.sheet} ${tone ? s[`sheet_${tone}`] : ''}`}
      aria-labelledby={labelledBy}
      data-locked={dismissible ? undefined : ''}
      onClose={onClose}
      onCancel={(e) => {
        if (!dismissible) e.preventDefault();
      }}
      onClick={(e) => {
        // Clique no backdrop: o alvo é o próprio <dialog>, fora da caixa de conteúdo.
        if (dismissible && e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      <div className={s.sheetBody}>
        <span className={s.grabber} aria-hidden="true" />
        {dismissible && (
          <button
            type="button"
            className={s.sheetClose}
            onClick={() => ref.current?.close()}
            aria-label="Fechar"
          >
            <X aria-hidden="true" />
          </button>
        )}
        {children}
      </div>
    </dialog>
  );
}
