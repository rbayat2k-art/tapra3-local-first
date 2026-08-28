# مشاهده‌پذیری

> **وضعیت سند:** `Verified` برای مشاهده‌پذیری درون‌محصولی

## سیگنال‌های موجود

- `audit_events`: رخداد کاربر/سیستم با sequence، actor، effective user، category، action، outcome، reason، correlation ID و metadata.
- `domain_events`: aggregate type/id، event type، actor، timestamp و payload.
- `workflow_history`: تاریخچه وضعیت، handoff و تصمیم هر رکورد.
- `notifications`: اعلان کاربر، unread/read، dedupe key و زمان.
- `meta.lastPersistedAt`: آخرین persistence.
- Dashboardهای محلی: شمارنده داده، صف‌ها و وضعیت Foundation.

## چیزی که وجود ندارد

- `Verified` — لاگ مرکزی، metrics exporter، traces توزیع‌شده، APM، alert manager و uptime monitor وجود ندارد.
- `Verified` — correlation ID در Audit/Domain Event هست اما به سامانه بیرونی ارسال نمی‌شود.
- `Unknown` — KPI و threshold رسمی کسب‌وکار برای هشدار تعریف نشده است.

## پیشنهاد مرحله بعد

- `Planned` — health panel محلی برای quota، schema، آخرین backup، projection lag و event failures.
- `Planned` — در Server phase: structured logs بدون PII، OpenTelemetry trace، metrics صف/خطا/latency، alertهای actionable و dashboard نقش‌محور.

## حریم خصوصی

`Documented` — لاگ و Audit نباید رمز، فایل کامل، شماره کارت کامل یا داده حساس غیرضروری را ثبت کند. گزارش خطا باید شناسه رکورد و correlation ID بدهد، نه payload محرمانه.
