import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@playwright/test';

async function enterAsCurrentUser(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', {name: /سلام|خوش آمدید|پرونده خود را کامل‌تر/}).first()).toBeVisible({timeout: 15_000});
  const initialDefer = page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  if (await initialDefer.isVisible()) {
    await expect(initialDefer).toBeEnabled();
    await initialDefer.click();
    await expect(page.getByRole('heading', {name: /سلام/})).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'})).toHaveCount(0);
  }
  if (await page.getByRole('heading', {name: 'خوش آمدید'}).isVisible()) {
    await page.getByPlaceholder('username').fill('admin');
    await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');
    await page.getByRole('button', {name: 'ورود به سامانه'}).click();
    const deferAfterLogin = page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
    if (await deferAfterLogin.isVisible()) await deferAfterLogin.click();
  }
  await expect(page.getByRole('heading', {name: /سلام/})).toBeVisible();
}

test('صف نواقص و مدارک اجباری بدون قطع دسترسی نمایش داده می‌شوند', async ({page}) => {
  await enterAsCurrentUser(page);
  await page.goto('/?page=personnel');
  await page.getByText('نواقص پرونده', {exact: true}).click();
  await expect(page.getByText('نواقص پرونده پرسنلی', {exact: true})).toBeVisible();
  await expect(page.getByText(/نیازمند تکمیل/).first()).toBeVisible();

  await page.getByRole('button', {name: 'بازکردن بخش مدارک'}).first().click();
  const dialog = page.getByRole('dialog').filter({hasText: 'پرونده پرسنلی'});
  await expect(dialog.getByText('سطح ۲ · اطلاعات کامل', {exact: true})).toBeVisible();
  await expect(dialog.getByText('صفحه اول شناسنامه', {exact: true})).toBeVisible();
  await expect(dialog.getByText('پشت کارت ملی', {exact: true})).toBeVisible();
  await expect(dialog.getByText('عکس پرسنلی', {exact: true})).toBeVisible();
  await expect(dialog.getByText('اجباری', {exact: true})).toHaveCount(2);
  await expect(dialog.getByText('اختیاری', {exact: true})).toHaveCount(4);
  await expect(dialog.getByRole('button', {name: 'ذخیره تغییرات'})).toHaveCount(0);
  await expect(dialog.locator('input[type=file]').first()).toHaveCSS('position', 'absolute');

  const firstDocumentInput = dialog.locator('input[aria-label="بارگذاری صفحه اول شناسنامه"]');
  await firstDocumentInput.setInputFiles({name: 'identity.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg></svg>')});
  await expect(dialog.getByText(/PDF، JPG، PNG یا WebP/)).toBeVisible();
  await firstDocumentInput.setInputFiles({name: 'birth-certificate.png', mimeType: 'image/png', buffer: Buffer.from([137,80,78,71,13,10,26,10])});
  await expect(dialog.getByText('birth-certificate.png', {exact: true})).toBeVisible();
  await dialog.locator('input[aria-label="بارگذاری پشت کارت ملی"]').setInputFiles({name: 'national-id.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4')});
  await expect(dialog.getByText('سطح ۳ · هویت تکمیل', {exact: true})).toBeVisible();

  const results = await new AxeBuilder({page}).include('.personnel-documents').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'), JSON.stringify(results.violations, null, 2)).toEqual([]);

  await page.setViewportSize({width: 390, height: 844});
  expect(await dialog.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
  await dialog.getByRole('button', {name: 'بستن پنجره'}).click();
  await expect(page.getByText('28 پرونده', {exact: true})).toBeVisible();
});
