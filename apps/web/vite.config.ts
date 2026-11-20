import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const api = process.env['DAMA_API'] ?? 'http://localhost:5810';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      // Onde está o servidor: na rede local (navegador) ou embutido no aparelho (app Android).
      // Troca de arquivo no build, e não `if` em tempo de execução: o servidor embutido (SQLite
      // WASM, workers) nem entra no bundle do navegador.
      '@dama/transport': fileURLToPath(
        new URL(mode === 'app' ? './src/local/transport.ts' : './src/lib/transport.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: api },
      '/ws': { target: api.replace(/^http/, 'ws'), ws: true },
    },
  },
  // Servidor embutido do app Android: o worker do servidor abre os workers da IA e carrega o
  // SQLite WebAssembly — precisa de workers em módulo ES. O pacote do SQLite traz o próprio .wasm.
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
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
}));
