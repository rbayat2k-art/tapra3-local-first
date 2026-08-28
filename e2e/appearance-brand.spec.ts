import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@playwright/test';

async function enterAsAdmin(page: Page) {
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

test('برند شاهراه و پالت رنگی مستقل از حالت روز و شب می‌مانند', async ({page}) => {
  test.setTimeout(60_000);
  await enterAsAdmin(page);
  await expect(page).toHaveTitle(/شاهراه/);
  await expect(page.locator('#main-sidebar .shahrah-brand')).toContainText('شاهراه');
  await expect(page.locator('#main-sidebar .shahrah-brand img')).toBeVisible();
  await expect(page.locator('.hero-brand-heading')).toContainText('شاهراه');
  await expect(page.locator('.hero-brand-large img')).toBeVisible();
  expect((await page.locator('.hero-brand-large .shahrah-brand__mark').boundingBox())?.width ?? 0).toBeGreaterThan(180);
  expect(await page.locator('#main-sidebar .shahrah-brand img').getAttribute('src')).toContain('shahrah-mark-light');

  await page.goto('/?page=appearance');
  const classic = page.getByRole('button', {name: /کلاسیک بنفش/});
  const shahrah = page.getByRole('button', {name: /شاهراه سرمه‌ای و طلایی/});
  await expect(classic).toHaveAttribute('aria-pressed', 'true');

  await shahrah.click();
  await page.getByRole('button', {name: /روشن پوسته روشن/}).click();
  await expect.poll(() => page.evaluate(() => ({
    palette: document.documentElement.dataset.palette,
    theme: document.documentElement.dataset.theme,
  }))).toEqual({palette: 'navy-gold', theme: 'light'});

  await page.getByRole('button', {name: /تیره پوسته تیره/}).click();
  await expect.poll(() => page.evaluate(() => ({
    palette: document.documentElement.dataset.palette,
    theme: document.documentElement.dataset.theme,
  }))).toEqual({palette: 'navy-gold', theme: 'dark'});

  await page.reload();
  await expect(shahrah).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', {name: /تیره پوسته تیره/})).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('tapra2_ui_preferences_v2'))).toContain('"palette":"navy-gold"');

  await page.getByRole('button', {name: /سیستم هماهنگ با دستگاه/}).click();
  await page.emulateMedia({colorScheme: 'dark'});
  await expect.poll(() => page.evaluate(() => ({palette: document.documentElement.dataset.palette, theme: document.documentElement.dataset.theme}))).toEqual({palette: 'navy-gold', theme: 'dark'});
  await page.emulateMedia({colorScheme: 'light'});
  await expect.poll(() => page.evaluate(() => ({palette: document.documentElement.dataset.palette, theme: document.documentElement.dataset.theme}))).toEqual({palette: 'navy-gold', theme: 'light'});

  await page.getByRole('checkbox', {name: /کنتراست بیشتر/}).check();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.highContrast)).toBe('true');

  await page.setViewportSize({width: 390, height: 844});
  expect(await page.locator('body').evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
  await expect(page.locator('.brand-palette-grid')).toBeVisible();

  const results = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'), JSON.stringify(results.violations, null, 2)).toEqual([]);
});

test('ترجیحات قدیمی بدون پالت با ظاهر کلاسیک و بدون از دست‌رفتن تنظیمات باز می‌شوند', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('tapra2_ui_preferences_v2', JSON.stringify({
      theme: 'dark',
      fontSize: 'xlarge',
      density: 'compact',
      columnGap: 12,
      reduceMotion: true,
      highContrast: true,
    }));
  });
  await enterAsAdmin(page);
  await expect.poll(() => page.evaluate(() => ({
    palette: document.documentElement.dataset.palette,
    theme: document.documentElement.dataset.theme,
    fontSize: document.documentElement.dataset.fontSize,
    density: document.documentElement.dataset.density,
    reduceMotion: document.documentElement.dataset.reduceMotion,
    highContrast: document.documentElement.dataset.highContrast,
  }))).toEqual({palette: 'classic', theme: 'dark', fontSize: 'xlarge', density: 'compact', reduceMotion: 'true', highContrast: 'true'});
});

test('صفحه ورود فقط برند شاهراه و لوگوی محلی را نمایش می‌دهد', async ({page}) => {
  await enterAsAdmin(page);
  await page.locator('.account-trigger').click();
  await page.getByRole('button', {name: /خروج از سامانه/}).first().click();
  await page.getByRole('dialog').getByRole('button', {name: 'خروج از سامانه'}).click();
  await expect(page.getByRole('heading', {name: 'خوش آمدید'})).toBeVisible();
  await expect(page.locator('.auth-brand')).toContainText('شاهراه');
  await expect(page.locator('.auth-brand img')).toBeVisible();
  expect((await page.locator('.auth-brand .shahrah-brand__mark').boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(80);
  expect(await page.locator('.auth-brand img').getAttribute('src')).toContain('shahrah-mark-light');
  expect(await page.locator('.auth-showcase').evaluate((element) => getComputedStyle(element, '::after').backgroundImage)).toContain('shahrah-mark-lines');
  await expect(page.locator('body')).not.toContainText(/تیرا|تپرا|تاپرا|Tira|Tapra/);

  const results = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'), JSON.stringify(results.violations, null, 2)).toEqual([]);
});
