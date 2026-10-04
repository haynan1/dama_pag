import { useCallback, useSyncExternalStore } from 'react';

/**
 * Preferências de interface do aparelho: síncronas (o tabuleiro precisa delas no primeiro
 * render) e compartilhadas entre telas abertas. Perder uma preferência só devolve o padrão,
 * por isso o localStorage basta — inclusive na WebView do Android.
 */
const COORDS_KEY = 'dama:coordinates';

const listeners = new Set<() => void>();

function read(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}

// Ligado por padrão: quem está começando precisa achar "d4" sem contar colunas.
let coordinates = read(COORDS_KEY, true);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== COORDS_KEY) return;
    coordinates = read(COORDS_KEY, true);
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function setCoordinates(value: boolean): void {
  coordinates = value;
  try {
    localStorage.setItem(COORDS_KEY, value ? '1' : '0');
  } catch {
    // Sem armazenamento: vale só nesta sessão.
  }
  for (const l of listeners) l();
}

/** Nome de cada casa escrito no tabuleiro. */
export function useCoordinates(): readonly [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => coordinates,
    () => true,
  );
  const set = useCallback((v: boolean) => setCoordinates(v), []);
  return [value, set] as const;
}
