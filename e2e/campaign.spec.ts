import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/*
 * Campanha ponta a ponta, contra o build de produção: o motor roda num Web Worker do navegador
 * (nada de servidor), sob a CSP estrita do app.
 */

const FUNDAMENTOS = ['f-01', 'f-02', 'f-03', 'f-04', 'f-05', 'f-06', 'f-07', 'f-chefe'];

/** Progresso salvo pronto para o teste, gravado antes de a página carregar. */
async function seed(page: Page, patch: { stars?: Record<string, number>; lives?: number }) {
  const now = Date.now();
  const state = {
    version: 1,
    lives: { count: patch.lives ?? 3, since: now },
    stars: patch.stars ?? {},
    active: null,
    adRewards: { day: '2000-01-01', count: 0 },
    sinceInterstitial: 0,
    lastInterstitialAt: 0,
  };
  await page.addInitScript((json) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('dama:campaign', json);
      localStorage.removeItem('dama:session');
      sessionStorage.setItem('seeded', '1');
    }
  }, JSON.stringify(state));
}

async function move(page: Page, from: string, to: string) {
  await page.getByRole('button', { name: new RegExp(`^${from}, pedra`) }).click();
  await page.getByRole('button', { name: new RegExp(`^${to}, destino possível`) }).click();
}

const yourTurn = (page: Page) => page.getByRole('status').filter({ hasText: 'Sua vez' });
const hearts = (page: Page) => page.getByRole('button', { name: /de 3 vidas/ });

async function expectAccessible(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
  await page.waitForTimeout(600);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test.beforeEach(({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
});

test('trilha: abre na próxima fase, acessível e sem rolagem horizontal', async ({ page }) => {
  await seed(page, {});
  await page.goto('/campanha');
  await expect(page.getByRole('heading', { name: /Fundamentos/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Fase 1: O primeiro passo\. Próxima fase/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Fase 2: .*Bloqueada/ })).toBeDisabled();
  await expect(hearts(page)).toHaveAccessibleName(/3 de 3 vidas/);
  await expectAccessible(page);
});

test('fase 1 do início ao fim: coroação, estrelas e próxima fase', async ({ page }) => {
  await seed(page, {});
  await page.goto('/campanha');
  await page.getByRole('button', { name: /Continuar/ }).click();
  await expect(page.getByRole('heading', { name: 'O primeiro passo', exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: /Jogar/ }).click();
  await expect(page).toHaveURL(/\/campanha\/fase\/f-01$/);

  for (const [from, to] of [
    ['d4', 'c5'],
    ['c5', 'b6'],
    ['b6', 'a7'],
    ['a7', 'b8'],
  ] as const) {
    await expect(yourTurn(page)).toBeVisible({ timeout: 20_000 });
    await move(page, from, to);
  }
  await expect(page.getByRole('heading', { name: 'Exercício resolvido' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('img', { name: '3 de 3 estrelas' })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: /Próxima fase/ }).click();
  await expect(page).toHaveURL(/\/campanha\/fase\/f-02$/);
  await expect(yourTurn(page)).toBeVisible({ timeout: 20_000 });
  await move(page, 'c3', 'e5');
  await expect(page.getByRole('heading', { name: 'Exercício resolvido' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /Trilha/ }).click();
  await expect(page).toHaveURL(/\/campanha\/?$/);
  await expect(page.getByRole('button', { name: /Fase 3: .*Próxima fase/ })).toBeVisible();
});

test('lance errado: o motor recusa, explica, desfaz — e a vida paga na entrada fica gasta ao sair', async ({
  page,
}) => {
  await seed(page, { stars: Object.fromEntries(FUNDAMENTOS.map((id) => [id, 3])) });
  await page.goto('/campanha');
  await page.getByRole('button', { name: /Fase 9: A pedra solta/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Jogar/ }).click();
  await expect(page).toHaveURL(/\/fase\/g-01$/);
  await expect(yourTurn(page)).toBeVisible({ timeout: 20_000 });

  // h2-g3 entrega a pedra: a preta de f4 captura.
  await move(page, 'h2', 'g3');
  await expect(page.getByRole('status').filter({ hasText: /tentativas restantes/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('img', { name: '2 tentativas restantes' })).toBeVisible();
  // O lance volta: a pedra está de novo em h2.
  await expect(page.getByRole('button', { name: /^h2, pedra branca/ })).toBeVisible({ timeout: 10_000 });

  // Mais dois erros encerram o exercício; "Tentar de novo" recomeça do zero (e custa outra vida).
  // A explicação do erro fica na tela até o próximo lance; a vez volta quando a pedra volta a h2.
  for (let i = 0; i < 2; i++) {
    await expect(page.getByRole('button', { name: /^h2, pedra branca/ })).toBeVisible({ timeout: 20_000 });
    await move(page, 'h2', 'g3');
    await expect(page.getByRole('status').filter({ hasText: /tentativa|Terceiro erro/ })).toBeVisible({
      timeout: 20_000,
    });
  }
  await expect(page.getByRole('heading', { name: 'Três erros' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /Tentar de novo/ }).click();
  await expect(yourTurn(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('img', { name: '3 tentativas restantes' })).toBeVisible();

  await page.getByRole('button', { name: 'Sair da fase' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page).toHaveURL(/\/campanha\/?$/);
  await expect(hearts(page)).toHaveAccessibleName(/1 de 3 vidas, próxima em/);
});

test('sem vidas: não entra na fase e vê as opções', async ({ page }) => {
  await seed(page, { stars: Object.fromEntries(FUNDAMENTOS.map((id) => [id, 3])), lives: 0 });
  await page.goto('/campanha');
  await page.getByRole('button', { name: /Continuar/ }).click();
  await page.getByRole('button', { name: /Sem vidas/ }).click();
  await expect(page.getByRole('heading', { name: 'Sem vidas' })).toBeVisible();
  await expect(page.getByText(/Uma vida volta a cada hora/)).toBeVisible();
});

test('a URL da fase não dispensa a vida: sem ingresso, volta para a trilha', async ({ page }) => {
  await seed(page, { stars: Object.fromEntries(FUNDAMENTOS.map((id) => [id, 3])) });
  await page.goto('/campanha/fase/g-01');
  await expect(page).toHaveURL(/\/campanha\/?$/);
  await expect(hearts(page)).toHaveAccessibleName(/3 de 3 vidas/);
});

test('partida-chefe: a IA responde no aparelho e desfazer volta o seu lance', async ({ page }) => {
  await seed(page, { stars: Object.fromEntries(FUNDAMENTOS.slice(0, 7).map((id) => [id, 3])) });
  await page.goto('/campanha');
  await page.getByRole('button', { name: /Partida: Primeira partida/ }).click();
  await expect(page.getByRole('dialog').getByText('Aprendiz · nível 1')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: /Jogar/ }).click();
  await expect(yourTurn(page)).toBeVisible({ timeout: 20_000 });

  await move(page, 'c3', 'd4');
  await expect(yourTurn(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /^d4, pedra branca/ })).toBeVisible();

  await page.getByRole('button', { name: /Desfazer/ }).click();
  await expect(page.getByRole('button', { name: /^c3, pedra branca/ })).toBeVisible();
  await expect(page.getByText(/valem menos estrelas/)).toBeVisible();
});
