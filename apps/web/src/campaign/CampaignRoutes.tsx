import { useEffect, useState } from 'react';
import { Route, Switch } from 'wouter';
import { LevelPage } from './LevelPage.tsx';
import { loadCampaign } from './store.ts';
import { Trail } from './Trail.tsx';
import { SimulatedAd } from './ui/SimulatedAd.tsx';

/**
 * A campanha como módulo de rotas relativas: montada na raiz no app Android e em `/campanha`
 * no app da rede local. Nada aqui fala com o servidor — o motor roda no aparelho.
 */
export function CampaignRoutes() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadCampaign().finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="campaign-splash" role="status" aria-busy="true" aria-label="Carregando a campanha">
        <span className="display">Dama</span>
      </div>
    );
  }

  return (
    <>
      <Switch>
        <Route path="/" component={Trail} />
        <Route path="/fase/:id">{(p) => <LevelPage key={p.id} id={p.id} />}</Route>
        <Route>
          <Trail />
        </Route>
      </Switch>
      {import.meta.env.DEV && <SimulatedAd />}
    </>
  );
}
