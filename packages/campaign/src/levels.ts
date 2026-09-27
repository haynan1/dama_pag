import type { Setup } from './setup.ts';
import type { Chapter, Level, MatchLevel, PuzzleLevel, Side } from './types.ts';

/*
 * A trilha. Do absolutamente básico (como a pedra anda) ao nível Implacável do motor.
 *
 * Capítulo 1 ensina as regras em exercícios de um lance, sem custo de vida.
 * Os exercícios dos capítulos 2–6 foram minerados de partidas IA × IA com semente fixa
 * (`scripts/mine.ts`) e selecionados pela curadoria (`scripts/curate.ts`): cada um tem um único
 * lance claramente melhor e a solução é provada pelo motor em `test/levels.test.ts`.
 *
 * Os ids são a chave do progresso salvo no aparelho: nunca renomeie nem reutilize um id publicado.
 */

type Theme = 'gain' | 'combination' | 'promotion' | 'win';

const SIDE: Record<Side, string> = { white: 'As brancas', black: 'As pretas' };

const THEME_BRIEF: Record<Theme, (side: Side) => string> = {
  gain: (s) => `${SIDE[s]} jogam e ganham uma peça. Procure a pedra que ficou sem defesa.`,
  combination: (s) =>
    `${SIDE[s]} jogam e ganham material. O caminho começa entregando uma peça: a captura é obrigatória.`,
  promotion: (s) => `${SIDE[s]} jogam e ganham material. Pense na última fileira: uma dama está por perto.`,
  win: (s) => `${SIDE[s]} jogam e ganham material de forma decisiva. Calcule até o fim antes de mover.`,
};

function puzzle(spec: {
  id: string;
  title: string;
  setup: Setup;
  moves: number;
  theme: Theme;
  brief?: string;
  /** Lances de folga além da solução mais curta. */
  slack?: number;
}): PuzzleLevel {
  return {
    kind: 'puzzle',
    id: spec.id,
    title: spec.title,
    brief: spec.brief ?? THEME_BRIEF[spec.theme](spec.setup.toMove),
    setup: spec.setup,
    goal: { type: 'gain', pieces: 1 },
    maxMoves: spec.moves + (spec.slack ?? 2),
  };
}

function match(spec: Omit<MatchLevel, 'kind'>): MatchLevel {
  return { kind: 'match', ...spec };
}

const fundamentos: Chapter = {
  id: 'fundamentos',
  title: 'Fundamentos',
  subtitle: 'Como as peças andam, capturam e coroam',
  tone: 'dawn',
  levels: [
    {
      kind: 'puzzle',
      id: 'f-01',
      title: 'O primeiro passo',
      brief:
        'A pedra anda uma casa na diagonal, sempre para a frente. Leve-a até a última fileira para coroá-la.',
      setup: { white: 'd4', black: 'h8', toMove: 'white' },
      goal: { type: 'promote' },
      maxMoves: 5,
      free: true,
    },
    {
      kind: 'puzzle',
      id: 'f-02',
      title: 'Captura obrigatória',
      brief:
        'Pula-se por cima da peça adversária até a casa vazia logo atrás. Se houver captura, ela é obrigatória.',
      setup: { white: 'c3 g3', black: 'd4 h8', toMove: 'white' },
      goal: { type: 'gain', pieces: 1 },
      maxMoves: 1,
      free: true,
    },
    {
      kind: 'puzzle',
      id: 'f-03',
      title: 'Para trás também',
      brief: 'A pedra só anda para a frente, mas captura em qualquer direção — inclusive para trás.',
      setup: { white: 'e5 a1', black: 'd4 h8', toMove: 'white' },
      goal: { type: 'gain', pieces: 1 },
      maxMoves: 1,
      free: true,
    },
    {
      kind: 'puzzle',
      id: 'f-04',
      title: 'Em cadeia',
      brief: 'Depois de capturar, se outra captura estiver disponível, a mesma pedra continua saltando.',
      setup: { white: 'c3 a1', black: 'd4 d6 h8', toMove: 'white' },
      goal: { type: 'gain', pieces: 2 },
      maxMoves: 1,
      free: true,
    },
    {
      kind: 'puzzle',
      id: 'f-05',
      title: 'Lei da maioria',
      brief: 'Com mais de uma captura possível, é obrigatório escolher a que leva mais peças.',
      setup: { white: 'e3 a1', black: 'd4 f4 f6 h8', toMove: 'white' },
      goal: { type: 'gain', pieces: 2 },
      maxMoves: 1,
      free: true,
    },
    {
      kind: 'puzzle',
      id: 'f-06',
      title: 'A dama voa',
      brief:
        'A dama anda quantas casas quiser na diagonal e captura de longe, pousando em qualquer casa livre depois da peça.',
      setup: { white: 'Ka1 g1', black: 'c3 e5 h8', toMove: 'white' },
      goal: { type: 'gain', pieces: 2 },
      maxMoves: 1,
      free: true,
    },
    {
      kind: 'puzzle',
      id: 'f-07',
      title: 'Dama contra pedra',
      brief:
        'Vence quem deixa o adversário sem peças ou sem lances. Use o alcance da dama para caçar a pedra.',
      setup: { white: 'Kd4', black: 'a7', toMove: 'white' },
      goal: { type: 'win' },
      maxMoves: 8,
      free: true,
    },
    match({
      id: 'f-chefe',
      title: 'Primeira partida',
      brief: 'Hora de jogar uma partida inteira. O Aprendiz ainda erra bastante: aproveite cada peça solta.',
      ai: 1,
      player: 'white',
      free: true,
    }),
  ],
};

const golpes: Chapter = {
  id: 'golpes',
  title: 'Primeiros golpes',
  subtitle: 'Enxergar a peça que ficou sozinha',
  tone: 'forest',
  levels: [
    puzzle({
      id: 'g-01',
      title: 'A pedra solta',
      setup: { white: 'h2 c3 b4', black: 'f4 d6', toMove: 'white' },
      moves: 2,
      theme: 'gain',
      slack: 1,
    }),
    puzzle({
      id: 'g-02',
      title: 'Duas frentes',
      setup: { white: 'a3 c3', black: 'c5 b6 h6', toMove: 'black' },
      moves: 2,
      theme: 'gain',
      slack: 1,
    }),
    puzzle({
      id: 'g-03',
      title: 'Pela lateral',
      setup: { white: 'a3 b4 h4', black: 'c5 b6 d6 f8', toMove: 'black' },
      moves: 2,
      theme: 'gain',
      slack: 1,
    }),
    puzzle({
      id: 'g-04',
      title: 'O desvio',
      setup: { white: 'c1 a3 c3 a5', black: 'f2 b6 d6', toMove: 'black' },
      moves: 2,
      theme: 'gain',
      slack: 1,
    }),
    match({
      id: 'g-partida-1',
      title: 'Treino de olho',
      brief: 'Partida contra o Iniciante. Antes de cada lance, pergunte: alguma peça minha ficou sozinha?',
      ai: 2,
      player: 'white',
    }),
    puzzle({
      id: 'g-05',
      title: 'A cunha',
      setup: { white: 'c3 g3 h4', black: 'c5 g5 b6 f6', toMove: 'black' },
      moves: 2,
      theme: 'gain',
      slack: 1,
    }),
    puzzle({
      id: 'g-06',
      title: 'Atalho',
      setup: { white: 'e3 b4 d4 f4', black: 'h4 d6 h6 c7', toMove: 'white' },
      moves: 2,
      theme: 'gain',
      slack: 1,
    }),
    puzzle({
      id: 'g-07',
      title: 'Porta aberta',
      setup: { white: 'e1 e3 d4 h4', black: 'g5 f6 c7 e7', toMove: 'white' },
      moves: 2,
      theme: 'gain',
      slack: 1,
    }),
    puzzle({
      id: 'g-08',
      title: 'O convite',
      setup: { white: 'a1 g1 d2 h4', black: 'a3 f4 g5 f6', toMove: 'white' },
      moves: 2,
      theme: 'gain',
      slack: 1,
    }),
    match({
      id: 'g-chefe',
      title: 'O Iniciante',
      brief: 'Vença o Iniciante com as pretas. Quem joga de pretas responde: paciência e contra-ataque.',
      ai: 2,
      player: 'black',
    }),
  ],
};

const finais: Chapter = {
  id: 'finais',
  title: 'Coroas e finais',
  subtitle: 'Transformar vantagem em vitória',
  tone: 'ember',
  levels: [
    puzzle({
      id: 'c-01',
      title: 'Rumo à coroa',
      setup: { white: 'f2 f6', black: 'h2 b4 h4 b6', toMove: 'black' },
      moves: 2,
      theme: 'promotion',
    }),
    puzzle({
      id: 'c-02',
      title: 'Última fileira',
      setup: { white: 'a3 e3 d4 g7', black: 'h4 c5 b6 d6', toMove: 'white' },
      moves: 2,
      theme: 'promotion',
    }),
    puzzle({
      id: 'c-03',
      title: 'A dama nasce',
      setup: { white: 'e1 h2 g3 h4 c5', black: 'b2 e5 a7 h8', toMove: 'black' },
      moves: 2,
      theme: 'promotion',
    }),
    puzzle({
      id: 'c-04',
      title: 'Corrida',
      setup: { white: 'e1 c5 h6', black: 'e5 f6 c7', toMove: 'white' },
      moves: 2,
      theme: 'win',
    }),
    match({
      id: 'c-final-1',
      title: 'Damas contra pedras',
      brief: 'Duas damas e uma pedra contra quatro pedras. Converta: cace as pedras antes que elas coroem.',
      ai: 3,
      player: 'white',
      setup: { white: 'Ka1 Kg1 c3', black: 'a7 c7 e7 h6', toMove: 'white' },
      maxMoves: 30,
    }),
    puzzle({
      id: 'c-05',
      title: 'Dama no canto',
      setup: { white: 'h4 b6', black: 'e5 d6 Kh6', toMove: 'black' },
      moves: 3,
      theme: 'win',
    }),
    puzzle({
      id: 'c-06',
      title: 'O cerco',
      setup: { white: 'a1 g3 h4 Kh8', black: 'd2 a3', toMove: 'white' },
      moves: 3,
      theme: 'win',
    }),
    puzzle({
      id: 'c-07',
      title: 'Tempo certo',
      setup: { white: 'e1 g3 b4', black: 'a5 f6 a7', toMove: 'white' },
      moves: 3,
      theme: 'gain',
    }),
    puzzle({
      id: 'c-08',
      title: 'Paciência',
      setup: { white: 'a3 e3 h6', black: 'c3 Kh4 a7', toMove: 'black' },
      moves: 4,
      theme: 'win',
    }),
    match({
      id: 'c-chefe',
      title: 'O Casual',
      brief: 'Partida inteira contra o Casual. Troque peças quando estiver na frente: finais simples vencem.',
      ai: 3,
      player: 'white',
    }),
  ],
};

const combinacoes: Chapter = {
  id: 'combinacoes',
  title: 'Combinações',
  subtitle: 'Entregar uma peça para ganhar duas',
  tone: 'dusk',
  levels: [
    puzzle({
      id: 'k-01',
      title: 'Entrega calculada',
      setup: { white: 'g1 b4 f4 a5 g5', black: 'b2 d6 a7 c7 e7', toMove: 'white' },
      moves: 2,
      theme: 'combination',
    }),
    puzzle({
      id: 'k-02',
      title: 'Isca',
      setup: { white: 'a1 f2 c3 b4 f4 h4', black: 'f6 h6 a7 g7 h8', toMove: 'black' },
      moves: 2,
      theme: 'combination',
    }),
    puzzle({
      id: 'k-03',
      title: 'O sacrifício',
      setup: { white: 'a1 b2 a3 g3 f4 g5', black: 'd2 d4 a5 b6 h6 g7', toMove: 'white' },
      moves: 2,
      theme: 'combination',
    }),
    puzzle({
      id: 'k-04',
      title: 'Fio da navalha',
      setup: { white: 'g1 f2 e3 d4 e5 g5', black: 'b2 h4 f6 c7 e7 g7', toMove: 'black' },
      moves: 2,
      theme: 'combination',
    }),
    match({
      id: 'k-partida-1',
      title: 'Olho no golpe',
      brief: 'Contra o Clube, de pretas. Toda troca forçada esconde uma pergunta: e depois da captura?',
      ai: 4,
      player: 'black',
    }),
    puzzle({
      id: 'k-05',
      title: 'Contragolpe',
      setup: { white: 'b2 f2 c3 e3 g3 a5 h6', black: 'c5 e5 d6 c7 d8 h8', toMove: 'black' },
      moves: 2,
      theme: 'combination',
    }),
    puzzle({
      id: 'k-06',
      title: 'Tabuleiro aberto',
      setup: { white: 'a1 e1 d2 a3 c3 e3 f4', black: 'a5 c5 b6 h6 a7 f8 h8', toMove: 'white' },
      moves: 2,
      theme: 'combination',
    }),
    puzzle({
      id: 'k-07',
      title: 'A troca que ganha',
      setup: { white: 'b2 f2 h2 a3 g3 d4 f4', black: 'h4 a5 d6 f6 h6 g7 h8', toMove: 'white' },
      moves: 2,
      theme: 'combination',
    }),
    puzzle({
      id: 'k-08',
      title: 'Dupla entrega',
      setup: { white: 'a1 f2 h2 c3 b4 h4', black: 'f4 f6 h6 a7 g7 h8', toMove: 'black' },
      moves: 3,
      theme: 'combination',
    }),
    match({
      id: 'k-chefe',
      title: 'O Clube',
      brief: 'Vença o jogador de clube. Ele não entrega peças de graça: crie a combinação.',
      ai: 4,
      player: 'white',
    }),
  ],
};

const calculo: Chapter = {
  id: 'calculo',
  title: 'Cálculo',
  subtitle: 'Enxergar três, quatro, cinco lances à frente',
  tone: 'night',
  levels: [
    puzzle({
      id: 'x-01',
      title: 'Três tempos',
      setup: { white: 'a3 c3 e3 d4 a5', black: 'b6 d6 h6 c7 g7', toMove: 'white' },
      moves: 3,
      theme: 'gain',
    }),
    puzzle({
      id: 'x-02',
      title: 'Cadeia',
      setup: { white: 'a3 c3 e3 b4 f4', black: 'h4 c5 b6 d6 c7 h8', toMove: 'white' },
      moves: 3,
      theme: 'win',
    }),
    puzzle({
      id: 'x-03',
      title: 'A diagonal',
      setup: { white: 'a1 d2 f2 e3 d4 h6', black: 'a3 a5 d6 f6 a7 h8', toMove: 'black' },
      moves: 3,
      theme: 'combination',
    }),
    puzzle({
      id: 'x-04',
      title: 'Rede',
      setup: { white: 'c1 f2 c3 g3 d4 f4 h4', black: 'a3 e5 b6 d6 f6 h6 e7', toMove: 'black' },
      moves: 3,
      theme: 'combination',
    }),
    match({
      id: 'x-partida-1',
      title: 'O Competidor',
      brief: 'O Competidor calcula seis lances. Jogue sólido e espere o erro.',
      ai: 5,
      player: 'white',
    }),
    puzzle({
      id: 'x-05',
      title: 'Engrenagem',
      setup: { white: 'a1 f2 a3 e3 b4 f4 h6', black: 'h4 a5 c5 d6 c7 d8 f8', toMove: 'white' },
      moves: 3,
      theme: 'combination',
    }),
    puzzle({
      id: 'x-06',
      title: 'Quatro passos',
      setup: { white: 'f2 a3 e3 g3 d4 f4', black: 'h4 a5 c5 d6 f6 h6', toMove: 'black' },
      moves: 4,
      theme: 'combination',
    }),
    puzzle({
      id: 'x-07',
      title: 'Maré',
      setup: { white: 'b2 f2 h2 a3 c3 e3 b4 d4', black: 'h4 e5 b6 d6 f6 a7 e7 b8', toMove: 'black' },
      moves: 4,
      theme: 'combination',
    }),
    puzzle({
      id: 'x-08',
      title: 'Longa distância',
      setup: { white: 'g1 e3 d4 a5', black: 'h2 c5 g5 d6 h8', toMove: 'black' },
      moves: 5,
      theme: 'combination',
    }),
    match({
      id: 'x-chefe',
      title: 'O Regional',
      brief: 'Oito lances de cálculo do outro lado. De pretas, sem pressa: cada tempo conta.',
      ai: 6,
      player: 'black',
    }),
  ],
};

const mestria: Chapter = {
  id: 'mestria',
  title: 'Mestria',
  subtitle: 'O motor no seu nível mais alto',
  tone: 'gold',
  levels: [
    match({
      id: 'm-partida-1',
      title: 'O Nacional',
      brief: 'O Nacional não comete erros de sorteio: só joga o melhor lance que encontra.',
      ai: 7,
      player: 'white',
    }),
    puzzle({
      id: 'm-01',
      title: 'Domínio',
      setup: { white: 'a1 Kc3 Kh4', black: 'Kb2 a5 h8', toMove: 'white' },
      moves: 5,
      theme: 'win',
    }),
    puzzle({
      id: 'm-02',
      title: 'A coroa pesa',
      setup: { white: 'd2 f2 a3 c3 g3 f4 h4 h6', black: 'c5 e5 d6 f6 b8 h8', toMove: 'white' },
      moves: 5,
      theme: 'win',
    }),
    match({
      id: 'm-partida-2',
      title: 'O Mestre',
      brief:
        'Dezoito lances de profundidade. Contra o Mestre, de pretas, o empate é honroso — mas a vitória é o objetivo.',
      ai: 8,
      player: 'black',
    }),
    puzzle({
      id: 'm-03',
      title: 'Avalanche',
      setup: {
        white: 'a1 c1 b2 d2 f2 h2 a3 g3 h4',
        black: 'c5 g5 b6 f6 a7 b8 d8 f8 h8',
        toMove: 'black',
      },
      moves: 5,
      theme: 'combination',
    }),
    puzzle({
      id: 'm-04',
      title: 'Grande combinação',
      setup: {
        white: 'a1 c1 e1 g1 b2 f2 a3 c3 e3 f4 h4',
        black: 'a5 g5 d6 f6 h6 a7 c7 e7 g7 d8 f8',
        toMove: 'white',
      },
      moves: 5,
      theme: 'combination',
    }),
    match({
      id: 'm-partida-3',
      title: 'O Grande Mestre',
      brief: 'Arranque um empate do Grande Mestre. Segurar é uma arte.',
      ai: 9,
      player: 'white',
      goal: 'draw',
    }),
    puzzle({
      id: 'm-05',
      title: 'Silêncio',
      setup: { white: 'a3 g3 b4 c5', black: 'g5 a7 b8 h8', toMove: 'white' },
      moves: 6,
      theme: 'combination',
    }),
    puzzle({
      id: 'm-06',
      title: 'Maestria',
      setup: { white: 'b2 d2 a3 c3 h4 c5', black: 'a5 e5 b6 a7 g7', toMove: 'white' },
      moves: 6,
      theme: 'combination',
    }),
    puzzle({
      id: 'm-07',
      title: 'Obra-prima',
      setup: {
        white: 'a1 c1 e1 c3 e3 g3 b4 d4 h4',
        black: 'e5 b6 d6 f6 h6 c7 e7 g7 b8',
        toMove: 'white',
      },
      moves: 6,
      theme: 'gain',
    }),
    match({
      id: 'm-chefe',
      title: 'Implacável',
      brief:
        'O motor no limite: cinco segundos e profundidade máxima por lance. Um empate aqui é uma façanha.',
      ai: 10,
      player: 'black',
      goal: 'draw',
    }),
  ],
};

export const CHAPTERS: readonly Chapter[] = [fundamentos, golpes, finais, combinacoes, calculo, mestria];

/** Todas as fases na ordem da trilha. */
export const LEVELS: readonly Level[] = CHAPTERS.flatMap((c) => c.levels);

const INDEX = new Map(LEVELS.map((l, i) => [l.id, i]));

export function levelIndex(id: string): number {
  return INDEX.get(id) ?? -1;
}

export function levelById(id: string): Level | undefined {
  const i = INDEX.get(id);
  return i === undefined ? undefined : LEVELS[i];
}

export function chapterOf(id: string): Chapter | undefined {
  return CHAPTERS.find((c) => c.levels.some((l) => l.id === id));
}
