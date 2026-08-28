import {expect, test, type Page} from '@playwright/test';

async function enterAsAdmin(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', {name: /سلام|خوش آمدید|پرونده خود را کامل‌تر/}).first()).toBeVisible({timeout: 15_000});
  if (await page.getByRole('heading', {name: 'خوش آمدید'}).isVisible()) {
    await page.getByPlaceholder('username').fill('admin');
    await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');
    await page.getByRole('button', {name: 'ورود به سامانه'}).click();
    await expect(page.getByRole('heading', {name: /سلام|پرونده خود را کامل‌تر/}).first()).toBeVisible({timeout: 15_000});
  }
  const defer = page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  const completionGateAppeared = await defer.waitFor({state: 'visible', timeout: 3_000}).then(() => true).catch(() => false);
  if (completionGateAppeared) {
    await defer.click();
    await expect(page.getByRole('heading', {name: /سلام/}).first()).toBeVisible();
  }
}

test('نمای سازمان ضعف‌ها را یک‌جا نشان می‌دهد و مستقیم به بخش اصلاح می‌رود', async ({page}) => {
  await enterAsAdmin(page);
  await page.goto('/?page=organization');
  const actionCenter = page.getByRole('region', {name: 'مرکز اقدام سلامت سازمان'});
  await expect(actionCenter).toContainText('ضعف‌های قابل پیگیری سازمان');
  await expect(actionCenter.getByRole('button')).toHaveCount(8);
  await actionCenter.getByRole('button', {name: /شعبه‌ها/}).click();
  await expect(page.getByRole('heading', {name: 'شعبه', level: 1})).toBeVisible();
  await expect(page).toHaveURL(/page=branches/);
});

test('شعبه‌های بدون مسئول یا پرسنل در فیلتر سلامت دیده می‌شوند', async ({page}) => {
  await enterAsAdmin(page);
  await page.goto('/?page=branches');
  const metrics = page.locator('.org-metrics');
  await expect(metrics).toContainText('مسئول معتبر');
  await expect(metrics).toContainText('نیازمند بررسی');
  await page.getByRole('button', {name: /نیازمند بررسی/}).click();
  const cards = page.locator('.branch-card');
  expect(await cards.count()).toBeGreaterThan(0);
  await expect(cards.first()).toContainText('نیازمند بررسی');
  await expect(cards.first().locator('.branch-health-issues')).toBeVisible();
});

test('ساختار فروش، مسیرهای بدون فروشنده و هویت اعضای زنجیره را روشن نشان می‌دهد', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await enterAsAdmin(page);
  await page.goto('/?page=sales-structures');
  const rows = page.locator('.sales-structure-row');
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText(/P-\d+/);
  await page.getByLabel('وضعیت و سلامت ساختار').selectOption('without-sellers');
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(rows.first()).toContainText('هنوز فروشنده‌ای متصل نیست');

  await page.getByRole('button', {name: 'ساخت مسیر جدید'}).click();
  const dialog = page.getByRole('dialog', {name: 'ساخت مسیر سرپرست کال‌سنتر'});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('شعبه')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
