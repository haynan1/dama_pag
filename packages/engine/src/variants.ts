/**
 * Variantes suportadas. Todas compartilham o mesmo conjunto de regras (o da Confederação
 * Brasileira de Jogo de Damas, idêntico ao da FMJD): pedras capturam para trás, damas voadoras,
 * captura obrigatória pela lei da maioria e peças capturadas removidas só ao fim do lance.
 * O que muda é o tamanho do tabuleiro, o número de pedras e os limites de empate.
 */
export type VariantId = 'brazilian' | 'international' | 'canadian';

export interface VariantRules {
  readonly id: VariantId;
  readonly name: string;
  readonly short: string;
  readonly size: number;
  readonly rowsPerSide: number;
  /** Plies consecutivos só de damas, sem captura, que encerram a partida empatada. */
  readonly kingOnlyDrawPlies: number;
  /** Código PDN `GameType`. */
  readonly pdnGameType: number;
  /** Valor da dama na avaliação, em centésimos de pedra. */
  readonly kingValue: number;
}

export const VARIANTS: Readonly<Record<VariantId, VariantRules>> = {
  brazilian: {
    id: 'brazilian',
    name: 'Brasileira',
    short: '8×8',
    size: 8,
    rowsPerSide: 3,
    kingOnlyDrawPlies: 40,
    pdnGameType: 26,
    kingValue: 300,
  },
  international: {
    id: 'international',
    name: 'Internacional',
    short: '10×10',
    size: 10,
    rowsPerSide: 4,
    kingOnlyDrawPlies: 50,
    pdnGameType: 20,
    kingValue: 330,
  },
  canadian: {
    id: 'canadian',
    name: 'Canadense',
    short: '12×12',
    size: 12,
    rowsPerSide: 5,
    kingOnlyDrawPlies: 50,
    pdnGameType: 27,
    kingValue: 350,
  },
};

export const VARIANT_IDS = Object.keys(VARIANTS) as readonly VariantId[];

export function isVariantId(value: unknown): value is VariantId {
  return typeof value === 'string' && Object.hasOwn(VARIANTS, value);
}

/**
 * Regra de finais curtos: uma dama isolada contra até 3 peças (com ao menos uma dama).
 * Retorna quantos plies sem captura encerram a partida empatada, ou 0 se não se aplica.
 * Brasileira (CBJD): 5 lances de cada lado. Internacional/canadense (FMJD): 16 lances
 * com 3 peças, 5 lances com 2 peças.
 */
export function shortEndgameLimit(rules: VariantRules, strongPieces: number): number {
  if (rules.id === 'brazilian') return 10;
  return strongPieces >= 3 ? 32 : 10;
}
