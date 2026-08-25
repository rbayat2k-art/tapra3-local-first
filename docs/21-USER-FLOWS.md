# جریان‌های کاربر

> **وضعیت:** جریان‌های تخصصی با تست `Verified`؛ جریان‌های generic با برچسب جداگانه.

URLها client-side و از شکل `/?page=<page>&module=<module>&cartable=<cartable>` هستند؛ API HTTP وجود ندارد.

## ۱. ورود، خروج و بازیابی

1. کاربر صفحه Login را می‌بیند و username/password می‌دهد.
2. `LocalFoundationService.signIn` hash را بررسی و active session را در IndexedDB ثبت می‌کند.
3. حساب غیرفعال یا رمز نامعتبر خطای فارسی می‌گیرد.
4. اگر پرونده ضروری ناقص باشد، `ProfileCompletionGate` ادامه کار را مسدود می‌کند.
5. خروج با `signOut` session را signed-out و Audit را ثبت می‌کند.
6. بازیابی رمز/نام کاربری با username/mobile و SMS preview محلی انجام می‌شود؛ پیام واقعی ارسال نمی‌شود.

**Route/UI:** Login در `FoundationApp.tsx` و `RegistrationPage.tsx`؛ حساب کاربری `/?page=my-account`.

**لغو/خطا:** فرم بدون persistence بسته می‌شود؛ خطای validation/credential در UI می‌ماند. **وضعیت:** `Verified` برای ورود/خروج، `Implemented-Unverified` برای E2E recovery.

## ۲. ثبت‌نام و فعال‌سازی

```text
متقاضی → submitRegistration → ثبت درخواست
→ بازبین ثبت‌نام → بررسی/اصلاح/رد/تأیید
→ تخصیص نقش + رمز اولیه → حساب فعال
```

کد ملی، موبایل و username تکراری رد می‌شوند. تصمیم و تاریخ در registration review و Audit می‌ماند. Route بازبین `/?page=registrations` است. **وضعیت:** `Implemented-Unverified`؛ کد وجود دارد ولی E2E کامل اجرا نشده است.

## ۳. QA login به‌عنوان کاربر

Admin در `/?page=users` کاربر فعال را باز و «ورود آزمایشی» را انتخاب می‌کند. session، Admin واقعی و effective user را جدا نگه می‌دارد. منو و تصمیم‌ها با permission واقعی کاربر هدف ساخته می‌شوند. پایان QA به session Admin برمی‌گردد. **وضعیت:** `Verified` با تست authorization.

## ۴. تکمیل و تغییر پرونده خود

- ورود با پرونده ناقص → Gate → تکمیل کد ملی، جنسیت، تلفن دوم، استان، شهر، نشانی، بانک و کارت.
- پس از تکمیل، کاربر در `/?page=my-account` اطلاعات را فقط مشاهده می‌کند.
- تغییر پیشنهادی → `submitOwnProfileChange` → صف HR در `/?page=personnel` → approve/reject با `expectedVersion`.
- تأیید، داده پرونده را تغییر و before/after/history/Audit را حفظ می‌کند.

**وضعیت:** `Verified` با profile completion/change tests.

## ۵. تغییر شعبه، واحد یا سمت پرسنل

HR پرونده را باز و نوع movement را انتخاب می‌کند. `changePersonnelAssignment` مقدار جاری را پایان می‌دهد، assignment جدید را با تاریخ شروع ثبت و `PersonnelMovement` می‌سازد. در انتقال فروش، ساختار فعال لازم است. لغو فرم تغییری نمی‌نویسد. **وضعیت:** `Verified` در Service/model؛ E2E مرورگر `Implemented-Unverified`.

## ۶. درخواست خرید تا پرداخت

```text
درخواست‌کننده خرید
→ Draft/ویرایش
→ ارسال برای تأیید
→ تأییدکننده: تأیید و ارجاع | نیازمند اصلاح | رد
→ مجری خزانه منتخب
→ ثبت پرداخت اختیاری با رسید/پیگیری اختیاری
→ اصلاح یا بازگشت پرداخت با Reason
→ چاپ و بایگانی
```

- **Route:** `/?page=procurement&module=purchase-request`؛ خزانه `/?page=treasury&module=treasury-execution&cartable=...`.
- **Validation:** حداقل یک ردیف، مبلغ/تعداد معتبر، جمع ردیف=جمع allocation، شعبه/مرکز هزینه، نام صاحب کارت و کارت ۱۶ رقمی.
- **Maker/checker:** سازنده تأییدکننده خودش نیست.
- **Correction:** به کارتابل درخواست‌کننده برمی‌گردد؛ رد terminal است.
- **Follow-up:** پس از پایان روز ارسال و یک‌بار در روز؛ Notification برای مجری.
- **Recovery:** payment قابل revision/revert با تاریخچه است.

**وضعیت:** `Verified` با `purchaseRequest.test.ts` و cartable tests.

## ۷. مساعده پرسنلی

### مسیر عادی

```text
پرسنل → مدیر شعبه → حسابداری → تأییدکننده اصلی → خزانه → پرداخت
```

### مسیر نیابتی تأییدکننده اصلی

```text
ثبت نیابتی و تأیید → حسابداری → خزانه
```

- **Route:** `/?page=hcm&module=employee-advance&cartable=...`.
- درخواست‌کننده قبل از تصمیم مرحله بعد یا پس از `needs_correction` می‌تواند ویرایش کند.
- هر مرحله approve/reject/needs correction دارد؛ Reason طبق transition ممکن است اختیاری یا اجباری باشد.
- مبلغ تغییر‌یافته، actor، زمان و route/version در تاریخچه می‌مانند.
- Resolver کاربر دارای نقش فعال و scope شعبه را در لحظه تصمیم می‌یابد.
- خزانه فرم کامل و چاپ نهایی را می‌بیند.

**وضعیت:** `Verified` با `employeeAdvance.test.ts` و `workflowPolicy.test.ts`.

## ۸. تعریف مسیر گردش‌کار

1. Workflow Admin وارد `/?page=workflow-admin` می‌شود.
2. گردش‌کار را انتخاب و «نسخه جدید» می‌سازد.
3. queue strategy، assignment policy، ترتیب stage، role، scope، تصمیم‌ها و route شعبه‌ای را تنظیم می‌کند.
4. ذخیره با `expectedVersion` انجام می‌شود؛ overlap شعبه/route نامعتبر رد می‌شود.
5. رکوردهای جدید از نسخه فعال و route منطبق استفاده می‌کنند؛ رکورد موجود نسخه frozen خود را ادامه می‌دهد.

**لغو:** نسخه ذخیره نمی‌شود. **خطا:** stale version یا route overlap. **وضعیت:** `Verified`.

## ۹. رکورد عمومی ERP

کاربر مجاز از صفحه گروه مانند `/?page=warehouse` یک module را انتخاب می‌کند، رکورد می‌سازد، ویرایش می‌کند و transition مجاز را می‌زند. Service permission/scope/maker-checker را اعمال و history/audit/event را transactionally ثبت می‌کند. Handoff می‌تواند رکورد مرتبط در module بعدی بسازد. **وضعیت:** foundation عمومی `Verified`؛ رفتار تخصصی ۶۴ module `Implemented-Unverified`.

## ۱۰. Backup، Restore و Reset

- Export ساده یا رمزگذاری‌شده از `/?page=data`.
- Import فقط پس از schema/store/checksum و در حالت encrypted پس از رمز صحیح.
- Restore همه storeها را atomically جایگزین می‌کند.
- Reset destructive است و seed deterministic را جایگزین می‌کند.
- مسیر بازیابی شکست در [Backup/DR](11-BACKUP-AND-DISASTER-RECOVERY.md) آمده است.

**وضعیت:** `Verified`.

## ۱۱. دارایی‌ها در پرونده پرسنلی

1. کاربر دارای مجوز پرونده پرسنلی و مجوز مشاهده ماژول‌های دارایی، انتقال و نگهداری، پرونده یک پرسنل موجود را باز می‌کند؛ بدون این مجوزهای دارایی تب نمایش داده نمی‌شود و هر رکورد نیز جداگانه باید داخل Scope/Resource فعال کاربر باشد.
2. بخش «دارایی‌ها و اموال» دارایی‌های قطعی جاری، انتقال‌های در انتظار، تاریخچه تحویل/عودت و گزارش‌های خرابی یا مفقودی همان فرد را نشان می‌دهد.
3. این نما فقط‌خواندنی است؛ تأیید OTP، گزارش مشکل و درخواست عودت همچنان از خودخدمتی فرد یا ماژول مسئول اموال انجام می‌شود.
4. گزارش خرابی وارد مسیر `asset-maintenance` می‌شود؛ عودت و تحویل جدید دو عملیات مستقل با تأیید دوطرفه هستند.
5. جایگزینی یک‌مرحله‌ای دارایی خراب هنوز workflow تخصصی پیاده‌شده ندارد و نیازمند تصمیم محصول و طراحی دامنه جداگانه است.

**وضعیت:** `Verified` برای نمایش با `record-dialog-assets.spec.ts` و برای چرخه تحویل/عودت/خرابی با `personnelLifecycle.test.ts`.

## ۱۲. مدارک و سطح تکمیل پرونده پرسنلی

- خود پرسنل از «حساب من» و منابع انسانی از پرونده فرد، همان بخش مشترک مدارک را می‌بینند.
- صفحه اول شناسنامه و پشت کارت ملی اجباری‌اند؛ صفحات بعدی شناسنامه، مدرک محل سکونت، عکس پرسنلی و سایر مدارک اختیاری‌اند.
- کاربر می‌تواند تکمیل را هفت روز به تعویق بیندازد و بدون حذف مجوزهای فعلی وارد سامانه شود.
- سطح ۱ تا ۴ از اطلاعات و مدارک واقعی محاسبه می‌شود و در این نسخه فقط راهنماست؛ RBAC موجود را تغییر نمی‌دهد.
- صف «نواقص پرونده» فقط افراد داخل محدوده مجاز منابع انسانی را نمایش می‌دهد و از داده واقعی محاسبه می‌شود.
- محتوای فایل در store محافظت‌شده جداست، در history/audit/state عمومی تکرار نمی‌شود و فقط در backup رمزگذاری‌شده مجاز است.

**وضعیت:** `Verified` با unit، migration، permission و Playwright.
