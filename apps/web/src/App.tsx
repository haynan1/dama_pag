import { lazy, Suspense } from 'react';
import { Route, Switch, useSearch } from 'wouter';
import { Shell } from './components/Shell.tsx';
import { Skeleton } from './components/ui.tsx';
import { ApiError } from './lib/api.ts';
import { useMe } from './lib/queries.ts';
import { Home } from './pages/Home.tsx';
import { NotFound } from './pages/NotFound.tsx';
import { Onboarding } from './pages/Onboarding.tsx';
import { useNativeApp } from './platform/native-app.ts';
import { TARGET } from './platform/runtime.ts';

const GamePage = lazy(() => import('./pages/GamePage.tsx').then((m) => ({ default: m.GamePage })));
const JoinRoom = lazy(() => import('./pages/JoinRoom.tsx').then((m) => ({ default: m.JoinRoom })));
const History = lazy(() => import('./pages/History.tsx'));
const Review = lazy(() => import('./pages/Review.tsx'));
const Studies = lazy(() => import('./pages/Studies.tsx'));
const StudyTrainer = lazy(() => import('./pages/StudyTrainer.tsx'));
const Progress = lazy(() => import('./pages/Progress.tsx'));
const Analysis = lazy(() => import('./pages/Analysis.tsx'));
const CampaignRoutes = lazy(() =>
  import('./campaign/CampaignRoutes.tsx').then((m) => ({ default: m.CampaignRoutes })),
);

function PageFallback() {
  return (
    <div
      style={{ display: 'grid', gap: 16, padding: 32 }}
      role="status"
      aria-busy="true"
      aria-label="Carregando"
    >
      <Skeleton height={44} width="40%" />
      <Skeleton height={220} />
      <Skeleton height={120} />
    </div>
  );
}

/** `/rede-local` (só no app): início com a folha de rede local. `?falha=1` vem do errorPath. */
function LanRoute() {
  const search = useSearch();
  return <Home lan={new URLSearchParams(search).has('falha') ? 'lost' : 'open'} />;
}

export function App() {
  useNativeApp();
  const me = useMe();

  if (me.isPending) {
    return (
      <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }} aria-busy="true">
        <span className="display" style={{ fontSize: 40, color: 'var(--text-3)' }}>
          Dama
        </span>
      </main>
    );
  }

  if (me.error instanceof ApiError && me.error.status === 401) return <Onboarding />;

  if (me.error) {
    return (
      <main
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
          <h1 className="display" style={{ fontSize: 40 }}>
            Servidor indisponível
          </h1>
          <p className="muted">{me.error.message}</p>
          <button type="button" onClick={() => void me.refetch()} style={{ justifySelf: 'center' }}>
            Tentar de novo
          </button>
        </div>
      </main>
    );
  }

  return (
    <Shell>
      <Suspense fallback={<PageFallback />}>
        <Switch>
          <Route path="/">
            <Home />
          </Route>
          <Route path="/partida/:id">{(p) => <GamePage id={p.id} />}</Route>
          <Route path="/sala/:code">{(p) => <JoinRoom code={p.code} />}</Route>
          <Route path="/historico" component={History} />
          <Route path="/historico/:id">{(p) => <Review id={p.id} />}</Route>
          <Route path="/estudos" component={Studies} />
          <Route path="/estudos/treino" component={StudyTrainer} />
          <Route path="/analise" component={Analysis} />
          <Route path="/progresso" component={Progress} />
          {TARGET === 'app' && (
            <Route path="/rede-local">
              <LanRoute />
            </Route>
          )}
          <Route path="/campanha" nest>
            <CampaignRoutes />
          </Route>
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </Shell>
  );
}
