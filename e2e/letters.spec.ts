import AxeBuilder from '@axe-core/playwright';
import {expect,test,type Page} from '@playwright/test';

async function enterAsAdmin(page:Page){await page.goto('/?page=letters');await page.waitForLoadState('domcontentloaded');const login=page.getByRole('heading',{name:'خوش آمدید'});if(await login.isVisible({timeout:3_000})){await page.getByPlaceholder('username').fill('admin');await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');await page.getByRole('button',{name:'ورود به سامانه'}).click();}const defer=page.getByRole('button',{name:/وارد می‌شوم/}).first();try{await defer.waitFor({state:'visible',timeout:15_000});await defer.click();await defer.waitFor({state:'hidden',timeout:15_000});}catch{/* پرونده کامل است. */}await page.goto('/?page=letters');await expect(page.getByRole('heading',{name:'نامه‌نگاری سازمانی'})).toBeVisible({timeout:15_000});}

test('نمونه‌های وارده، ارسالی، پیش‌نویس و در جریان پس از بازخوانی باقی می‌مانند',async({page})=>{
  test.setTimeout(60_000);await enterAsAdmin(page);
  await expect(page.locator('.letter-row').filter({hasText:'ابلاغ برنامه قطعی نگهداری شبکه بانکی'})).toBeVisible();
  await page.getByRole('button',{name:/ارسالی و در جریان/}).click();await expect(page.locator('.letter-row').filter({hasText:'درخواست تمدید قرارداد خدمات پشتیبانی'})).toContainText('ارسال‌شده');
  await expect(page.locator('.letter-row').filter({hasText:'ابلاغ برنامه قطعی نگهداری شبکه بانکی'})).toHaveCount(0);
  await expect(page.locator('.letter-row').filter({hasText:'پاسخ تأییدشده به درخواست تأمین‌کننده'})).toContainText('مجوز ارسال صادر شده');
  await page.getByRole('button',{name:/پیش‌نویس‌ها/}).click();await expect(page.locator('.letter-row').filter({hasText:'پیش‌نویس دستورالعمل بایگانی قراردادها'})).toBeVisible();
  await page.getByRole('button',{name:/صف بازبینی/}).click();const review=page.locator('.letter-row').filter({hasText:'پاسخ پیشنهادی به استعلام اداره مالیات'});await expect(review).toContainText('در حال بازبینی');await review.click();
  const detail=page.getByRole('dialog',{name:/نامه LTR-1405-0005/});await expect(detail.locator('.letter-history > div')).toHaveCount(2);await detail.getByRole('button',{name:'بستن'}).first().click();
  await page.reload();await page.getByRole('button',{name:/صف بازبینی/}).click();await expect(page.locator('.letter-row').filter({hasText:'پاسخ پیشنهادی به استعلام اداره مالیات'})).toBeVisible();
});

test('نامه صادره با پیوست به‌صورت پیش‌نویس ثبت و برای بازبینی ارسال می‌شود',async({page})=>{
  test.setTimeout(60_000);await enterAsAdmin(page);await page.getByRole('button',{name:'نامه جدید'}).click();const dialog=page.getByRole('dialog',{name:'ثبت نامه جدید'});await dialog.getByRole('radio',{name:'صادره'}).click();await dialog.getByLabel('موضوع').fill('درخواست همکاری رسمی');await dialog.getByLabel('گیرنده بیرونی').fill('شرکت نمونه');await dialog.getByLabel('متن نامه').fill('با سلام، درخواست همکاری رسمی جهت بررسی و اعلام نظر ارسال می‌شود.');await dialog.locator('input[type="file"]').setInputFiles({name:'official.txt',mimeType:'text/plain',buffer:Buffer.from('official letter')});await expect(dialog).toContainText('official.txt');await dialog.getByRole('button',{name:'ثبت نامه'}).click();
  await page.getByRole('button',{name:/پیش‌نویس‌ها/}).click();const row=page.locator('.letter-row').filter({hasText:'درخواست همکاری رسمی'});await expect(row).toBeVisible();await row.click();const detail=page.getByRole('dialog',{name:/نامه LTR/});await expect(detail).toContainText('شرکت نمونه');await expect(detail.getByRole('link',{name:/official.txt/})).toBeVisible();await detail.getByRole('button',{name:/ارسال برای بازبینی/}).click();
  await page.getByRole('button',{name:/ارسالی و در جریان/}).click();const submitted=page.locator('.letter-row').filter({hasText:'درخواست همکاری رسمی'});await expect(submitted).toContainText('در حال بازبینی');await page.reload();await page.getByRole('button',{name:/ارسالی و در جریان/}).click();await expect(page.locator('.letter-row').filter({hasText:'درخواست همکاری رسمی'})).toBeVisible();
  await page.setViewportSize({width:390,height:844});expect(await page.locator('body').evaluate((element)=>element.scrollWidth>element.clientWidth+1)).toBe(false);const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();expect(results.violations.filter((item)=>item.impact==='serious'||item.impact==='critical'),JSON.stringify(results.violations,null,2)).toEqual([]);
});
