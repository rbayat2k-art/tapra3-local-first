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
  await enterAsAdmin(page);
  await page.getByRole('button',{name:/گفت‌وگوی جدید/}).first().click();
  const dialog=page.getByRole('dialog',{name:'ساخت گفت‌وگوی جدید'});
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('@s.moradi');
  await expect(dialog).toContainText('@s.moradi.sales');
  const target=dialog.locator('.chat-member-picker label').filter({hasText:'@s.moradi'}).filter({hasNotText:'@s.moradi.sales'}).first();
  await target.locator('input').check();
  await dialog.getByRole('button',{name:'ساخت گفت‌وگو'}).click();

  await expect(page.locator('.chat-thread-header')).toContainText('سودابه مرادی');
  const composer=page.locator('.chat-composer');
  await composer.getByRole('textbox',{name:'متن پیام'}).fill('سلام، لطفاً فایل برنامه را بررسی کنید.');
  await composer.getByRole('button',{name:'ارسال پیام'}).click();
  await expect(page.locator('.chat-message--mine')).toContainText('فایل برنامه');

  await composer.locator('input[type="file"]').first().setInputFiles({name:'plan.txt',mimeType:'text/plain',buffer:Buffer.from('Shahrah chat attachment')});
  await expect(composer).toContainText('plan.txt');
  await composer.getByRole('button',{name:'ارسال پیام'}).click();
  await expect(page.locator('a[download="plan.txt"]')).toBeVisible();

  await composer.locator('input[type="file"]').nth(1).setInputFiles({name:'voice.ogg',mimeType:'audio/ogg',buffer:Buffer.from('voice')});
  await expect(composer).toContainText('voice.ogg');
  await composer.getByRole('button',{name:'ارسال پیام'}).click();
  await expect(page.locator('.chat-voice audio')).toBeVisible();

  await page.reload();
  await expect(page.locator('.chat-message--mine')).toHaveCount(3);
  await page.setViewportSize({width:390,height:844});
  expect(await page.locator('body').evaluate((element)=>element.scrollWidth>element.clientWidth+1)).toBe(false);
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(results.violations.filter((item)=>item.impact==='serious'||item.impact==='critical'),JSON.stringify(results.violations,null,2)).toEqual([]);
});
