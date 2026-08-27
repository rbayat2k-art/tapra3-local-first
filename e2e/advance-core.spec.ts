import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@playwright/test';

async function signOut(page: Page) {
  await page.locator('.account-trigger').click();
  await page.getByRole('button', {name:/خروج از سامانه/}).first().click();
  await page.getByRole('dialog').getByRole('button', {name:'خروج از سامانه'}).click();
  await expect(page.getByRole('heading', {name:'خوش آمدید'})).toBeVisible();
}

async function signIn(page: Page, username: string) {
  const login = page.getByRole('heading', {name:'خوش آمدید'});
  if (!await login.isVisible()) await signOut(page);
  await page.getByPlaceholder('username').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');
  await page.getByRole('button', {name:'ورود به سامانه'}).click();
  const defer = page.getByRole('button', {name:'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  try {await defer.waitFor({state:'visible',timeout:5_000});await defer.click();} catch {/* پرونده کامل مستقیم وارد می‌شود. */}
  await expect(page.locator('#main-page-heading')).toBeVisible({timeout:15_000});
}

async function discardLastWorkspaceWindow(page: Page) {
  const close = page.locator('.workspace-window-tab__close').last();
  if (!await close.isVisible()) return;
  await close.click();
  await page.getByRole('button', {name:'بستن و حذف تغییرات'}).click();
}

async function openAdvance(page: Page) {
  await page.goto('/?page=hcm&module=employee-advance');
  await page.locator('.advance-table .record-link').filter({hasText:'آرمان فرهمند'}).first().click();
  return page.locator('.advance-drawer:visible');
}

test('مساعده از درخواست امضاشده تا تأیید سه‌مرحله‌ای و پرداخت خزانه کامل می‌شود', async ({page}) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByRole('heading', {name:/سلام|خوش آمدید|پرونده خود را کامل‌تر و قابل اعتمادتر کنید/}).first()).toBeVisible({timeout:15_000});
  const initialDefer = page.getByRole('button', {name:'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  if (await initialDefer.isVisible()) await initialDefer.click();
  if (!await page.getByRole('heading', {name:'خوش آمدید'}).isVisible()) await signOut(page);

  await signIn(page, 'a.farahmand');
  await page.goto('/?page=hcm&module=employee-advance');
  await page.getByRole('button', {name:/ایجاد درخواست مساعده/}).click();
  const editor = page.locator('.advance-editor:visible');
  await editor.getByLabel('مبلغ مساعده (ریال)').fill('60000000');
  await editor.getByRole('checkbox', {name:/درخواست را تأیید و امضا می‌کنم/}).check();
  await editor.getByRole('button', {name:'ثبت، امضا و ارسال'}).click();
  await expect(editor).toBeHidden();

  await signOut(page); await signIn(page, 'k.yousefi');
  let drawer = await openAdvance(page);
  await drawer.getByRole('button', {name:'تأیید و ارسال به حسابداری'}).click();
  await expect(page.getByText('تصمیم مساعده ثبت و کارتابل مرحله بعد به‌روزرسانی شد.')).toBeVisible();
  await drawer.getByRole('button', {name:'بستن'}).last().click(); await discardLastWorkspaceWindow(page);

  await signOut(page); await signIn(page, 'b.akbari');
  drawer = await openAdvance(page);
  await drawer.getByRole('button', {name:'تأیید و ارسال به تأییدکننده اصلی'}).click();
  await expect(page.getByText('تصمیم مساعده ثبت و کارتابل مرحله بعد به‌روزرسانی شد.')).toBeVisible();
  await drawer.getByRole('button', {name:'بستن'}).last().click(); await discardLastWorkspaceWindow(page);

  await signOut(page); await signIn(page, 's.moradi');
  drawer = await openAdvance(page);
  await drawer.getByRole('button', {name:'تأیید و ارسال به خزانه'}).click();
  await expect(page.getByText('تصمیم مساعده ثبت و کارتابل مرحله بعد به‌روزرسانی شد.')).toBeVisible();
  await drawer.getByRole('button', {name:'بستن'}).last().click(); await discardLastWorkspaceWindow(page);

  await signOut(page); await signIn(page, 'b.nouri');
  await page.goto('/?page=treasury&module=treasury-execution');
  await page.locator('.treasury-record-link').filter({hasText:'پرداخت مساعده آرمان فرهمند'}).click();
  const payment = page.locator('.treasury-payment-drawer:visible');
  await payment.getByLabel('شماره پیگیری پرداخت').fill('ADV-E2E-001');
  await payment.getByLabel('توضیحات پرداخت').fill('پرداخت مساعده آزمون یکپارچه');
  await payment.getByRole('button', {name:'ثبت پرداخت', exact:true}).click();
  await expect(payment.getByText('پرداخت ثبت شده است')).toBeVisible();

  const axe = await new AxeBuilder({page}).include('.treasury-payment-drawer').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(axe.violations.filter((item)=>item.impact==='serious'||item.impact==='critical')).toEqual([]);
});

test('منابع انسانی می‌تواند استحقاق مساعده فرد را مستقل از نقش حساب متوقف کند', async ({page}) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await expect(page.getByRole('heading', {name:/سلام|خوش آمدید|پرونده خود را کامل‌تر و قابل اعتمادتر کنید/}).first()).toBeVisible({timeout:15_000});
  const initialDefer = page.getByRole('button', {name:'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  if (await initialDefer.isVisible()) await initialDefer.click();
  if (!await page.getByRole('heading', {name:'خوش آمدید'}).isVisible()) await signOut(page);
  await signIn(page, 'admin');
  await page.goto('/?page=personnel');
  await page.getByPlaceholder('جست‌وجوی نام، کد پرسنلی، کد ملی یا همراه').fill('آرمان فرهمند');
  await page.getByRole('button', {name:/آرمان فرهمند/}).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {name:/استحقاق مساعده/}).click();
  await dialog.getByLabel('وضعیت استحقاق').selectOption('ineligible');
  await dialog.getByLabel('دلیل تصمیم').fill('توقف آزمایشی توسط منابع انسانی');
  await dialog.getByRole('button', {name:'ذخیره تغییرات'}).click();
  await expect(dialog).toBeHidden();

  await signOut(page);
  await signIn(page, 'a.farahmand');
  await page.goto('/?page=hcm&module=employee-advance');
  await expect(page.getByText('ثبت درخواست جدید فعلاً مجاز نیست')).toBeVisible();
  await expect(page.getByRole('button', {name:/ایجاد درخواست مساعده/})).toHaveCount(0);
});
