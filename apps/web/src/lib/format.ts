import { type Classification, type EndReason, formatScore, winProbability } from '@dama/engine';
import type { Side } from '@dama/protocol';

export { formatScore, winProbability };

export const SIDE_LABEL: Record<Side, string> = { white: 'Brancas', black: 'Pretas' };

export const REASON_LABEL: Record<EndReason, string> = {
  'no-moves': 'sem lances',
  resign: 'abandono',
  timeout: 'tempo esgotado',
  agreement: 'acordo',
  abandon: 'sala cancelada',
  repetition: 'repetição de posição',
  'kings-only': 'regra dos 20 lances de damas',
  'short-endgame': 'regra dos finais curtos',
};

export const CLASSIFICATION_META: Record<Classification, { label: string; glyph: string; tone: string }> = {
  brilliant: { label: 'Golpe brilhante', glyph: '!!', tone: 'brilliant' },
  best: { label: 'Melhor lance', glyph: '★', tone: 'good' },
  excellent: { label: 'Excelente', glyph: '!', tone: 'good' },
  good: { label: 'Bom', glyph: '✓', tone: 'neutral' },
  inaccuracy: { label: 'Imprecisão', glyph: '?!', tone: 'warn' },
  mistake: { label: 'Erro', glyph: '?', tone: 'bad' },
  blunder: { label: 'Erro grave', glyph: '??', tone: 'bad' },
  forced: { label: 'Forçado', glyph: '□', tone: 'neutral' },
};

export function clockText(ms: number): string {
  const total = Math.max(0, ms);
  if (total < 10_000) return (total / 1000).toFixed(1);
  const s = Math.ceil(total / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const relFmt = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

export function dateText(iso: string): string {
  return dateFmt.format(new Date(iso));
}

export function relativeText(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  if (abs < 60_000) return 'agora';
  if (abs < 3_600_000) return relFmt.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return relFmt.format(Math.round(diff / 3_600_000), 'hour');
  return relFmt.format(Math.round(diff / 86_400_000), 'day');
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}
