# ردیابی نیازمندی‌ها تا کد و آزمون

> **وضعیت:** ترکیبی از `Verified`، `Implemented-Unverified` و `Planned`. معیار پذیرش فقط وقتی `Verified` است که شاهد کد و آزمون یا اجرای ثبت‌شده داشته باشد.

## نیازمندی‌های عملکردی

| شناسه | نیازمندی و معیار پذیرش | شاهد | وضعیت |
|---|---|---|---|
| FR-001 | برنامه بدون Server/API اجرا شود. | `main.tsx`, `FoundationApp.tsx`, build | `Verified` |
| FR-002 | operational data فقط در IndexedDB باشد. | `storage.ts`, 96 stores | `Verified` |
| FR-003 | UI از StorageAdapter جدا باشد. | `service.ts`, `storage.ts` | `Verified` |
| FR-004 | منو با permission مؤثر تغییر کند. | navigation و tests | `Verified` |
| FR-005 | role + scope + resource + workflow هم‌زمان اعمال شوند. | `authorization.ts`, tests | `Verified` |
| FR-006 | QA login نقش واقعی را دور نزند و actor را ثبت کند. | `loginAsUser`, Audit | `Verified` |
| FR-007 | Reset قطعی و Backup/Restore قابل تست باشد. | snapshot/storage و UI | `Verified` |
| FR-008 | شعبه، واحد و سمت جدا مدل شوند. | model/pages/service | `Verified` |
| FR-009 | تغییر شعبه/واحد/سمت با تاریخ و reason بماند. | personnel movement | `Verified` |
| FR-010 | حساب، نقش و مجوز فردی مدیریت شود. | role/user service + override tests | `Verified` |
| FR-011 | کدملی/موبایل/username تکراری ثبت‌نام رد شود. | registration validation | `Verified` |
| FR-012 | تکمیل اطلاعات الزامی مانع ادامه کار شود. | ProfileCompletionGate + tests | `Verified` |
| FR-013 | درخواست خرید چندردیفی و چندشعبه‌ای با جمع برابر ثبت شود. | `purchaseRequest.ts`, tests | `Verified` |
| FR-014 | تأیید خرید شامل تأیید/رد/اصلاح/ارجاع باشد. | purchase service/UI/tests | `Verified` |
| FR-015 | خزانه فقط کارهای ارجاع‌شده به خود را ببیند و پرداخت را اصلاح/برگرداند. | treasury service/UI/tests | `Verified` |
| FR-016 | مساعده self/proxy با شعبه، حسابداری، تأیید اصلی و خزانه گردش کند. | employeeAdvance/workflow tests | `Verified` |
| FR-017 | مسیر پایه و مسیر خاص شعبه قابل نسخه‌گذاری باشد. | workflowPolicy/admin/tests | `Verified` |
| FR-018 | تغییر workflow روی پرونده جاری اثر نگذارد. | frozen version/route + tests | `Verified` |
| FR-019 | تاریخ جلالی، مبلغ سه‌رقمی و شناسه‌های مالی validate شوند. | date/validation/format tests | utilities `Verified`؛ همه فرم‌ها `Implemented-Unverified` |
| FR-020 | جدول‌های پرتراکم جست‌وجو، sort و ردیف عددی داشته باشند. | Sorting components/tests | `Implemented-Unverified` در همه صفحات |
| FR-021 | notification دارای شمارنده و read state باشد. | model/service/UI | خزانه `Verified`؛ عمومی `Implemented-Unverified` |
| FR-022 | چاپ کامل خرید/خزانه/مساعده با تاریخچه و پیوست. | UI print paths | `Implemented-Unverified`؛ آزمون چاپ ندارد |
| FR-023 | 67 ماژول ERP در registry و navigation موجود باشند. | `erpCatalog.ts` | `Verified` |
| FR-024 | 64 ماژول عمومی رفتار دامنه عمیق داشته باشند. | — | `Planned`؛ فعلاً workspace عمومی |
| FR-025 | کاربر در refresh همان صفحه/کارتابل بماند. | URL navigation tests | `Verified` |

## نیازمندی‌های غیرعملکردی

| شناسه | معیار | شاهد یا Gap | وضعیت |
|---|---|---|---|
| NFR-001 | RTL فارسی و responsive | UI و Browser QA قبلی | `Verified` سطح Foundation |
| NFR-002 | transaction اتمیک برای record/history/audit/event | `persistOperationalChange` | `Verified` |
| NFR-003 | optimistic concurrency در multi-tab | expectedVersion tests | `Verified`؛ field merge ندارد |
| NFR-004 | idempotency برای انتقال حساس | `idempotency_keys` | `Verified` در مسیر عمومی |
| NFR-005 | عدم ذخیره secret در docs | secret scan نهایی | پس از اعتبارسنجی نهایی تعیین می‌شود |
| NFR-006 | CI شامل typecheck/test/build | GitHub Actions | `Verified` |
| NFR-007 | کار با 500 کاربر | طراحی QA dataset | `Implemented-Unverified`؛ benchmark ندارد |
| NFR-008 | recovery از حذف دستگاه/profile | backup دستی | `Implemented-Unverified`؛ RPO/RTO نامشخص |
| NFR-009 | رمزگذاری data at rest | فقط snapshot اختیاری | `Planned` |
| NFR-010 | امنیت Production | Server auth/MFA/rate limit | `Planned` |
| NFR-011 | performance bundle | build موفق | `Conflict`: chunk اصلی بالاتر از 500 kB |
| NFR-012 | accessibility کامل | aria/tooltipهای منتخب | `Implemented-Unverified`؛ audit WCAG ندارد |

## پوشش آزمون

`Verified` در آخرین اجرای ثبت‌شده در 2026-08-24: 22 فایل و 124 تست موفق. coverage عددی line/branch هنوز تولید نمی‌شود؛ بنابراین درصد پوشش `Unknown` است.

## قاعده تغییر وضعیت

- `Verified` فقط با شاهد جاری و آزمون/اجرای قابل تکرار.
- وجود component بدون اجرای سناریو، `Implemented-Unverified` است.
- توافق محصول بدون کد، `Documented` یا `Planned` است.
- هر تعارض به [`_meta/OPEN-QUESTIONS.md`](./_meta/OPEN-QUESTIONS.md) ارجاع می‌شود.

