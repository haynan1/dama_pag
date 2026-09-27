/**
 * Sobe servidor (com watch) e Vite juntos, multiplataforma, sem dependências.
 * Ctrl+C encerra os dois.
 */
import { type ChildProcess, spawn } from 'node:child_process';

const tasks: [string, string][] = [
  ['servidor', 'dev:server'],
  ['web', 'dev:web'],
];

const children: ChildProcess[] = tasks.map(([name, script]) => {
  const child = spawn(process.execPath, ['--run', script], { stdio: 'inherit', env: process.env });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[${name}] saiu com código ${code}`);
      shutdown(code);
    }
  });
  return child;
});

function shutdown(code = 0): void {
  for (const c of children) if (!c.killed) c.kill();
  process.exit(code);
}

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
