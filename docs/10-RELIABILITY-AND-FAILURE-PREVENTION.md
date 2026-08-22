# قابلیت اطمینان و پیشگیری از خطا

> **وضعیت سند:** `Verified` برای کنترل‌های موجود

## کنترل‌های موجود

- Transaction چند-store: ثبت رکورد، history، audit، domain event و meta با هم commit/abort می‌شوند.
- Optimistic concurrency: عملیات حساس `expectedVersion` می‌گیرند و در تعارض پیام Refresh/Retry می‌دهند.
- Idempotency: Transition عمومی و Follow-up روزانه کلید تکرار دارند.
- Snapshot validation: schema، store set و checksum قبل از restore کنترل می‌شود.
- Deterministic seed: Reset نتیجه قابل پیش‌بینی برای QA تولید می‌کند.
- Frozen workflow: رکورد جاری نسخه و route زمان ایجاد را حفظ می‌کند.
- Form guards: required/format/business validation قبل از persistence.
- Permission-aware navigation: منوی غیرمجاز پنهان است و Service نیز مجوز را دوباره اجرا می‌کند.

## حالت‌های شکست و پاسخ

| شکست | رفتار فعلی | وضعیت |
|---|---|---|
| دو تب یک رکورد را ویرایش کنند | stale version و Refresh/Retry | `Verified` |
| Snapshot خراب/نسخه ناسازگار | Import رد می‌شود | `Verified` |
| quota مرورگر پر شود | عملیات IndexedDB خطا می‌دهد | `Inferred`؛ UX تخصصی کامل تأیید نشد |
| بستن مرورگر حین transaction | atomicity IndexedDB | `Verified` |
| خطای render React | Error boundary سراسری صریح دیده نشد | `Unknown` |
| خرابی projection | rebuild projection وجود دارد | `Verified` |

## کاستی‌ها

- `Verified` — Offline واقعی است اما Sync/replication وجود ندارد.
- `Verified` — retry خودکار و backoff برای external service موضوعیت ندارد چون سرویس خارجی فعال نیست.
- `Unknown` — آزمون Crash recovery، quota exhaustion و مرورگرهای مختلف به‌صورت خودکار وجود ندارد.
- `Planned` — در Server phase، outbox/inbox، distributed idempotency، conflict policy، queue DLQ و circuit breaker باید طراحی شود.
