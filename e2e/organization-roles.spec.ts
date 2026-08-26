import {expect, test, type Page} from '@playwright/test';

async function enterAsAdmin(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', {name: /سلام|خوش آمدید|پرونده خود را کامل‌تر/}).first()).toBeVisible({timeout: 15_000});
  if (await page.getByRole('heading', {name: 'خوش آمدید'}).isVisible()) {
    await page.getByPlaceholder('username').fill('admin');
    await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');
    await page.getByRole('button', {name: 'ورود به سامانه'}).click();
  }
  const defer = page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  if (await page.getByRole('heading', {name: /پرونده خود را کامل‌تر/}).isVisible()) {
    await expect(defer).toBeVisible({timeout: 5_000});
    await defer.click();
  }
}

test('نقش‌ها سلامت، استفاده واقعی و حوزه مجوزها را نشان می‌دهند', async ({page}) => {
  await enterAsAdmin(page);
  await page.goto('/?page=roles');

  await expect(page.getByRole('region', {name: 'خلاصه سلامت نقش‌ها'})).toContainText('نیازمند بررسی');
  await page.getByRole('button', {name: /بدون استفاده/}).click();
  await expect(page.locator('.role-row').first()).toContainText('نقش فعال به هیچ کاربری تخصیص ندارد');
  await page.getByRole('button', {name: /دارای کاربر/}).click();

  const role = page.locator('.role-row').filter({has: page.getByText('مدیر سامانه', {exact: true})});
  await expect(role.locator('.role-row-users')).not.toContainText('0');
  await role.locator('.role-row-identity').click();
  const dialog = page.getByRole('dialog', {name: 'مدیر سامانه'});
  await expect(dialog).toContainText('مجوزها به تفکیک حوزه');
  await expect(dialog).toContainText('کاربران دارای این نقش');
  await expect(dialog).toContainText('@s.ahmadi');
});

test('فیلترها و کارت‌های نقش در موبایل بیرون‌زدگی ندارند', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await enterAsAdmin(page);
  await page.goto('/?page=roles');
  await page.getByRole('button', {name: /حساس/}).click();
  await expect(page.locator('.role-list-head')).toBeHidden();
  await expect(page.locator('.role-row').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
