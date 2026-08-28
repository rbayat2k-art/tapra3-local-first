import {expect, test, type Page} from '@playwright/test';

async function signInAsAdmin(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  const loginHeading = page.getByRole('heading', {name: 'خوش آمدید'});
  if (await loginHeading.isVisible({timeout: 3_000})) {
    await page.getByPlaceholder('username').fill('admin');
    await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');
    await page.getByRole('button', {name: 'ورود به سامانه'}).click();
  }
  const defer = page.getByRole('button', {name: /فعلاً وارد می‌شوم/}).first();
  try {
    await defer.waitFor({state: 'visible', timeout: 8_000});
    await defer.click();
  } catch {
    // A completed profile enters the dashboard directly.
  }
  await expect(page.locator('#main-page-heading')).toBeVisible({timeout: 15_000});
}

test('ذخیره فرم ناقص اولین فیلد را پیدا می‌کند و نواقص را بالای برنامه نشان می‌دهد', async ({page}) => {
  await signInAsAdmin(page);
  await page.goto('/?page=hcm&module=leave');
  await page.getByRole('button', {name: /ایجاد درخواست مرخصی/}).click();

  const form = page.locator('.record-editor');
  const title = form.getByLabel('عنوان');
  await form.getByRole('button', {name: 'ایجاد رکورد'}).click();

  const popup = page.locator('.form-validation-popup');
  await expect(popup).toBeVisible();
  await expect(popup).toContainText('فرم کامل نیست');
  await expect(popup).toContainText('عنوان');
  await expect(title).toBeFocused();
  await expect(title).toHaveAttribute('data-validation-highlight', 'true');
  await expect(title).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.form-validation-summary')).toHaveCount(0);
  await expect.poll(async () => title.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight;
  })).toBe(true);

  await popup.getByRole('button', {name: 'بستن نوار نواقص'}).click();
  await expect(popup).toHaveCount(0);
});

test('در فرم چندبخشی انتخاب هر نقص کاربر را به همان کنترل می‌برد', async ({page}) => {
  test.setTimeout(60_000);
  await signInAsAdmin(page);
  await page.goto('/?page=procurement&module=purchase-request');
  await page.getByRole('button', {name: /ایجاد درخواست خرید/}).click();

  const form = page.locator('.purchase-editor');
  await form.getByRole('button', {name: 'ثبت پیش‌نویس درخواست'}).click();
  const popup = page.locator('.form-validation-popup');
  await expect(popup).toBeVisible();

  const branchError = popup.getByRole('button').filter({hasText: /شعبه ردیف تخصیص/}).first();
  await expect(branchError).toBeVisible();
  await branchError.click();

  const branch = form.locator('.purchase-allocation select').first();
  await expect(branch).toBeFocused();
  await expect(branch).toHaveAttribute('data-validation-highlight', 'true');
  await expect.poll(async () => branch.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight;
  })).toBe(true);

  await page.setViewportSize({width: 390, height: 844});
  await expect(popup).toBeVisible();
  expect(await popup.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});
