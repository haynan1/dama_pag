import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const api = process.env['DAMA_API'] ?? 'http://localhost:5810';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: api },
      '/ws': { target: api.replace(/^http/, 'ws'), ws: true },
    },
  },
  build: {
    target: 'es2023',
    sourcemap: false,
    // Nada embutido como data: URI — a CSP do servidor só aceita fontes e scripts da própria origem.
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 400,
    rolldownOptions: {
      output: {
        // React muda raramente: chunk próprio, cache longo entre versões do app.
        advancedChunks: {
          groups: [{ name: 'react', test: /node_modules[/](react|react-dom|scheduler)[/]/ }],
        },
      },
    },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
