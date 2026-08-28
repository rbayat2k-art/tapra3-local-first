# Research: هسته واحد حقوقی و بازرسی

## Decision 1: bounded context مستقل

**Decision**: مسیر فعال `src/local-foundation/legal-inspection` ساخته شود و legacy `src/components/SupportCaseFormModal.tsx` و localStorage حساب‌ها استفاده نشود.

**Rationale**: برنامه فعال فقط LocalFoundationApp است و مسیر legacy authorization، tenant، audit، CAS و masking لازم را ندارد.

**Alternatives considered**: توسعه support-case عمومی؛ رد شد چون قرارداد پرونده حقوقی، اشخاص و restrictionها را به payload عمومی و ناامن تبدیل می‌کند.

## Decision 2: tenant، company و legal entity جدا

**Decision**: هر رکورد tenant و company مالک دارد؛ LegalEntity مرجع جدا داخل همان tenant است و پیوند چندشرکتی صریح ثبت می‌شود.

**Rationale**: حدود ۹ شخصیت حقوقی وجود دارد و scope گروهی نباید به دسترسی ضمنی به همه شرکت‌ها تبدیل شود.

**Alternatives considered**: استفاده مستقیم از companyId به‌جای legal entity؛ رد شد چون مالک حساب، سابقه ثبتی و رابطه چندشرکتی را مبهم می‌کند.

## Decision 3: حساب بانکی masked-by-default

**Decision**: full values فقط در store حساس account detail؛ پرونده فقط accountId و snapshot ماسک‌شده دارد. permission ماسک‌شده و full جدا است.

**Rationale**: تکرار شماره در پرونده/history/export سطح نشت و stale master data را افزایش می‌دهد.

**Alternatives considered**: duplicate کردن شماره کامل در payload پرونده؛ رد شد.

## Decision 4: local prototype با داده مصنوعی

**Decision**: فاز اول بنر دائمی منع داده واقعی دارد و upload/export/payment حساس ارائه نمی‌کند.

**Rationale**: runtime فعلی encryption-at-rest، secure blob، MFA، malware scan، tamper-evident audit و retention server-side ندارد.

**Alternatives considered**: استفاده محدود از داده واقعی؛ رد شد چون کنترل‌های فنی کافی نیست.

## Decision 5: safe CSV later, no XLSX expansion

**Decision**: فاز اول import/export ندارد؛ در فاز بعد safe CSV port بررسی می‌شود و dependency فعلی xlsx برای این دامنه توسعه داده نمی‌شود.

**Rationale**: dependency فعلی برای داده حساس baseline امنیتی مناسبی ندارد و formula injection نیز باید کنترل شود.

## Decision 6: no physical delete

**Decision**: status/void/supersede با reason و history append-only؛ purge تا تصویب retention/legal-hold غیرفعال است.

**Rationale**: پرونده، دستور قضایی، حساب و سند حقوقی نیازمند chain of custody و قابلیت ممیزی‌اند.
