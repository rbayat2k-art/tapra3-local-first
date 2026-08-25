# مدل داده و IndexedDB

> **وضعیت سند:** `Verified` | **DB:** `tapra2_local` | **Schema:** 11

## قرارداد ذخیره‌سازی

`StorageAdapter` عملیات `transaction`، `get`، `getAll`، `put`، `delete`، `replaceAll`، `exportSnapshot` و `importSnapshot` را تعریف می‌کند. `IndexedDBAdapter` پیاده‌سازی فعال است. هر object store از `id` به‌عنوان keyPath استفاده می‌کند.

## گروه‌های اصلی داده

| گروه | نمونه storeها | وضعیت |
|---|---|---|
| Foundation | `meta`, `sessions`, `users`, `security_roles`, `policy_definitions`, `workflow_definitions` | `Verified` |
| Organization | `personnel`, `units`, `positions`, `branches`, `personnel_movements` | `Verified` |
| Access/QA | grant/denialهای داخل `users`، `registration_requests`, `qa_dataset_manifests` | `Verified` |
| Audit/Event | `audit_events`, `domain_events`, `workflow_history`, `notifications`, `idempotency_keys` | `Verified` |
| CRM/Sales | customer/contact/lead/opportunity/sales structure stores | `Verified` برای schema؛ عمق قابلیت متفاوت است |
| Finance/Operations | purchase, treasury, invoice, payment, accounting, warehouse و سایر storeهای Catalog | `Verified` برای schema |

فهرست کامل ۹۶ store در [`FOUNDATION_STORES`](../src/local-foundation/model.ts) مرجع نهایی است.

## Indexها

`Verified` — Indexهای صریح فعلی:

- `audit_events`: `occurredAt`, `actorId`, `category`
- `domain_events`: `aggregateId`
- `notifications`: `userId`, `createdAt`, `dedupeKey`

`Inferred` — در مقیاس بسیار بزرگ، Queryهای بیشتر به index و pagination واقعی نیاز خواهند داشت؛ اکنون بسیاری از فهرست‌ها با `getAll` در حافظه فیلتر می‌شوند.

## نسخه و migration

- `Verified` — schema version عددی 10 است و seed version رشته `complete-local-erp-v1.28-unit-position-catalog` است.
- `Verified` — ایجاد storeهای گمشده در `onupgradeneeded` انجام می‌شود.
- `Conflict` — سند قدیمی `architecture/local-foundation.md` هنوز schema version 7 را ذکر می‌کند.
- `Unknown` — migrationهای معنایی رسمی و قابل rollback برای تغییر شکل payloadها وجود ندارد.

## Snapshot schema

Snapshot شامل `schemaVersion`، `seedVersion`، `exportedAt`، تمام storeها و checksum SHA-256 است. Import فقط schema دقیقاً همسان و مجموعه کامل storeها را می‌پذیرد و سپس در transaction مشترک جایگزین می‌کند.

## قیود داده‌ای

`Verified` — یکتایی username، کد ملی و موبایل در use-caseهای مربوط در Service کنترل می‌شود، نه با unique index دیتابیس. Optimistic concurrency با `expectedVersion` در عملیات حساس اجرا می‌شود.

## عدم وجود پایگاه داده سروری

`Verified` — migration SQL، ORM، connection string، PostgreSQL و replication در اجرای فعلی وجود ندارند. هر سندی که آن‌ها را وضعیت جاری معرفی کند `Conflict` است.
