import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@playwright/test';

async function enterAsRecruitmentUser(page: Page, username: string) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', {name: /سلام|خوش آمدید|پرونده خود را کامل‌تر/}).first()).toBeVisible({timeout: 15_000});
  const login = page.getByRole('heading', {name: 'خوش آمدید'});
  if (!await login.isVisible()) {
    const defer = page.getByRole('button', {name: /فعلاً وارد می‌شوم/}).first();
    if (await defer.isVisible()) await defer.click();
    await expect(page.locator('.account-trigger')).toBeVisible({timeout: 15_000});
    await page.locator('.account-trigger').click();
    await page.getByRole('button', {name: /خروج از سامانه/}).first().click();
    await page.getByRole('dialog').getByRole('button', {name: 'خروج از سامانه'}).click();
    await expect(login).toBeVisible();
  }
  try {
    await login.waitFor({state: 'visible', timeout: 3_000});
    await page.getByPlaceholder('username').fill(username);
    await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');
    await page.getByRole('button', {name: 'ورود به سامانه'}).click();
  } catch {/* نشست فعال مستقیماً وارد برنامه می‌شود. */}
  const defer = page.getByRole('button', {name: /وارد می‌شوم/}).first();
  try {
    await defer.waitFor({state: 'visible', timeout: 15_000});
    await defer.click();
    await defer.waitFor({state: 'hidden', timeout: 15_000});
  } catch {/* پرونده کامل نیازی به عبور موقت ندارد. */}
  await page.goto('/?page=recruitment');
  await expect(page.getByRole('heading', {name: 'جذب و بانک استعداد'})).toBeVisible({timeout: 15_000});
}

async function openSignedOutPortal(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', {name: /سلام|خوش آمدید|پرونده خود را کامل‌تر/}).first()).toBeVisible({timeout: 15_000});
  const defer = page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  if (await defer.isVisible()) {
    await defer.click();
    await expect(page.locator('.account-trigger')).toBeVisible({timeout: 15_000});
  }
  if (await page.locator('.account-trigger').isVisible()) {
    await page.locator('.account-trigger').click();
    await page.getByRole('button', {name: /خروج از سامانه/}).first().click();
    await page.getByRole('dialog').getByRole('button', {name: 'خروج از سامانه'}).click();
  }
  await expect(page.getByRole('heading', {name: 'خوش آمدید'})).toBeVisible();
}

test('متقاضی بدون ورود فرم رزومه و فایل واقعی را ثبت و کد پیگیری دریافت می‌کند', async ({page}) => {
  test.setTimeout(75_000);
  await openSignedOutPortal(page);
  await page.getByRole('button', {name: 'ارسال رزومه برای همکاری'}).click();

  const dialog = page.getByRole('dialog', {name: 'ارسال رزومه برای همکاری'});
  await expect(dialog.getByRole('heading', {name: 'فرم رزومه و ارسال مدارک'})).toBeVisible();
  await dialog.getByLabel('نام و نام خانوادگی').fill('متقاضی آزمون رزومه');
  await dialog.getByLabel('شماره همراه').fill('09121234567');
  await dialog.getByLabel('کد ملی').fill('1234567891');
  await dialog.getByLabel('حوزه یا واحد موردنظر').selectOption('unit-human-resources');
  await dialog.getByLabel('عنوان شغلی موردنظر').fill('کارشناس آموزش');
  await dialog.getByLabel('آخرین مقطع تحصیلی').selectOption({label: 'کارشناسی'});
  await dialog.getByLabel('سابقه کار (سال)').fill('3');
  await dialog.getByLabel('مهارت‌ها').fill('آموزش سازمانی، تدوین محتوا و اکسل');
  await dialog.getByLabel('درباره من و هدف شغلی').fill('سه سال سابقه آموزش سازمانی دارم و آماده همکاری در واحد منابع انسانی هستم.');
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'resume-test.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n% Shahrah recruitment resume test\n'),
  });
  await expect(dialog.getByText('resume-test.pdf')).toBeVisible();
  await dialog.locator('.candidate-consent input').check();

  const results = await new AxeBuilder({page}).include('.candidate-profile-dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'), JSON.stringify(results.violations, null, 2)).toEqual([]);
  await dialog.getByRole('button', {name: 'ارسال رزومه و دریافت کد پیگیری'}).click();
  await expect(page.locator('.toast')).toContainText(/رزومه با کد پیگیری REC-/);
  await expect(dialog).toBeHidden();
});

test('پرونده ردشده قدیمی جست‌وجو و برای فرصت تازه استفاده می‌شود', async ({page}) => {
  test.setTimeout(75_000);
  await enterAsRecruitmentUser(page, 'n.akbari');

  await page.getByRole('button', {name: 'ردشده‌ها'}).click();
  const historicalRow = page.locator('.recruitment-table tbody tr').filter({hasText: 'مهسا قربانی'});
  await expect(historicalRow).toBeVisible();
  await expect(historicalRow).toContainText('سابقه مصاحبه');

  const search = page.getByPlaceholder('نام، موبایل، کد ملی، کد پرونده، سمت یا واحد…');
  await search.fill('09121230061');
  await expect(historicalRow).toBeVisible();
  await search.fill('0081234561');
  await expect(historicalRow).toBeVisible();

  await historicalRow.getByRole('button', {name: /مشاهده پرونده مهسا قربانی/}).click();
  const dossier = page.getByRole('dialog', {name: /پرونده استخدام/});
  await expect(dossier).toHaveAttribute('role', 'dialog');
  await expect(dossier).toContainText('سابقه بانک استعداد');
  await expect(dossier).toContainText('نتیجه آخرین مصاحبه');
  await dossier.getByRole('button', {name: 'استفاده برای فرصت جدید'}).click();

  const reuse = page.getByRole('dialog', {name: 'استفاده مجدد از پرونده مهسا قربانی'});
  await expect(reuse).toContainText('پرونده قدیمی دست‌نخورده می‌ماند');
  await reuse.getByLabel('عنوان فرصت جدید').fill('فرصت تازه مهسا قربانی در ارتباط با مشتری');
  await reuse.getByLabel('واحد مقصد').selectOption('unit-management');
  await reuse.getByLabel('سمت جدید').fill('کارشناس ارتباط با مشتری');
  await reuse.getByLabel('دلیل استفاده مجدد').fill('سابقه مصاحبه مناسب است و واحد مدیریت اکنون به این مهارت نیاز دارد.');
  await reuse.getByRole('button', {name: 'ساخت پرونده جدید'}).click();

  await expect(page.locator('.toast')).toContainText('پرونده قبلی بدون تغییر حفظ شد');
  await expect(historicalRow).toContainText('۱ استفاده مجدد');
});

test('بانک متقاضیان در موبایل قابل استفاده و بدون خطای جدی دسترس‌پذیری است', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await enterAsRecruitmentUser(page, 'n.akbari');
  await page.getByRole('button', {name: 'قابل استفاده مجدد'}).click();
  await expect(page.getByText('مهسا قربانی', {exact: true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  const results = await new AxeBuilder({page}).include('.recruitment-page').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'), JSON.stringify(results.violations, null, 2)).toEqual([]);
});

test('فردی که دوره آموزشی را شروع کرده در بانک جذب و پرسنل سازمان یک هویت پیوندخورده دارد', async ({page}) => {
  await enterAsRecruitmentUser(page, 'n.akbari');
  await page.getByRole('button', {name: /پرسنل آموزشی/}).click();
  const recruitmentRow = page.locator('.recruitment-table tbody tr').filter({hasText: 'یاسین احمدی'});
  await expect(recruitmentRow).toContainText('همکاری آموزشی');

  await page.goto('/?page=personnel&category=training');
  await expect(page.getByRole('heading', {name: 'پرسنل سازمان'})).toBeVisible();
  await expect(page.getByRole('tab', {name: /پرسنل آموزشی/})).toHaveAttribute('aria-selected', 'true');
  const personnelRow = page.locator('.personnel-table .enterprise-table-row').filter({hasText: 'یاسین احمدی'});
  await expect(personnelRow).toContainText('P-6105');
  await expect(personnelRow).toContainText('y.ahmadi.training');
  await expect(personnelRow).toContainText('پرسنل آموزشی');
});

test('شروع دوره آموزشی از پرونده جذب، پرونده پرسنلی را اتمیک می‌سازد', async ({page}) => {
  test.setTimeout(75_000);
  await enterAsRecruitmentUser(page, 'n.ahmadi');
  const row = page.locator('.recruitment-table tbody tr').filter({hasText: 'نازنین رضایی'});
  await row.getByRole('button', {name: /مشاهده پرونده نازنین رضایی/}).click();
  const dossier = page.getByRole('dialog', {name: /پرونده استخدام/});
  await dossier.getByRole('button', {name: /تأیید شروع همکاری آموزشی/}).click();

  const dialog = page.getByRole('dialog', {name: /شروع دوره آموزشی نازنین رضایی/});
  await expect(dialog.getByRole('heading', {name: 'تشکیل پرونده پرسنلی آموزشی'})).toBeVisible();
  await dialog.getByLabel('کد ملی').fill('1234567891');
  await dialog.getByLabel('سمت سازمانی').selectOption('position-seller');
  await dialog.getByText('برای این فرد حساب ورود به شاهراه بساز').click();
  await expect(dialog.getByLabel('نام کاربری')).toBeHidden();
  const results = await new AxeBuilder({page}).include('.recruitment-training-dialog').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(results.violations.filter((item)=>item.impact==='serious'||item.impact==='critical'),JSON.stringify(results.violations,null,2)).toEqual([]);
  await dialog.getByRole('button', {name: 'تشکیل پرونده و شروع دوره'}).click();
  await expect(page.locator('.toast')).toContainText('پرونده پرسنلی تشکیل شد');

  await page.goto('/?page=personnel&category=training');
  const personnelRow = page.locator('.personnel-table .enterprise-table-row').filter({hasText: 'نازنین رضایی'});
  await expect(personnelRow).toBeVisible();
  await expect(personnelRow).toContainText('آموزشی');
});
