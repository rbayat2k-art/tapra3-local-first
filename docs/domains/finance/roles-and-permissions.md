# نقش‌ها و دسترسی‌های فعلی

> Status: CURRENT
> Source of truth: این سند برای مدل نقش، permission و محدودیت‌های دسترسی فعلی است.
> Owner: Access Control Owner
> Last validated: 2026-08-19 against Local Foundation V1.13
> Supersedes: none
> Superseded by: none

این پروژه در دوره migration دو مدل دسترسی اجراشده دارد. مدل Server-backed از migrationهای `server/migrations/` و `server/src/modules/access/` خوانده می‌شود؛ مدل legacy Prototype از `src/types.ts` و نقش‌های پیش‌فرض `src/utils/storage.ts` خوانده می‌شود. این دو فهرست نباید هم‌معنی فرض شوند.

## مدل Server-backed

- `Membership` می‌تواند Workspace-level (`company_id = NULL`) یا Company-level باشد.
- Provisioning اولیهٔ `UserAccount`، credential موقتِ یک‌بارنمایش و Membership انتخاب‌شده در یک تراکنش انجام می‌شود؛ بنابراین UserAccount جدید بدون Membership معتبر در Workspace رها نمی‌شود. تغییر credential اجباری در اولین ورود همچنان server-side است.
- Membership پایان‌یافته با فعال‌سازی مجدد دورهٔ اعتبار باز (`valid_until = NULL`) می‌گیرد؛ Membership دارای `valid_until` منقضی، حتی با status فعال، context قابل‌استفاده ایجاد نمی‌کند.
- `role_assignments` Scope صریح `WORKSPACE`، `COMPANY`، `BRANCH`، `DEPARTMENT`، `TEAM` یا `SELF` دارد.
- یک UserAccount می‌تواند بدون ساخت account دوم، Role متفاوت در چند Company/Scope داشته باشد.
- Permission سمت server محاسبه می‌شود؛ در Impersonation نتیجه به اشتراک Permissionهای Admin و target محدود می‌شود.
- Permissionهای Organization فعلی: `organization.read`، `organization.company.manage`، `organization.unit.manage`، `organization.user.manage`، `organization.membership.manage`، `organization.role.manage` و `organization.impersonate`.
- نقش‌های legacy حذف یا به‌صورت حدسی تبدیل نشده‌اند. `legacy_role_mappings` وضعیت `UNMAPPED/PARTIAL/MAPPED/REVIEW_REQUIRED` را برای migration تدریجی نگه می‌دارد؛ تا ثبت mapping، نقش legacy فقط در Prototype معتبر است.

## اصول مصوب authority

- تنها `Permission + Scope + Resource Policy` اختیار اجرایی می‌سازد. نام Role صرفاً بستهٔ قابل‌استفاده برای تخصیص permissionهاست و هیچ bypass یا اختیار ضمنی ندارد.
- `workspace_admin` فقط مدیر سامانه و سازمان Workspace است. این bundle هیچ permission فروش، مالی، انبار، خزانه‌داری یا دامنهٔ کسب‌وکار دیگری ندارد؛ دسترسی کسب‌وکار فقط با bundle جدا تخصیص می‌یابد.
- فروشنده، سرپرست فروش، مدیر فروش و اپراتور `PAPER_ENTRY` bundleهای مستقل‌اند. «سرپرست ارشد فروش» و «معاون فروش» تا زمان تصویب مسئولیت متمایز Role امنیتی جدا ندارند و با bundle مدیریتی به‌همراه Scope گسترده‌تر مدل می‌شوند.
- ثبت‌کننده واریزی از بازبین مالی مستقل است. ثبت‌کننده کنترل موجودی نیز از تأییدکننده مستقل است؛ Resource Policy سمت server خودتأییدی را حتی در صورت جمع‌شدن دو bundle روی یک Membership رد می‌کند.
- approval/review حساس در Impersonation ممنوع است. Permission مؤثر Impersonation نیز اشتراک permissionهای مدیر و کاربر هدف است، نه اجتماع آن‌ها.
- Scope پشتیبانی‌نشده fail-closed است. وجود Role یا Permission بدون Scope و attribution معتبر، دسترسی به resource نمی‌دهد.
- Treasury، Support، Chat، Letters، Communications، Catalog، Campaign، Coordination، Fulfillment و دیگر ماژول‌های Legacy/Prototype به‌عنوان دانش حفظ می‌شوند، اما تا vertical slice مصوب و اثبات‌شده، Role یا authority تولیدی CURRENT ایجاد نمی‌کنند.

## bundleهای CURRENT سمت Server

فهرست اجرایی و seed-authoritative در `server/src/modules/access/current-role-bundles.ts` قرار دارد. seed هر بار permissionهای این Roleها را دقیقاً با همین catalog همگام می‌کند؛ دادهٔ توسعه ممکن است برای پوشش integration چند bundle مستقل را به یک Membership بدهد، اما هیچ Role منفردی دامنه‌ها یا دو سوی maker-checker را با هم ترکیب نمی‌کند.

| کد bundle | Scope پیش‌فرض | Permissionهای صریح |
|---|---|---|
| `workspace_admin` | `WORKSPACE` | هفت permission خانواده `organization.*` |
| `customer_manager` | `COMPANY` | `customer.read/create/identity.manage/merge` و `customer.import.read/create/review/approve` |
| `customer_reader` | `COMPANY` | `customer.read` |
| `data_steward` | `WORKSPACE` | `customer.read`, `customer.merge`, `customer.identity.reconcile` |
| `sales_seller` | `SELF` | `customer.read`, `sales.queue.read`, `sales.call.create`, `sales.lead.create`, `sales.sale.create`, `sales.invoice.read_own/edit_draft`, `sales.payment.record` |
| `sales_supervisor` | `COMPANY` | `customer.read`, `sales.lead.read_all/assign/reassign`, `sales.invoice.read_all/supervisor_approve` |
| `sales_manager` | `COMPANY` | `customer.read`, `sales.lead.create/read_all/assign/reassign`, `sales.marketing.link`, `sales.invoice.read_all/amend` |
| `paper_entry_operator` | `COMPANY` | `customer.read`, `sales.sale.create_on_behalf`, `sales.invoice.read_all/edit_draft` |
| `payment_recorder` | `COMPANY` | `sales.invoice.read_all`, `sales.payment.record` |
| `financial_reviewer` | `COMPANY` | `sales.invoice.read_all`, `sales.payment.review` |
| `collection_manager` | `COMPANY` | `sales.invoice.read_all`, `sales.payment.infrastructure.manage` |
| `warehouse_manager` | `COMPANY` | `warehouse.read/manage/item.manage` |
| `receiving_operator` | `COMPANY` | `warehouse.read`, `warehouse.receiving.create/post` |
| `manual_receiving_operator` | `COMPANY` | `warehouse.read`, `warehouse.receiving.create/manual` |
| `reservation_operator` | `COMPANY` | `warehouse.read`, `warehouse.reservation.manage` |
| `transfer_operator` | `COMPANY` | `warehouse.read`, `warehouse.transfer.manage` |
| `inventory_maker` | `COMPANY` | `warehouse.read`, `warehouse.adjustment.create`, `warehouse.count.create` |
| `inventory_approver` | `COMPANY` | `warehouse.read`, `warehouse.adjustment.approve`, `warehouse.count.approve` |
| `return_inspector` | `COMPANY` | `warehouse.read`, `warehouse.return.manage` |
| `movement_reversal_officer` | `COMPANY` | `warehouse.read`, `warehouse.movement.reverse` |

این foundation permission code تازه‌ای ایجاد یا حذف نمی‌کند؛ ۴۸ permission Server موجود حفظ شده‌اند و فقط packaging و seed overgrant اصلاح شده است.

## ماتریس واقعی Role/Permission/Scope

این جدول وضعیت enforcement فعلی را نشان می‌دهد، نه Role bundle پیشنهادی. Roleهای Server سفارشی‌اند و فقط Permission/Scope صریح اختیار می‌دهد؛ نام‌هایی مانند Data Manager، MIS یا Supervisor به‌تنهایی Permission ایجاد نمی‌کنند.

| سناریوی نقش | چه چیزی می‌بیند/انجام می‌دهد | چه چیزی نمی‌بیند/انجام نمی‌دهد | Scope و enforcement فعلی |
|---|---|---|---|
| Super Admin | Organization و contextهای Company همان Workspace مطابق Permissionهای صریح | Workspace مستقل دیگر؛ Permission اضافه target در Impersonation | Server؛ `WORKSPACE` و permission intersection |
| Workspace Manager | Companyها و Shared Serviceهای همان Workspace طبق `organization.*` | mutation فاقد Permission؛ Tenant دیگر | Server؛ `WORKSPACE` |
| Data Manager | Customer/Import فقط با bundleهای `customer_manager` یا `data_steward` و Scope صریح | Sales assignment یا Organization mutation ضمنی؛ داده Workspace دیگر | Server؛ `COMPANY` یا `WORKSPACE` مطابق bundle و assignment |
| MIS | نمای مجاز سازمانی/تجمیعی فقط با Permission صریح | Customer mutation یا دسترسی business ضمنی | Role تولیدی مستقلی ندارد؛ نیاز جدید باید bundle و Scope مصوب بگیرد |
| Sales Manager | Leadهای Company، assignment/reassignment و marketing linkage با Permissionهای Sales | Lead Company دیگر؛ Permission Organization ضمنی | Server؛ `COMPANY`؛ Audit و RLS فعال |
| Supervisor | context دقیق Branch/Department/Team در access engine | گسترش Scope واحد به کل Company یا واحد هم‌سطح دیگر | Server scope engine؛ Sales Lead فعلی تا attribution صریح واحد fail-closed است |
| Salesperson | Customer مجاز، صف خود و Call Log Lead تخصیص‌یافته | self-claim، صف فروشنده دیگر، reassignment و Cross-Company | Server؛ `COMPANY` یا `SELF` دارای Company |
| Finance User | صفحات و actionهای Prototype طبق legacy RBAC | هیچ Permission Backend صرفاً از نام نقش legacy دریافت نمی‌کند | Prototype/client-side؛ هنوز security boundary SaaS نیست |
| Support User | پرونده‌های Prototype طبق permissionهای Support legacy | هیچ Customer/Organization Permission Backend ضمنی دریافت نمی‌کند | Prototype/client-side؛ هنوز security boundary SaaS نیست |

فایل `server/tests/access-matrix.test.ts` سی سناریوی صریح `A01` تا `A30` را روی projection واقعی Scope و Permission در `limitContextToActor` اجرا می‌کند. سناریوها Alpha/Beta، Workspace، Shared Services، Company، Branch، Department، Team، SELF، permission intersection، Customer/Import privacy و جلوگیری از نشت Roleهای Finance/Support Prototype به Backend را پوشش می‌دهند. تست‌های PostgreSQL در `server/tests/foundation.integration.test.ts` نیز Unauthorized mutation، Impersonation ممیزی‌شده، RLS، Customer privacy و Import privacy را در سطح HTTP/database بررسی می‌کنند.

این validation به معنی ارتقای mapping نقش‌های Legacy/Prototype نیست. mappingهای حل‌نشده باید در `legacy_role_mappings` باقی بمانند و بدون تصمیم دامنه به `MAPPED` تغییر نکنند.

## مدل مؤثر دسترسی Prototype

`getEffectiveUserPermissions(user, roles)` مجموعه بدون تکرار زیر را می‌سازد:

1. permissionهای نقش پایه `roleId`؛ در نبود آن، نقش متناظر با `User.role`.
2. permissionهای همه `additionalRoleIds`.
3. اگر برای نقشی `roleAccessOverrides` وجود داشته باشد، فهرست همان entry به‌طور کامل جایگزین permissionهای پیش‌فرض آن نقش می‌شود.
4. `customPermissions` به نتیجه افزوده می‌شود.

`Sidebar.tsx` از این محاسبه استفاده می‌کند و admin را unrestricted در نظر می‌گیرد. استثناهای نمایشی فعلی شامل `canCreateRequests`، قابلیت task و نمایش کارتابل برای `isDualRole` است. همه Viewها هنوز یکسان به این utility مهاجرت نکرده‌اند؛ بنابراین نمایش منو به‌تنهایی تضمین authorization سراسری نیست.

## نقش‌های پیش‌فرض

| Role ID | هدف |
|---|---|
| `role_super_admin` | مدیریت فراگیر؛ فهرست پیش‌فرض آن همه permissionها به‌جز `sales_access` را دارد، ولی `User.role === 'admin'` در UI bypass می‌شود. |
| `role_treasury_manager` | تأیید نهایی، پرداخت، عودت و گزارش خزانه‌داری. |
| `role_branch_approver` | تأیید اولیه درخواست‌های شعب و ارجاع. |
| `role_treasury_executor` | اجرای پرداخت و خروجی بانکی. |
| `role_purchaser` | ایجاد و پیگیری درخواست و مدیریت ذی‌نفعان. |
| `role_support_agent` | ثبت و پیگیری پرونده پشتیبانی. |
| `role_financial_approver` | تأیید مالی ردیف‌های عودت پشتیبانی. |

`SystemPermission` در زمان این validation دارای ۱۲۱ مقدار قابل‌کامپایل است. فهرست دقیق و authoritative آن در `src/types.ts` است؛ عدد این سند فقط snapshot اعتبارسنجی است و هنگام تغییر type باید دوباره محاسبه شود.

## مدل چندنقشی

- نقش پایه همیشه فعال است و در `additionalRoleIds` تکرار نمی‌شود.
- `isDualRole` هنگام ذخیره کاربر derive می‌شود: وجود هم‌زمان نقش درخواست‌کننده‌مانند و تأییدکننده‌مانند.
- `canIssueTasks` و `canExecuteTasks` با تغییر نقش‌ها پیشنهاد می‌شوند، اما admin می‌تواند آن‌ها را دستی override کند.
- `isSeniorTreasurySupervisor` مستقل است و ذخیره admin تضمین می‌کند حداکثر یک کاربر این پرچم را داشته باشد.
- `approvalChain`, `allowedApproverIds` و `allowedCostCenterIds` از مدل چندنقشی مستقل‌اند.
- `salesSupervisorId` زنجیره مستقل فروش است و نباید برای خزانه‌داری استفاده شود.

## قواعد تغییر دسترسی

- نقش‌های دارای `isSystemRole` پایه‌های پیش‌فرض‌اند و UI آن‌ها را مانند نقش سفارشی قابل حذف تلقی نمی‌کند.
- هر تغییر permission باید هم مسیر نمایش و هم تمام guardهای اقدام مربوط را بررسی کند.
- تغییر هویت، impersonation، login یا logout باید tabها را به dashboard بازگرداند؛ دلیل امنیتی در [module catalog](../../product/module-catalog.md) ثبت شده است.
- محدودیت‌های امنیت واقعی این مدل client-side در [security and privacy](../../engineering/security-and-privacy.md) توضیح داده شده است.

## استثنای مجوز در سطح کاربر محلی

- در Local Foundation، نقش همچنان بستهٔ پایه مجوزهاست و تغییر ریزمجوز یک کاربر، خود نقش یا دسترسی سایر کاربران را تغییر نمی‌دهد.
- `permissionDenials` مجوزهای حاصل از همه نقش‌های فعال همان کاربر را مستثنا می‌کند و بر اجتماع نقش‌ها مقدم است.
- `permissionGrants` مجوز تکمیلی را فقط به همان کاربر می‌افزاید؛ مجوزی که از قبل در نقش پایه وجود دارد به‌صورت افزوده تکراری ذخیره نمی‌شود.
- تغییر هر دو فهرست با Actor، کاربر مؤثر، زمان و کدهای افزوده/مستثناشده در Audit ثبت می‌شود.
- حساب ادمین محافظت‌شده است و استثنای کاربری نمی‌پذیرد. Scope، Resource Policy، Workflow Guard و maker/checker پس از محاسبه مجوز مؤثر همچنان بدون bypass اجرا می‌شوند.

## Employee advance roles (Local Foundation V1.15)

| Role | Scope and authority |
|---|---|
| Employee | Create, sign, view, and correct only own advance requests before the first decision or after an explicit return for correction. Every correction requires a new digital signature. |
| Advance Branch Manager | Review requests for the assigned branch and approve, reject, or return for correction. |
| Advance Accounting Reviewer | Review bank/personnel data and amount; approve, reject, return for correction, or recheck an adjusted amount. |
| Main Sales Advance Approver | All-branches or selected-branches scope; create proxy requests, approve during proxy creation, change amount, request accounting recheck, or send directly to Treasury. |
| Treasury Executor | See only assigned treasury handoffs, the complete beneficiary and workflow snapshot, record the payment, and print the complete archival form with the full cycle. |

The dedicated approved exception allows the Main Sales Advance Approver to approve a self request or a proxy request created by the same actor. No other workflow gains a maker/checker bypass from this exception.
