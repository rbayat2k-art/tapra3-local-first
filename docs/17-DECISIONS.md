# تصمیم‌های معماری و محصول

> **وضعیت سند:** `Documented`؛ ستون اجرا مشخص می‌کند تصمیم در کد فعلی فعال است یا نه.

| شناسه | تصمیم | دلیل | اجرا |
|---|---|---|---|
| ADR-001 | Browser-local در فاز پذیرش | آزمون سریع همه flowها بدون Backend | `Verified` |
| ADR-002 | IndexedDB برای operational data | داده ساختاریافته و ظرفیت بهتر از localStorage | `Verified` |
| ADR-003 | localStorage فقط UI preferences | جداسازی preference از داده عملیاتی | `Verified` |
| ADR-004 | StorageAdapter boundary | تعویض آینده با ServerApiAdapter | `Verified` |
| ADR-005 | Single-company-first | کاهش پیچیدگی UX فعلی | `Verified` |
| ADR-006 | QA persona به شکل local user | تست Permission واقعی بدون bypass | `Verified` |
| ADR-007 | Permission + Scope + Resource + Workflow | کنترل دسترسی چندلایه | `Verified` |
| ADR-008 | Audit/Event/History append-oriented | قابلیت پیگیری و عدم حذف سابقه | `Verified` |
| ADR-009 | Quote مستقل از Invoice | تفاوت معنای کسب‌وکار | `Planned` در عمق کامل |
| ADR-010 | Workflow محدود و versioned | انعطاف کنترل‌شده بدون خرابی رکورد جاری | `Verified` |
| ADR-011 | Branch route با اولویت و freeze | تفاوت شعب بدون hard-code و حفظ تاریخچه | `Verified` |
| ADR-012 | Optimistic concurrency V1 | سادگی نسبت به field merge | `Verified` |
| ADR-013 | تاریخ داخلی ISO، نمایش شمسی | sort/migration پایدار و UX فارسی | `Verified` |
| ADR-014 | خزانه assignment مستقیم | هر مجری فقط کارتابل خودش را می‌بیند | `Verified` |
| ADR-015 | مساعده نیابتی self-approved سازمانی | تصمیم صریح Product Owner برای شرایط فعلی | `Verified` با استثنای کنترل‌شده |

## قانون تغییر تصمیم

`Documented` — تصمیم تصویب‌شده حذف یا بی‌صدا بازنویسی نمی‌شود. تاریخ، علت، اثر migration و تصمیم جایگزین به همین سند افزوده می‌شود. تصمیمی که کد آن را نقض می‌کند با `Conflict` علامت می‌خورد.

## ADRهای تفصیلی فعال

### ADR-A — Runtime مرورگرمحور و مرز ذخیره‌سازی

- **زمینه:** مالک محصول برای طراحی و پذیرش سریع به اجرای مستقل از Server نیاز دارد.
- **تصمیم:** UI فقط `LocalFoundationService` را می‌شناسد؛ سرویس فقط `StorageAdapter` را می‌شناسد؛ اجرای فعلی `IndexedDBAdapter` است.
- **گزینه‌های ردشده:** PostgreSQL/Express در این فاز؛ localStorage به‌عنوان دیتابیس عملیاتی.
- **پیامد مثبت:** اجرای آفلاین و تست سریع؛ امکان جایگزینی Adapter.
- **پیامد منفی:** دستگاه/profile نقطه شکست یکتا و کنترل امنیتی سمت سرور غایب است.
- **Migration:** `ServerApiAdapter` باید semantics و error contract سرویس محلی را حفظ کند.
- **شاهد:** `FoundationApp.tsx`, `service.ts`, `storage.ts`.

### ADR-B — مجوز مؤثر چندلایه

- **زمینه:** نام نقش به‌تنهایی برای تفکیک شرکت، واحد، تیم، خود و رکورد کافی نیست.
- **تصمیم:** Role permissions + per-user grants/denials + Scope + Resource Policy + Workflow Guard. Deny فردی برنده است.
- **گزینه‌های ردشده:** شرط‌های پراکنده در component؛ bypass برای QA persona.
- **پیامد:** تصمیم‌ها explainable و قابل Audit هستند؛ نگه‌داری ماتریس مجوز ضروری است.
- **امنیت:** QA login actor ادمین و effective user را جدا نگه می‌دارد.
- **شاهد:** `seed.ts`, `authorization.ts`, `organizationAccess.ts` و تست‌ها.

### ADR-C — Workflow نسخه‌دار با State Machine محافظت‌شده

- **زمینه:** مسیرها باید قابل تغییر باشند، اما تغییر آزاد stateها پرونده‌های جاری را خراب می‌کند.
- **تصمیم:** ترتیب stage، role، scope، تصمیم و route شعبه‌ای قابل نسخه‌گذاری است؛ state/transition مصوب آزادانه ویرایش نمی‌شود.
- **پیامد:** نسخه و route هنگام ایجاد روی رکورد freeze می‌شود. تغییر سیاست فقط رکورد جدید را می‌گیرد.
- **محدودیت:** quorum، escalation زمانی و expressionهای شرطی `Planned` هستند.
- **شاهد:** `workflowPolicy.ts`, `WorkflowAdminPage.tsx`, `service.updateWorkflowPolicy`.

### ADR-D — Audit، History و Domain Event در همان Transaction

- **زمینه:** تصمیم، actor، زمان، reason و handoff باید قابل پیگیری بمانند.
- **تصمیم:** تغییر عملیاتی همراه history، audit، domain event و meta در یک transaction IndexedDB نوشته می‌شود.
- **پیامد:** failure میانی rollback می‌شود؛ اما tamper evidence مستقل از دستگاه وجود ندارد.
- **مهاجرت آینده:** outbox یا event log سمت سرور باید correlation و ordering را حفظ کند.
- **شاهد:** `persistOperationalChange` و `StorageAdapter.transaction`.

## ADRهای تاریخی

فایل‌های `docs/decisions/adr/ADR-001` تا `ADR-007` طراحی Server/PostgreSQL قدیمی‌اند. آن‌ها برای بازیابی دانش حفظ شده‌اند، اما برای runtime جاری `Deprecated` هستند و شناسه‌هایشان با جدول تصمیم‌های Local-first بالا یک namespace مشترک ندارند.
