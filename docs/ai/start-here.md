# شروع سریع برای AI و توسعه‌دهنده

> Status: CURRENT
> Source of truth: این سند فقط برای مسیریابی task-based عامل‌های AI است.
> Owner: Documentation Architecture
> Last validated: 2026-08-24 against `fix/ocr-blockers-20260824`
> Supersedes: none
> Superseded by: none

## ترتیب خواندن

1. قواعد اجباری و workflow: [`AGENTS.md`](../../AGENTS.md).
2. منبع Repository و ترتیب authority: [source of truth](../engineering/source-of-truth.md).
3. انتخاب authority موضوع: [docs/README.md](../README.md).
4. فقط سندهای مرتبط با task و سپس code/test شاهد همان موضوع.

## مسیرهای رایج

| Task | فقط این اسناد را ابتدا بخوانید |
|---|---|
| درخواست مالی یا approval | [finance rules](../domains/finance/business-rules.md)، [roles](../domains/finance/roles-and-permissions.md) |
| پشتیبانی/عودت | [support rules](../domains/support/business-rules.md)، [finance rules](../domains/finance/business-rules.md) |
| مشتری، پرسنل و جریان‌های جاری | [user flows](../21-USER-FLOWS.md)، [business rules](../05-BUSINESS-RULES.md) |
| فروش/مالی/پشتیبانی | سند دامنه فقط وقتی `CURRENT` است؛ سپس [feature matrix](../_meta/FEATURE-MATRIX.md) و کد فعال |
| Warehouse و Asset | [module catalog](../01-PROJECT-OVERVIEW.md)، [user flows](../21-USER-FLOWS.md)، کد فعال Local Foundation |
| shell، navigation یا backing ماژول‌ها | [architecture](../03-ARCHITECTURE.md)، [module catalog](../product/module-catalog.md) |
| CI، migration یا seed safety | [testing policy](../engineering/testing-policy.md)، [testing](../15-TESTING.md)، [database](../06-DATABASE.md) |
| Auth، Scope و Permission | [authentication/access](../08-AUTHENTICATION-AND-ACCESS.md)، [permission matrix](../22-PERMISSION-MATRIX.md) |
| طراحی آینده فروش | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) |
| معماری/API آینده | [future platform](../architecture/future-platform.md)، [API draft](../future/api-contract-draft.md) |
| امنیت | [security](../09-SECURITY.md)، [reliability](../10-RELIABILITY-AND-FAILURE-PREVENTION.md) |
| تصمیم و rationale | [decision log](../decisions/DECISION_LOG.md) |

## قاعده context

اسناد legacy/Server-backed را فقط برای traceability یا حل تعارض تاریخی باز کنید. وجود متن future در Repository هرگز اثبات پیاده‌سازی نیست. برای Featureهای غیرساده از Skill پروژه `$tapra-feature-delivery` استفاده کنید.
