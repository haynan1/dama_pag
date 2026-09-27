import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Tela cheia imersiva para a partida.
 *
 * - Desktop, Android e iPad: Fullscreen API no documento inteiro (toasts e diálogos continuam visíveis).
 * - iPhone não expõe a API para elementos; lá a tela cheia vem de "Adicionar à Tela de Início"
 *   (manifesto com `display: fullscreen` + metas da Apple). Nesse caso — ou quando o app já roda
 *   instalado — o botão some, porque não haveria o que alternar.
 *
 * A preferência sobrevive a recarregar a página: navegadores saem da tela cheia ao recarregar e só
 * permitem voltar com um gesto, então o primeiro toque na partida restaura o modo.
 */

type Doc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type El = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const PREF_KEY = 'dama:fullscreen';
const EVENTS = ['fullscreenchange', 'webkitfullscreenchange'] as const;

function doc(): Doc | null {
  return typeof document === 'undefined' ? null : (document as Doc);
}

function isActive(): boolean {
  const d = doc();
  return Boolean(d && (d.fullscreenElement ?? d.webkitFullscreenElement));
}

/** Aberto pela Tela de Início. A Fullscreen API também ativa `display-mode: fullscreen`; essa não conta. */
function installed(): boolean {
  if (typeof matchMedia === 'undefined') return false;
  if (matchMedia('(display-mode: standalone)').matches) return true;
  return matchMedia('(display-mode: fullscreen)').matches && !isActive();
}

export function fullscreenSupported(): boolean {
  const d = doc();
  return Boolean(d && (d.fullscreenEnabled || d.webkitFullscreenEnabled)) && !installed();
}

function readPref(): boolean {
  try {
    const v = localStorage.getItem(PREF_KEY);
    // Sem escolha registrada: em telas de toque a tela cheia é o padrão.
    if (v === null) return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    return v === '1';
  } catch {
    return false;
  }
}

function writePref(on: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, on ? '1' : '0');
  } catch {
    // Armazenamento indisponível (janela privada): a preferência vale só nesta sessão.
  }
}

async function enter(): Promise<void> {
  const el = document.documentElement as El;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else await el.webkitRequestFullscreen?.();
  } catch {
    // Negado pelo navegador (sem gesto, política da página): segue na janela normal.
  }
}

async function exit(): Promise<void> {
  const d = document as Doc;
  try {
    if (d.exitFullscreen) await d.exitFullscreen();
    else await d.webkitExitFullscreen?.();
  } catch {
    // Já tinha saído.
  }
}

function subscribe(onChange: () => void): () => void {
  const d = doc();
  if (!d) return () => {};
  for (const e of EVENTS) d.addEventListener(e, onChange);
  return () => {
    for (const e of EVENTS) d.removeEventListener(e, onChange);
  };
}

export function useFullscreenState(): boolean {
  return useSyncExternalStore(subscribe, isActive, () => false);
}

export interface Fullscreen {
  readonly supported: boolean;
  readonly active: boolean;
  toggle(): void;
}

/**
 * Controle de tela cheia de uma tela imersiva. Com `restore`, reentra no primeiro toque se a
 * pessoa estava em tela cheia (ou nunca escolheu, num aparelho de toque).
 */
export function useFullscreen({ restore = false }: { restore?: boolean } = {}): Fullscreen {
  const active = useFullscreenState();
  const supported = fullscreenSupported();

  // Sair por Esc, gesto de voltar ou pelo botão registra a escolha: não insistimos depois.
  useEffect(
    () =>
      subscribe(() => {
        if (!isActive()) writePref(false);
      }),
    [],
  );

  useEffect(() => {
    if (!restore || !supported || isActive() || !readPref()) return;
    // `click`, não `pointerdown`: o redimensionamento acontece depois do toque já ter sido tratado.
    const onClick = () => {
      if (!isActive() && readPref()) void enter();
    };
    document.addEventListener('click', onClick, { once: true, capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, [restore, supported]);

  const toggle = useCallback(() => {
    if (isActive()) {
      writePref(false);
      void exit();
    } else {
      writePref(true);
      void enter();
    }
  }, []);

  return { supported, active, toggle };
}
