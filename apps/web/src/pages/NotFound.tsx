import { Link } from 'wouter';
import p from './pages.module.css';

export function NotFound() {
  return (
    <div className={p.page} style={{ placeItems: 'center', minHeight: '60dvh', textAlign: 'center' }}>
      <div style={{ display: 'grid', gap: 12 }}>
        <p className="eyebrow">404</p>
        <h1 className={p.title}>Esta casa está vazia.</h1>
        <p className="muted">A página que você procurou não existe.</p>
        <Link href="/">Voltar ao início</Link>
      </div>
    </div>
  );
}
