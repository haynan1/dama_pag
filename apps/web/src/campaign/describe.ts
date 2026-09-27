import type { Level } from '@dama/campaign';
import { aiLevel } from '@dama/engine';

/** Objetivo da fase em linguagem de jogador, curto o bastante para um chip. */
export function objective(level: Level): string {
  if (level.kind === 'match') {
    return level.goal === 'draw' ? 'Empate ou vença' : 'Vença a partida';
  }
  switch (level.goal.type) {
    case 'promote':
      return 'Coroe uma pedra';
    case 'win':
      return 'Vença o final';
    case 'gain':
      return level.goal.pieces === 1 ? 'Ganhe uma peça' : `Ganhe ${level.goal.pieces} peças`;
  }
}

export function details(level: Level): string[] {
  const out: string[] = [];
  if (level.kind === 'match') {
    const ai = aiLevel(level.ai);
    out.push(`${ai.name} · nível ${ai.level}`);
    out.push(level.player === 'white' ? 'Você joga de brancas' : 'Você joga de pretas');
    if (level.maxMoves) out.push(`Até ${level.maxMoves} lances`);
  } else {
    out.push(level.setup.toMove === 'white' ? 'Brancas jogam' : 'Pretas jogam');
    out.push(`Até ${level.maxMoves} ${level.maxMoves === 1 ? 'lance' : 'lances'}`);
  }
  return out;
}

export function opponentName(level: Level): string {
  return level.kind === 'match' ? aiLevel(level.ai).name : 'Defesa perfeita';
}
