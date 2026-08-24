# Definition of Done

یک تغییر فقط وقتی Done است که موارد مرتبط زیر کامل باشند:

- [ ] Goal، Actorها، رفتار فعلی/موردانتظار و Acceptance Criteria روشن‌اند.
- [ ] سؤال محصولی حل‌نشده وجود ندارد یا تغییر در نقطه امن متوقف شده است.
- [ ] سند دامنه و مسیر معماری واقعی بررسی شده‌اند.
- [ ] Component/Helper موجود reuse شده و duplication بی‌دلیل اضافه نشده است.
- [ ] Permission، Scope، Resource، Workflow و Maker/Checker مرتبط در Service enforce شده‌اند.
- [ ] Audit/History/Event بدون داده حساس بررسی شده‌اند.
- [ ] Migration/atomicity/concurrency/failure paths متناسب با ریسک پوشش دارند.
- [ ] تست مثبت و تست منفی لازم اضافه شده‌اند.
- [ ] RTL، فارسی، responsive و accessibility برای UI مرتبط بررسی شده‌اند.
- [ ] `npm run lint` موفق است.
- [ ] `npm run typecheck` موفق است.
- [ ] `npm test` موفق است.
- [ ] `npm run build` موفق است.
- [ ] Gateهای اضافه انتخاب‌شده در Testing Policy موفق‌اند.
- [ ] Findings مستقل triage شده و مورد `VALID` حل‌نشده پنهان نشده است.
- [ ] Docs و status labelهای مرتبط به‌روزند.
- [ ] تغییر روی Branch امن با کامیت‌های روشن است و protected branch خودکار Merge نشده است.
- [ ] هشدارها، محدودیت‌ها و بخش‌های unverified در تحویل نهایی گفته شده‌اند.
