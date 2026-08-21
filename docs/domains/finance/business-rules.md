# قواعد کسب‌وکار مالی و خزانه‌داری

> Status: CURRENT
> Source of truth: این سند برای قواعد اجرایی درخواست مالی و گردش تأیید است.
> Owner: Finance Domain Owner
> Last validated: 2026-08-11 against `stable@cea6514`
> Supersedes: none
> Superseded by: none

شواهد اصلی این سند `NewRequestModal.tsx`, `RequestDetailModal.tsx`, `ApprovalInboxView.tsx`, `AdminPanel.tsx` و typeهای مالی در `src/types.ts` هستند. مالکیت نقش‌ها در [roles and permissions](roles-and-permissions.md) است.

## ایجاد و مسیریابی درخواست

- درخواست، `id` و `trackingCode` پایدار، درخواست‌کننده، شرکت، مرکز هزینه، مبلغ، مقصد پرداخت، وضعیت و timeline دارد.
- اولین مسئول از `approvalChain` درخواست‌کننده انتخاب می‌شود.
- برای کاربر دارای `isDualRole`، درخواست شخصی مستقیماً به کاربر دارای `isSeniorTreasurySupervisor` می‌رود؛ اگر چنین کاربری پیدا نشود، fallback فعلی یک admin است.
- `approvalChain` و `allowedApproverIds` دو مفهوم جدا هستند: اولی مسیر اولیه درخواست‌کننده و دومی مقصدهای مجاز مسئول هنگام ارجاع است.
- عنصر اول `approvalChain` نباید خود درخواست‌کننده‌ای باشد که توان ارجاع ندارد. شناسه‌های `allowedCostCenterIds` نیز باید به مراکز هزینه واقعی و قابل‌دسترسی اشاره کنند.

## درخواست تجمیعی

- درخواست تجمیعی `batchItems` دارد و هر ردیف عنوان، مبلغ، ذی‌نفع و وضعیت تصمیم مستقل دارد.
- مسئول فعلی می‌تواند هر ردیف را `approved` یا `rejected` کند؛ رد ردیف دلیل می‌خواهد.
- تا پیش از ارجاع کل درخواست، تصمیم ردیف قابل بازگرداندن به `pending` است.
- «تأیید و ارجاع» کل درخواست تا تعیین تکلیف همه ردیف‌ها غیرفعال می‌ماند.
- تصمیم ردیف timeline جداگانه ایجاد نمی‌کند.

## ویرایش و اصلاح مبلغ

- درخواست‌کننده فقط در پنجره اولیه `pending_approval` و پیش از اقدام تأییدکننده، درخواست خود را ویرایش یا حذف می‌کند.
- در همین پنجره، درخواست تجمیعی ردیف‌به‌ردیف ویرایش می‌شود؛ مبلغ کل و متن مبلغ از مجموع ردیف‌ها بازمحاسبه می‌شود.
- وضعیت و اطلاعات تصمیم هر ردیف، `id` و `trackingCode` در ویرایش تغییر نمی‌کنند.
- درخواست تجمیعی `returned` از فرم تک‌فیلدی legacy استفاده می‌کند؛ درخواست غیرتجمیعی نیز فرم تک‌فیلدی خود را حفظ می‌کند.
- مسئول فعلی می‌تواند فقط هنگام `handleApproveAndForward` مبلغ کل را اصلاح کند. تغییر در `amountCorrectionNote` همان گام `forwarded` ثبت می‌شود و `comment` مستقل می‌ماند.
- اصلاح مبلغ کل درخواست تجمیعی، `batchItems` را تغییر نمی‌دهد و در تأیید نهایی یا ثبت پرداخت فعال نیست.

## وضعیت، اقدام و مرتب‌سازی

- وضعیت‌های اصلی `pending_approval`, `returned`, `approved_pending_payment`, `paid`, `completed`, `rejected` هستند.
- اقدام تأیید یا پرداخت فقط با نقش/دسترسی مناسب و مسئولیت فعلی درخواست مجاز است.
- «درخواست‌های من» در وضعیت فعلی `pending_approval`, `approved_pending_payment` و `returned` را باز و `paid`, `rejected`, `completed` را بسته می‌داند.
- کارتابل تأیید سه گروه «نیازمند اقدام من»، «در حال پیگیری سایرین» و «سوابق» دارد. ارجاع فعال با `currentApproverId` به مسئول مشخص محدود می‌شود و حضور کاربر در `timeline` مبنای دسترسی به سابقه است؛ admin دامنه دید گسترده‌تری دارد.
- جست‌وجوی درخواست‌ها کد پیگیری، عنوان/شرح، درخواست‌کننده، شرکت، مرکز هزینه، ذی‌نفع، مقصد بانکی، مبلغ و تخصیص‌های مرکز هزینه را پوشش می‌دهد؛ فیلترهای دقیق هر View ممکن است کمی متفاوت باشند.
- کارتابل «جدیدترین/قدیمی‌ترین» را از تاریخ و ساعت شمسی `createdAt` محاسبه می‌کند؛ مرتب‌سازی مبلغ عددی و مستقل است.
- `MyRequestsView` در code فعلی هنوز گزینه‌های «جدیدترین/قدیمی‌ترین» را با `id` مقایسه می‌کند، نه `createdAt`. این یک technical debt مشاهده‌شده است و این سند آن را رفتار مطلوب معرفی نمی‌کند.
- timeline رویدادهای ارسال، ارجاع، عودت، رد، تأیید، پرداخت، تکمیل، توضیح و undo را نگه می‌دارد.

`RequestTableView` امکان جابه‌جایی میان نمای `slim` و `card` را فراهم می‌کند. این ترجیح نمایشی قاعده مالی یا authorization را تغییر نمی‌دهد.

## مبلغ، بودجه و ورودی‌ها

- مبلغ‌ها به ریال ذخیره می‌شوند و متن فارسی مبلغ با utilityهای تبدیل عدد تولید می‌شود.
- `CostCenter.monthlyBudget` در مدل فعلی وجود دارد و View مراکز هزینه درخواست‌ها را برای نمایش/محاسبه بودجه مصرفی استفاده می‌کند؛ این سند وجود کنترل سخت بازدارنده در زمان ثبت را ادعا نمی‌کند.
- فرم ثبت بر اساس نوع درخواست اعتبارسنجی می‌شود؛ `info_request` می‌تواند مبلغ صفر داشته باشد، بنابراین قاعده legacy «همه درخواست‌ها حتماً مبلغ بزرگ‌تر از صفر» سراسری نیست.
- فرمت و الزام اطلاعات کارت/شبا به مسیر فرم وابسته است؛ قرارداد دقیق فیلدها در `src/types.ts` authoritative code evidence است.
- یکپارچگی `DEFAULT_USERS` با `DEFAULT_COST_CENTERS` و زنجیره تأیید باید حفظ شود. اصلاح داده نمونه، داده از قبل ذخیره‌شده در `shavaz_treasury_users_v2` را migrate یا overwrite نمی‌کند.

## حدود سند

قواعد عودت Support Case در [support business rules](../support/business-rules.md) است. طراحی دریافت پول از مشتری و فاکتور فروش CURRENT نیست و در [approved sales design](../sales/approved-design.md) ثبت می‌شود.

## Employee advance workflow (Local Foundation V1.15)

- A normal employee signs and submits an advance request for self. The route is Branch Manager, Accounting, Main Sales Advance Approver, Treasury, then Paid.
- A Main Sales Advance Approver may create a proxy request for self or an employee in an allowed branch and approve it during creation. This route deliberately skips Branch Manager and continues through Accounting to Treasury.
- The Main Sales Advance Approver is an assignable role with explicit all-branches or selected-branches scope. Inactive branches are not valid request targets.
- Multiple open requests are allowed and no fixed amount ceiling is enforced in this release.
- Accounting and the Main Sales Advance Approver may change the amount. The event records old amount, new amount, actor, and timestamp. Employee re-consent and a mandatory change reason are not required.
- After changing an amount, the Main Sales Advance Approver may request an Accounting recheck or send the request directly to Treasury.
- Self-approval and approval of a proxy request created by the same Main Sales Advance Approver are explicitly allowed by the approved local policy.
- Every state change, correction, rejection, handoff, payment, and amount change remains append-only in workflow history and audit.
- The requester or proxy creator may save a newly signed corrective version while the request is still waiting for its first Branch Manager decision. The beneficiary identity cannot be changed.
- When a reviewer returns a request as `needs_correction`, the return stage is persisted. A signed correction resumes at that exact Branch Manager, Accounting, or Main Approver stage; it does not restart or skip the workflow.
- Request data becomes read-only for the requester after a reviewer decision unless the request is explicitly returned for correction. It is permanently locked after Treasury handoff, rejection, or payment.
- Every workflow participant sees the same complete current form snapshot plus append-only history. The assigned Treasury Executor additionally sees the full destination card and may print an archival A4 form containing personnel, organizational, banking, amount, signature, approval, handoff, and payment history.
