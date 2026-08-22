# معماری

> **وضعیت سند:** `Verified`

## نمای کلان

```text
React Persian RTL UI
        ↓
LocalFoundationService / Application Layer
        ↓
Authorization + Domain Rules + Workflow Guards
        ↓
StorageAdapter
        ↓
IndexedDBAdapter
        ↓
Browser IndexedDB (tapra2_local)
```

## لایه‌ها

1. `Verified` — **Presentation:** [`FoundationApp.tsx`](../src/local-foundation/FoundationApp.tsx) و Pageهای تخصصی. کامپوننت‌ها مستقیماً IndexedDB را صدا نمی‌زنند.
2. `Verified` — **Application/Domain:** [`service.ts`](../src/local-foundation/service.ts)، [`authorization.ts`](../src/local-foundation/authorization.ts)، قواعد تخصصی purchase/advance/profile/workflow.
3. `Verified` — **Storage boundary:** قرارداد `StorageAdapter` و پیاده‌سازی `IndexedDBAdapter` در [`storage.ts`](../src/local-foundation/storage.ts).
4. `Verified` — **Registry:** ماژول‌ها، Workflowهای عمومی، Permissionها و Role templateها در [`erpCatalog.ts`](../src/local-foundation/erpCatalog.ts).
5. `Verified` — **Model/schema:** انواع و فهرست storeها در [`model.ts`](../src/local-foundation/model.ts).

## جریان یک فرمان

```text
Click/Submit
→ validation UI
→ service method
→ permission + scope + resource + transition checks
→ IndexedDB transaction
→ domain/audit/history event
→ reload state
→ permission-aware render
```

## اصول معماری

- `Verified` — UI به storage implementation وابسته نیست؛ تعویض آینده `IndexedDBAdapter` با `ServerApiAdapter` از نظر طراحی ممکن است.
- `Verified` — تغییرات چند-store در transaction واحد انجام می‌شوند.
- `Verified` — Side effect خارجی واقعی وجود ندارد؛ SMS و Notification فعلاً محلی‌اند.
- `Verified` — Routing سبک با query parameter و History API انجام می‌شود؛ Refresh باید صفحه و cartable را نگه دارد.
- `Verified` — وضعیت رکورد versioned است و مسیر گردش‌کار در زمان ایجاد freeze می‌شود.

## نقاط بدهی فنی

- `Verified` — `FoundationApp.tsx` و `service.ts` بسیار بزرگ‌اند و چند مسئولیت را حمل می‌کنند.
- `Verified` — Chunk نهایی build بزرگ‌تر از آستانه پیشنهادی Vite است.
- `Inferred` — قبل از Backend production باید مرزهای use-case، repository، event schema و file storage رسمی‌تر شوند.
- `Conflict` — اسناد Server-backed قدیمی معماری دیگری را نشان می‌دهند؛ مسیر فعال برنامه آن معماری را import نمی‌کند.
