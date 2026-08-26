import {expect, test, type Page} from '@playwright/test';

async function openSignedOutPortal(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', {name: /سلام|خوش آمدید|پرونده خود را کامل‌تر/}).first()).toBeVisible({timeout: 15_000});
  const initialDefer = page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  if (await initialDefer.isVisible()) {
    await initialDefer.click();
    await expect(page.getByRole('heading', {name: /سلام/})).toBeVisible();
  }
  if (await page.getByRole('heading', {name: /سلام/}).isVisible()) {
    await page.locator('.account-trigger').click();
    await page.getByRole('button', {name: /خروج از سامانه/}).first().click();
    await page.getByRole('dialog').getByRole('button', {name: 'خروج از سامانه'}).click();
  }
  await expect(page.getByRole('heading', {name: 'خوش آمدید'})).toBeVisible();
}

async function signInAsAdmin(page: Page) {
  await page.getByPlaceholder('username').fill('admin');
  await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');
  await page.getByRole('button', {name: 'ورود به سامانه'}).click();
  const gateHeading = page.getByRole('heading', {name: /پرونده خود را کامل‌تر/});
  await expect(page.getByRole('heading', {name: /سلام|پرونده خود را کامل‌تر/}).first()).toBeVisible({timeout: 15_000});
  if (await gateHeading.isVisible()) {
    await page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first().click();
    await expect(page.getByRole('heading', {name: /سلام/})).toBeVisible();
  }
}

test('درخواست تازه در صف اقدام منابع انسانی با گام بعدی روشن دیده می‌شود', async ({page}) => {
  test.setTimeout(60_000);
  await openSignedOutPortal(page);
  await page.getByRole('button', {name: 'ثبت‌نام در سامانه'}).click();
  const dialog = page.locator('.dialog--registration');
  await dialog.getByLabel('نام و نام خانوادگی').fill('متقاضی آزمون سازمان');
  await dialog.getByLabel('کد ملی').fill('1234567891');
  await dialog.getByLabel('جنسیت').selectOption('male');
  await dialog.getByLabel('نام کاربری پیشنهادی').fill('org.queue.test');
  await dialog.getByLabel('شماره همراه اصلی').fill('09129999998');
  await dialog.getByLabel('شماره تماس دوم').fill('09129999997');
  await dialog.getByLabel('استان').fill('تهران');
  await dialog.getByLabel('شهر').fill('تهران');
  await dialog.getByLabel('نشانی کامل').fill('تهران، نشانی آزمون صف ثبت‌نام');
  await dialog.getByLabel('نام بانک').fill('بانک آزمون');
  await dialog.getByLabel('شماره کارت').fill('6219861984162049');
  await dialog.getByRole('button', {name: 'ثبت درخواست'}).click();
  await expect(page.getByText('درخواست ثبت‌نام با کد پیگیری ثبت شد.')).toBeVisible();

  await signInAsAdmin(page);
  await page.goto('/?page=registrations');
  await expect(page.getByRole('region', {name: 'خلاصه صف ثبت‌نام'})).toContainText('1');
  await expect(page.getByText('شروع بررسی توسط منابع انسانی')).toBeVisible();
  await page.getByRole('button', {name: /منابع انسانی 1/}).click();
  const requestRow = page.locator('.registration-list>button').filter({hasText: '@org.queue.test'});
  await expect(requestRow).toContainText('منابع انسانی');
  await requestRow.click();
  await expect(page.getByRole('dialog')).toContainText('متقاضی آزمون سازمان');
  await expect(page.getByRole('dialog')).toContainText('تصمیم منابع انسانی');
});
