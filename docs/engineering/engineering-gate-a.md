# Engineering Gate A

> Status: CURRENT
> Source of truth: این سند برای وضعیت کنترل‌های Engineering Gate A است.
> Owner: Engineering Owner
> Last validated: 2026-08-11 against `agent/canonical-product-integration`
> Supersedes: none
> Superseded by: none

## نتیجه Gate

| کنترل | وضعیت اجراشده | شاهد |
|---|---|---|
| Customer Import access | مجوز مستقل `customer.import.read`، summary پاک‌سازی‌شده و جداسازی read/review/approve در server | migration `0007`، route/service و testهای permission منفی |
| Customer identity invariant | identity و phone در Workspace مرکزی؛ relationship و داده عملیاتی در Company؛ بدون existence oracle بین Companyها | migration `0008` و test چندCompany |
| CI | workflow Pull Request با PostgreSQL 18، install، typecheck، lint، build، test و migration repeat check | `.github/workflows/ci.yml` |
| Seed safety | رد قطعی Production، محدودشدن database به `tapra2_dev`/`tapra2_test` و roleهای `tapra2_owner`/`tapra2_app` | `server/scripts/seed.ts` و test guard |
| Stable protection preparation | repository برای required check آماده است؛ ruleset هنوز عمداً اعمال نشده | بخش تنظیم GitHub در پایین |

## مرز دسترسی Customer Import

- `customer.import.read`: فقط list و summary بدون raw row، candidate detail یا file hash.
- `customer.import.create`: ایجاد staging محدود CSV.
- `customer.import.review`: مشاهده جزئیات خام و تصمیم روی ردیف.
- `customer.import.approve`: اعمال transaction نهایی به Customer 360.

وجود `customer.read` به‌تنهایی هیچ دسترسی Import ایجاد نمی‌کند. UI فقط قابلیت‌ها را نمایش می‌دهد و مرز امنیتی نیست.

## Invariant هویت و رابطه

`customer_identities` و `customer_identity_phones` در Workspace یکتا هستند. جدول `customers` رابطه همان identity با یک Company را نگه می‌دارد؛ بنابراین یک شخص در Workspace تکرار نمی‌شود، اما هر Company وضعیت عملیاتی مستقل خود را دارد. queryهای Customer و RLS همچنان Company-scoped هستند.

migration `0008` هنگام backfill موقتاً فقط `FORCE RLS` را برای table owner برمی‌دارد، RLS برای application role فعال می‌ماند و `FORCE RLS` پیش از commit بازگردانده می‌شود. test upgrade با Customer موجود این مسیر و مشاهده پس از migration از طریق `tapra2_app` را بررسی می‌کند.

## تنظیم GitHub باقی‌مانده

پس از merge شدن workflow به branch هدف، برای `stable` یک ruleset با این حداقل‌ها فعال شود:

- Pull Request الزامی؛
- required status check مربوط به job CI؛
- جلوگیری از direct push برای کاربران عادی؛
- عدم فعال‌سازی rule پیش از قابل‌اجرا بودن check روی `stable`، تا repository ناخواسته قفل نشود.

این تنظیم در این branch اعمال نشده است و merge خودکار نیز مجاز نیست.
