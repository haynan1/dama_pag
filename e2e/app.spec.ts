import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const SHOTS = process.env['E2E_SHOTS'];

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` });
}

/** Sem violações sérias ou críticas de WCAG 2.1 AA (axe-core), medidas após as animações de entrada. */
async function expectAccessible(page: Page) {
  await expectNoHorizontalScroll(page);
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .filter((a) => a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
      .every((a) => a.playState === 'finished'),
  );
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

/** Nenhum conteúdo vaza na horizontal (no celular isso reduz o zoom e desalinha os toques). */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    if (root.scrollWidth <= root.clientWidth + 1) return null;
    const culprit = [...document.querySelectorAll('body *')].find(
      (el) => el.getBoundingClientRect().right > root.clientWidth + 1,
    );
    return culprit ? `${culprit.tagName}.${culprit.className}` : 'desconhecido';
  });
  expect(overflow).toBeNull();
}

async function playFirstMove(page: Page) {
  await page.getByRole('button', { name: /^c3, pedra branca/ }).click();
  await page.getByRole('button', { name: /^d4, destino possível/ }).click();
}

// Nenhuma violação de CSP (ex.: fonte embutida como data:) nem erro de JavaScript em nenhum teste.
test.beforeEach(({ page }, info) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy/i.test(m.text()))
      problems.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => problems.push(e.message));
  (page as Page & { problems?: string[] }).problems = problems;
});

test.afterEach(({ page }) => {
  expect((page as Page & { problems?: string[] }).problems ?? []).toEqual([]);
});

const yourTurn = (page: Page) => page.getByRole('status').filter({ hasText: 'Sua vez' });

test('início: nova partida e estado inicial', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Nova partida' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Brasileira/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: /Modo mentor/ })).toBeVisible();
  await expectAccessible(page);
  await shot(page, 'home');
});

test('contra a IA com mentor: lance, revisão, dica, árvore, estudo, desfazer, abandono e revisão', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Força da IA').fill('1');
  await page.getByRole('button', { name: /Jogar contra a IA/ }).click();
  await expect(page).toHaveURL(/\/partida\//);
  await expect(yourTurn(page)).toBeVisible();

  await playFirstMove(page);
  await expect(page.getByRole('button', { name: /^c3, pedra branca/ })).toHaveCount(0);
  await expect(yourTurn(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel('Avaliação do seu último lance')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Qual peça devo mover?' }).click();
  await expect(page.getByText(/Olhe para a peça em/)).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar o lance e o porquê' }).click();

  await page.getByRole('button', { name: 'Mapear possibilidades' }).click();
  await expect(page.getByText(/Melhor plano/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('O que o adversário pode fazer')).toBeVisible();
  await shot(page, 'game-mentor');
  await expectAccessible(page);

  await page.getByRole('switch', { name: /Modo estudo/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Modo estudo' })).toBeVisible();
  await page.getByRole('switch', { name: /Modo estudo/ }).click();
  await expect(yourTurn(page)).toBeVisible();

  await page.getByRole('button', { name: 'Desfazer lance' }).click();
  await expect(page.getByRole('button', { name: /^c3, pedra branca/ })).toBeVisible();
  await playFirstMove(page);
  await expect(yourTurn(page)).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Abandonar partida' }).click();
  await page.getByRole('button', { name: 'Confirmar abandono' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Derrota' })).toBeVisible();
  await shot(page, 'result');
  await dialog.getByRole('link', { name: /Revisar partida/ }).click();
  await expect(page.getByRole('heading', { name: /Derrota/ })).toBeVisible();
  await expect(page.getByRole('slider', { name: /Gráfico de avaliação/ })).toBeVisible();
  await shot(page, 'review');
  await expectAccessible(page);
});

test('análise livre: melhores lances e lances dos dois lados', async ({ page }) => {
  await page.goto('/analise');
  await page.getByRole('button', { name: /Melhores lances/ }).click();
  await expect(page.getByText(/Profundidade \d+ ·/)).toBeVisible({ timeout: 20_000 });
  // Arrastar e soltar com o mouse/dedo: e3 → f4.
  const from = await page.getByRole('button', { name: /^e3, pedra branca/ }).boundingBox();
  const to = await page.getByRole('button', { name: /^f4$/ }).boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + from!.width / 2 + 10, from!.y + from!.height / 2 - 10, { steps: 3 });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText('Pretas jogam')).toBeVisible();
  await expect(page.getByRole('button', { name: /^f4, pedra branca/ })).toBeVisible();
  await shot(page, 'analysis');
  await expectAccessible(page);
});

test('estudos, histórico, progresso e 404', async ({ page }) => {
  await page.goto('/estudos');
  await expect(page.getByRole('heading', { name: /Aprenda com/ })).toBeVisible();
  await shot(page, 'studies');
  await expectAccessible(page);
  await page.goto('/historico');
  await expect(page.getByRole('heading', { name: 'Suas partidas' })).toBeVisible();
  await expectAccessible(page);
  await page.goto('/progresso');
  await expect(page.getByRole('heading', { name: /Conquistas/ })).toBeVisible();
  await expect(page.getByText('Primeiro lance').first()).toBeVisible();
  await shot(page, 'progress');
  await expectAccessible(page);
  await page.goto('/nao-existe');
  await expect(page.getByRole('heading', { name: 'Esta casa está vazia.' })).toBeVisible();
});

test('rede local: sala, convite e lance visto pelo adversário', async ({ page, browser, baseURL }, info) => {
  test.skip(info.project.name === 'mobile', 'Fluxo de duas pessoas coberto no desktop');
  await page.goto('/');
  await page.getByRole('radio', { name: 'Na rede' }).click();
  await page.getByRole('button', { name: /Criar sala na rede/ }).click();
  const codeText = await page.locator('p', { hasText: 'Código da sala' }).innerText();
  const code = codeText.replace('Código da sala:', '').trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  await shot(page, 'lan-waiting');

  // Outra pessoa: contexto limpo, sem o cookie do anfitrião.
  const guestContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    baseURL: baseURL!,
    storageState: { cookies: [], origins: [] },
  });
  const guest = await guestContext.newPage();
  await guest.goto('/');
  await guest.getByLabel('Como você quer ser chamado?').fill('Convidado');
  await guest.getByRole('button', { name: 'Começar' }).click();
  await expect(guest.getByRole('heading', { name: 'Nova partida' })).toBeVisible();
  await guest.goto(`/sala/${code}`);
  await expect(guest).toHaveURL(/\/partida\//);

  await expect(yourTurn(page)).toBeVisible();
  await playFirstMove(page);
  await expect(yourTurn(guest)).toBeVisible();
  await expect(guest.getByRole('button', { name: /^d4, pedra branca/ })).toBeVisible();
  await shot(guest, 'lan-guest');
  await guestContext.close();
});
