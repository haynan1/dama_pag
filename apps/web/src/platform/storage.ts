import { isNative } from './runtime.ts';

/**
 * Armazenamento chave-valor durável. No Android usa Preferences (SharedPreferences), que o sistema
 * não descarta sob pressão de espaço — ao contrário do localStorage da WebView. No navegador,
 * localStorage, com falha silenciosa em janela privada.
 */
export interface KeyValue {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const web: KeyValue = {
  async get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Sem armazenamento (janela privada, cota): o progresso vale só nesta sessão.
    }
  },
  async remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Idem.
    }
  },
};

const native: KeyValue = {
  async get(key) {
    const { Preferences } = await import('@capacitor/preferences');
    return (await Preferences.get({ key })).value;
  },
  async set(key, value) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key, value });
  },
  async remove(key) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key });
  },
};

export const storage: KeyValue = isNative ? native : web;
