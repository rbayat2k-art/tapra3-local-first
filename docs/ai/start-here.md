# شروع سریع برای AI و توسعه‌دهنده

> Status: CURRENT
> Source of truth: این سند فقط برای مسیریابی task-based عامل‌های AI است.
> Owner: Documentation Architecture
> Last validated: 2026-08-16 against `agent/warehouse-foundation`
> Supersedes: none
> Superseded by: none

## ترتیب خواندن

1. قواعد اجباری و محدودیت‌ها: [AGENTS.md](../../AGENTS.md)
2. انتخاب authority موضوع: [docs/README.md](../README.md)
3. فقط سندهای مرتبط با task و سپس code شاهد همان موضوع.

## مسیرهای رایج

| Task | فقط این اسناد را ابتدا بخوانید |
|---|---|
| درخواست مالی یا approval | [finance rules](../domains/finance/business-rules.md)، [roles](../domains/finance/roles-and-permissions.md) |
| پشتیبانی/عودت | [support rules](../domains/support/business-rules.md)، [finance rules](../domains/finance/business-rules.md) |
| مشتری فعلی | [current customer](../domains/sales/current-customer.md) |
| Customer Import | [customer import](../domains/sales/customer-import.md) |
| Lead، Sales Queue، Assignment یا Call Log فعلی | [current lead operations](../domains/sales/current-lead-operations.md) |
| Sale، Invoice، Payment یا Financial Review فعلی | [current invoice/payment](../domains/sales/current-invoice-payment.md) |
| Warehouse، Inventory، Receiving، Reservation یا Return | [current Warehouse foundation](../domains/warehouse/current-foundation.md) |
| shell، navigation یا backing ماژول‌ها | [canonical integration](../engineering/canonical-product-integration.md)، [module catalog](../product/module-catalog.md) |
| CI، migration یا seed safety | [Engineering Gate A](../engineering/engineering-gate-a.md)، [quality](../engineering/quality.md) |
| Foundation Backend/Auth/tenant | [current system](../architecture/current-system.md)، [API status](../architecture/api-status.md)، [security](../engineering/security-and-privacy.md) |
| طراحی آینده فروش | [approved design](../domains/sales/approved-design.md)، [open questions](../domains/sales/open-questions.md) |
| معماری/API آینده | [future platform](../architecture/future-platform.md)، [API draft](../future/api-contract-draft.md) |
| امنیت | [security](../engineering/security-and-privacy.md)، [persistence](../data/persistence.md) |
| تصمیم و rationale | [decision log](../decisions/DECISION_LOG.md) |

## قاعده context

اسناد legacy و Snapshot را فقط برای traceability یا حل تعارض تاریخی باز کنید. برای recovery از [preservation matrix](../archive/legacy-product-preservation-matrix.md) شروع کنید و ZIP evidence را فقط در صورت نیاز forensic بخوانید. این فایل جزئیات دامنه را تکرار نمی‌کند و وجود متن future در repository هرگز اثبات پیاده‌سازی نیست.
