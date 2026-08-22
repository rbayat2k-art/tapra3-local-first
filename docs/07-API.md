# API و مرز سرویس

> **وضعیت سند:** `Verified` — API در این فاز، متدهای درون‌مرورگری است؛ HTTP API وجود ندارد.

## مرز عمومی

UI فقط با `LocalFoundationService` و helperهای دامنه کار می‌کند. این مرز، نامزد تبدیل آینده به Port/ServerApiAdapter است.

## گروه use-caseها

| حوزه | عملیات شاخص |
|---|---|
| Boot | `initialize`, `loadState` |
| Session | `signIn`, `signOut`, recovery/reminder، QA login/end |
| Organization | CRUD/status واحد، سمت، شعبه، پرسنل و انتصاب |
| Users/Roles | create/update/status/password، clone/delete role، override |
| Customer | create/update/status/merge/import |
| Workflow | create/update/transition/assign operational record، update policy |
| Purchase/Treasury | create/submit/decision/payment/revise/revert/follow-up |
| Advance | create/update/decision و کارتابل‌های scoped |
| Data control | export/import snapshot، reset، projection rebuild |

## الگوی خطا

`Verified` — Service در نقض validation، permission، scope، stale version یا transition خطای فارسی `Error` می‌اندازد و UI آن را نمایش می‌دهد. Error code ساختاریافته یا RFC Problem Details وجود ندارد.

## هم‌زمانی و idempotency

- `Verified` — `expectedVersion` برای ویرایش درخواست تغییر پروفایل، مساعده، رکورد عمومی و Workflow policy استفاده می‌شود.
- `Verified` — Transition رکورد عمومی کلید idempotency پیش‌فرض از `recordId:version:transitionId` می‌سازد.
- `Verified` — پیگیری خرید کلید dedupe روزانه دارد.
- `Inferred` — همه فرمان‌های تخصصی هنوز قرارداد یکسان idempotency ندارند.

## قرارداد آینده Server API

`Planned` — UI و Domain باید بدون بازطراحی به adapter سروری متصل شوند. موارد لازم پیش از آن: DTO versioning، احراز هویت واقعی، error contract، pagination، upload/download امن، retry semantics، audit correlation و authorization سمت سرور.

## نبود endpoint

`Verified` — Routeهای URL فعلی فقط navigation client-side هستند و endpoint داده محسوب نمی‌شوند. هیچ `/api/*` فعال، OpenAPI یا client HTTP در runtime وجود ندارد.
