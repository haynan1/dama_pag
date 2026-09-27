import { expect, test as setup } from '@playwright/test';

setup('onboarding cria o perfil', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Jogue\. Estude\./ })).toBeVisible();
  const name = page.getByLabel('Como você quer ser chamado?');
  // Validação inline com mensagem clara.
  await name.fill('A');
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect(page.getByRole('alert')).toContainText('ao menos 2');
  await name.fill('Ana Tester');
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect(page.getByRole('heading', { name: /Ana/ })).toBeVisible();
  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
