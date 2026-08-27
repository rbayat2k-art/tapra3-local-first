import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@playwright/test';

async function enterAsAdmin(page: Page) {
  await page.goto('/?page=communications');
  await page.waitForLoadState('domcontentloaded');
  const loginHeading=page.getByRole('heading',{name:'خوش آمدید'});
  if(await loginHeading.isVisible({timeout:3_000})){
    await page.getByPlaceholder('username').fill('admin');
    await page.locator('input[autocomplete="current-password"]').fill('Tapra2@123');
    await page.getByRole('button',{name:'ورود به سامانه'}).click();
  }
  const defer=page.getByRole('button',{name:/وارد می‌شوم/}).first();
  try{await defer.waitFor({state:'visible',timeout:15_000});await defer.click();await defer.waitFor({state:'hidden',timeout:15_000});}catch{/* پرونده کامل مستقیماً وارد برنامه می‌شود. */}
  await page.goto('/?page=communications');
  await expect(page.locator('#main-page-heading')).toHaveText('گفت‌وگوها',{timeout:15_000});
}

test('گفت‌وگوی شخصی با هویت متمایز، متن، فایل و ویس روی موبایل کار می‌کند',async({page})=>{
  test.setTimeout(60_000);
  await page.addInitScript(()=>{
    class FakeMediaRecorder {
      static isTypeSupported(){return true;}
      state:'inactive'|'recording'='inactive';mimeType:string;ondataavailable:((event:{data:Blob})=>void)|null=null;onstop:(()=>void)|null=null;onerror:(()=>void)|null=null;
      constructor(_stream:MediaStream,options?:MediaRecorderOptions){this.mimeType=options?.mimeType??'audio/webm';}
      start(){this.state='recording';}
      stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['recorded voice'],{type:'audio/webm'})});this.onstop?.();}
    }
    Object.defineProperty(window,'MediaRecorder',{value:FakeMediaRecorder,configurable:true});
    Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})},configurable:true});
  });
  await enterAsAdmin(page);
  await page.getByRole('button',{name:/گفت‌وگوی جدید/}).first().click();
  const dialog=page.getByRole('dialog',{name:'ساخت گفت‌وگوی جدید'});
  await expect(dialog).toBeVisible();
  const memberSearch=dialog.getByRole('textbox',{name:'جست‌وجوی شخص یا عضو'});
  await memberSearch.fill('s.moradi');
  await expect(dialog).toContainText('@s.moradi');await expect(dialog).toContainText('@s.moradi.sales');
  await memberSearch.fill('P-2002');
  await expect(dialog.locator('.chat-member-picker label')).toHaveCount(1);
  await memberSearch.fill('s.moradi');
  const target=dialog.locator('.chat-member-picker label').filter({hasText:'@s.moradi'}).filter({hasNotText:'@s.moradi.sales'}).first();
  await target.locator('input').check();
  await dialog.getByRole('button',{name:'ساخت گفت‌وگو'}).click();

  await expect(page.locator('.chat-thread-header')).toContainText('سودابه مرادی');
  const composer=page.locator('.chat-composer');
  await composer.getByRole('textbox',{name:'متن پیام'}).fill('سلام، لطفاً فایل برنامه را بررسی کنید.');
  await composer.getByRole('button',{name:'ارسال پیام'}).click();
  await expect(page.locator('.chat-message--mine')).toContainText('فایل برنامه');

  await page.locator('.chat-message-list').evaluate((element)=>{const dataTransfer=new DataTransfer();dataTransfer.items.add(new File(['Shahrah chat attachment'],'plan.txt',{type:'text/plain'}));element.dispatchEvent(new DragEvent('dragenter',{bubbles:true,dataTransfer}));element.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer}));});
  await expect(composer).toContainText('plan.txt');
  await composer.getByRole('button',{name:'ارسال پیام'}).click();
  await expect(page.locator('a[download="plan.txt"]')).toBeVisible();

  await composer.getByRole('button',{name:'شروع ضبط ویس'}).click();
  await expect(composer).toContainText('در حال ضبط ویس');
  await composer.getByRole('button',{name:'توقف ضبط ویس'}).click();
  await expect(composer).toContainText(/voice-\d+\.webm/);
  await composer.getByRole('button',{name:'ارسال پیام'}).click();
  await expect(page.locator('.chat-voice audio')).toBeVisible();

  await page.reload();
  await expect(page.locator('.chat-message--mine')).toHaveCount(3);

  const firstMessage=page.locator('.chat-message--mine').first();
  await firstMessage.getByRole('button',{name:'پاسخ به پیام'}).click();
  await expect(composer).toContainText('پاسخ به پیام');
  await composer.getByRole('textbox',{name:'متن پیام'}).fill('پاسخ آزمایشی به پیام اول');
  await composer.getByRole('button',{name:'ارسال پیام'}).click();
  const replyMessage=page.locator('.chat-message--mine').last();
  await expect(replyMessage.locator('.chat-reply-quote')).toContainText('فایل برنامه');
  await replyMessage.getByRole('button',{name:'ویرایش پیام'}).click();
  await composer.getByRole('textbox',{name:'ویرایش متن پیام'}).fill('پاسخ ویرایش‌شده به پیام اول');
  await composer.getByRole('button',{name:'ثبت ویرایش'}).click();
  await expect(replyMessage).toContainText('پاسخ ویرایش‌شده');
  await expect(replyMessage).toContainText('ویرایش‌شده');
  await replyMessage.getByRole('button',{name:'حذف پیام برای همه'}).click();
  const deleteDialog=page.getByRole('dialog',{name:'حذف پیام برای همه'});
  await expect(deleteDialog).toContainText('اثرانگشت محتوا');
  await deleteDialog.getByRole('button',{name:'حذف برای همه'}).click();
  await expect(page.locator('.chat-message--deleted')).toContainText('این پیام توسط فرستنده حذف شده است');

  await page.getByRole('button',{name:'جست‌وجو در پیام‌ها و فایل‌ها'}).click();
  const messageSearch=page.getByRole('textbox',{name:'جست‌وجو در پیام‌ها و نام فایل‌ها'});
  await messageSearch.fill('plan.txt');
  await expect(page.locator('.chat-message--search-current')).toContainText('plan.txt');
  await messageSearch.fill('فایل برنامه');
  await expect(page.locator('.chat-message--search-current')).toContainText('فایل برنامه');
  await page.getByRole('button',{name:'بستن جست‌وجوی گفتگو'}).click();

  await page.getByRole('button',{name:/فایل‌های به‌اشتراک‌گذاشته‌شده؛/}).click();
  const sharedPanel=page.getByRole('complementary',{name:'فایل‌های به‌اشتراک‌گذاشته‌شده'});
  await expect(sharedPanel).toContainText('plan.txt');
  await expect(sharedPanel.locator('audio')).toHaveCount(1);
  await sharedPanel.getByRole('textbox',{name:'جست‌وجو در فایل‌های به‌اشتراک‌گذاشته‌شده'}).fill('plan');
  await expect(sharedPanel.locator('.chat-shared-item')).toHaveCount(1);
  await sharedPanel.getByRole('button',{name:'پاک‌کردن جست‌وجوی فایل‌ها'}).click();
  await sharedPanel.getByRole('button',{name:'صوت'}).click();
  await expect(sharedPanel.locator('.chat-shared-item')).toHaveCount(1);
  await sharedPanel.getByRole('button',{name:'بستن فایل‌های به‌اشتراک‌گذاشته‌شده'}).click();

  await page.setViewportSize({width:390,height:844});
  expect(await page.locator('body').evaluate((element)=>element.scrollWidth>element.clientWidth+1)).toBe(false);
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(results.violations.filter((item)=>item.impact==='serious'||item.impact==='critical'),JSON.stringify(results.violations,null,2)).toEqual([]);

  await page.setViewportSize({width:1280,height:900});
  await page.getByRole('button',{name:'حذف گفتگو از فهرست من'}).click();
  const hideDialog=page.getByRole('dialog',{name:'حذف گفتگو از فهرست من'});
  await expect(hideDialog).toContainText('برای طرف مقابل یا اعضای گروه حذف نمی‌شوند');
  await hideDialog.getByRole('button',{name:'حذف از فهرست من'}).click();
  await expect(page.locator('.chat-thread-header')).toHaveCount(0);
});

test('مالک گروه اعضا و مدیران را با جست‌وجوی هویتی مدیریت می‌کند',async({page})=>{
  test.setTimeout(60_000);
  await enterAsAdmin(page);
  await page.getByRole('button',{name:/گفت‌وگوی جدید/}).first().click();
  const createDialog=page.getByRole('dialog',{name:'ساخت گفت‌وگوی جدید'});
  await createDialog.getByRole('radio',{name:'گروهی'}).click();
  await createDialog.getByLabel('نام گروه').fill('گروه ممیزی محلی');
  await page.keyboard.press('Escape');
  await expect(createDialog).toBeHidden();
  const openWindows=page.getByRole('region',{name:'پنجره‌های باز'});
  await openWindows.getByRole('button',{name:/ساخت گفت‌وگوی جدید/}).first().click();
  await expect(createDialog.getByLabel('نام گروه')).toHaveValue('گروه ممیزی محلی');
  const memberSearch=createDialog.getByRole('textbox',{name:'جست‌وجوی شخص یا عضو'});
  await memberSearch.fill('s.moradi');
  await createDialog.locator('.chat-member-picker label').filter({hasText:'@s.moradi'}).filter({hasNotText:'@s.moradi.sales'}).locator('input').check();
  await createDialog.getByRole('button',{name:'ساخت گفت‌وگو'}).click();
  await expect(page.locator('.chat-thread-header')).toContainText('گروه ممیزی محلی');

  await page.getByRole('button',{name:'مدیریت اعضا و مدیران گروه'}).click();
  const manageDialog=page.getByRole('dialog',{name:'مدیریت اعضا و مدیران گروه'});
  await expect(manageDialog).toContainText('به‌عنوان مالک');
  const groupSearch=manageDialog.getByRole('textbox',{name:'جست‌وجوی اعضای گروه'});
  await groupSearch.fill('s.moradi');
  const currentMember=manageDialog.locator('.chat-group-member').filter({hasText:'@s.moradi'}).filter({hasNotText:'@s.moradi.sales'});
  await currentMember.getByText('مدیر گروه').locator('..').locator('input').check();
  await groupSearch.fill('p.javadi');
  await manageDialog.locator('.chat-group-member').filter({hasText:'@p.javadi'}).locator('input').first().check();
  await page.keyboard.press('Escape');
  await expect(manageDialog).toBeHidden();
  await openWindows.getByRole('button',{name:/مدیریت اعضا و مدیران گروه/}).first().click();
  await expect(manageDialog.locator('.chat-group-member').filter({hasText:'@p.javadi'}).locator('input').first()).toBeChecked();
  await manageDialog.getByRole('button',{name:'ذخیره تغییرات گروه'}).click();
  await expect(page.locator('.chat-thread-header')).toContainText('۳ عضو');
  await page.reload();
  await expect(page.locator('.chat-thread-header')).toContainText('گروه ممیزی محلی');
});
