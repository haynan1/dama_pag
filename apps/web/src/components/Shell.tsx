import {
  BookOpenText,
  ChartLineUp,
  ClockCounterClockwise,
  Crown,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import { type ReactNode, useEffect, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { useMe } from '../lib/queries.ts';
import s from './Shell.module.css';

const NAV = [
  {
    href: '/',
    label: 'Jogar',
    icon: Crown,
    match: (p: string) => p === '/' || p.startsWith('/partida') || p.startsWith('/sala'),
  },
  { href: '/estudos', label: 'Estudos', icon: BookOpenText, match: (p: string) => p.startsWith('/estudos') },
  {
    href: '/analise',
    label: 'Análise',
    icon: MagnifyingGlass,
    match: (p: string) => p.startsWith('/analise'),
  },
  {
    href: '/historico',
    label: 'Histórico',
    icon: ClockCounterClockwise,
    match: (p: string) => p.startsWith('/historico'),
  },
  {
    href: '/progresso',
    label: 'Progresso',
    icon: ChartLineUp,
    match: (p: string) => p.startsWith('/progresso'),
  },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const me = useMe();
  const due = me.data?.studiesDue ?? 0;
  const profile = me.data?.profile;
  const mainRef = useRef<HTMLElement>(null);
  const immersive = location.startsWith('/partida');

  // Foco no conteúdo principal ao trocar de página (leitores de tela).
  const first = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: dispara a cada troca de rota.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [location]);

  return (
    <div className={`${s.shell} ${immersive ? s.immersive : ''}`}>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <nav className={s.rail} aria-label="Principal">
        <Link href="/" className={s.brand} aria-label="Dama — início">
          <span className={s.mark} aria-hidden="true" />
          <span className="display">Dama</span>
        </Link>
        <ul className={s.items}>
          {NAV.map((item) => {
            const active = item.match(location);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link href={item.href} className={s.item} aria-current={active ? 'page' : undefined}>
                  <Icon weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.href === '/estudos' && due > 0 && (
                    <span className={s.count}>
                      {due > 99 ? '99+' : due}
                      <span className="visually-hidden"> estudos para revisar</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        {profile && (
          <Link href="/progresso" className={s.me}>
            <span className={s.avatar} aria-hidden="true">
              {profile.name.slice(0, 1).toUpperCase()}
            </span>
            <span className={s.meText}>
              <strong>{profile.name}</strong>
              <span>
                Nível {profile.level.level} · <span className="mono">{profile.rating}</span>
              </span>
            </span>
          </Link>
        )}
      </nav>
      <main id="conteudo" ref={mainRef} tabIndex={-1} className={s.main}>
        {children}
      </main>
    </div>
  );
}
