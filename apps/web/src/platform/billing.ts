import { useSyncExternalStore } from 'react';
import { BILLING } from './config.ts';
import { isNative } from './runtime.ts';
import { storage } from './storage.ts';

/**
 * Compras (Google Play Billing via RevenueCat).
 *
 * Por que RevenueCat: o app não tem servidor, e compra validada só no aparelho é compra
 * falsificável. A RevenueCat valida cada recibo com o Google no servidor dela, reconhece
 * (acknowledge) a compra dentro do prazo da Play — compra não reconhecida em 3 dias é estornada —
 * e entrega o direito (entitlement) pronto. O SDK usa só a chave pública.
 *
 * Produtos:
 * - `refill` (consumível): enche as vidas.
 * - `pro` (vitalício): vidas infinitas e sem intersticiais. Anúncio recompensado continua opcional.
 */
export type ProductId = 'refill' | 'pro';

export interface Product {
  readonly id: ProductId;
  readonly title: string;
  readonly price: string;
}

export type PurchaseOutcome = 'purchased' | 'pending' | 'cancelled' | 'failed' | 'unavailable';

type Rc = typeof import('@revenuecat/purchases-capacitor');
type RcPackage = import('@revenuecat/purchases-capacitor').PurchasesPackage;
type RcCustomerInfo = import('@revenuecat/purchases-capacitor').CustomerInfo;

const PRO_KEY = 'dama:pro';

let premium = false;
const listeners = new Set<() => void>();
let rc: Promise<Rc | null> | null = null;
let packages = new Map<ProductId, RcPackage>();

function setPremium(value: boolean): void {
  if (premium === value) return;
  premium = value;
  void storage.set(PRO_KEY, value ? '1' : '0');
  for (const l of listeners) l();
}

function fromCustomer(info: RcCustomerInfo): void {
  setPremium(info.entitlements.active[BILLING.entitlement] !== undefined);
}

async function setup(): Promise<Rc | null> {
  if (!BILLING.revenueCatKey) {
    console.warn('[compras] VITE_REVENUECAT_ANDROID_KEY ausente: loja desativada');
    return null;
  }
  const mod = await import('@revenuecat/purchases-capacitor');
  await mod.Purchases.configure({ apiKey: BILLING.revenueCatKey });
  await mod.Purchases.addCustomerInfoUpdateListener(fromCustomer);
  fromCustomer((await mod.Purchases.getCustomerInfo()).customerInfo);
  return mod;
}

function purchases(): Promise<Rc | null> {
  if (!isNative) return Promise.resolve(null);
  rc ??= setup().catch((err: unknown) => {
    console.warn('[compras] inicialização falhou', err);
    rc = null;
    return null;
  });
  return rc;
}

/** Carrega o direito salvo (vale offline) e conecta à loja em segundo plano. */
export async function initBilling(): Promise<void> {
  premium = (await storage.get(PRO_KEY)) === '1';
  for (const l of listeners) l();
  void purchases();
}

export async function loadProducts(): Promise<Product[]> {
  if (!isNative) return import.meta.env.DEV ? DEV_PRODUCTS : [];
  const mod = await purchases();
  if (!mod) return [];
  const offerings = await mod.Purchases.getOfferings();
  const found = new Map<ProductId, RcPackage>();
  for (const pkg of offerings.current?.availablePackages ?? []) {
    // A Play acrescenta ":plano" em assinaturas; os nossos produtos são avulsos, mas o corte é seguro.
    const storeId = pkg.product.identifier.split(':')[0];
    if (storeId === BILLING.products.refill) found.set('refill', pkg);
    if (storeId === BILLING.products.pro) found.set('pro', pkg);
  }
  packages = found;
  return [...found].map(([id, pkg]) => ({ id, title: pkg.product.title, price: pkg.product.priceString }));
}

export async function buy(id: ProductId): Promise<PurchaseOutcome> {
  if (!isNative) {
    if (!import.meta.env.DEV) return 'unavailable';
    if (id === 'pro') setPremium(true);
    return 'purchased';
  }
  const mod = await purchases();
  const pkg = packages.get(id);
  if (!mod || !pkg) return 'unavailable';
  try {
    const result = await mod.Purchases.purchasePackage({ aPackage: pkg });
    fromCustomer(result.customerInfo);
    return 'purchased';
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === mod.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return 'cancelled';
    // Pix/boleto: a Play confirma depois. O direito chega pelo listener quando o pagamento cair.
    if (code === mod.PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return 'pending';
    console.warn('[compras] falhou', err);
    return 'failed';
  }
}

/** Restaura compras (troca de aparelho, reinstalação). Devolve se o Pro está ativo. */
export async function restorePurchases(): Promise<boolean> {
  const mod = await purchases();
  if (!mod) return premium;
  fromCustomer((await mod.Purchases.restorePurchases()).customerInfo);
  return premium;
}

export function isPremium(): boolean {
  return premium;
}

export function usePremium(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => premium,
    () => false,
  );
}

const DEV_PRODUCTS: Product[] = [
  { id: 'refill', title: 'Recarga de vidas (teste)', price: 'R$ 4,90' },
  { id: 'pro', title: 'Dama Pro (teste)', price: 'R$ 19,90' },
];
