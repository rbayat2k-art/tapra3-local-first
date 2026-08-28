import {expect, test, type Page} from '@playwright/test';

async function enterAsAdmin(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', {name: /سلام|خوش آمدید|پرونده خود را کامل‌تر/}).first()).toBeVisible({timeout: 15_000});
  if (await page.getByRole('heading', {name: 'خوش آمدید'}).isVisible()) {
    await page.getByPlaceholder('username').fill('admin');
    await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');
    await page.getByRole('button', {name: 'ورود به سامانه'}).click();
  }
  const completionHeading = page.getByRole('heading', {name: /پرونده خود را کامل‌تر/});
  if (await completionHeading.isVisible()) {
    await page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first().click();
    await expect(page.getByRole('heading', {name: /سلام/})).toBeVisible();
  }
}

test('کاربران پیوند پرسنلی، سلامت جایگاه و حساب‌های سطح‌بالا را نشان می‌دهند', async ({page}) => {
  await enterAsAdmin(page);
  await page.goto('/?page=users');
  const metrics = page.locator('.user-metrics');
  await expect(metrics).toContainText('متصل به پرسنل');
  await expect(metrics).toContainText('نیازمند بررسی');
  await page.getByRole('button', {name: 'سطح‌بالا'}).click();
  expect(await page.locator('.user-row').count()).toBeGreaterThan(0);
  await expect(page.locator('.user-row').first().locator('.account-health-badge')).toContainText('هماهنگ');
});

test('واحد و سمت کاربر در نمای موبایل پنهان نمی‌شوند', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await enterAsAdmin(page);
  await page.goto('/?page=users');
  const firstPlacement = page.locator('.user-placement-summary').first();
  await expect(firstPlacement).toBeVisible();
  await expect(firstPlacement).toContainText('واحد');
  await expect(firstPlacement).toContainText('سمت');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
