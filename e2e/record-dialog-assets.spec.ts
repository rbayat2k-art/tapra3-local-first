import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@playwright/test';

async function signInAsAdmin(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', {name: /سلام|خوش آمدید|پرونده خود را کامل‌تر/}).first()).toBeVisible({timeout: 15_000});
  const initialDefer = page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  if (await initialDefer.isVisible()) {
    await initialDefer.click();
    await expect(page.getByRole('heading', {name: /سلام/})).toBeVisible();
  }
  if (await page.getByRole('heading', {name: /سلام/}).isVisible()) {
    const defer = page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
    if (await defer.isVisible()) await defer.click();
    return;
  }
  await page.getByPlaceholder('username').fill('admin');
  await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');
  await page.getByRole('button', {name: 'ورود به سامانه'}).click();
  await expect(page.getByRole('heading', {name: /سلام/})).toBeVisible();
  const defer = page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  if (await defer.isVisible()) await defer.click();
}

async function expectNoSeriousAccessibilityViolations(page: Page, selector: string) {
  const results = await new AxeBuilder({page}).include(selector).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'), JSON.stringify(results.violations, null, 2)).toEqual([]);
}

test('جزئیات رکورد عملیاتی در مرکز باز می‌شود و focus داخل پنجره می‌ماند', async ({page}) => {
  await signInAsAdmin(page);
  await page.goto('/?page=hcm&module=leave');
  const trigger = page.locator('.record-link').first();
  await expect(trigger).toBeVisible();
  await trigger.click();

  const dialog = page.getByRole('dialog').filter({has: page.locator('.record-status-hero')});
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs((box!.x + box!.width / 2) - 640)).toBeLessThan(8);
  expect(box!.x).toBeGreaterThan(20);
  await expect(dialog.getByRole('button', {name: 'بستن'}).first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', {name: 'بستن'}).last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.setViewportSize({width: 390, height: 844});
  await trigger.click();
  const mobileDialog = page.getByRole('dialog').filter({has: page.locator('.record-status-hero')});
  const overflows = await mobileDialog.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  expect(overflows).toBe(false);
  await expectNoSeriousAccessibilityViolations(page, '.record-drawer');
});

test('پرونده پرسنلی دارایی‌ها و سوابق را فقط‌خواندنی نشان می‌دهد', async ({page}) => {
  await signInAsAdmin(page);
  await page.goto('/?page=personnel');
  await page.locator('.record-identity').first().click();
  const personnelDialog = page.getByRole('dialog').filter({hasText: 'پرونده پرسنلی'});
  await expect(personnelDialog).toBeVisible();
  await personnelDialog.getByRole('button', {name: /دارایی‌ها و اموال/}).click();

  await expect(personnelDialog.getByText('در اختیار پرسنل', {exact: true}).first()).toBeVisible();
  await expect(personnelDialog.getByText('انتقال در انتظار', {exact: true})).toBeVisible();
  await expect(personnelDialog.getByText('سوابق تحویل و عودت', {exact: true})).toBeVisible();
  await expect(personnelDialog.getByText('گزارش‌های ثبت‌شده', {exact: true})).toBeVisible();
  await expect(personnelDialog.getByRole('button', {name: /گزارش خرابی|درخواست عودت|ثبت تأیید من|دریافت رمز من/})).toHaveCount(0);
  await expect(personnelDialog.getByRole('button', {name: 'ذخیره تغییرات'})).toHaveCount(0);
  await expectNoSeriousAccessibilityViolations(page, '.modal-card--record');

  await personnelDialog.getByRole('button', {name: 'بستن پنجره'}).click();
  await page.goto('/?page=users');
  const auditorRow = page.locator('.user-row').filter({hasText: 'فرهاد زمانی'});
  await auditorRow.getByRole('button', {name: 'ورود به دسترسی کاربر'}).click();
  await expect(page.locator('.access-view-banner')).toContainText('فرهاد زمانی');
  await page.goto('/?page=personnel');
  await expect(page).toHaveURL(/page=personnel&category=changes/);
  await expect(page.locator('.record-identity')).toHaveCount(0);
});

test('خطای سرویس روی پنجره باز دیده می‌شود و ورودی کاربر حفظ می‌شود', async ({page, context}) => {
  await signInAsAdmin(page);
  await page.goto('/?page=hcm&module=leave');
  const firstTrigger = page.locator('.record-link').first();
  const trackingCode = (await firstTrigger.locator('code').textContent())!;
  await firstTrigger.click();
  const firstDialog = page.getByRole('dialog').filter({has: page.locator('.record-status-hero')});
  const firstAction = firstDialog.locator('.transition-actions .button').first();
  await expect(firstAction).toBeVisible();
  const reason = firstDialog.locator('.workflow-box textarea');
  if (await reason.isVisible()) await reason.fill('این متن پس از خطا باید حفظ شود');

  const competingPage = await context.newPage();
  await competingPage.goto('/?page=hcm&module=leave');
  await competingPage.locator('.record-link', {hasText: trackingCode}).click();
  const competingDialog = competingPage.getByRole('dialog').filter({has: competingPage.locator('.record-status-hero')});
  const competingReason = competingDialog.locator('.workflow-box textarea');
  if (await competingReason.isVisible()) await competingReason.fill('تصمیم هم‌زمان');
  await competingDialog.locator('.transition-actions .button').first().click();
  await expect(competingPage.locator('.toast')).toBeVisible();

  await firstAction.click();
  await expect(page.locator('.global-operation-error')).toBeVisible();
  await expect(firstDialog).toBeVisible();
  if (await reason.isVisible()) await expect(reason).toHaveValue('این متن پس از خطا باید حفظ شود');
  const errorZ = await page.locator('.global-operation-error').evaluate((element) => Number(getComputedStyle(element).zIndex));
  const scrimZ = await page.locator('.drawer-scrim').evaluate((element) => Number(getComputedStyle(element).zIndex));
  expect(errorZ).toBeGreaterThan(scrimZ);
  const dismissError = page.getByRole('button', {name: 'بستن پیام خطا'});
  const dialogFocusable = firstDialog.locator('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
  await firstDialog.locator('footer button:not([disabled])').last().focus();
  await page.keyboard.press('Tab');
  await expect(dismissError).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialogFocusable.first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dismissError).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.global-operation-error')).toBeHidden();
  await expect(firstDialog).toBeVisible();
});

test('همه پنجره‌های تخصصی از پوسته وسط‌صفحه استفاده می‌کنند و چاپ خزانه حفظ است', async ({page}) => {
  test.setTimeout(75_000);
  await signInAsAdmin(page);
  const cases = [
    {route: '/?page=hcm&module=employee-advance', trigger: '.record-link', dialog: '.advance-drawer'},
    {route: '/?page=procurement&module=purchase-request', trigger: '.record-link', dialog: '.purchase-drawer:not(.treasury-payment-drawer)'},
    {route: '/?page=assets&module=asset-transfer', trigger: '.record-link', dialog: '.asset-custody-drawer'},
    {route: '/?page=hcm&module=offboarding', trigger: '.record-link', dialog: '.offboarding-drawer'},
    {route: '/?page=recruitment', trigger: 'button[aria-label="مشاهده پرونده کامل"]', dialog: '.recruitment-drawer'},
  ];

  for (const item of cases) {
    await page.goto(item.route);
    await page.locator(item.trigger).first().click();
    const dialog = page.locator(item.dialog);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('role', 'dialog');
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs((box!.x + box!.width / 2) - 640)).toBeLessThan(8);
    await dialog.getByRole('button', {name: 'بستن'}).first().click();
  }

  await page.goto('/?page=users');
  await page.locator('.user-row').filter({hasText: 'بردیا نوری'}).getByRole('button', {name: 'ورود به دسترسی کاربر'}).click();
  await expect(page.locator('.access-view-banner')).toContainText('بردیا نوری');
  await page.goto('/?page=treasury&module=treasury-execution');
  const printableTreasuryDialog = page.locator('.treasury-payment-drawer');
  const paymentDate = printableTreasuryDialog.locator('.persian-date-input');
  await page.getByRole('button', {name: 'اصلاح اطلاعات پرداخت'}).first().click();
  await expect(printableTreasuryDialog).toBeVisible();
  await expect(paymentDate).toBeVisible();
  await paymentDate.click();
  const calendar = printableTreasuryDialog.locator('.rmdp-wrapper.tapra-persian-calendar');
  await expect(calendar).toBeVisible();
  expect(await calendar.evaluate((element) => element.closest('[role="dialog"]') !== null)).toBe(true);
  const calendarFocusable = calendar.locator('button:not([disabled]), [tabindex]:not([tabindex="-1"])');
  expect(await calendarFocusable.count()).toBeGreaterThan(0);
  await calendarFocusable.first().focus();
  await page.keyboard.press('Tab');
  expect(await printableTreasuryDialog.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(calendar).toBeHidden();
  await expect(printableTreasuryDialog).toBeVisible();
  await expect(paymentDate).toBeFocused();
  await printableTreasuryDialog.locator('.drawer-body').evaluate((body) => {
    const printProbe = document.createElement('article');
    printProbe.className = 'treasury-print-sheet';
    printProbe.textContent = 'print layout probe';
    body.append(printProbe);
  });
  await expect(printableTreasuryDialog.locator('.treasury-print-sheet')).toBeHidden();
  await page.emulateMedia({media: 'print'});
  await expect(printableTreasuryDialog.locator('.treasury-print-sheet')).toHaveCSS('display', 'block');
  await expect(printableTreasuryDialog.locator('.treasury-print-sheet')).toHaveCSS('visibility', 'visible');
  await expect(printableTreasuryDialog).toHaveCSS('position', 'static');
  await expect(page.locator('.drawer-scrim')).toHaveCSS('display', 'block');
  await page.emulateMedia({media: 'screen'});
});
