import { describe, expect, it } from 'vitest';
import { clockText, relativeText } from '../src/lib/format.ts';

describe('formatação', () => {
  it('relógio mostra décimos abaixo de 10s e h:mm:ss acima de 1h', () => {
    expect(clockText(9_450)).toBe('9.4');
    expect(clockText(65_000)).toBe('1:05');
    expect(clockText(3_725_000)).toBe('1:02:05');
    expect(clockText(-5)).toBe('0.0');
  });

  it('tempo relativo em português', () => {
    const now = Date.parse('2026-01-10T12:00:00Z');
    expect(relativeText('2026-01-10T11:59:40Z', now)).toBe('agora');
    expect(relativeText('2026-01-11T12:00:00Z', now)).toBe('amanhã');
    expect(relativeText('2026-01-10T09:00:00Z', now)).toBe('há 3 horas');
  });
});
