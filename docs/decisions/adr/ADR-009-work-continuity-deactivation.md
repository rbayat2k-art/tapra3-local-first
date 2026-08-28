# ADR-009 — Work Continuity Before Deactivation

> Status: ACCEPTED
> Date: 2026-08-28

## Context

غیرفعال‌کردن حساب یا پایان همکاری فقط یک تغییر وضعیت نیست. کاربر ممکن است مدیر مستقیم، مدیر واحد، مالک پروژه یا گروه، مسئول کار، گیرنده نامه، مسئول پرونده جذب، تأییدکننده درخواست مالی یا مجری خزانه باشد. غیرفعال‌سازی بدون تعیین تکلیف این وابستگی‌ها، رکورد باز بدون مسئول، گردش‌کار متوقف یا انتقال دلخواه و غیرقابل ممیزی ایجاد می‌کند.

## Decision

- پیش از غیرفعال‌سازی حساب، سامانه همه مسئولیت‌های باز را از داده خام و جاری کشف می‌کند؛ projection صفحه یا پیش‌نمایش قدیمی منبع تصمیم نیست.
- برنامه تداوم نسخه‌دار است و شناسه حساب، token نسخه حساب، زمان پیش‌نمایش، دلیل، فهرست دقیق مسئولیت‌ها و تصمیم هر مسئولیت را pin می‌کند.
- مالک پروژه، مالک گروه، مدیر دائم واحد و مدیر مستقیم جانشین صریح و فعال همان شرکت می‌خواهند. جانشین باید نقش، مجوز و محدوده واقعی منبع را داشته باشد و چرخه مدیریتی نسازد.
- مسئولیت exact/specific مانند کار، نامه، جذب، مساعده، خرید، خزانه و خروج یا به جانشین مجاز منتقل می‌شود یا صریحاً `needsReassignment` می‌گیرد. سامانه فرد دلخواه را خودکار انتخاب نمی‌کند.
- مسئولیت `role_queue` فقط وقتی بدون assignee به صف برمی‌گردد که حداقل یک کاربر فعال با نقش مرحله، مجوز و محدوده همان رکورد وجود داشته باشد. دسترسی ادمین به‌تنهایی عضویت در صف کسب‌وکار محسوب نمی‌شود.
- عضویت غیرمالک پروژه و گروه خاتمه می‌یابد؛ `createdBy`، maker، پیام‌ها، امضاها و سابقه حذف یا بازنویسی نمی‌شوند.
- تغییر کاربر، پرسنل، واحد، رکوردهای عملیاتی، history، audit، event، notification، meta و ابطال نشست یک تراکنش واحد است. شکست هر write کل عملیات را rollback می‌کند.
- برنامه آینده در پرونده lifecycle ذخیره می‌شود، اما هنگام سررسید تمام مسئولیت‌ها، نسخه حساب، جانشین‌ها، نقش‌ها و محدوده‌ها دوباره خوانده و اعتبارسنجی می‌شوند.
- اگر برنامه قدیمی وجود نداشته باشد یا برنامه آینده به‌علت مسئولیت تازه دیگر معتبر نباشد، غیرفعال‌سازی انجام نمی‌شود. یک رخداد و اعلان idempotent «نیازمند اقدام» ثبت می‌شود تا اجرای مجدد اعلان تکراری نسازد.
- worker سررسید از داده خام authoritative می‌خواند؛ redaction رابط کاربر نباید pending lifecycle یا مسئولیت‌های خارج از projection کاربر واردشده را پنهان کند.

## Atomic flow

### Phase 2 safety clarifications

- نامه‌ای که به وضعیت نهایی `sent` رسیده، بخشی از تحویل مسئولیت نیست؛ گیرندگان، بازبین، مسئول صریح، امضا و تمام بایت‌های رکورد آن بدون تغییر باقی می‌مانند.
- مسئولیت‌های هم‌معنا پیش از ارائه به کاربر canonical می‌شوند؛ رابطه مدیر مستقیم/مدیر پرونده و مسئولیت‌های هم‌پوشان پرونده جذب فقط یک تصمیم می‌خواهند. برنامه دارای تصمیم تکراری یا متناقض رد می‌شود.
- جانشین ساختاری نباید در گراف ترکیبی حساب کاربری، مدیر پرونده پرسنلی و سرپرست فروش حلقه بسازد. خودفرد، زیرمجموعه مستقیم یا غیرمستقیم و جانشین خارج از شرکت مجاز نیست.
- صلاحیت صف یا جانشین دقیق از transition خروجی واقعی همان state و نسخه pin‌شده گردش‌کار محاسبه می‌شود. permission، action، scope و قاعده maker-checker همان transition باید برقرار باشد؛ سازنده نمی‌تواند تأیید maker-checked کار خودش را به ارث ببرد.
- برای مساعده و خرید، اگر مسیر جاری می‌تواند در آینده به «نیازمند اصلاح» برگردد، گیرنده اصلاح نیز مسئولیت آینده محسوب می‌شود. جانشین آن در `continuityCorrectionRecipientUserId` نگهداری و در بازگشت واقعی مصرف می‌شود؛ مسیر هرگز به کاربر غیرفعال بازنمی‌گردد.
- زمان‌بندی، تأیید و لغو پایان همکاری، نشست و نقش جاری، permission/scope دقیق و نسخه رکورد را داخل همان transaction دوباره اعتبارسنجی می‌کند. لغو شامل personnel، offboarding، history، audit، event و meta در یک transaction است.
- پنجره انتخاب جانشین از همان helper صلاحیت سمت سرور استفاده می‌کند؛ بااین‌حال نتیجه رابط کاربری صرفاً راهنما است و transaction هنگام ثبت، همه وابستگی‌ها را از داده خام بازخوانی می‌کند.

1. بازخوانی نشست، عامل، حساب هدف، نقش‌ها، پرسنل، واحدها، نسخه‌های گردش‌کار و همه رکوردهای مسئولیت در transaction.
2. کشف دوباره مسئولیت‌ها و مقایسه با برنامه pin‌شده.
3. اعتبارسنجی جانشین و صف نقش با شرکت، وضعیت، نقش، مجوز، scope و نسخه جاری.
4. ساخت write-set بدون دست‌زدن به maker/history قبلی.
5. ثبت انتقال‌ها، history جدید، audit، domain event، notification و ابطال نشست.
6. تغییر وضعیت حساب و پرسنل فقط پس از موفقیت همه مراحل.

### Final phase-2 repair rules

- Structural successors are selected from authoritative active positions and current permission/scope. Role names and role-id patterns are not evidence of managerial authority; finance and purchase approvers are not organizational managers merely because their title contains “manager” or “approver”.
- Cycle detection traverses account `managerUserId`, personnel `managerPersonnelId`, and sales `salesSupervisorPersonnelId` as one graph. Mixed cycles across those edge types fail closed.
- Cycle validation is cumulative: every planned permanent-unit, direct-manager, personnel-manager and sales-supervisor replacement is first applied to an in-memory graph, then the combined post-plan graph is validated before any durable write. Two individually harmless choices that form a cycle together are therefore rejected atomically.
- Terminal work, including project tasks in `done`, and finalized letters in `sent`, is immutable and excluded from continuity writes.
- Employee-advance and purchase replacements are checked against the pinned workflow stage and its specialized assignment policy. A generic module permission cannot satisfy branch, role, specific-user, or maker/checker rules.
- A correction successor may edit and resubmit only while the record is in `needs_correction`; original maker, beneficiary and requester provenance never changes.
- `needsReassignment` is a durable hold, not a terminal state. An authorized, versioned and idempotent repair command may clear it only after fresh session, role, tenant, scope and stage eligibility checks in the same transaction. Record, history, audit, domain event, receipt and metadata commit atomically.
- Generic record edits, assignments and transitions fail closed while that hold exists. Continuity markers (including previous assignee/recipient/reviewer, correction recipient and specific-user overrides) are protected recursively from generic payload input; project-task edits likewise cannot clear the hold or replace its assignee outside the repair command.
- Repair is responsibility-specific. Recipient, reviewer, assignee, executor and correction-recipient markers are resolved independently; one replacement is never copied into unrelated fields, and the hold remains until every marker is resolved.
- A repaired recruitment correction recipient is also the current actionable assignee. This alignment keeps the case visible and operable for the successor without changing its maker or creator provenance.
- A project-task repair additionally requires the current actor to be an authorized project member/manager and the replacement to be an active member of that exact parent project.
- Missing legacy assignment modes are interpreted through the canonical stage policy (`branch_review` is `branch_manager`, other legacy stages are `role_queue`). Branch-manager eligibility is evaluated against the post-plan unit-manager handover.
- A departed `specific_user` is replaced only by an explicit compatible continuity decision. The replacement is pinned to the current state as a continuity override, consumed by the specialized decision path, and cleared when the record leaves that state.
- The same permission-aware repair panel is available in generic workspaces and in specialized Letter and Recruitment pages. UI eligibility is advisory; the transaction remains authoritative.

## Consequences

- هیچ غیرفعال‌سازی موفقی مسئولیت شناخته‌شده را بی‌صاحب رها نمی‌کند.
- تغییر هم‌زمان نقش، وضعیت جانشین یا ایجاد مسئولیت جدید باعث توقف کامل و قابل پیگیری می‌شود.
- مدیر منابع انسانی پیش از تأیید پایان همکاری، شمار مسئولیت‌ها و تصمیم هر مورد را در یک پنجره واحد می‌بیند.
- برنامه تداوم با «جانشین موقت مدیر واحد» متفاوت است. طراحی جانشین موقت و اتصال آن به همه گردش‌ها در فاز بعدی انجام می‌شود و این ADR آن را خودکار نمی‌کند.

## Alternatives rejected

- انتخاب خودکار نخستین مدیر یا ادمین: مسئولیت کسب‌وکار و تفکیک وظایف را نقض می‌کند.
- غیرفعال‌سازی و انتقال در چند تراکنش: در خطا، سامانه را در وضعیت نیمه‌کاره می‌گذارد.
- اعتماد به پیش‌نمایش UI: رقابت چندتب و تغییر نقش/مسئولیت پس از بازشدن فرم را پوشش نمی‌دهد.
- حذف مسئولیت‌ها یا بازنویسی سازنده: سابقه ممیزی و مالکیت تاریخی را مخدوش می‌کند.

## References

- [Identity and session](ADR-004-identity-session-authorization.md)
- [Audit, outbox and reliability](ADR-005-audit-outbox-reliability.md)
- [Local command concurrency](ADR-008-local-command-concurrency.md)
