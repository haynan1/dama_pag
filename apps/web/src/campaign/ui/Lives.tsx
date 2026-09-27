import { adRewardsLeft, LIVES, livesNow, nextLifeIn } from '@dama/campaign';
import { Crown, FilmStrip, Heart, Infinity as InfinityIcon, Lightning } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useToast } from '../../components/Toasts.tsx';
import { Button } from '../../components/ui.tsx';
import { rewardedAvailable, showRewarded } from '../../platform/ads.ts';
import { buy, loadProducts, type Product, usePremium } from '../../platform/billing.ts';
import { haptic } from '../../platform/haptics.ts';
import { campaign, useCampaign, useNow } from '../store.ts';
import s from './campaign.module.css';
import { Sheet } from './Sheet.tsx';

export function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = String(total % 60).padStart(2, '0');
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}:${sec}`;
}

/** Vidas no topo da tela: corações + contagem da próxima. Toque abre a folha de vidas. */
export function LivesBadge({ onOpen }: { onOpen: () => void }) {
  const state = useCampaign();
  const premium = usePremium();
  const now = useNow();
  const lives = livesNow(state, now);
  const next = nextLifeIn(state.lives, now);

  const label = premium
    ? 'Vidas infinitas (Dama Pro)'
    : `${lives.count} de ${LIVES.max} vidas${next !== null ? `, próxima em ${countdown(next)}` : ''}`;

  return (
    <button type="button" className={s.lives} onClick={onOpen} aria-label={`${label}. Abrir vidas`}>
      {premium ? (
        <>
          <Heart weight="fill" className={s.heartOn} aria-hidden="true" />
          <InfinityIcon weight="bold" aria-hidden="true" />
        </>
      ) : (
        <>
          <span className={s.hearts} aria-hidden="true">
            {Array.from({ length: LIVES.max }, (_, i) => (
              <Heart
                // biome-ignore lint/suspicious/noArrayIndexKey: posição fixa de cada coração.
                key={i}
                weight={i < lives.count ? 'fill' : 'regular'}
                className={i < lives.count ? s.heartOn : s.heartOff}
              />
            ))}
          </span>
          {next !== null && (
            <span className={`${s.livesTimer} mono`} aria-hidden="true">
              {countdown(next)}
            </span>
          )}
        </>
      )}
    </button>
  );
}

/**
 * Folha de vidas: as três formas de voltar a jogar, em ordem de custo para o jogador —
 * esperar (grátis), assistir um anúncio, comprar. Nenhuma é empurrada: a folha só aparece
 * quando o jogador toca nas vidas ou tenta jogar sem nenhuma.
 */
export function LivesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useCampaign();
  const premium = usePremium();
  const now = useNow();
  const toast = useToast();
  const lives = livesNow(state, now);
  const next = nextLifeIn(state.lives, now);
  const full = lives.count >= LIVES.max;
  const adsLeft = adRewardsLeft(state, now);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [busy, setBusy] = useState<'ad' | Product['id'] | null>(null);

  useEffect(() => {
    if (!open || products) return;
    let alive = true;
    loadProducts()
      .then((p) => alive && setProducts(p))
      .catch(() => alive && setProducts([]));
    return () => {
      alive = false;
    };
  }, [open, products]);

  const watch = async () => {
    setBusy('ad');
    const outcome = await showRewarded();
    setBusy(null);
    if (outcome === 'rewarded' && campaign.rewardAd()) {
      haptic('success');
      toast('+1 vida', 'success');
    } else if (outcome === 'unavailable') {
      toast('Nenhum anúncio disponível agora. Tente em alguns minutos.', 'error');
    }
  };

  const purchase = async (id: Product['id']) => {
    setBusy(id);
    const outcome = await buy(id);
    setBusy(null);
    if (outcome === 'purchased') {
      if (id === 'refill') campaign.refill();
      haptic('success');
      toast(id === 'pro' ? 'Dama Pro ativado. Obrigado!' : 'Vidas recarregadas', 'success');
      onClose();
    } else if (outcome === 'pending') {
      toast('Pagamento em processamento. As vidas chegam assim que ele for confirmado.', 'info');
    } else if (outcome === 'failed' || outcome === 'unavailable') {
      toast('A compra não foi concluída. Nenhuma cobrança foi feita.', 'error');
    }
  };

  const refillProduct = products?.find((p) => p.id === 'refill');
  const proProduct = products?.find((p) => p.id === 'pro');

  return (
    <Sheet open={open} onClose={onClose} labelledBy="vidas-titulo">
      <p className="eyebrow">Vidas</p>
      <h2 id="vidas-titulo" className={s.sheetTitle}>
        {premium
          ? 'Infinitas'
          : full
            ? 'Cheias'
            : lives.count === 0
              ? 'Sem vidas'
              : `${lives.count} de ${LIVES.max}`}
      </h2>
      {premium ? (
        <p className={s.sheetLead}>Com o Dama Pro você joga quantas fases quiser, sem intervalos.</p>
      ) : (
        <p className={s.sheetLead}>
          Cada fase usa uma vida, devolvida se você concluir. Uma vida volta a cada hora
          {next !== null && (
            <>
              {' '}
              — a próxima em <strong className="mono">{countdown(next)}</strong>
            </>
          )}
          .
        </p>
      )}

      {!premium && (
        <div className={s.offers}>
          {rewardedAvailable() && (
            <button
              type="button"
              className={s.offer}
              onClick={() => void watch()}
              disabled={full || adsLeft === 0 || busy !== null}
              aria-busy={busy === 'ad' || undefined}
            >
              <span className={s.offerIcon} aria-hidden="true">
                <FilmStrip weight="duotone" />
              </span>
              <span className={s.offerText}>
                <strong>Assistir um anúncio</strong>
                <span>
                  {full
                    ? 'Suas vidas já estão cheias'
                    : adsLeft === 0
                      ? 'Limite de hoje atingido'
                      : `+1 vida · ${adsLeft} hoje`}
                </span>
              </span>
              <span className={s.offerPrice}>Grátis</span>
            </button>
          )}
          {refillProduct && (
            <button
              type="button"
              className={s.offer}
              onClick={() => void purchase('refill')}
              disabled={full || busy !== null}
              aria-busy={busy === 'refill' || undefined}
            >
              <span className={s.offerIcon} aria-hidden="true">
                <Lightning weight="duotone" />
              </span>
              <span className={s.offerText}>
                <strong>Recarga completa</strong>
                <span>{full ? 'Suas vidas já estão cheias' : `Volta para ${LIVES.max} vidas agora`}</span>
              </span>
              <span className={`${s.offerPrice} mono`}>{refillProduct.price}</span>
            </button>
          )}
          {products === null && <div className={s.offerSkeleton} aria-hidden="true" />}
        </div>
      )}

      {!premium && proProduct && (
        <div className={s.pro}>
          <Crown weight="fill" className={s.proCrown} aria-hidden="true" />
          <div>
            <p className={s.proTitle}>Dama Pro</p>
            <p className={s.proText}>Vidas infinitas e nenhum intervalo entre fases. Pagamento único.</p>
          </div>
          <Button
            variant="primary"
            onClick={() => void purchase('pro')}
            loading={busy === 'pro'}
            disabled={busy !== null}
          >
            {proProduct.price}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
