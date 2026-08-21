# راهنمای مستندات پروژه

> Status: CURRENT
> Source of truth: این فایل فقط مرجع ناوبری و فهرست مستندات است.
> Owner: Documentation Architecture
> Last validated: 2026-08-16 against `agent/warehouse-foundation`
> Supersedes: none
> Superseded by: none

این فایل نقطه ورود مرکزی مستندات پروژه است. هدف آن پیدا کردن سند مناسب با کمترین میزان مطالعه و جلوگیری از بارگذاری غیرضروری تمام مستندات است.

## وضعیت مستندات

مهاجرت مستندات به مدل `single source of truth` کامل شده است. اسناد legacy و snapshot فقط برای traceability باقی مانده‌اند و وجود آن‌ها به معنی مرجع فعال بودن نیست.

برای تشخیص وضعیت اطلاعات:

- `CURRENT`: رفتار پیاده‌سازی‌شده و اعتبارسنجی‌شده با کد.
- `APPROVED-FUTURE`: طراحی پذیرفته‌شده‌ای که هنوز پیاده‌سازی نشده است.
- `ACCEPTED`: فقط برای ADR؛ تصمیم معماری پذیرفته‌شده برای آینده است و به معنی implementation فعلی نیست.
- `DRAFT`: موضوع در حال بررسی و فاقد تصمیم نهایی.
- `HISTORICAL`: تاریخچه حفظ‌شده و غیرقابل استفاده به‌عنوان رفتار فعلی.
- `DEPRECATED`: مرجع قدیمی که فقط برای سازگاری نگهداری می‌شود.

اسناد دارای وضعیت `MIXED` از ساختار قدیمی باقی مانده‌اند و باید هنگام مهاجرت به اسناد متمرکز و دارای وضعیت روشن تقسیم شوند.

## مسیرهای ورود

| نیاز | نقطه شروع فعلی |
|---|---|
| آشنایی با دامنه فعلی محصول | [product/overview.md](product/overview.md) |
| اصول cross-domain و جهت آینده محصول | [architecture/product-principles.md](architecture/product-principles.md) |
| معماری و tech stack فعلی | [architecture/current-system.md](architecture/current-system.md) |
| بنیاد محلی اجرایی Phase A | [architecture/local-foundation.md](architecture/local-foundation.md) |
| وضعیت فعلی API | [architecture/api-status.md](architecture/api-status.md) |
| مدل داده فعلی | [data/current-data-model.md](data/current-data-model.md) |
| Persistence فعلی | [data/persistence.md](data/persistence.md) |
| راه‌اندازی محیط توسعه | [engineering/development.md](engineering/development.md) |
| منبع GitHub و قاعده شروع توسعه | [engineering/source-of-truth.md](engineering/source-of-truth.md) |
| وضعیت quality و test | [engineering/quality.md](engineering/quality.md) |
| Engineering Gate A | [engineering/engineering-gate-a.md](engineering/engineering-gate-a.md) |
| وضعیت ادغام محصول canonical | [engineering/canonical-product-integration.md](engineering/canonical-product-integration.md) |
| فهرست ماژول‌های فعلی | [product/module-catalog.md](product/module-catalog.md) |
| واژه‌های دامنه | [glossary.md](glossary.md) |
| قواعد مالی و دسترسی | [finance rules](domains/finance/business-rules.md)، [roles](domains/finance/roles-and-permissions.md) |
| قواعد پشتیبانی | [domains/support/business-rules.md](domains/support/business-rules.md) |
| فروش فعلی و آینده | [current customer](domains/sales/current-customer.md)، [current lead operations](domains/sales/current-lead-operations.md)، [current invoice/payment](domains/sales/current-invoice-payment.md)، [approved design](domains/sales/approved-design.md)، [fulfillment policy](domains/sales/fulfillment-policy.md)، [open questions](domains/sales/open-questions.md) |
| بنیاد فعلی انبار و موجودی | [domains/warehouse/current-foundation.md](domains/warehouse/current-foundation.md) |
| ورود کنترل‌شده Customer | [domains/sales/customer-import.md](domains/sales/customer-import.md) |
| امنیت و حریم خصوصی | [engineering/security-and-privacy.md](engineering/security-and-privacy.md) |
| معماری و API آینده | [future platform](architecture/future-platform.md)، [API draft](future/api-contract-draft.md) |
| تصمیم‌های پذیرفته‌شده Foundation SaaS | [decisions/adr/README.md](decisions/adr/README.md) |
| مسیر کوتاه AI | [ai/start-here.md](ai/start-here.md) و [AGENTS.md](../AGENTS.md) |
| تاریخچه تصمیمات authoritative | [decisions/DECISION_LOG.md](decisions/DECISION_LOG.md) |

## اسناد authoritative فعال

| موضوع | مرجع authoritative | Status |
|---|---|---|
| هدف و دامنه محصول | [product/overview.md](product/overview.md) | `CURRENT` |
| اصول cross-domain آینده محصول | [architecture/product-principles.md](architecture/product-principles.md) | `APPROVED-FUTURE` |
| فهرست ماژول‌ها | [product/module-catalog.md](product/module-catalog.md) | `CURRENT` |
| واژه‌نامه | [glossary.md](glossary.md) | `CURRENT` |
| معماری و tech stack | [architecture/current-system.md](architecture/current-system.md) | `CURRENT` |
| وضعیت API | [architecture/api-status.md](architecture/api-status.md) | `CURRENT` |
| مدل داده | [data/current-data-model.md](data/current-data-model.md) | `CURRENT` |
| Persistence | [data/persistence.md](data/persistence.md) | `CURRENT` |
| قواعد مالی | [domains/finance/business-rules.md](domains/finance/business-rules.md) | `CURRENT` |
| نقش و permission | [domains/finance/roles-and-permissions.md](domains/finance/roles-and-permissions.md) | `CURRENT` |
| قواعد پشتیبانی | [domains/support/business-rules.md](domains/support/business-rules.md) | `CURRENT` |
| مشتری فروش فعلی | [domains/sales/current-customer.md](domains/sales/current-customer.md) | `CURRENT` |
| Customer Import و reconciliation | [domains/sales/customer-import.md](domains/sales/customer-import.md) | `CURRENT` |
| Lead، صف، تخصیص و تماس فروش | [domains/sales/current-lead-operations.md](domains/sales/current-lead-operations.md) | `CURRENT` |
| Sale، Invoice، Payment و Financial Review | [domains/sales/current-invoice-payment.md](domains/sales/current-invoice-payment.md) | `CURRENT` |
| Warehouse Foundation و Inventory | [domains/warehouse/current-foundation.md](domains/warehouse/current-foundation.md) | `CURRENT` |
| Development workflow | [engineering/development.md](engineering/development.md) | `CURRENT` |
| GitHub source of truth | [engineering/source-of-truth.md](engineering/source-of-truth.md) | `CURRENT` |
| Quality status | [engineering/quality.md](engineering/quality.md) | `CURRENT` |
| Engineering Gate A | [engineering/engineering-gate-a.md](engineering/engineering-gate-a.md) | `CURRENT` |
| وضعیت ادغام محصول canonical | [engineering/canonical-product-integration.md](engineering/canonical-product-integration.md) | `CURRENT` |
| Security posture | [engineering/security-and-privacy.md](engineering/security-and-privacy.md) | `CURRENT` |
| معماری آینده | [architecture/future-platform.md](architecture/future-platform.md) | `DRAFT` |
| تصمیم‌های معماری Foundation SaaS | [decisions/adr/README.md](decisions/adr/README.md) | `ACCEPTED`؛ آینده پیاده‌سازی‌نشده |
| API آینده | [future/api-contract-draft.md](future/api-contract-draft.md) | `DRAFT` |
| طراحی پذیرفته‌شده فروش | [domains/sales/approved-design.md](domains/sales/approved-design.md) | `APPROVED-FUTURE` |
| سیاست Invoice و Fulfillment آینده | [domains/sales/fulfillment-policy.md](domains/sales/fulfillment-policy.md) | `APPROVED-FUTURE` |
| پرسش‌های باز فروش | [domains/sales/open-questions.md](domains/sales/open-questions.md) | `DRAFT` |
| تاریخچه تصمیمات | [decisions/DECISION_LOG.md](decisions/DECISION_LOG.md) | `HISTORICAL` |
| مسیریابی AI | [ai/start-here.md](ai/start-here.md) | `CURRENT` |

مسیرهای legacy پایین حذف نشده‌اند. در Step 7 به redirectهای سازگاری تبدیل یا به archive دائمی منتقل شده‌اند و authority فعال محسوب نمی‌شوند.

## Compatibility و history

| فایل | نقش فعلی | وضعیت Step 7 |
|---|---|---|
| [README.md](../README.md) | entry کوتاه repository | `KEEP / CURRENT` |
| [AGENTS.md](../AGENTS.md) | ورودی کوتاه و authority دستورالعمل AI/developer | `KEEP` |
| [DECISION_LOG.md](../DECISION_LOG.md) | مسیر سازگاری برای Decision Log authoritative | `DEPRECATED_REDIRECT — APPLIED` |
| [AI_CONTEXT.md](AI_CONTEXT.md) | مسیر سازگاری برای AI routing جدید | `DEPRECATED_REDIRECT — APPLIED` |
| [API_DOCUMENTATION.md](API_DOCUMENTATION.md) | مسیر سازگاری برای API status/DRAFT | `DEPRECATED_REDIRECT — APPLIED` |
| [BUSINESS_RULES.md](BUSINESS_RULES.md) | مسیر سازگاری برای authorityهای domain | `DEPRECATED_REDIRECT — APPLIED` |
| [CODE_STRUCTURE.md](CODE_STRUCTURE.md) | محتوای انتقالی غیرauthoritative | `RETIRE_LATER — RETAINED` |
| [DATABASE_DOCUMENTATION.md](DATABASE_DOCUMENTATION.md) | مسیر سازگاری برای data/persistence | `DEPRECATED_REDIRECT — APPLIED` |
| [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) | مسیر سازگاری برای development/quality | `DEPRECATED_REDIRECT — APPLIED` |
| [MODULES_DOCUMENTATION.md](MODULES_DOCUMENTATION.md) | مسیر سازگاری برای module catalog | `DEPRECATED_REDIRECT — APPLIED` |
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | مسیر سازگاری برای product overview | `DEPRECATED_REDIRECT — APPLIED` |
| [SALES_ARCHITECTURE_DRAFT.md](SALES_ARCHITECTURE_DRAFT.md) | redirect به archive و authorityهای Sales | `ARCHIVED + DEPRECATED_REDIRECT` |
| [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) | مسیر سازگاری برای current/future architecture | `DEPRECATED_REDIRECT — APPLIED` |

## Snapshot پیش از مهاجرت

نسخه کامل و تغییرناپذیر مستندات قبل از Phase 3 در مسیر زیر نگهداری می‌شود:

- [Pre-migration snapshot manifest](archive/pre-migration-snapshot/2026-08-10-stable-f271cca7/manifest.md)
- [Pre-migration snapshot checksums](archive/pre-migration-snapshot/2026-08-10-stable-f271cca7/checksums.sha256)
- [Migration traceability and legacy classification](archive/migration-traceability.md)
- [Legacy product preservation and Legacy → SaaS map](archive/legacy-product-preservation-matrix.md)
- [Permanent Sales Draft archive](archive/sales/README.md)
- [PR #1 historical preservation and classification](archive/pr-1/README.md)
- [Archive consolidation audit and cleanup evidence](archive/archive-consolidation-audit.md)
- [Unique legacy product artifacts](archive/legacy-product/README.md)

Snapshot فقط برای بازیابی و تاریخچه است و نباید به‌عنوان مستندات فعال استفاده شود.

## قواعد استفاده در دوره مهاجرت

1. برای رفتار فعلی، ادعاهای سند باید با کد موجود در `stable` تطبیق داده شوند.
2. اسناد API و طراحی فروش نباید بدون شواهد کد به‌عنوان قابلیت پیاده‌سازی‌شده تلقی شوند.
3. عامل‌های هوش مصنوعی ابتدا این فایل را بخوانند و فقط سند مرتبط با وظیفه را باز کنند.
4. از بارگذاری هم‌زمان تمام مستندات خودداری شود.
5. جدول زیر تنها مرجع تعیین مالکیت مستندات است؛ جزئیات هر موضوع نباید در این فایل تکرار شود.

## سیاست مالکیت source of truth

این جدول مالک موضوعات را تعیین می‌کند، اما سند مقصد فقط زمانی مرجع فعال می‌شود که:

1. فایل واقعاً ایجاد شده باشد.
2. وضعیت آن `CURRENT`، `APPROVED-FUTURE` یا `DRAFT` به‌طور صریح مشخص شده باشد.
3. محتوای `CURRENT` با کد `stable` اعتبارسنجی شده باشد.
4. اسناد دیگر به‌جای تکرار محتوا به آن لینک دهند.

وضعیت مالکیت در دوره مهاجرت:

- `ACTIVE`: مرجع رسمی اکنون موجود و قابل استفاده است.
- `LEGACY`: اطلاعات فعلاً در ساختار قدیمی است و باید با کد یا تاریخچه تطبیق داده شود.
- `PLANNED`: مسیر نهایی رزرو شده، اما هنوز مرجع فعال نیست.
- `HISTORICAL`: فقط برای تاریخچه و بازیابی است.

## Source-of-truth ownership map

| موضوع | منبع بررسی فعلی در دوره مهاجرت | سند نهایی authoritative | Owner | وضعیت فعلی | اسنادی که باید به مرجع نهایی لینک دهند |
|---|---|---|---|---|---|
| ناوبری و مالکیت مستندات | همین فایل | `docs/README.md` | Documentation Architecture | `ACTIVE` | `README.md`, `AGENTS.md`, تمام indexهای دامنه |
| هدف، دامنه و کاربران پروژه | `docs/product/overview.md` | `docs/product/overview.md` | Product Owner | `ACTIVE` | `README.md`, module catalog, AI instructions |
| اصول cross-domain آینده محصول | `docs/architecture/product-principles.md` | `docs/architecture/product-principles.md` | Product Architecture Owner | `ACTIVE (APPROVED-FUTURE)` | product overview, future platform, اسناد future دامنه‌ها، AI instructions |
| فهرست ماژول‌های پیاده‌سازی‌شده | `docs/product/module-catalog.md` با شواهد `src/components/` | `docs/product/module-catalog.md` | Product Owner | `ACTIVE` | product overview, codebase map, AI instructions |
| واژگان فارسی و English دامنه | `docs/glossary.md` | `docs/glossary.md` | Documentation Architecture | `ACTIVE` | تمام اسناد دامنه |
| tech stack فعلی | `docs/architecture/current-system.md` با شواهد package و code | `docs/architecture/current-system.md` | Architecture Owner | `ACTIVE` | `README.md`, development guide, AI instructions |
| معماری فعلی سیستم | `docs/architecture/current-system.md` | `docs/architecture/current-system.md` | Architecture Owner | `ACTIVE` | module catalog, codebase map, data docs |
| وضعیت API فعلی | `docs/architecture/api-status.md` | `docs/architecture/api-status.md` | Architecture Owner | `ACTIVE` | `README.md`, security, future API contract |
| overview و جزئیات حل‌نشده معماری آینده platform/backend | `docs/architecture/future-platform.md` | `docs/architecture/future-platform.md` | Architecture Owner | `ACTIVE (DRAFT)` | future API contract, approved sales design, ADR index |
| مدل Tenant/Workspace پذیرفته‌شده | `docs/decisions/adr/ADR-001-tenant-workspace-model.md` | `docs/decisions/adr/ADR-001-tenant-workspace-model.md` | Architecture Owner | `ACTIVE (ADR ACCEPTED؛ implementation در CURRENT authorities)` | future platform, product principles, identity design |
| topology اولیه Backend | `docs/decisions/adr/ADR-002-modular-monolith.md` | `docs/decisions/adr/ADR-002-modular-monolith.md` | Architecture Owner | `ACTIVE (ADR ACCEPTED؛ implementation در CURRENT authorities)` | future platform, development guidance |
| Database و tenancy enforcement | `docs/decisions/adr/ADR-003-postgresql-tenancy.md` | `docs/decisions/adr/ADR-003-postgresql-tenancy.md` | Data Architecture Owner | `ACTIVE (ADR ACCEPTED؛ implementation در CURRENT authorities)` | future platform, future data design, migration plan |
| Identity/session/authorization | `docs/decisions/adr/ADR-004-identity-session-authorization.md` | `docs/decisions/adr/ADR-004-identity-session-authorization.md` | Security Architecture Owner | `ACTIVE (ADR ACCEPTED؛ implementation در CURRENT authorities)` | future platform, security, future API contract |
| Audit، Outbox و reliability | `docs/decisions/adr/ADR-005-audit-outbox-reliability.md` | `docs/decisions/adr/ADR-005-audit-outbox-reliability.md` | Architecture Owner | `ACTIVE (ADR ACCEPTED؛ implementation در CURRENT authorities)` | future platform, domain designs, integration design |
| راهبرد مهاجرت Prototype | `docs/decisions/adr/ADR-006-prototype-migration.md` | `docs/decisions/adr/ADR-006-prototype-migration.md` | Data Architecture Owner | `ACTIVE (ADR ACCEPTED؛ implementation در CURRENT authorities)` | persistence, future platform, migration artifacts |
| مرزهای Data/AI/Security | `docs/decisions/adr/ADR-007-data-ai-security-boundaries.md` | `docs/decisions/adr/ADR-007-data-ai-security-boundaries.md` | Security Architecture Owner | `ACTIVE (ADR ACCEPTED؛ implementation در CURRENT authorities)` | security, product principles, AI guidance |
| مدل داده فعلی | `docs/data/current-data-model.md` با شواهد `src/types.ts` | `docs/data/current-data-model.md` | Data Owner | `ACTIVE` | اسناد دامنه، architecture |
| persistence فعلی | `docs/data/persistence.md` با شواهد `src/utils/storage.ts` | `docs/data/persistence.md` | Data Owner | `ACTIVE` | architecture, security, development |
| قواعد مالی و approval workflow | `docs/domains/finance/business-rules.md` با شواهد code | `docs/domains/finance/business-rules.md` | Finance Domain Owner | `ACTIVE` | module catalog, roles and permissions |
| نقش‌ها و permissions | `docs/domains/finance/roles-and-permissions.md` با شواهد permission utilities | `docs/domains/finance/roles-and-permissions.md` | Access Control Owner | `ACTIVE` | finance rules, security, module catalog |
| قواعد support و complaint | `docs/domains/support/business-rules.md` با شواهد code | `docs/domains/support/business-rules.md` | Support Domain Owner | `ACTIVE` | module catalog, sales documents |
| Customer identity/profile و relationship فعلی شرکت | `docs/domains/sales/current-customer.md` با شواهد code | `docs/domains/sales/current-customer.md` | Sales Domain Owner | `ACTIVE` | module catalog, data model |
| Customer Import، staging و reconciliation فعلی | `docs/domains/sales/customer-import.md` با شواهد code | `docs/domains/sales/customer-import.md` | Sales Domain Owner | `ACTIVE` | current customer, data model, API status, security |
| عملیات فعلی Lead، Sales Queue، Assignment، Call Log و Marketing Context | `docs/domains/sales/current-lead-operations.md` با شواهد migration/service/test | `docs/domains/sales/current-lead-operations.md` | Sales Domain Owner | `ACTIVE` | module catalog, current system, data model, API status, security |
| عملیات فعلی Sale، Invoice، revision، Payment و Financial Review | `docs/domains/sales/current-invoice-payment.md` با شواهد migration/service/test/UI | `docs/domains/sales/current-invoice-payment.md` | Sales Domain Owner | `ACTIVE` | module catalog, current system, data model, API status, security, fulfillment policy |
| عملیات فعلی Warehouse، Inventory ledger، Receiving، Reservation، Transfer، Control و Return | `docs/domains/warehouse/current-foundation.md` با شواهد migration/service/test/UI | `docs/domains/warehouse/current-foundation.md` | Warehouse Domain Owner | `ACTIVE` | module catalog, data model, persistence, API status, security, fulfillment policy |
| طراحی پذیرفته‌شده آینده sales | `docs/domains/sales/approved-design.md` | `docs/domains/sales/approved-design.md` | Sales Domain Owner | `ACTIVE (APPROVED-FUTURE)` | future platform, decisions |
| سیاست پذیرفته‌شده Invoice release، Warehouse، Logistics، Service execution و cancellation | `docs/domains/sales/fulfillment-policy.md` | `docs/domains/sales/fulfillment-policy.md` | Sales Domain Owner | `ACTIVE (APPROVED-FUTURE)` | approved sales design, open questions, future platform, decisions |
| پرسش‌های حل‌نشده sales | `docs/domains/sales/open-questions.md` | `docs/domains/sales/open-questions.md` | Sales Domain Owner | `ACTIVE (DRAFT)` | approved sales design |
| راه‌اندازی و development workflow | `docs/engineering/development.md` | `docs/engineering/development.md` | Engineering Owner | `ACTIVE` | `README.md`, AI instructions |
| Git lineage و محل شروع توسعه | `docs/engineering/source-of-truth.md` | `docs/engineering/source-of-truth.md` | Engineering Owner | `ACTIVE` | `README.md`, `AGENTS.md`, AI instructions |
| testing و quality gates | `docs/engineering/quality.md` | `docs/engineering/quality.md` | Engineering Owner | `ACTIVE` | development guide, release guidance |
| کنترل‌های Engineering Gate A | `docs/engineering/engineering-gate-a.md` | `docs/engineering/engineering-gate-a.md` | Engineering Owner | `ACTIVE` | quality، security، CI guidance |
| وضعیت canonical product integration | `docs/engineering/canonical-product-integration.md` | `docs/engineering/canonical-product-integration.md` | Product Integration | `ACTIVE` | module catalog، AI instructions، preservation matrix |
| security و privacy | `docs/engineering/security-and-privacy.md` با شواهد code | `docs/engineering/security-and-privacy.md` | Security Owner | `ACTIVE` | persistence, API status, roles and permissions |
| قرارداد مفهومی API آینده | `docs/future/api-contract-draft.md` | `docs/future/api-contract-draft.md` | Architecture Owner | `ACTIVE (DRAFT)` | API status, future platform |
| تاریخچه تصمیمات | `docs/decisions/DECISION_LOG.md` | `docs/decisions/DECISION_LOG.md` | Architecture Owner | `ACTIVE (HISTORICAL)` | همه اسنادی که به rationale نیاز دارند |
| دستورالعمل اجباری AI | `AGENTS.md` | `AGENTS.md` | Documentation Architecture | `ACTIVE` | `docs/ai/start-here.md`, documentation index |
| مسیریابی task-based برای AI | `docs/ai/start-here.md` | `docs/ai/start-here.md` | Documentation Architecture | `ACTIVE` | `AGENTS.md` |

## قواعد جلوگیری از مالکیت دوگانه

1. ستون «سند نهایی authoritative» برای هر موضوع فقط یک مسیر دارد.
2. یک سند می‌تواند مالک چند موضوع مرتبط باشد؛ برای مثال `current-system.md` مالک tech stack و معماری فعلی است.
3. اسناد overview و AI فقط خلاصه ناوبری ارائه می‌کنند و جزئیات موضوع را تکرار نمی‌کنند.
4. کد و package configuration شواهد اعتبارسنجی `CURRENT` هستند، اما جای مستند authoritative را نمی‌گیرند.
5. تا زمانی که یک مقصد `PLANNED` ایجاد و اعتبارسنجی نشده، منبع قدیمی حذف یا `DEPRECATED` نمی‌شود.
6. هر تغییر آینده در مالکیت باید فقط در همین جدول ثبت شود.
