import { Capacitor } from '@capacitor/core';

/** Rodando dentro do app Android (Capacitor), e não num navegador. */
export const isNative = Capacitor.isNativePlatform();

/** Destino do build: `app` = só campanha, offline (Android); `web` = app da rede local completo. */
export const TARGET: 'app' | 'web' = import.meta.env.VITE_TARGET === 'app' ? 'app' : 'web';
