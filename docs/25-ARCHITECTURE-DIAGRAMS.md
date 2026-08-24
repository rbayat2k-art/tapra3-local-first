# نمودارهای معماری قابل تطبیق با کد

> **وضعیت:** `Verified` — نمودارها فقط runtime فعال Browser-local را نشان می‌دهند.

## ۱. System Context

```mermaid
flowchart LR
  U["کاربر سازمانی"] --> B["Tapra2 در مرورگر"]
  A["ادمین QA"] --> B
  B --> I["IndexedDB پروفایل مرورگر"]
  B --> L["localStorage ترجیحات UI"]
  B --> F["فایل Snapshot ورودی/خروجی"]
```

هیچ Server، API، PostgreSQL یا سرویس SMS واقعی در context جاری وجود ندارد.

## ۲. Container

```mermaid
flowchart TB
  UI["React RTL UI"] --> APP["LocalFoundationService"]
  APP --> AUTH["Permission + Scope + Resource Policy"]
  APP --> WF["Workflow Policy و Domain Rules"]
  APP --> SA["StorageAdapter"]
  SA --> IDB["IndexedDBAdapter"]
  IDB --> DB[("tapra2_local")]
  UI --> PREF["UI Preferences"]
  PREF --> LS[("localStorage")]
```

## ۳. Component

```mermaid
flowchart LR
  PAGES["صفحه‌های Foundation"] --> SVC["service.ts"]
  SVC --> ORG["قواعد سازمان و پرسنل"]
  SVC --> PUR["purchaseRequest.ts"]
  SVC --> ADV["employeeAdvance.ts"]
  SVC --> WP["workflowPolicy.ts"]
  SVC --> AZ["authorization.ts"]
  SVC --> SNAP["snapshot.ts"]
  SVC --> STORE["storage.ts"]
  STORE --> REG["storeRegistry.ts"]
  STORE --> DB[("96 stores")]
```

## ۴. Request Sequence

```mermaid
sequenceDiagram
  actor User as کاربر
  participant UI as UI
  participant Service as LocalFoundationService
  participant Guard as Authorization و Domain
  participant Store as StorageAdapter
  participant DB as IndexedDB
  User->>UI: ثبت یا تصمیم
  UI->>Service: متد use-case
  Service->>Guard: مجوز، Scope، Resource، Workflow
  Guard-->>Service: مجاز یا خطای فارسی
  Service->>Store: transaction چند store
  Store->>DB: record + history + audit + event
  DB-->>Store: commit
  Store-->>Service: موفق
  Service-->>UI: FoundationState تازه
  UI-->>User: نتیجه و وضعیت جدید
```

## ۵. Data Flow

```mermaid
flowchart LR
  FORM["فرم و validation"] --> DOMAIN["مدل دامنه"]
  DOMAIN --> RECORD["OperationalRecord"]
  RECORD --> HISTORY["Workflow History"]
  RECORD --> AUDIT["Audit Event"]
  RECORD --> EVENT["Domain Event"]
  RECORD --> META["lastPersistedAt"]
  HISTORY --> SNAPSHOT["Snapshot Export"]
  AUDIT --> SNAPSHOT
  EVENT --> SNAPSHOT
  RECORD --> SNAPSHOT
```

## ۶. Deployment

```mermaid
flowchart TB
  STATIC["Vite static assets"] --> BROWSER["Browser tab"]
  BROWSER --> PROFILE["Browser profile"]
  PROFILE --> IDB[("IndexedDB")]
  PROFILE --> LS[("localStorage UI only")]
  BROWSER --> DOWNLOAD["Backup file"]
  DOWNLOAD --> OFFLINE["محل امن خارج از دستگاه"]
```

## مرزهای اعتماد و نقاط شکست

| مرز/نقطه | وضعیت | پیامد |
|---|---|---|
| ورودی UI به Service | validation و permission | UI قابل اعتماد فرض نمی‌شود. |
| Service به IndexedDB | transaction محلی | خرابی tab وسط transaction باید rollback شود. |
| پروفایل مرورگر | نقطه شکست یکتا | حذف profile/device بدون backup باعث از دست‌رفتن داده می‌شود. |
| Snapshot file | خارج از مرز برنامه | فایل ساده ممکن است داده بسیار حساس داشته باشد. |
| چند tab | optimistic concurrency | merge فیلدی وجود ندارد؛ refresh/retry لازم است. |

## محدودیت معماری

- `Verified` — operational data فقط IndexedDB است.
- `Verified` — localStorage فقط preference است.
- `Verified` — UI نباید مستقیم IndexedDB را صدا بزند.
- `Unknown` — مقیاس، latency و quota روی دستگاه‌های واقعی benchmark نشده است.
- `Planned` — جایگزینی Adapter با API سرور بدون بازطراحی workflow/UI.

