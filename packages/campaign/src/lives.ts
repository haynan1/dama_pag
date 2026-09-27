/**
 * Vidas: começam cheias, uma é consumida ao entrar numa fase e devolvida se ela for concluída.
 * Descontar na entrada (e não na derrota) fecha a brecha de fechar o app no meio de uma fase
 * perdida. Cada vida perdida volta sozinha depois de `regenMs`.
 *
 * Estado mínimo: quantas vidas havia no último acerto e desde quando o relógio de recarga corre.
 * Tudo é derivado de `now` — sem timers, sem estado escondido, testável com relógio falso.
 */
export interface LivesConfig {
  readonly max: number;
  readonly regenMs: number;
}

export const LIVES: LivesConfig = { max: 3, regenMs: 60 * 60 * 1000 };

export interface Lives {
  readonly count: number;
  /** Início da recarga da próxima vida (ms). Irrelevante com as vidas cheias. */
  readonly since: number;
}

export function fullLives(now: number, cfg: LivesConfig = LIVES): Lives {
  return { count: cfg.max, since: now };
}

/** Aplica a recarga acumulada até `now`. */
export function settle(lives: Lives, now: number, cfg: LivesConfig = LIVES): Lives {
  if (lives.count >= cfg.max) return lives.count === cfg.max ? lives : { count: cfg.max, since: now };
  // Relógio do aparelho voltou no tempo: recomeça a contagem em vez de premiar a manobra.
  if (now < lives.since) return { count: lives.count, since: now };
  const earned = Math.floor((now - lives.since) / cfg.regenMs);
  if (earned <= 0) return lives;
  const count = Math.min(cfg.max, lives.count + earned);
  return count >= cfg.max ? { count, since: now } : { count, since: lives.since + earned * cfg.regenMs };
}

/** Milissegundos até a próxima vida, ou `null` com as vidas cheias. */
export function nextLifeIn(lives: Lives, now: number, cfg: LivesConfig = LIVES): number | null {
  const s = settle(lives, now, cfg);
  if (s.count >= cfg.max) return null;
  return Math.max(0, s.since + cfg.regenMs - now);
}

/** Consome uma vida. `null` se não houver nenhuma. */
export function spend(lives: Lives, now: number, cfg: LivesConfig = LIVES): Lives | null {
  const s = settle(lives, now, cfg);
  if (s.count <= 0) return null;
  // Saindo do máximo, a recarga começa agora; abaixo dele, o relógio que já corria continua.
  return { count: s.count - 1, since: s.count >= cfg.max ? now : s.since };
}

/**
 * Soma vidas (fase concluída, anúncio assistido, compra). Nunca passa do máximo: vida extra
 * guardada viraria moeda paralela e desequilibraria a trilha.
 */
export function grant(lives: Lives, amount: number, now: number, cfg: LivesConfig = LIVES): Lives {
  const s = settle(lives, now, cfg);
  const count = Math.min(cfg.max, s.count + Math.max(0, Math.floor(amount)));
  return count >= cfg.max ? { count, since: now } : { count, since: s.since };
}
