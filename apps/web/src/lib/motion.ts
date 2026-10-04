/**
 * Ritmo dos lances no tabuleiro. Fica fora do componente porque a encenação do mentor precisa
 * saber quanto cada lance leva para andar antes de mostrar o próximo.
 */
export interface Tempo {
  /** Respiro antes de a peça sair: separa o lance do adversário do seu. */
  readonly beat: number;
  readonly lift: number;
  readonly hop: number;
  /** Parada em cada casa de pouso entre capturas. */
  readonly rest: number;
  readonly land: number;
  readonly vanish: number;
}

export type Pace = 'quick' | 'own' | 'opponent';

const STAGED = {
  simple: { beat: 0, lift: 170, hop: 460, rest: 0, land: 190, vanish: 360 },
  capture: { beat: 0, lift: 170, hop: 400, rest: 130, land: 190, vanish: 360 },
} satisfies Record<string, Tempo>;

export const TEMPO: Readonly<Record<Pace, { readonly simple: Tempo; readonly capture: Tempo }>> = {
  quick: {
    simple: { beat: 0, lift: 0, hop: 230, rest: 0, land: 0, vanish: 260 },
    capture: { beat: 0, lift: 0, hop: 190, rest: 0, land: 0, vanish: 260 },
  },
  own: STAGED,
  opponent: {
    simple: { ...STAGED.simple, beat: 260 },
    capture: { ...STAGED.capture, beat: 260 },
  },
};

/** Duração total da encenação de um lance (ms), do respiro inicial à última peça capturada sumir. */
export function moveDuration(pace: Pace, hops: number, capture: boolean): number {
  const t = TEMPO[pace][capture ? 'capture' : 'simple'];
  return t.beat + t.lift + hops * t.hop + Math.max(0, hops - 1) * t.rest + t.land + (capture ? t.vanish : 0);
}
