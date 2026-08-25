import {expect, test, type Page} from '@playwright/test';

async function signInAsAdmin(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', {name: /سلام|خوش آمدید|پرونده خود را کامل‌تر/}).first()).toBeVisible({timeout: 15_000});
  const initialDefer = page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  if (await initialDefer.isVisible()) {
    await initialDefer.click();
    await expect(page.getByRole('heading', {name: /سلام/})).toBeVisible();
  }
  if (await page.getByRole('heading', {name: /سلام/}).isVisible()) return;
  await page.getByPlaceholder('username').fill('admin');
  await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');
  await page.getByRole('button', {name: 'ورود به سامانه'}).click();
  const defer = page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  if (await defer.isVisible()) await defer.click();
  await expect(page.getByRole('heading', {name: /سلام/})).toBeVisible();
}

test('پنجره پاک با کلیک بیرون بسته می‌شود و فرم تغییرکرده در نوار پنجره‌ها حفظ می‌شود', async ({page}) => {
  test.setTimeout(75_000);
  await signInAsAdmin(page);
  await page.goto('/?page=personnel');

  await page.getByRole('button', {name: 'پرسنل جدید'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('.modal-layer > .modal-scrim').click({position: {x: 5, y: 5}});
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', {name: 'پرسنل جدید'}).click();
  const dialog = page.getByRole('dialog');
  const firstName = dialog.locator('label.field-label').filter({hasText: 'نام'}).first().locator('input');
  await firstName.fill('آزمایشی');
  await page.locator('.modal-layer > .modal-scrim').click({position: {x: 5, y: 5}});

  const bar = page.getByRole('region', {name: 'پنجره‌های باز'});
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('تغییرات شما حفظ شده‌اند');
  await expect(dialog).toBeHidden();

  await page.getByRole('button', {name: /نمای امروز وضعیت/}).click();
  await expect(page).toHaveURL(/page=personnel/);
  await expect(bar).toContainText('برای جلوگیری از حذف اطلاعات');

  await bar.getByRole('tab', {name: /ایجاد پرسنل جدید/}).click();
  await expect(dialog).toBeVisible();
  await expect(firstName).toHaveValue('آزمایشی');

  await dialog.getByRole('button', {name: 'انصراف'}).click();
  await expect(dialog).toBeHidden();
  await bar.getByRole('button', {name: /بستن ایجاد پرسنل جدید/}).click();
  await expect(bar.getByRole('alertdialog')).toContainText('اطلاعاتی که هنوز ذخیره نکرده‌اید از بین می‌رود');
  await bar.getByRole('button', {name: 'بستن و حذف تغییرات'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', {name: 'پنجره‌های باز'})).toHaveCount(0);
});

test('منوی حساب و پنجره خواندنی با کلیک بیرون بسته می‌شوند', async ({page}) => {
  await signInAsAdmin(page);
  await page.locator('.account-trigger').click();
  await expect(page.locator('.account-menu')).toBeVisible();
  await page.mouse.click(450, 450);
  await expect(page.locator('.account-menu')).toHaveCount(0);

  await page.goto('/?page=personnel');
  await page.locator('.enterprise-table-row .record-identity').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('.modal-layer > .modal-scrim').click({position: {x: 5, y: 5}});
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('فرم‌های عملیاتی قدیمی نیز بیرون پنجره کوچک می‌شوند و داده را نگه می‌دارند', async ({page}) => {
  await signInAsAdmin(page);
  await page.goto('/?page=hcm&module=leave');
  await page.getByRole('button', {name: /ایجاد درخواست مرخصی/}).click();
  const form = page.locator('.record-editor');
  const title = form.getByLabel('عنوان');
  await title.fill('مرخصی آزمایشی حفظ پنجره');
  await page.locator('.modal-scrim:has(> .record-editor)').click({position: {x: 5, y: 5}});
  await expect(form).toBeHidden();

  const bar = page.getByRole('region', {name: 'پنجره‌های باز'});
  await expect(bar).toContainText('ایجاد درخواست مرخصی');
  await bar.getByRole('tab', {name: /ایجاد درخواست مرخصی/}).click();
  await expect(title).toHaveValue('مرخصی آزمایشی حفظ پنجره');
});
