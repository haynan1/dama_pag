import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { api } from '../lib/api.ts';
import p from './pages.module.css';

/** Link direto de convite: /sala/K7QX2M entra na sala e redireciona para a partida. */
export function JoinRoom({ code }: { code: string }) {
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api
      .joinRoom(code.toUpperCase())
      .then(({ id }) => navigate(`/partida/${id}`, { replace: true }))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Não foi possível entrar'));
  }, [code, navigate]);

  return (
    <div className={p.page} style={{ placeItems: 'center', minHeight: '60dvh', textAlign: 'center' }}>
      {error ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <h1 className={p.title}>Sala indisponível</h1>
          <p className="muted">{error}</p>
          <Link href="/">Voltar ao início</Link>
        </div>
      ) : (
        <p className="muted" role="status">
          Entrando na sala <span className="mono">{code.toUpperCase()}</span>…
        </p>
      )}
    </div>
  );
}
