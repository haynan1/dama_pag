import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/engine', 'packages/campaign', 'apps/server', 'apps/web'],
  },
});
