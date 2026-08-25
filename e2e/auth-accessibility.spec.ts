import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@playwright/test';

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({page})
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const violations = results.violations.filter((item) =>
    item.impact === 'serious' || item.impact === 'critical');
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

async function openSignedOutPortal(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', {name: /سلام|خوش آمدید|پرونده خود را کامل‌تر/}).first()).toBeVisible({timeout: 15_000});
  const initialDefer = page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  if (await initialDefer.isVisible()) {
    await initialDefer.click();
    await expect(page.getByRole('heading', {name: /سلام/})).toBeVisible();
  }
  const dashboardHeading = page.getByRole('heading', {name: /سلام/});
  if (await dashboardHeading.isVisible()) {
    const defer = page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
    if (await defer.isVisible()) await defer.click();
    await page.locator('.account-trigger').click();
    await page.getByRole('button', {name: /خروج از سامانه/}).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', {name: 'خروج از سامانه'}).click();
  }
  await expect(page.getByRole('heading', {name: 'خوش آمدید'})).toBeVisible();
}

async function signInAsAdmin(page: Page) {
  await openSignedOutPortal(page);
  await page.getByPlaceholder('username').fill('admin');
  await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');
  await page.getByRole('button', {name: 'ورود به سامانه'}).click();
  await expect(page.getByRole('heading', {name: /سلام/})).toBeVisible();
  const defer = page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  if (await defer.isVisible()) await defer.click();
}

test('ورود محلی پس از بارگذاری دوباره حفظ می‌شود', async ({page}) => {
  await signInAsAdmin(page);
  await page.reload();
  await expect(page.getByRole('heading', {name: /سلام/})).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveAttribute('dir', 'rtl');
});

test('صفحه ورود و داشبورد تخلف جدی accessibility ندارند', async ({page}) => {
  await openSignedOutPortal(page);
  await expectNoSeriousAccessibilityViolations(page);

  await signInAsAdmin(page);
  await expectNoSeriousAccessibilityViolations(page);
});

test('ویرایش گردش‌کار با کارت‌های مرحله‌ای ساده و واکنش‌گرا نمایش داده می‌شود', async ({page}) => {
  test.setTimeout(75_000);
  await signInAsAdmin(page);
  await page.getByRole('button', {name: /کنترل و راهبری/}).click();
  await page.getByRole('button', {name: /مدیریت گردش‌کار/}).click();
  await page.getByRole('button', {name: /گردش‌کار مساعده پرسنلی/}).click();
  const createVersionButton = page.getByRole('button', {name: 'ایجاد نسخه جدید'});
  await createVersionButton.click();

  const dialog = page.getByRole('dialog', {name: /گردش‌کار مساعده پرسنلی/});
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await dialog.press('Shift+Tab');
  await expect(dialog.getByRole('button', {name: /انتشار نسخه/})).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', {name: 'بستن'})).toBeFocused();
  const stages = dialog.locator('.workflow-stage-toggle');
  await expect(stages).toHaveCount(4);
  await expect(dialog.getByRole('button', {name: 'افزودن مرحله'})).toHaveCount(0);
  await expect(dialog.getByRole('button', {name: 'حذف مرحله'})).toHaveCount(2);
  await expect(stages.nth(0)).toHaveAttribute('aria-expanded', 'true');
  await expect(stages.nth(1)).toHaveAttribute('aria-expanded', 'false');
  await expect(dialog.locator('.workflow-stage-card').first().getByRole('combobox', {name: /وضعیت پرونده/})).toHaveCount(0);

  await stages.nth(1).click();
  await expect(stages.nth(0)).toHaveAttribute('aria-expanded', 'false');
  await expect(stages.nth(1)).toHaveAttribute('aria-expanded', 'true');
  const stageTitle = dialog.getByRole('textbox', {name: /عنوان نمایشی مرحله/});
  const originalStageTitle = await stageTitle.inputValue();
  await stageTitle.fill('عنوان آزمایشی حسابداری');
  await stages.nth(0).click();
  await stages.nth(1).click();
  await expect(stageTitle).toHaveValue('عنوان آزمایشی حسابداری');
  await dialog.getByText('نقش‌های مسئول', {exact: true}).click();
  const roleOption = dialog.locator('.workflow-role-options label').first();
  await expect(roleOption).toBeVisible();
  await expect(roleOption).toHaveCSS('border-style', 'solid');

  await page.setViewportSize({width: 390, height: 844});
  const hasHorizontalOverflow = await dialog.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
  await expectNoSeriousAccessibilityViolations(page);

  await dialog.getByRole('button', {name: 'افزودن مسیر شعبه‌ای'}).click();
  const branchRoute = dialog.locator('.workflow-branch-route').first();
  await expect(branchRoute).toHaveAttribute('open', '');
  await dialog.getByRole('button', {name: /انتشار نسخه/}).click();
  await expect(branchRoute).toHaveClass(/has-error/);
  await expect(branchRoute.locator(':scope > summary > span')).toHaveText('نیازمند اصلاح');

  await dialog.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(createVersionButton).toBeFocused();
  await createVersionButton.click();
  const reopenedDialog = page.getByRole('dialog', {name: /گردش‌کار مساعده پرسنلی/});
  await reopenedDialog.locator('.workflow-stage-toggle').nth(1).click();
  await expect(reopenedDialog.getByRole('textbox', {name: /عنوان نمایشی مرحله/})).toHaveValue(originalStageTitle);
});
