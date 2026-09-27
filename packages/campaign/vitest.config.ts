import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'campaign', include: ['test/**/*.test.ts'], testTimeout: 120_000 },
});
