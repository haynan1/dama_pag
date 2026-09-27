import { Position, Searcher } from '@dama/engine';
import { describe, expect, it } from 'vitest';
import {
  baseline,
  CHAPTERS,
  judge,
  LEVELS,
  levelById,
  PUZZLE_DEPTH,
  setupToFen,
  solve,
} from '../src/index.ts';

describe('trilha', () => {
  it('ids únicos e estáveis', () => {
    const ids = LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+-[a-z0-9-]+$/);
  });

  it('todo capítulo termina numa partida-chefe e só o tutorial é gratuito', () => {
    for (const c of CHAPTERS) expect(c.levels.at(-1)?.kind).toBe('match');
    expect(CHAPTERS[0]!.levels.every((l) => l.free)).toBe(true);
    expect(CHAPTERS.slice(1).every((c) => c.levels.every((l) => !l.free))).toBe(true);
  });

  it('a força da IA nunca regride ao longo da trilha e termina no nível máximo', () => {
    let last = 0;
    for (const l of LEVELS) {
      if (l.kind !== 'match') continue;
      expect(l.ai, l.id).toBeGreaterThanOrEqual(last);
      last = l.ai;
    }
    expect(last).toBe(10);
  });

  it('posições válidas, com lances para quem joga', () => {
    for (const l of LEVELS) {
      if (!l.setup) continue;
      const pos = Position.fromFen('brazilian', setupToFen(l.setup));
      expect(pos.legalMoves().length, l.id).toBeGreaterThan(0);
      if (l.kind === 'match') expect(l.setup.toMove, l.id).toBe(l.player);
    }
  });

  const searcher = new Searcher(20);
  for (const level of LEVELS) {
    if (level.kind !== 'puzzle') continue;
    it(`${level.id} "${level.title}" tem solução dentro do limite`, () => {
      const r = solve(searcher, setupToFen(level.setup), level.goal, level.maxMoves);
      expect(r.solved, r.line.join(' ')).toBe(true);
    });
  }

  it('o juiz recusa o lance que entrega peça, aceita a solução e explica pela refutação', () => {
    const l = levelById('g-01');
    if (l?.kind !== 'puzzle') throw new Error('fase ausente');
    const pos = Position.fromFen('brazilian', setupToFen(l.setup));
    const key = (from: string, to: string) => {
      const m = pos.legalMoves().find((x) => {
        const n = (s: number) => `${'abcdefgh'[pos.geo.col[s]!]}${pos.geo.row[s]! + 1}`;
        return n(x.from) === from && n(x.to) === to;
      });
      if (!m) throw new Error(`${from}-${to} ilegal`);
      return `${m.from}-${m.to}`;
    };
    const fresh = () => new Searcher(18);
    const wrong = judge(fresh(), pos, key('h2', 'g3'), l.goal, baseline(pos), PUZZLE_DEPTH);
    expect(wrong.accepted).toBe(false);
    expect(wrong.reply?.move.captures.length).toBeGreaterThan(0);
    const right = judge(fresh(), pos, key('c3', 'd4'), l.goal, baseline(pos), PUZZLE_DEPTH);
    expect(right.accepted).toBe(true);
  });

  it('o final de dama contra pedras é vencedor para quem joga', () => {
    const l = levelById('c-final-1');
    if (l?.kind !== 'match' || !l.setup) throw new Error('fase ausente');
    const pos = Position.fromFen('brazilian', setupToFen(l.setup));
    const best = searcher.search(pos, { depth: 14 }).lines[0]!;
    expect(best.score).toBeGreaterThan(300);
  });
});
