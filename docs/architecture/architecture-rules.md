# قواعد معماری جاری

> **وضعیت:** `CURRENT` برای Runtime محلی این Repository.

## مسیر مجاز فرمان

```text
Persian RTL UI
→ application command in LocalFoundationService or focused domain helper
→ permission + scope + resource + workflow guard
→ StorageAdapter transaction
→ IndexedDB stores + history + audit + domain event
→ state reload and permission-aware rendering
```

## قواعد مرزی

- UI مستقیماً IndexedDB را صدا نمی‌زند و منبع نهایی Authorization نیست.
- `StorageAdapter` مرز Persistence است؛ تست‌ها می‌توانند Adapter حافظه‌ای یا `fake-indexeddb` استفاده کنند.
- فرمان عمومی نباید invariant یک ماژول تخصصی را دور بزند. ماژول دارای Payload/Scope/Workflow ویژه، command اختصاصی می‌خواهد.
- رکورد Workflow نسخه و Route خود را pin می‌کند. نبود نسخه/Route تاریخی خطاست و به نسخه فعال fallback نمی‌شود.
- Validation مرتبط با نتیجه باید پیش از commit یا داخل همان transaction انجام شود. Audit موفقیت قبل از commit نهایی ثبت نمی‌شود.
- نتیجه‌های چندرکوردی در یک transaction نوشته می‌شوند. اگر transaction واحد ممکن نیست، pending state پایدار، idempotency key، retry و recovery test الزامی است.
- Migration باید داده موجود را با defaultهای جدید merge کند؛ Seed مرجع جایگزینی wholesale داده کاربر نیست.
- Side effect خارجی در Runtime عادی فعلی وجود ندارد. هر اتصال آینده نیازمند boundary، retry، timeout، idempotency و threat model مستقل است.

## کنترل رشد

- `src/local-foundation/service.ts` و `FoundationApp.tsx` بدهی فنی شناخته‌شده‌اند. قابلیت جدید نباید مسئولیت تازه‌ای را بی‌دلیل داخل آن‌ها انباشته کند.
- منطق دامنه قابل تست در فایل focused قرار می‌گیرد؛ Component فقط orchestration نمایشی را نگه می‌دارد.
- Abstraction جدید با یک مصرف‌کننده پیش‌فرض نیست. ابتدا از helper مستقیم استفاده و پس از دومین use case واقعی استخراج شود.
- تغییر Schema همراه افزایش نسخه، migration path، fixture قدیمی، تست idempotency و بررسی حفظ relationshipهاست.

## وضعیت معماری‌های دیگر

اسناد Server-backed/PostgreSQL در Repository برای تاریخچه یا آینده باقی مانده‌اند. تا زمانی که در ورودی Runtime، package scripts و تست پذیرش فعال نشده‌اند، مبنای Implementation جاری نیستند.

