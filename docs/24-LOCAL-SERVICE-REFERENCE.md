# مرجع سرویس محلی

> **وضعیت:** `Verified` — برنامه HTTP API ندارد. UI فقط با `LocalFoundationService` کار می‌کند و سرویس از `StorageAdapter` استفاده می‌کند. این مرجع معادل API Reference مرحله Local-first است.

## قرارداد عمومی

- ورودی همه عملیات از TypeScript typeها و validation دامنه عبور می‌کند.
- خروجی اغلب `Promise<FoundationState>` است تا UI state تازه را دریافت کند.
- خطاها فعلاً `Error` با پیام فارسی‌اند؛ error code ساخت‌یافته وجود ندارد.
- عملیات رکوردی از optimistic concurrency با `expectedVersion` استفاده می‌کنند.
- `persistOperationalChange` نوشتن رکورد، history، audit، domain event، meta و در صورت نیاز idempotency key را در یک transaction انجام می‌دهد.
- هیچ request/response شبکه، rate limit، CORS یا HTTP status در runtime فعلی وجود ندارد.

## راه‌اندازی و نشست

| متد | ورودی/خروجی | Guard و اثر جانبی | وضعیت |
|---|---|---|---|
| `initialize`, `loadState` | — → state | seed schema و resolve access | `Verified` |
| `signIn` | username/password | حساب فعال + hash؛ session و Audit | `Verified` |
| `signOut` | — | خاتمه نشست محلی | `Verified` |
| `loginAsUser`, `endQaSession` | target user | فقط ادمین و QA permission؛ actor/effective user جدا | `Verified` |
| password recovery/reminder | username/mobile/code | شبیه‌سازی SMS محلی | `Verified`؛ سرویس واقعی `Planned` |

## سازمان، کاربر و پرسنل

| گروه متد | قواعد مهم | transaction/side effect | وضعیت |
|---|---|---|---|
| unit/position CRUD و status | permission ساختار؛ ارجاع‌های فعال کنترل می‌شوند | entity + Audit | `Verified` در کد |
| user create/update/password/status | username یکتا، حساب فعال، ادمین محافظت‌شده | user + Audit | `Verified` |
| own credentials | خود کاربر | user + Audit | `Verified` |
| personnel create/update/complete | کد تولیدی، validation، banking permission | personnel + Audit | `Verified` |
| profile change/review | درخواست self-service و review مستقل | request + personnel + Audit | `Verified` |
| personnel movement | شعبه/واحد/سمت/فروش، تاریخ و reason | personnel/history + Audit | `Verified` |
| create user for personnel | حساب یکتا و اتصال one-to-one | user + personnel + Audit | `Verified` |
| role create/update/clone/status/delete | role protected، assignment، versioning | role + role_versions + users + Audit | `Verified` |

## مشتری و ساختار فروش

| گروه | متدها | محدودیت | وضعیت |
|---|---|---|---|
| ساختار فروش | create/update/status | level صحیح، شعبه فعال، قفل پس از انتصاب | `Verified` |
| مشتری | create/update/status/merge/import | validation، duplicate handling، timeline | `Implemented-Unverified` |

## رکورد و گردش‌کار عمومی

| متد | رفتار |
|---|---|
| `createOperationalRecord` | module و permission را resolve، workflow version/route را freeze و history ایجاد می‌کند. |
| `updateOperationalRecord` | permission و version مورد انتظار را کنترل و snapshot ویرایش می‌سازد. |
| `transitionOperationalRecord` | transition، reason، maker/checker، scope و idempotency را بررسی می‌کند. |
| `assignOperationalRecord` | assignee و reason را ثبت می‌کند. |
| `updateWorkflowPolicy` | stages/variants را validate، نسخه قبل را archive و نسخه جدید را publish می‌کند. |
| `inspectAuthorization` | نتیجه Guard را بدون دورزدن سیاست، در Audit ثبت می‌کند. |

## درخواست خرید

| عملیات | قواعد | خروجی/اثر |
|---|---|---|
| ایجاد/ویرایش | عنوان، شرح، تاریخ، حداقل یک line، تخصیص برابر جمع، کارت ۱۶ رقمی | request با نسخه و payload |
| تصمیم | `approve`, `reject`, `needs_correction`, handoff؛ تصمیم مرحله باید مجاز باشد | state/history/audit |
| ارسال خزانه | برای سهم‌های تأییدشده handoff جدا می‌سازد | یک یا چند `treasury_execution` |
| پیگیری خزانه | فقط پس از عبور روز جاری و برای درخواست واجد شرایط | notification deduplicated برای مجریان |

## مساعده

| متد | Guard | وضعیت‌های اصلی |
|---|---|---|
| `createEmployeeAdvance` | ذی‌نفع، پرونده کامل، کارت/بانک، امضا؛ self/proxy policy | draft یا مرحله بعد |
| `updateEmployeeAdvance` | فقط در draft/needs_correction و با version صحیح | نسخه جدید + trail |
| `decideEmployeeAdvance` | نقش مرحله، شعبه، decisions policy و امکان تغییر مبلغ | branch/accounting/final/treasury/rejected |

مسیر پایه seed: شعبه ← حسابداری ← تأییدکننده اصلی ← خزانه. route شعبه‌ای می‌تواند مرحله اختیاری را حذف کند، اما ترتیب stateهای مصوب را جابه‌جا نمی‌کند.

## خزانه

| متد | رفتار | الزام |
|---|---|---|
| `recordTreasuryPayment` | ثبت پرداخت روی کار ارجاع‌شده | تاریخ لازم؛ پیگیری و رسید اختیاری |
| `reviseTreasuryPayment` | اصلاح مقادیر قبلی با reason | optimistic version ضمنی state |
| `revertTreasuryPayment` | برگشت پرداخت اشتباهی | reason + Audit |
| follow-up | اعلان برای مجریان مجاز | dedupeKey |

## ثبت‌نام و QA

| متد | رفتار | وضعیت |
|---|---|---|
| `submitRegistration` | کدملی/موبایل/username تکراری را رد می‌کند؛ اطلاعات الزامی کامل | `Verified` |
| `reviewRegistration` | review، نقش‌های انتخابی، رمز اولیه و ساخت حساب | `Verified` |
| QA dataset/scenarios | ساخت/حذف داده بزرگ، projection و سناریو | `Verified` در تست‌های seed؛ تست مرورگر کامل `Unknown` |

## داده و بازیابی

| متد | کنترل |
|---|---|
| `exportSnapshot(password?)` | snapshot ساده یا PBKDF2/AES-GCM رمزدار؛ Audit |
| `importSnapshot(input,password?)` | shape، schema، store و checksum؛ جایگزینی کامل |
| `reset` | جایگزینی کامل با deterministic seed؛ مخرب و بدون undo |
| `recordPersonnelExport` | شمارش خروجی و وجود اطلاعات بانکی را Audit می‌کند. |

## خطاها و قرارداد آینده

`Planned` — `ServerApiAdapter` باید همین semantics را با error code، correlation id، authorization سمت سرور، rate limit و transaction پایگاه داده ارائه کند. UI نباید مستقیماً endpoint یا IndexedDB را بشناسد.

