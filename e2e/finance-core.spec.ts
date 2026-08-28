import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@playwright/test';

async function signOut(page: Page) {
  await page.locator('.account-trigger').click();
  await page.getByRole('button', {name: /خروج از سامانه/}).first().click();
  await page.getByRole('dialog').getByRole('button', {name: 'خروج از سامانه'}).click();
  await expect(page.getByRole('heading', {name: 'خوش آمدید'})).toBeVisible();
}

async function signIn(page: Page, username: string) {
  const login = page.getByRole('heading', {name: 'خوش آمدید'});
  if (!await login.isVisible()) await signOut(page);
  await page.getByPlaceholder('username').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');
  await page.getByRole('button', {name: 'ورود به سامانه'}).click();
  const defer = page.getByRole('button', {name: 'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  try {await defer.waitFor({state:'visible',timeout:5_000});await defer.click();} catch {/* پرونده کامل مستقیماً وارد می‌شود. */}
  await expect(page.locator('#main-page-heading')).toBeVisible({timeout:15_000});
}

async function discardLastWorkspaceWindow(page: Page) {
  const close = page.locator('.workspace-window-tab__close').last();
  if (!await close.isVisible()) return;
  await close.click();
  await page.getByRole('button', {name:'بستن و حذف تغییرات'}).click();
}

test('درخواست خرید چندسهمی از تأیید تا تسویه کامل خزانه یکپارچه می‌ماند', async ({page}) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByRole('heading', {name:/سلام|خوش آمدید|پرونده خود را کامل‌تر/}).first()).toBeVisible({timeout:15_000});
  const initialDefer = page.getByRole('button', {name:'فعلاً وارد می‌شوم؛ بعداً تکمیل می‌کنم'}).first();
  if (await initialDefer.isVisible()) await initialDefer.click();
  if (!await page.getByRole('heading', {name:'خوش آمدید'}).isVisible()) await signOut(page);

  await signIn(page, 'p.javadi');
  await page.goto('/?page=procurement&module=purchase-request');
  await page.getByRole('button', {name:/تجهیز اتاق جلسات شعب فروش/}).first().click();
  let dialog = page.getByRole('dialog', {name:/جزئیات تجهیز اتاق جلسات شعب فروش/});
  await dialog.getByRole('button', {name:'ثبت و ارسال برای تأیید'}).click();
  await expect(page.getByText(/وضعیت درخواست به «ارسال‌شده» تغییر کرد/)).toBeVisible();
  await dialog.getByRole('button', {name:'بستن'}).last().click();

  await signOut(page); await signIn(page, 'h.rostami');
  await page.goto('/?page=procurement&module=purchase-request');
  await page.getByRole('button', {name:/تجهیز اتاق جلسات شعب فروش/}).first().click();
  dialog = page.getByRole('dialog', {name:/جزئیات تجهیز اتاق جلسات شعب فروش/});
  await dialog.getByLabel('توضیح تصمیم').fill('ردیف‌ها، مبالغ و سهم شعب کنترل شد؛ برای پرداخت ارسال شود');
  const destination = dialog.getByLabel('مقصد پس از تأیید');
  const payerId = await destination.locator('option').filter({hasText:'بردیا نوری'}).getAttribute('value');
  expect(payerId).toBeTruthy(); await destination.selectOption(payerId!);
  await dialog.getByRole('button', {name:/تأیید و ارجاع به نفر بعدی/}).click();
  await expect(page.getByText('درخواست تأیید و به مقصد بعدی ارجاع شد.')).toBeVisible();
  await dialog.getByRole('button', {name:'بستن'}).last().click();

  await signOut(page); await signIn(page, 'b.nouri');
  await page.goto('/?page=treasury&module=treasury-execution');
  const queueRecords = page.locator('.treasury-record-link').filter({hasText:'تجهیز اتاق جلسات شعب فروش'});
  await expect(queueRecords).toHaveCount(2);
  for (let index=0; index<2; index+=1) {
    const queuedRow = page.locator('.treasury-cartable-table tbody tr').filter({hasText:'تجهیز اتاق جلسات شعب فروش'}).filter({hasText:'در اختیار مجری پرداخت'}).first();
    await expect(queuedRow).toBeVisible();
    await queuedRow.locator('.treasury-record-link').click();
    const paymentDialog = page.locator('.treasury-payment-drawer:visible');
    await paymentDialog.getByLabel('شماره پیگیری پرداخت').fill(`E2E-PAY-${index+1}`);
    await paymentDialog.getByLabel('توضیحات پرداخت').fill(`پرداخت سهم ${index+1}`);
    await paymentDialog.getByRole('button', {name:'ثبت پرداخت', exact:true}).click();
    await expect(paymentDialog.getByText('پرداخت ثبت شده است')).toBeVisible();
    await paymentDialog.getByRole('button', {name:'بستن'}).last().click();
    await discardLastWorkspaceWindow(page);
  }

  await signOut(page); await signIn(page, 'p.javadi');
  await page.goto('/?page=procurement&module=purchase-request');
  await page.getByRole('tab', {name:/پرداخت، رد یا بسته‌شده/}).click();
  await page.getByRole('button', {name:/تجهیز اتاق جلسات شعب فروش/}).first().click();
  dialog = page.getByRole('dialog', {name:/جزئیات تجهیز اتاق جلسات شعب فروش/});
  await expect(dialog.getByText('پرداخت‌شده', {exact:true})).toBeVisible();
  await expect(dialog.getByRole('region', {name:'پیشرفت پرداخت درخواست'})).toContainText('2 از 2');
  const axe = await new AxeBuilder({page}).include('.purchase-drawer').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(axe.violations.filter((item)=>item.impact==='serious'||item.impact==='critical')).toEqual([]);
});
