import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@playwright/test';

async function enterAsAdmin(page: Page) {
  await page.goto('/?page=collaboration');
  await page.waitForLoadState('domcontentloaded');
  const login = page.getByRole('heading', {name: 'خوش آمدید'});
  try {
    await login.waitFor({state: 'visible', timeout: 3_000});
    await page.getByPlaceholder('username').fill('admin');
    await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');
    await page.getByRole('button', {name: 'ورود به سامانه'}).click();
  } catch {/* نشست فعال مستقیماً وارد برنامه می‌شود. */}
  const defer = page.getByRole('button', {name: /وارد می‌شوم/}).first();
  try {
    await defer.waitFor({state: 'visible', timeout: 15_000});
    await defer.click();
    await defer.waitFor({state: 'hidden', timeout: 15_000});
  } catch {/* پرونده کامل نیازی به عبور موقت ندارد. */}
  await page.goto('/?page=collaboration');
  await expect(page.getByRole('heading', {name: 'پروژه، کار، گفت‌وگو و نامه در یک نمای هماهنگ'})).toBeVisible({timeout: 15_000});
}

test('مدیر پروژه را با گفت‌وگو و کارهای مستقل چندمسئولی می‌سازد', async ({page}) => {
  test.setTimeout(75_000);
  await enterAsAdmin(page);
  await page.getByRole('button', {name: /پروژه جدید/}).click();
  const projectDialog = page.getByRole('dialog', {name: 'ساخت پروژه همکاری'});
  await projectDialog.getByLabel('نام پروژه').fill('راه‌اندازی پایگاه دانش فروش');
  await projectDialog.getByLabel('شرح و خروجی مورد انتظار').fill('جمع‌آوری، بازبینی و انتشار راهنماهای پاسخ‌گویی تیم فروش');
  await projectDialog.getByPlaceholder('نام، نام کاربری، واحد یا سمت…').fill('آرمان');
  await projectDialog.getByRole('checkbox', {name: /آرمان فرهمند/}).check();
  await projectDialog.getByRole('button', {name: 'ساخت پروژه'}).click();

  await expect(page.getByRole('heading', {name: 'راه‌اندازی پایگاه دانش فروش'})).toBeVisible();
  await expect(page.getByRole('button', {name: /گفت‌وگوی پروژه/})).toBeVisible();
  await page.getByRole('button', {name: /شروع پروژه/}).click();
  await expect(page.getByText('فعال', {exact: true}).first()).toBeVisible();

  await page.getByRole('button', {name: /افزودن کار/}).click();
  const taskDialog = page.getByRole('dialog', {name: /افزودن کار به راه‌اندازی/});
  await taskDialog.getByLabel('عنوان کار').fill('بازبینی راهنمای پاسخ‌گویی');
  await taskDialog.getByLabel('شرح').fill('نسخه اولیه را بررسی و اصلاحات را ثبت کنید.');
  await taskDialog.getByLabel('برچسب‌ها').fill('فروش، محتوا');
  await taskDialog.getByLabel(/چک‌لیست/).fill('بررسی متن\nکنترل مثال‌ها');
  await taskDialog.getByRole('checkbox', {name: /ایلیا بیات/}).check();
  await taskDialog.getByRole('checkbox', {name: /آرمان فرهمند/}).check();
  await taskDialog.getByRole('button', {name: 'ساخت کار'}).click();

  await expect(page.locator('.task-lane--todo .task-card')).toHaveCount(2);
  await expect(page.locator('.task-card').first()).toContainText('فروش');
  await page.locator('.task-card').first().getByRole('checkbox', {name: 'بررسی متن'}).click();
  await expect(page.locator('.task-card').first()).toContainText('۱ از ۲ مورد', {timeout: 15_000});
  await page.locator('.task-card').first().getByRole('button', {name: 'شروع'}).click();
  await expect(page.locator('.task-lane--in_progress .task-card')).toHaveCount(1);
  page.once('dialog',(dialog)=>dialog.accept('در انتظار دریافت نسخه تأییدشده محتوا'));
  await page.locator('.task-lane--in_progress .task-card').getByRole('button',{name:'ثبت مانع'}).click();
  await expect(page.locator('.task-lane--blocked .task-card')).toContainText('در انتظار دریافت نسخه تأییدشده محتوا');
  page.once('dialog',(dialog)=>dialog.accept('نسخه تأییدشده دریافت شد'));
  await page.locator('.task-lane--blocked .task-card').getByRole('button',{name:'رفع مانع'}).click();
  await expect(page.locator('.task-lane--in_progress .task-card')).toHaveCount(1);

  await page.getByLabel('جست‌وجوی کار').fill('بازبینی راهنما');
  await expect(page.locator('.task-card')).toHaveCount(2);
  await page.getByLabel('برچسب').selectOption({label:'محتوا'});
  await expect(page.locator('.task-card')).toHaveCount(2);
  await page.getByRole('button', {name:'پاک‌کردن فیلترها'}).click();

  await page.locator('.task-card').first().getByRole('button', {name:/ویرایش بازبینی راهنمای پاسخ‌گویی/}).click();
  const editTaskDialog=page.getByRole('dialog',{name:/ویرایش کار راه‌اندازی/});
  await editTaskDialog.getByLabel('شرح').fill('نسخه اولیه را بررسی کنید و نتیجه را در چک‌لیست ثبت کنید.');
  await editTaskDialog.getByRole('button',{name:'ذخیره تغییرات'}).click();
  await expect(page.locator('.task-card').filter({hasText:'نتیجه را در چک‌لیست'}).first()).toBeVisible();

  await page.getByRole('button',{name:/ویرایش پروژه و اعضا/}).click();
  const editProjectDialog=page.getByRole('dialog',{name:'ویرایش پروژه همکاری'});
  const unsavedProjectDescription='تغییر ذخیره‌نشده برای آزمون نگهداری پنجره';
  await editProjectDialog.getByLabel('شرح و خروجی مورد انتظار').fill(unsavedProjectDescription);
  await page.keyboard.press('Escape');
  await expect(editProjectDialog).toBeHidden();
  const openWindows=page.getByRole('region',{name:'پنجره‌های باز'});
  await expect(openWindows).toBeVisible();
  await openWindows.getByRole('button',{name:/ویرایش پروژه همکاری/}).first().click();
  await expect(editProjectDialog).toBeVisible();
  await expect(editProjectDialog.getByLabel('شرح و خروجی مورد انتظار')).toHaveValue(unsavedProjectDescription);
  await openWindows.getByRole('button',{name:/بستن ویرایش پروژه همکاری/}).click();
  const discardDialog=page.getByRole('alertdialog');
  await expect(discardDialog).toContainText('اطلاعاتی که هنوز ذخیره نکرده‌اید از بین می‌رود');
  await discardDialog.getByRole('button',{name:'بستن و حذف تغییرات'}).click();
  await expect(editProjectDialog).toBeHidden();
  await expect(page.getByRole('button',{name:/ویرایش پروژه و اعضا/}).last()).toBeVisible();

  await page.getByRole('button', {name: /گفت‌وگوی پروژه/}).click();
  await expect(page).toHaveURL(/page=communications.*chat=/);
  await expect(page.getByRole('heading',{name:'راه‌اندازی پایگاه دانش فروش'})).toBeVisible();
  const composer=page.getByLabel('متن پیام');
  await composer.fill('پیش‌نویس محفوظ پروژه');
  const otherConversation=page.locator('.chat-conversation:not(.chat-conversation--active)').first();
  if(await otherConversation.count()){
    await otherConversation.click();
    await page.getByRole('button',{name:/راه‌اندازی پایگاه دانش فروش/}).click();
    await expect(composer).toHaveValue('پیش‌نویس محفوظ پروژه');
  }
});

test('میز همکاری در موبایل بدون بیرون‌زدگی و خطای جدی دسترس‌پذیری است', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await enterAsAdmin(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const results = await new AxeBuilder({page}).exclude('.tapra-persian-calendar').analyze();
  expect(results.violations.filter((item) => ['serious','critical'].includes(item.impact ?? ''))).toEqual([]);
});

test('سند پیوندخورده از پرونده پروژه در مسیر تخصصی خودش باز می‌شود',async({page})=>{
  test.setTimeout(75_000);
  await enterAsAdmin(page);
  await page.goto('/?page=documents&module=document');
  await expect(page.getByRole('heading',{name:'اسناد و آرشیو'}).first()).toBeVisible({timeout:15_000});
  await page.getByRole('button',{name:/ایجاد سند/}).click();
  const recordEditor=page.locator('form.record-editor');
  await recordEditor.getByLabel('عنوان').fill('صورت‌جلسه راه‌اندازی هاب همکاری');
  await recordEditor.getByLabel('توضیحات').fill('سند نمونه برای آزمون بازشدن از پرونده پروژه');
  await recordEditor.getByRole('button',{name:'ایجاد رکورد'}).click();
  await expect(page.getByRole('button',{name:/صورت‌جلسه راه‌اندازی هاب همکاری/})).toBeVisible();

  await page.goto('/?page=collaboration');
  await page.getByRole('button',{name:/پروژه جدید/}).click();
  const projectDialog=page.getByRole('dialog',{name:'ساخت پروژه همکاری'});
  await projectDialog.getByLabel('نام پروژه').fill('پروژه پیوند سند تخصصی');
  await projectDialog.getByRole('button',{name:'ساخت پروژه'}).click();
  await expect(page.getByRole('heading',{name:'پروژه پیوند سند تخصصی'})).toBeVisible();
  await page.getByRole('button',{name:'مدیریت پیوند اسناد'}).click();
  let linkDialog=page.getByRole('dialog',{name:'مدیریت پیوند اسنادی پروژه'});
  const documentRow=linkDialog.locator('article').filter({hasText:'صورت‌جلسه راه‌اندازی هاب همکاری'});
  await documentRow.getByRole('button',{name:'اتصال به پروژه'}).click();
  await page.getByRole('button',{name:/۱ سند/}).click();
  linkDialog=page.getByRole('dialog',{name:'مدیریت پیوند اسنادی پروژه'});
  await linkDialog.locator('article').filter({hasText:'صورت‌جلسه راه‌اندازی هاب همکاری'}).getByRole('button',{name:'بازکردن'}).click();
  await expect(page).toHaveURL(/page=documents.*record=/);
  await expect(page.getByRole('dialog',{name:'جزئیات صورت‌جلسه راه‌اندازی هاب همکاری'})).toBeVisible();
});
