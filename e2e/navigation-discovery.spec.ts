import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@playwright/test';

async function enterAsCurrentUser(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', {name: /سلام|خوش آمدید|پرونده خود را کامل‌تر/}).first()).toBeVisible({timeout: 15_000});
  if (await page.getByRole('heading', {name: 'خوش آمدید'}).isVisible()) {
    await page.getByPlaceholder('username').fill('admin');
    await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');
    await page.getByRole('button', {name: 'ورود به سامانه'}).click();
  }
  const defer = page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  if (await defer.isVisible()) await defer.click();
  await expect(page.getByRole('heading', {name: /سلام/})).toBeVisible();
}

async function signOut(page: Page) {
  await page.locator('.account-trigger').click();
  await page.getByRole('button', {name: /خروج از سامانه/}).first().click();
  await page.getByRole('dialog').getByRole('button', {name: 'خروج از سامانه'}).click();
  await expect(page.getByRole('heading', {name: 'خوش آمدید'})).toBeVisible();
}

test('جست‌وجوی منو به مساعده، خرید و پرسنل دقیق می‌رود و پرکاربردها را حفظ می‌کند', async ({page}) => {
  await enterAsCurrentUser(page);
  await expect(page).toHaveTitle(/تیرا/);
  const search = page.locator('#sidebar-navigation-search');

  await search.fill('مساعده');
  await expect(page.locator('.navigation-search [role="status"]')).toContainText('۱ نتیجه');
  await search.press('ArrowDown');
  await expect(page.locator('.navigation-search__result').first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/page=hcm&module=employee-advance/);
  await expect(page.getByRole('tab', {name: /مساعده/})).toHaveAttribute('aria-selected', 'true');

  await page.reload();
  await expect(page.getByRole('tab', {name: /مساعده/})).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', {name: /نمای امروز وضعیت/}).click();
  await expect(page.locator('.frequent-navigation')).toContainText('مساعده');

  await search.fill('درخواست خرید');
  await search.press('Enter');
  await expect(page).toHaveURL(/page=procurement&module=purchase-request/);
  await expect(page.getByRole('tab', {name: /درخواست خرید/})).toHaveAttribute('aria-selected', 'true');

  await search.fill('استعلام');
  await search.press('Enter');
  await expect(page).toHaveURL(/page=procurement&module=rfq/);
  await expect(page.getByRole('tab', {name: /استعلام/})).toHaveAttribute('aria-selected', 'true');
  await page.goBack();
  await expect(page.getByRole('tab', {name: /درخواست خرید/})).toHaveAttribute('aria-selected', 'true');

  await search.fill('پرستل');
  await search.press('Enter');
  await expect(page).toHaveURL(/page=personnel/);
  await expect(page.getByRole('heading', {name: 'پرسنل'}).first()).toBeVisible();

  await search.fill('صف تغییرات پرسنل');
  await search.press('Enter');
  await expect(page).toHaveURL(/page=personnel&category=changes/);
  await expect(page.getByRole('tab', {name: /صف تغییرات/})).toHaveAttribute('aria-selected', 'true');
  await page.goBack();
  await expect(page.getByRole('tab', {name: /همه پرسنل/})).toHaveAttribute('aria-selected', 'true');
  await page.goForward();
  await expect(page.getByRole('tab', {name: /صف تغییرات/})).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', {name: /همه پرسنل/}).click();
  await expect(page).not.toHaveURL(/category=changes/);
  await page.reload();
  await expect(page.getByRole('tab', {name: /همه پرسنل/})).toHaveAttribute('aria-selected', 'true');

  await page.reload();
  await page.getByRole('button', {name: /نمای امروز وضعیت/}).click();
  const frequent = page.locator('.frequent-navigation');
  await expect(frequent).toContainText('مساعده');
  await expect(frequent).toContainText('درخواست خرید');
  await expect(frequent).toContainText('پرسنل');
});

test('حالت جمع‌شده و موبایل جست‌وجو را قابل دسترس نگه می‌دارند', async ({page}) => {
  await enterAsCurrentUser(page);
  await page.getByRole('button', {name: 'جمع کردن منوی اصلی'}).click();
  const searchToggle = page.getByRole('button', {name: 'جست‌وجوی منو و کارها'});
  await expect(searchToggle).toBeVisible();
  await searchToggle.click();
  await expect(page.locator('#sidebar-navigation-search')).toBeFocused();
  await page.locator('#sidebar-navigation-search').fill('درخواست خرید');
  await page.locator('#sidebar-navigation-search').press('Escape');
  await expect(page.locator('#sidebar-navigation-search')).toHaveValue('');

  await page.setViewportSize({width: 390, height: 844});
  await expect(page.locator('#main-sidebar')).toHaveAttribute('inert', '');
  await page.getByRole('button', {name: 'بازکردن منو'}).click();
  await expect(page.locator('.sidebar-close')).toBeFocused();
  await expect(page.locator('.main-area')).toHaveAttribute('inert', '');
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('#main-sidebar') !== null && (document.activeElement as HTMLElement).getClientRects().length > 0)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.locator('.sidebar-close')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', {name: 'بازکردن منو'})).toBeFocused();
  await expect(page.locator('#main-sidebar')).toHaveAttribute('inert', '');
  await page.getByRole('button', {name: 'بازکردن منو'}).click();
  await page.locator('#sidebar-navigation-search').fill('مساعده');
  await expect(page.locator('.navigation-search__result strong').first()).toHaveCSS('font-size', '14px');
  await page.locator('.navigation-search__result').first().click();
  await expect(page).toHaveURL(/page=hcm&module=employee-advance/);
  await expect(page.locator('#main-sidebar')).not.toHaveClass(/sidebar--open/);
  await expect(page.locator('#main-page-heading')).toBeFocused();
  expect(await page.locator('body').evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);

  const results = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'), JSON.stringify(results.violations, null, 2)).toEqual([]);
});

test('مسیر غیرمجاز قبل از mount به مقصد امن برمی‌گردد', async ({page}) => {
  await enterAsCurrentUser(page);
  await signOut(page);
  await page.getByPlaceholder('username').fill('a.farahmand');
  await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');
  await page.getByRole('button', {name: 'ورود به سامانه'}).click();
  await expect(page.getByRole('heading', {name: /سلام|پرونده خود را کامل‌تر/}).first()).toBeVisible();
  const defer = page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  if (await defer.isVisible()) await defer.click();
  await expect(page.getByRole('heading', {name: /سلام/})).toBeVisible();

  await page.goto('/?page=audit');
  await expect(page).toHaveURL(/page=dashboard/);
  await expect(page.getByRole('heading', {name: 'رویدادها و ممیزی'})).toHaveCount(0);
  await expect(page.getByRole('heading', {name: /سلام/})).toBeVisible();
  await page.locator('#sidebar-navigation-search').fill('درخواست خرید');
  await expect(page.locator('.navigation-search__result')).toHaveCount(0);
  await expect(page.locator('.navigation-search__empty')).toContainText('در منوهای مجاز شما موردی پیدا نشد');
  await expect(page.locator('.frequent-navigation')).not.toContainText('درخواست خرید');

  await page.goto('/?page=hcm&module=personnel-document');
  await expect(page).not.toHaveURL(/module=personnel-document/);
  await expect(page.getByRole('tab', {name: /اسناد پرسنل/})).toHaveCount(0);
});

test('خرابی localStorage ناوبری و جست‌وجو را متوقف نمی‌کند', async ({page}) => {
  await page.addInitScript(() => {
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith('tapra2_') || key.startsWith('tira_')) throw new DOMException('blocked', 'SecurityError');
      return originalGet.call(this, key);
    };
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith('tapra2_') || key.startsWith('tira_')) throw new DOMException('blocked', 'SecurityError');
      return originalSet.call(this, key, value);
    };
  });
  await enterAsCurrentUser(page);
  await page.locator('#sidebar-navigation-search').fill('مساعده');
  await page.locator('#sidebar-navigation-search').press('Enter');
  await expect(page).toHaveURL(/page=hcm&module=employee-advance/);
});

test('مشاهده آزمایشی آمار ادمین را نمی‌خواند یا تغییر نمی‌دهد', async ({page}) => {
  test.setTimeout(45_000);
  await enterAsCurrentUser(page);
  const search = page.locator('#sidebar-navigation-search');
  await search.fill('مساعده');
  await search.press('Enter');
  await page.getByRole('button', {name: /نمای امروز وضعیت/}).click();
  await expect(page.locator('.frequent-navigation')).toContainText('مساعده');
  await search.fill('کاربران سازمان');
  await search.press('Enter');
  const beforeQa = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((key) => key.startsWith('tira_navigation_usage_v1:')).map((key) => [key, localStorage.getItem(key)])));
  await page.locator('.user-row').filter({hasText: 'سارا احمدی'}).getByRole('button', {name: 'ورود به دسترسی کاربر'}).click();
  await expect(page.locator('.access-view-banner')).toBeVisible();
  await expect(page.locator('.frequent-navigation')).not.toContainText('مساعده');
  await page.locator('#sidebar-navigation-search').fill('واحدها');
  await page.locator('#sidebar-navigation-search').press('Enter');
  await expect(page).toHaveURL(/page=units/);
  await expect.poll(() => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((key) => key.startsWith('tira_navigation_usage_v1:')).map((key) => [key, localStorage.getItem(key)])))).toEqual(beforeQa);

  await page.goto('/?page=account-security');
  await expect(page).toHaveURL(/page=dashboard/);
  await expect(page.getByRole('heading', {name: 'حساب و امنیت'})).toHaveCount(0);
  await page.locator('.access-view-banner').getByRole('button', {name: /بازگشت به دسترسی ادمین/}).click();
  await expect(page.locator('.access-view-banner')).toHaveCount(0);
  const deferAfterQa = page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  if (await deferAfterQa.isVisible()) await deferAfterQa.click();
  await page.getByRole('button', {name: /نمای امروز وضعیت/}).click();
  await expect(page.locator('.frequent-navigation')).toContainText('مساعده');
});
