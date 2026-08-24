# چک‌لیست جامع ساخت و اعتبارسنجی مستندات

> **آخرین بررسی:** ۱۴۰۵/۰۶/۰۲ (2026-08-24) | **Branch:** `fix/ocr-blockers-20260824` | **Commit پایه اصلاحات:** `a0f02dd`

## نتیجه اجرای نهایی

| کنترل | نتیجه | شاهد |
|---|---|---|
| Typecheck/Lint | موفق | `tsc --noEmit` با کد خروج صفر |
| تست خودکار | موفق | ۲۲ فایل تست و ۱۲۴ تست موفق |
| Production build | موفق با هشدار | ۱٬۷۳۱ ماژول؛ بسته اصلی minified برابر ۱٬۲۲۵٫۰۹ kB و بزرگ‌تر از آستانه ۵۰۰ kB |
| لینک داخلی Markdown | موفق | صفر لینک شکسته |
| ساختار Markdown | موفق | صفر فایل خالی، صفر سند بدون H1 و صفر بلوک Mermaid بازمانده |
| Secret assignment scan | موفق | صفر الگوی انتساب credential در مستندات جدید |
| دامنه مستندشده | ثبت شد | ۶۷ ماژول، ۹۶ store و ۲۳ جزء اصلی در ماتریس پوشش |

> هشدار اندازه بسته، مانع Build نیست؛ یک بدهی عملکردی ثبت‌شده برای code splitting است. نبود E2E، benchmark و هدف رسمی RPO/RTO همچنان شکاف معتبر است و به‌عنوان موفقیت اعلام نشده است.

معنا: `[x]` تأییدشده، `[!]` تعارض/شکاف، `[?]` نیازمند پاسخ، `[-]` نامرتبط با دلیل.

## ۱. Preflight

- [x] `AGENTS.md` جست‌وجو شد؛ در مخزن وجود ندارد، بنابراین فایلی ایجاد یا تغییر نکرد.
- [x] وضعیت Git، branch، commit و تغییرات محلی ثبت شد.
- [x] تغییرات محلی قبلی کاربر از تغییرات مستندات تفکیک شد.
- [x] تمام READMEها و پوشه‌های موجود زیر `docs/` فهرست شدند.
- [x] Docs generator/Wiki جست‌وجو شد؛ مورد فعالی وجود ندارد.
- [x] زبان جاری فارسی با حفظ identifierهای انگلیسی تعیین شد.
- [x] `dist/` به‌عنوان generated artifact شناسایی شد.
- [x] scriptهای واقعی از `package.json` استخراج شدند.
- [x] منابع دارای credential آزمایشی شناسایی و مقدارشان در Docs جدید Mask/حذف شد.
- [x] برنامه جلوگیری از تکرار در `DOCUMENTATION-POLICY.md` ثبت شد.

## ۲. فهرست‌برداری ساختار

- [-] Backend مستقل — در runtime فعلی وجود ندارد.
- [x] Frontend React/Vite — ورودی و componentها مستند شدند.
- [-] Mobile/Desktop native — وجود ندارد؛ UI وب responsive است.
- [x] Shared utilities منتخب — در ساختار پوشه‌ها ثبت شدند.
- [x] Database — IndexedDB و ۹۶ store مستند شد.
- [!] Migration معنایی — فقط upgrade ساختاری storeها وجود دارد؛ migration payload رسمی موجود نیست.
- [-] Worker/Queue/Cron/Webhook/WebSocket/Cache خارجی — در runtime فعلی وجود ندارد.
- [x] Storage — `StorageAdapter` و `IndexedDBAdapter` مستند شدند.
- [x] Infrastructure/CI — GitHub Actions و build استاتیک ثبت شد.
- [x] Scripts/Tests/Configuration — فرمان‌ها و scope واقعی ثبت شد.
- [x] Existing Docs — اسناد قدیمی حفظ و تعارض آن‌ها علامت‌گذاری شد.

## ۳. پوشش محتوایی

- [x] صفحه ورود مرکزی Docs و مسیر مطالعه مخاطبان.
- [x] معرفی پروژه، محدوده، محدودیت و وضعیت فعلی.
- [x] جریان‌های اصلی و خطا/لغو/بازیابی.
- [x] نیازمندی‌های عملکردی و غیرعملکردی با شاهد.
- [x] معماری، جریان داده، مرز transaction و اعتماد.
- [x] Feature Matrix شامل Foundation و همه ۶۷ ماژول Registry.
- [x] قواعد سازمان، فروش، خرید، خزانه و مساعده.
- [x] مرجع سرویس محلی به‌جای endpointهای HTTP ناموجود.
- [x] مدل IndexedDB، entityها، indexها و ER مفهومی.
- [x] احراز هویت، QA login، نقش، scope و Permission Matrix.
- [x] Threat model، کنترل‌ها، ریسک‌ها و موارد Planned.
- [x] Reliability، idempotency، concurrency و failure mode.
- [x] Backup/DR، observability و incident response.
- [x] توسعه، تست، CI، build و عملیات محلی.
- [x] تصمیم‌ها، وضعیت، Roadmap و پرسش‌های باز.
- [x] Doc Coverage و Source Map.

## ۴. دور اول — Coverage

- [x] componentهای مهم در `DOC-COVERAGE.md` ثبت شده‌اند.
- [x] قابلیت‌های تخصصی و عمومی در `FEATURE-MATRIX.md` تفکیک شده‌اند.
- [x] API ناموجود به‌صراحت نامرتبط و Service API فعال مستند شده است.
- [x] Database، Security، Testing و Operations پوشش دارند.
- [x] توافق‌های معتبر گفتگو با برچسب `Documented` و تطبیق کد ثبت شده‌اند.
- [!] اسناد تاریخی Server-backed هنوز در مخزن هستند؛ به‌عنوان `Deprecated/Conflict` طبقه‌بندی شده‌اند.

## ۵. دور دوم — Accuracy و Contradiction

- [x] ۶۷ ماژول Registry مستقیماً از `erpCatalog.ts` شمارش شد.
- [x] ۹۶ store مستقیماً از `FOUNDATION_STORES` شمارش شد.
- [x] schema version 10 و seed version فعال تطبیق داده شد.
- [x] stateهای خرید/خزانه/مساعده با کد و تست مقایسه شدند.
- [x] Permission/Scope/Maker-checker با guard و تست مقایسه شد.
- [x] لینک‌های نسبی اسناد جدید بررسی شدند.
- [x] Typecheck، ۱۲۴ تست و production build اجرا و موفق شدند.
- [!] Build هشدار chunk اصلی بزرگ‌تر از 500 kB دارد.
- [!] schema version 7 در سند تاریخی با نسخه 9 فعال متعارض است.
- [x] قابلیت‌های `Planned` از قابلیت‌های فعال جدا شدند.

## ۶. دور سوم — Reader Simulation

- [x] توسعه‌دهنده جدید می‌تواند از `14-DEVELOPMENT.md` پروژه را اجرا و کنترل کیفیت کند.
- [x] مدیر فنی معماری، transaction boundary، ریسک و تصمیم‌ها را می‌بیند.
- [x] مسئول عملیات می‌تواند محدودیت Browser-local، Backup و Restore را بفهمد.
- [x] مسئول امنیت مرز اعتماد، داده حساس و کنترل‌های غایب Production را می‌بیند.
- [x] مالک محصول قابلیت‌های عمیق، عمومی، نیمه‌کاره و Roadmap را تفکیک می‌کند.
- [x] تست‌کننده جریان‌ها، تست‌های موجود و gapهای E2E را می‌بیند.

## ۷. اعتبارسنجی نهایی

- [x] Markdownها غیرخالی و دارای heading معتبرند.
- [x] لینک‌های داخلی بررسی شدند.
- [x] Mermaidها از syntax ساده و identifierهای امن استفاده می‌کنند.
- [x] فرمان‌های اصلی از `package.json` گرفته و اجرا شدند.
- [-] Docs build — generator اختصاصی وجود ندارد.
- [x] Service/API، Database و Feature coverage بررسی شد.
- [x] Secret scan روی اسناد جدید انجام شد؛ assignment حساس پیدا نشد.
- [x] اصطلاحات و وضعیت‌های اطمینان یکسان شدند.
- [x] سه دور بازبینی در همین سند ثبت شد.
- [x] هیچ Push، Merge، Deploy یا تغییر Production انجام نشد.

## ۸. موارد نیازمند تصمیم

- [?] مالک رسمی مستندات و دوره بازبینی.
- [?] سیاست archive یا انتقال اسناد Server-backed قدیمی.
- [?] RPO/RTO، retention و سقف attachment.
- [?] سیاست نهایی امنیت Production و حذف demo seed.
- [?] حد انعطاف Workflow Designer و escalation رکوردهای بدون assignee.

جزئیات در [`_meta/OPEN-QUESTIONS.md`](./_meta/OPEN-QUESTIONS.md) ثبت شده است.
