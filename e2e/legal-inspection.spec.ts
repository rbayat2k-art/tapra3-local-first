import AxeBuilder from '@axe-core/playwright';
import {expect,test,type Page} from '@playwright/test';

test.setTimeout(90_000);

async function enter(page:Page,url:string,heading:string){
  await page.goto(url);await page.waitForLoadState('domcontentloaded');const retry=page.getByRole('button',{name:'تلاش دوباره'});if(await retry.isVisible({timeout:2_000}).catch(()=>false))await retry.click();
  const login=page.getByRole('heading',{name:'خوش آمدید'});if(await login.isVisible({timeout:3_000}).catch(()=>false)){await page.getByPlaceholder('username').fill('admin');await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');await page.getByRole('button',{name:'ورود به سامانه'}).click();}
  const defer=page.getByRole('button',{name:/فعلاً وارد می‌شوم/}).first();try{await defer.waitFor({state:'visible',timeout:15_000});await defer.click();await defer.waitFor({state:'hidden',timeout:15_000});}catch{/* پرونده پیش‌تر تکمیل یا به تعویق افتاده است. */}
  await page.goto(url);
  await expect(page.getByRole('heading',{name:heading})).toBeVisible({timeout:15_000});
}

test('اطلاعات پایه فقط در خزانه ساخته می‌شود و پرونده ردیفی با جزئیات پایدار است',async({page})=>{
  await enter(page,'/?page=treasury&module=bank-account','اطلاعات پایه شرکت‌ها و بانک‌ها');
  const entityTrigger=page.getByRole('button',{name:'ثبت شخصیت حقوقی'});await entityTrigger.click();let keyboardDialog=page.getByRole('dialog',{name:'ثبت شخصیت حقوقی آزمایشی'});await expect(keyboardDialog).toBeVisible();await page.keyboard.press('Escape');await expect(keyboardDialog).toBeHidden();await expect(entityTrigger).toBeFocused();
  await page.getByRole('button',{name:'ثبت شخصیت حقوقی'}).click();let dialog=page.getByRole('dialog').filter({hasText:'ثبت شخصیت حقوقی آزمایشی'});await dialog.getByLabel('نام شرکت').fill('شرکت کاملاً مصنوعی ACCEPTANCE');await dialog.getByLabel('نوع شرکت').selectOption('private_joint_stock');await dialog.getByLabel('شناسه ملی مصنوعی').fill('00000000000');await dialog.getByLabel('شماره ثبت مصنوعی').fill('111111');await dialog.getByRole('button',{name:'افزودن فرد'}).click();await dialog.getByLabel('نام و نام خانوادگی').fill('مدیرعامل کاملاً ساختگی ACCEPTANCE');await dialog.getByLabel('سمت').selectOption('chief_executive');await dialog.getByLabel('کد ملی مصنوعی').fill('0000000000');await dialog.getByRole('button',{name:'ثبت شخصیت حقوقی'}).click();await expect(dialog).toBeHidden({timeout:15_000});
  const entityRow=page.locator('.operational-table tbody tr').filter({hasText:'شرکت کاملاً مصنوعی ACCEPTANCE'});await expect(entityRow).toContainText('سهامی خاص');await expect(entityRow).toContainText('مدیرعامل کاملاً ساختگی ACCEPTANCE');await entityRow.getByRole('button',{name:'مشاهده جزئیات'}).click();const entityDetails=page.getByRole('dialog',{name:/جزئیات شخصیت حقوقی/});await expect(entityDetails).toContainText('مدیرعامل کاملاً ساختگی ACCEPTANCE');await entityDetails.getByRole('button',{name:'بستن'}).click();await entityRow.getByRole('button',{name:'ویرایش'}).click();dialog=page.getByRole('dialog',{name:'ویرایش اطلاعات شخصیت حقوقی'});await dialog.getByLabel('آخرین مرکز یا نشانی').selectOption({label:'تهران، نشانی کاملاً ساختگی شماره ۱'});await dialog.getByRole('button',{name:'ذخیره نسخه جدید'}).click();await expect(dialog).toBeHidden({timeout:15_000});await expect(entityRow).toContainText('۲');
  await page.getByRole('button',{name:'ثبت شخصیت حقوقی'}).click();dialog=page.getByRole('dialog').filter({hasText:'ثبت شخصیت حقوقی آزمایشی'});await dialog.getByLabel('نام شرکت').fill('شرکت کاملاً آزمایشی RELATED');await dialog.getByLabel('شماره ثبت مصنوعی').fill('222222');await dialog.getByRole('button',{name:'ثبت شخصیت حقوقی'}).click();await expect(dialog).toBeHidden({timeout:15_000});
  await page.getByRole('tab',{name:/بانک‌ها/}).click();await page.getByRole('button',{name:'ثبت بانک'}).click();dialog=page.getByRole('dialog').filter({hasText:'ثبت بانک آزمایشی'});await dialog.getByLabel('کد بانک').fill('QA-LEGAL');await dialog.getByLabel('نام بانک').fill('بانک مصنوعی حقوقی');await dialog.getByRole('button',{name:'ثبت'}).click();await expect(dialog).toBeHidden({timeout:15_000});
  await page.getByRole('tab',{name:/حساب‌های بانکی/}).click();await page.getByRole('button',{name:'ثبت حساب بانکی'}).click();dialog=page.getByRole('dialog').filter({hasText:'ثبت حساب بانکی آزمایشی'});await dialog.getByLabel('شخصیت حقوقی').selectOption({label:'شرکت کاملاً مصنوعی ACCEPTANCE'});await dialog.getByLabel('شبای ساختگی').fill('IR000000000000000000000000');await dialog.getByLabel('کارت ساختگی').fill('4444333322221111');await dialog.getByRole('button',{name:'ثبت و ماسک‌سازی'}).click();await expect(dialog).toBeHidden({timeout:15_000});await expect(page.getByText('4444333322221111')).toHaveCount(0);
  await enter(page,'/?page=legal-inspection','پرونده‌های حقوقی');await expect(page.getByRole('button',{name:'ثبت شخصیت حقوقی'})).toHaveCount(0);
  const caseTrigger=page.getByRole('button',{name:'پرونده جدید'});await caseTrigger.click();keyboardDialog=page.getByRole('dialog',{name:'پرونده حقوقی آزمایشی'});await expect(keyboardDialog).toBeVisible();await page.keyboard.press('Escape');await expect(keyboardDialog).toBeHidden();await expect(caseTrigger).toBeFocused();
  await page.getByRole('button',{name:'پرونده جدید'}).click();dialog=page.getByRole('dialog').filter({hasText:'پرونده حقوقی آزمایشی'});await dialog.getByLabel('عنوان پرونده').fill('پرونده مصنوعی پذیرش حقوقی');await dialog.getByLabel('شخصیت حقوقی مالک').selectOption({label:'شرکت کاملاً مصنوعی ACCEPTANCE'});await dialog.getByLabel('حساب مرتبط').selectOption({index:1});await dialog.locator('fieldset').filter({hasText:'شخصیت‌های مرتبط'}).getByRole('checkbox',{name:'شرکت کاملاً آزمایشی RELATED'}).check();await dialog.getByLabel('نام شاکی ساختگی').fill('شاکی مصنوعی');await dialog.getByLabel('نام پرداخت‌کننده ساختگی').fill('پرداخت‌کننده مصنوعی');await dialog.getByRole('button',{name:'ذخیره پرونده'}).click();
  const row=page.locator('.legal-case-table tbody tr').filter({hasText:'پرونده مصنوعی پذیرش حقوقی'});await expect(row).toBeVisible();await expect(row).toContainText(/LEGAL-\d{4}-\d{5}/);await row.getByRole('button',{name:/مشاهده جزئیات/}).click();let details=page.getByRole('dialog',{name:/جزئیات LEGAL-/});await expect(details).toContainText('اشخاص و نقش‌ها');await expect(details).toContainText('شاکی مصنوعی');await expect(details).toContainText(/\*+0000/);await details.getByRole('button',{name:'تغییر وضعیت'}).click();dialog=page.getByRole('dialog').filter({hasText:/تغییر وضعیت LEGAL-/});await dialog.getByLabel('وضعیت تازه').selectOption('open');await dialog.getByRole('button',{name:'ثبت تغییر وضعیت'}).click();
  await expect(dialog).toBeHidden({timeout:15_000});await expect(row).toContainText('باز');
  await page.reload();
  await page.locator('.legal-case-table tbody tr').filter({hasText:'پرونده مصنوعی پذیرش حقوقی'}).getByRole('button',{name:/مشاهده جزئیات/}).click();
  details=page.getByRole('dialog',{name:/جزئیات LEGAL-/});
  await expect(details).toContainText('از «پیش‌نویس» به «باز»');
  await expect(details.getByText('عامل ثبت‌شده')).toHaveCount(0);
  await details.getByRole('button',{name:'روند جدید'}).click();
  dialog=page.getByRole('dialog',{name:'ثبت روند دادرسی'});
  await dialog.getByLabel('نام مرجع').fill('شعبه آزمایشی پذیرش');
  await dialog.getByLabel('مرحله').selectOption('hearing');
  await dialog.getByRole('button',{name:'ثبت'}).click();
  await expect(dialog).toBeHidden({timeout:15_000});
  await expect(details).toContainText('شعبه آزمایشی پذیرش');
  await details.getByRole('button',{name:'ثبت ابلاغ'}).click();
  dialog=page.getByRole('dialog',{name:'ثبت ابلاغ متادیتایی'});
  const deadlineInput=dialog.locator('label').filter({hasText:'تاریخ مهلت'}).locator('input');
  await expect(deadlineInput).not.toHaveValue('');
  await deadlineInput.click();
  const openCalendar=page.locator('.rmdp-calendar:visible').last();
  const today=openCalendar.locator('.rmdp-day.rmdp-today:not(.rmdp-disabled)');
  await expect(today.first()).toBeVisible();
  await today.first().click();
  await expect(deadlineInput).not.toHaveValue('');
  const futurePersianDate=await page.evaluate(()=>new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+86_400_000)));
  await deadlineInput.fill(futurePersianDate);
  await deadlineInput.press('Tab');
  await expect(deadlineInput).toHaveValue(futurePersianDate);
  await expect(dialog.getByLabel('مسئول مهلت')).toHaveValue(/.+/);
  await dialog.getByRole('button',{name:'ثبت'}).click();
  await expect(dialog).toBeHidden({timeout:15_000});
  await expect(details).toContainText('نیازمند پاسخ');
  await details.getByRole('button',{name:'تأیید دریافت'}).click();
  await details.getByRole('button',{name:'تکمیل'}).click();
  await details.getByRole('button',{name:'بستن روند'}).click();
  await expect(details.getByRole('button',{name:'ثبت ابلاغ'})).toHaveCount(0);
  await page.reload();
  await page.locator('.legal-case-table tbody tr').filter({hasText:'پرونده مصنوعی پذیرش حقوقی'}).getByRole('button',{name:/مشاهده جزئیات/}).click();
  details=page.getByRole('dialog',{name:/جزئیات LEGAL-/});
  await expect(details).toContainText('روند دادرسی · شعبه آزمایشی پذیرش · نسخه ۲');
  await expect(details).toContainText('از «دریافت‌شده» به «تأییدشده»');
  await expect(details).toContainText('از «باز» به «تکمیل‌شده»');
});

test('جدول حقوقی در موبایل دسترس‌پذیر است و هشدار داده مصنوعی باقی می‌ماند',async({page})=>{await page.setViewportSize({width:390,height:844});await enter(page,'/?page=legal-inspection','پرونده‌های حقوقی');await expect(page.getByText(/ورود داده واقعی ممنوع است/)).toBeVisible();const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();expect(results.violations.filter((item)=>['serious','critical'].includes(item.impact??''))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);});

test('دیتاست پنجاه‌تایی اکشن دستی یا ویرایش پایه را فعال نمی‌کند',async({page})=>{await enter(page,'/?page=legal-inspection','پرونده‌های حقوقی');await page.getByRole('button',{name:'ساخت ۵۰ سناریوی QA'}).click();await expect(page.locator('.legal-case-table tbody tr')).toHaveCount(50,{timeout:30_000});await expect(page.getByRole('button',{name:'پرونده جدید'})).toBeDisabled();await expect(page.getByText(/ابتدا شخصیت حقوقی و حساب بانکی را/)).toBeVisible();await page.locator('.legal-case-table tbody tr').first().getByRole('button',{name:/مشاهده جزئیات/}).click();await expect(page.getByRole('button',{name:'ویرایش اطلاعات پایه'})).toHaveCount(0);});
