import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@playwright/test';

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({page})
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const violations = results.violations.filter((item) =>
    item.impact === 'serious' || item.impact === 'critical');
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

async function openSignedOutPortal(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', {name: /سلام|خوش آمدید/}).first()).toBeVisible({timeout: 15_000});
  const dashboardHeading = page.getByRole('heading', {name: /سلام/});
  if (await dashboardHeading.isVisible()) {
    await page.locator('.account-trigger').click();
    await page.getByRole('button', {name: /خروج از سامانه/}).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', {name: 'خروج از سامانه'}).click();
  }
  await expect(page.getByRole('heading', {name: 'خوش آمدید'})).toBeVisible();
}

async function signInAsAdmin(page: Page) {
  await openSignedOutPortal(page);
  await page.getByPlaceholder('username').fill('admin');
  await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');
  await page.getByRole('button', {name: 'ورود به سامانه'}).click();
  await expect(page.getByRole('heading', {name: /سلام/})).toBeVisible();
}

test('ورود محلی پس از بارگذاری دوباره حفظ می‌شود', async ({page}) => {
  await signInAsAdmin(page);
  await page.reload();
  await expect(page.getByRole('heading', {name: /سلام/})).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveAttribute('dir', 'rtl');
});

test('صفحه ورود و داشبورد تخلف جدی accessibility ندارند', async ({page}) => {
  await openSignedOutPortal(page);
  await expectNoSeriousAccessibilityViolations(page);

  await signInAsAdmin(page);
  await expectNoSeriousAccessibilityViolations(page);
});
