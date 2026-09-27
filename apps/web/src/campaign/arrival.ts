/**
 * Fase recém-liberada, para a trilha celebrar a chegada uma única vez ao voltar da fase.
 * Estado de navegação, não de progresso: vive só na memória.
 */
let pending: string | null = null;

export function markArrival(levelId: string): void {
  pending = levelId;
}

export function consumeArrival(): string | null {
  const id = pending;
  pending = null;
  return id;
}
