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
  await expect(page.getByRole('heading', {name: /سلام/})).toBeVisible();
  const defer = page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  if (await defer.isVisible()) await defer.click();
}

test('افراد هم‌نام فقط با شناسه پایدار انتخاب و باز می‌شوند', async ({page}) => {
  test.setTimeout(75_000);
  await signInAsAdmin(page);
  await page.goto('/?page=users');

  const firstUser = page.locator('.user-row').filter({hasText: '@s.moradi.sales'});
  const secondUser = page.locator('.user-row').filter({hasText: '@s.moradi'}).filter({hasNotText: '@s.moradi.sales'});
  await expect(firstUser).toContainText('نام مشابه؛ شناسه را بررسی کنید');
  await expect(secondUser).toContainText('نام مشابه؛ شناسه را بررسی کنید');
  await firstUser.getByRole('button', {name: /بازکردن پرونده/}).click();
  await expect(page.getByRole('dialog')).toContainText('@s.moradi.sales');
  await page.getByRole('dialog').getByRole('button', {name: 'بستن پنجره'}).click();

  await page.goto('/?page=personnel');
  const vice = page.locator('.enterprise-table-row').filter({hasText: 'P-3010'});
  const approver = page.locator('.enterprise-table-row').filter({hasText: 'P-1503'});
  await expect(vice).toContainText('سودابه مرادی');
  await expect(approver).toContainText('سودابه مرادی');
  await approver.locator('.record-identity').click();
  const personnelDialog = page.getByRole('dialog');
  await expect(personnelDialog.getByRole('heading')).toContainText('P-1503');
  await expect(personnelDialog).toContainText('نام مشابه در سازمان وجود دارد');
});

test('مدیر دسترسی کنترل‌های نقش سطح‌بالا و grant عملیاتی را فعال نمی‌بیند', async ({page}) => {
  test.setTimeout(75_000);
  await signInAsAdmin(page);
  await page.goto('/?page=users');
  const manager = page.locator('.user-row').filter({hasText: '@k.sadeghi'});
  await manager.getByRole('button', {name: 'ورود به دسترسی کاربر'}).click();
  await expect(page.locator('.access-view-banner')).toContainText('@k.sadeghi');
  await page.goto('/?page=users');
  await page.locator('.user-row').filter({hasText: '@l.moradi'}).getByRole('button', {name: /بازکردن پرونده/}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {name: 'نقش و دسترسی مؤثر'}).click();
  await dialog.getByLabel('باز کردن فهرست نقش‌ها').click();
  await expect(dialog.getByText('فقط ادمین اصلی').first()).toBeVisible();
  await expect(dialog.getByText(/افزودن مجوز مستقیم غیرفعال است/)).toBeVisible();
  await expect(dialog.getByText('مدیریت پرسنل', {exact:true})).toHaveCount(0);
  await dialog.getByRole('button', {name: 'بستن پنجره'}).click();

  await page.goto('/?page=roles');
  const protectedRole = page.locator('.role-row').filter({has: page.getByText('مدیر سامانه', {exact: true})});
  await expect(protectedRole.getByRole('button', {name: 'ویرایش نقش و مجوزها'})).toHaveCount(0);
  await protectedRole.locator('.role-row-users').click();
  const assignmentDialog = page.getByRole('dialog');
  await expect(assignmentDialog).toContainText('فقط برای مشاهده');
  const assignmentChecks = assignmentDialog.locator('.assignment-list input[type="checkbox"]');
  await expect(assignmentChecks.first()).toBeDisabled();
  expect(await assignmentChecks.evaluateAll((inputs) => inputs.every((input) => (input as HTMLInputElement).disabled))).toBe(true);
  await assignmentDialog.getByRole('button', {name: 'بستن پنجره'}).click();

  const ordinaryRole = page.locator('.role-row').filter({has: page.getByText('درخواست‌کننده خرید', {exact: true})});
  await ordinaryRole.locator('.role-row-users').click();
  const ordinaryAssignmentDialog = page.getByRole('dialog');
  await expect(ordinaryAssignmentDialog.locator('label').filter({hasText: '@s.ahmadi'}).locator('input')).toBeDisabled();
  await expect(ordinaryAssignmentDialog.locator('label').filter({hasText: '@r.naderi'}).locator('input')).toBeEnabled();
});
