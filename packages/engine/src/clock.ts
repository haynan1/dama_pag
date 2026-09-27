/** Relógio monotônico disponível no Node e no navegador, sem depender dos tipos de nenhum dos dois. */
const perf = (globalThis as { performance?: { now(): number } }).performance;

export const now: () => number = perf ? () => perf.now() : () => Date.now();
