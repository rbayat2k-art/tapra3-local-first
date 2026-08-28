# ADR-010 — Temporary Acting Manager Workflow Routing

> Status: ACCEPTED
> Date: 2026-08-28

## Context

واحد یا شعبه می‌تواند مدیر دائم و یک جانشین موقتِ زمان‌دار داشته باشد. پیش از این، نمایش سازمان ممکن بود جانشین را نشان دهد، اما گردش‌های manager-bound همچنان به شناسه مدیر دائم یا assignee ذخیره‌شده متکی بودند. این تفاوت می‌توانست کارتابل را به مدیر قبلی بدهد یا پرونده باز را بدون مسئول معتبر رها کند.

## Decision

- یک resolver مشترک و state-aware مدیر مؤثر را برای یک تاریخ ISO محاسبه می‌کند. بازه شروع و پایان inclusive و تاریخ عملیاتی بر اساس `Asia/Tehran` است.
- در بازه فعال، جانشین فقط وقتی مؤثر است که حساب و پرونده پرسنلی فعال، شرکت یکسان، رابطه سازمانی معتبر، نقش فعال همان مرحله، permission و scope لازم را داشته باشد. جانشینی هیچ role یا permission عمومی را کپی نمی‌کند.
- وجود جانشین ثبت‌شده ولی نامعتبر در بازه فعال یک وضعیت شکسته است و fail-closed می‌شود؛ سامانه بی‌صدا به مدیر دائم برنمی‌گردد. خارج از بازه یا پس از لغو/خاتمه ثبت‌شده، مدیر دائم معتبر دوباره مؤثر است.
- فقط stageهایی که صریحاً `branch_manager`/manager-bound هستند از این resolver استفاده می‌کنند. صف‌های `role_queue` خرید و سایر specific-userها به جانشینی سازمانی تبدیل نمی‌شوند.
- create، اصلاح و تصمیم مساعده، مدیر مؤثر و assignee را داخل همان transaction از کاربران، پرسنل، نقش‌ها، واحدها و نسخه pin‌شده گردش بازحل می‌کنند. مدیر دائم در بازه جانشینی صرفاً به اتکای جایگاه دائم حق اقدام ندارد.
- هنگام شروع، لغو زودهنگام یا انقضای جانشینی، پرونده بازِ manager-bound به مدیر مؤثر تازه rebind می‌شود؛ اگر مدیر واجد شرایط وجود نداشته باشد `needsReassignment` می‌گیرد. رکورد، history، audit، event، notification و meta یک outcome اتمیک‌اند.
- UI باید مدیر دائم، جانشین، بازه، دلیل، مدیر مؤثر و وضعیت نامعتبر را جدا نشان دهد. ورودی تاریخ شمسی است و مقدار ISO ذخیره می‌شود.

## Operational route audit

- در مدل جاری، تنها مسیر کسب‌وکاری صریح manager-bound مرحله `branch_review` مساعده پرسنلی است.
- مسیر درخواست نیروی انسانی که «مدیر واحد درخواست‌کننده» را می‌خواهد از همان resolver استفاده می‌کند، اما همچنان active role و permission مخصوص درخواست نیرو را لازم دارد.
- رابطه مدیر مستقیم کاربر، مدیر پرونده پرسنلی و سرپرست فروش، مسئولیت‌های مستقل‌اند و با جانشین واحد بازنویسی نمی‌شوند.
- purchase-request فعلاً manager-bound mode ندارد و عمداً تغییر نکرده است.

## Direct `managerUserId` read audit

The Phase 3 source audit classifies every remaining direct read as follows:

- `workflowRouting.ts` is the only authoritative unit-manager routing reader. It validates tenant, active account/personnel, organizational relation, Tehran date range, and delegation validity.
- `organizationStructure.effectiveUnitManagerUserId(unit, date)` remains only as a deprecated date-only compatibility helper for its isolated legacy test. It lacks identity and tenant state and is forbidden for authorization, routing, or action visibility.
- `employeeAdvance.ts`, employee-advance service commands, workforce-request manager checks, branch health, organization views, advance UI, and the letter unit-picker use the validated resolver. The letter picker is display-only and shows permanent, active acting, and effective managers; letter routing itself is unchanged.
- `workContinuity.ts` intentionally reads and rewrites the permanent unit manager because continuity is a permanent responsibility transfer, not a temporary acting assignment.
- user/personnel `managerUserId` reads in lifecycle, recruitment, account editing, and organization health refer to the separate direct-report relationship; Phase 3 must not reinterpret them as unit acting-manager authority.
- unit create/update validation and seed/model declarations are authoritative storage/validation, not workflow routing.
- purchase role queues and specific-user routes remain unchanged because their pinned workflow definitions do not declare a manager-bound assignment mode.

Any new manager-bound workflow stage must call the shared resolver inside the same transaction and still enforce its pinned active role, permission, scope, and maker-checker rules.

## Phase 3 revalidation addendum

- A future assignment is intentionally inert before `startsOn`. During initialization, a transactional activation reconciler detects the first Tehran date on which the period is active, rebinds open manager-bound records, and stores an assignment-specific marker with the audit/event outcome. Re-running initialization is therefore idempotent.
- An invalid acting manager at activation never falls back silently to the permanent manager. Affected open records are held with `needsReassignment` until an eligible manager is established.
- Branch acting-manager validity includes the direct parent row itself: the parent must exist, be active, be a non-branch unit in the same tenant, and the acting personnel must be a direct member of that parent.
- Employee-advance creation treats the beneficiary identity, employment, unit/branch relation, banking snapshot, pinned workflow route, and resolved manager as one optimistic snapshot. All are re-read inside the write transaction; concurrent personnel or organization changes fail as a stale form without a partial request.
- Employee-advance UI capabilities are derived from the same pinned workflow version/route and effective-stage eligibility used by the service. Saved assignee equality and administrator status alone do not reveal financial details or enable a decision.
- A mounted application watches the Tehran calendar date on a lightweight timer and rechecks it on `focus`, `pageshow`, and visible `visibilitychange`. Crossing a date boundary invokes only `reconcileActingManagerBoundaries()` (activation, expiry, then a state reload); it never runs seeding, migration, or unrelated personnel lifecycle work.
- Boundary refresh replaces only the foundation data projection. Workspace tabs, open dialogs, and component-local dirty drafts remain mounted. A last-date reference and a shared in-flight promise coalesce simultaneous browser signals, while storage markers and read-write transaction serialization keep multiple tabs idempotent.

## Consequences

- کارتابل مدیر در مرز تاریخ و تغییر جانشینی قابل پیش‌بینی و قابل ممیزی است.
- نقش نامعتبر، حساب غیرفعال یا داده سازمانی ناسازگار مسیر را متوقف می‌کند؛ این توقف باید در سلامت سازمان دیده و اصلاح شود.
- کارگر انقضا هنگام initialize اجرا می‌شود؛ resolver در هر خواندن/اقدام تاریخ جاری تهران را می‌سنجد، بنابراین authorization حتی پیش از پاک‌سازی persisted fail-safe باقی می‌ماند.

## Alternatives rejected

- کپی نقش مدیر دائم به جانشین: موجب گسترش پنهان دسترسی می‌شود.
- fallback بی‌صدا به مدیر دائم در بازه جانشین نامعتبر: خرابی delegation را پنهان و انحصار بازه را نقض می‌کند.
- بازنویسی همه صف‌های نقشی و specific-userها: قواعد کسب‌وکار مستقل را تغییر می‌دهد.

## References

- [Identity and session](ADR-004-identity-session-authorization.md)
- [Local command concurrency](ADR-008-local-command-concurrency.md)
- [Work continuity](ADR-009-work-continuity-deactivation.md)
