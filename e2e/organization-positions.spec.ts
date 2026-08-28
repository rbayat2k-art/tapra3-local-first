import {expect, test, type Page} from '@playwright/test';

async function enterAsAdmin(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', {name: /سلام|خوش آمدید|پرونده خود را کامل‌تر/}).first()).toBeVisible({timeout: 15_000});
  if (await page.getByRole('heading', {name: 'خوش آمدید'}).isVisible()) {
    await page.getByPlaceholder('username').fill('admin');
    await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');
    await page.getByRole('button', {name: 'ورود به سامانه'}).click();
  }
  const defer = page.getByRole('button', {name: /فعلاً وارد می‌شوم/}).first();
  try {
    await defer.waitFor({state: 'visible', timeout: 15_000});
    await defer.click();
    await defer.waitFor({state: 'hidden', timeout: 15_000});
  } catch {
    // پرونده کامل است و دروازه تکمیل نمایش داده نشده است.
  }
}

test('سمت‌ها انتساب جاری، سابقه و عملیات امن را جدا نشان می‌دهند', async ({page}) => {
  await enterAsAdmin(page);
  await page.goto('/?page=positions');
  await expect(page.getByRole('heading', {name: 'سمت‌های مجاز هر واحد'})).toBeVisible();

  const metrics = page.locator('.position-catalog-metrics');
  await expect(metrics).toContainText('سمت تعریف‌شده');
  await expect(metrics).toContainText('انتساب فعال در واحد');
  await expect(page.locator('.position-inspector')).toContainText('پرونده سمت سازمانی');
  await expect(page.locator('.position-inspector')).toContainText('افراد فعال در همه واحدها');
  await expect(page.locator('.position-inspector')).toContainText('سوابق خاتمه‌یافته');

  const operator = page.locator('.unit-position-catalog__row').filter({has: page.getByText('اپراتور', {exact: true})});
  await expect(operator.getByRole('button', {name: /غیرفعال‌سازی ممکن نیست/})).toBeDisabled();
  await expect(operator.getByRole('button', {name: /حذف ممکن نیست/})).toBeDisabled();
  await expect(operator.locator('.position-assignment-count')).toContainText('0');
  await operator.getByRole('button', {name: 'مشاهده جزئیات سمت اپراتور'}).click();
  await expect(page.locator('.position-inspector')).toContainText('رضا نادری');
  await expect(page.locator('.position-inspector')).toContainText('انبار');

  await page.getByRole('button', {name: 'دارای فرد فعال'}).click();
  expect(await page.locator('.unit-position-catalog__row').count()).toBeGreaterThan(0);
  await page.getByRole('button', {name: 'بدون فرد فعال'}).click();
  expect(await page.locator('.unit-position-catalog__row').count()).toBeGreaterThan(0);
});

test('صفحه سمت‌ها در موبایل بدون بیرون‌زدگی و با کارت‌های خوانا نمایش داده می‌شود', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await enterAsAdmin(page);
  await page.goto('/?page=positions');
  await expect(page.getByRole('heading', {name: 'سمت‌های مجاز هر واحد'})).toBeVisible();
  await expect(page.locator('.unit-position-catalog__table-head')).toBeHidden();
  await expect(page.locator('.unit-position-catalog__row').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
