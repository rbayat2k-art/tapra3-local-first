# ماتریس قابلیت‌ها و شواهد

> **آخرین تطبیق:** شاخه مستقل `fix/ocr-blockers-20260824` با پایه `feature/workflow-management@a0f02dd`، 2026-08-24

## روش خواندن

`Verified` یعنی رفتار با تست/اجرای این بازبینی تأیید شده است. `Implemented-Unverified` یعنی تعریف، UI یا use-case در کد هست، اما آزمون مستقیم کامل هر جریان انجام نشده است. همه APIهای این جدول متد محلی `LocalFoundationService` هستند؛ Backend/HTTP API و external side effect وجود ندارد.

## قابلیت‌های تخصصی و Foundation

| قابلیت | هدف/مخاطب | Entry/UI | Service/داده | دسترسی/اعتبارسنجی | تست و وضعیت | محدودیت/شاهد |
|---|---|---|---|---|---|---|
| Boot و seed | آماده‌سازی QA | `App.tsx`, `FoundationApp.tsx` | `initialize`; `meta` + تمام storeها | seed version/schema guard | `seed.test.ts` — `Verified` | reset داده محلی را جایگزین می‌کند |
| Session محلی | همه کاربران | Login/Account menu | `signIn`, `signOut`; `sessions` | active account، password hash | authorization/seed tests — `Verified` | Cookie/JWT/MFA ندارد |
| بازیابی حساب | کاربر | `RegistrationPage.tsx` | recovery/reminder؛ Audit | تطبیق username/mobile | کد موجود — `Implemented-Unverified` | SMS فقط preview محلی |
| QA login | Admin/QA | User detail | `loginAsUser`, `endQaSession` | `foundation.users.qa_login`، بدون bypass | `authorization.test.ts` — `Verified` | فقط local acceptance |
| تنظیمات ظاهر | هر کاربر | Visual settings | localStorage فقط UI preference | schema ساده preference | build/typecheck — `Implemented-Unverified` | بین دستگاه‌ها sync نمی‌شود |
| Snapshot | Admin مجاز | Backup/Restore | export/import، 96 store | schema/store/checksum؛ AES-GCM اختیاری | storage path + build — `Verified` | backup خودکار ندارد |
| Audit/Event | Admin/Auditor | Audit page | `audit_events`, `domain_events` | actor/effective user/correlation | authorization/domain tests — `Verified` | tamper-proof سروری نیست |
| Notification | کاربران | Bell/notification list | `notifications` | فقط recipient | purchase tests — `Verified` | Push خارجی ندارد |
| Navigation | همه | Shell/sidebar/query route | History API | permission-aware | `navigationUrl.test.ts` — `Verified` | router framework ندارد |
| سازمان/شعبه | Admin/HR | Organization/Branches | CRUD/status | permission + scope | `organizationAccess.test.ts` — `Verified` | hierarchy analytics محدود |
| واحد و سمت | Admin/HR | Organization pages | CRUD/status/delete | منع حذف تخصیص جاری | organization tests — `Verified` | سابقه حذف در Audit است |
| پرسنل | HR/Admin | `PersonnelPages.tsx` | create/update/movement/export | required profile + unique identifiers | profile/export/seed tests — `Verified` | فایل پرسنلی عمیق محدود |
| حساب کاربری | Admin/خود کاربر | Users/My Account | account CRUD/credential change | unique username، own-account guard | user override/profile tests — `Verified` | policy رمز Production ندارد |
| تغییر پروفایل | کاربر/HR | My Account/Change Queue | submit/review | expectedVersion، reviewer permission | `profileChangeWorkflow.test.ts` — `Verified` | approval یک‌مرحله‌ای |
| نقش و مجوز | Admin | Roles/User detail | role CRUD/clone/delete + grants/denials | denial wins، active role | override/auth tests — `Verified` | شرط‌های ABAC عمومی ندارد |
| ساختار فروش | Admin فروش | Sales structures | version/status/assignment | active-only selection، lock after assignment | seed/identity code — `Implemented-Unverified` | آزمون E2E انتقال گروهی ندارد |
| مشتری | CRM user | Customer pages | CRUD/status/merge/import | permission/scope/validation | `customerPersonnel.test.ts` — `Verified` | CRM عمیق هنوز generic است |
| درخواست خرید | درخواست‌کننده/تأییدکننده | `PurchaseRequestUi.tsx` | create/update/decision | line/allocation/card/maker-checker | `purchaseRequest.test.ts` — `Verified` | approval chain شرطی کامل Planned |
| خزانه خرید | مجری خزانه | `TreasuryExecutionUi.tsx` | payment/revise/revert/follow-up | assignee-only، reason guards | purchase/cartable tests — `Verified` | مدیر بالاسری مجری هنوز Unknown |
| مساعده | پرسنل/مدیر شعبه/حسابداری/تأییدکننده/خزانه | `EmployeeAdvanceUi.tsx` | create/update/decide | branch scope، route، correction، version | `employeeAdvance.test.ts` — `Verified` | سقف و تعداد محدود نشده |
| مدیریت گردش‌کار | Workflow Admin | `WorkflowAdminPage.tsx` | `updateWorkflowPolicy` | version، route overlap، state-machine protected | `workflowPolicy.test.ts` — `Verified` | ویرایش آزاد state ممنوع |
| رکورد عمومی ERP | اپراتورهای دامنه | `ErpWorkspacePage.tsx` | create/update/transition/assign | permission/scope/maker-checker | catalog/auth tests — `Verified` | payload و UI عمومی است |

## ۶۷ ماژول Registry

سه ماژول تخصصی با تست دامنه `Verified` هستند. بقیه ماژول‌ها workflow/store/permission و UI عمومی دارند، ولی منطق تخصصی واقعی آن‌ها جداگانه اجرا نشده و `Implemented-Unverified` هستند. شاهد مشترک: `erpCatalog.ts`, `erpCatalog.test.ts`, `seed.test.ts`, `ErpWorkspacePage.tsx`.

| # | Module | Domain | Store | وضعیت |
|---:|---|---|---|---|
| 1 | `employment-contract` | hr | `employment_contracts` | `Implemented-Unverified` |
| 2 | `onboarding` | hr | `onboarding_cases` | `Implemented-Unverified` |
| 3 | `offboarding` | hr | `offboarding_cases` | `Implemented-Unverified` |
| 4 | `attendance` | hr | `attendance_records` | `Implemented-Unverified` |
| 5 | `shift` | hr | `shifts` | `Implemented-Unverified` |
| 6 | `leave` | hr | `leave_requests` | `Implemented-Unverified` |
| 7 | `mission` | hr | `missions` | `Implemented-Unverified` |
| 8 | `overtime` | hr | `overtime_requests` | `Implemented-Unverified` |
| 9 | `employee-advance` | hr | `employee_advances` | `Verified` |
| 10 | `employee-loan` | hr | `employee_loans` | `Implemented-Unverified` |
| 11 | `performance-review` | hr | `performance_reviews` | `Implemented-Unverified` |
| 12 | `training` | hr | `training_records` | `Implemented-Unverified` |
| 13 | `personnel-document` | hr | `personnel_documents` | `Implemented-Unverified` |
| 14 | `lead` | crm | `leads` | `Implemented-Unverified` |
| 15 | `call` | crm | `calls` | `Implemented-Unverified` |
| 16 | `followup` | crm | `followups` | `Implemented-Unverified` |
| 17 | `opportunity` | crm | `opportunities` | `Implemented-Unverified` |
| 18 | `quote` | sales | `quotes` | `Implemented-Unverified` |
| 19 | `sale` | sales | `sales` | `Implemented-Unverified` |
| 20 | `invoice` | sales | `invoices` | `Implemented-Unverified` |
| 21 | `payment` | sales | `payments` | `Implemented-Unverified` |
| 22 | `campaign` | marketing | `campaigns` | `Implemented-Unverified` |
| 23 | `promotion` | marketing | `promotions` | `Implemented-Unverified` |
| 24 | `catalog-item` | catalog | `catalog_items` | `Implemented-Unverified` |
| 25 | `price-list` | catalog | `price_lists` | `Implemented-Unverified` |
| 26 | `purchase-request` | procurement | `purchase_requests` | `Verified` |
| 27 | `rfq` | procurement | `rfqs` | `Implemented-Unverified` |
| 28 | `supplier-offer` | procurement | `supplier_offers` | `Implemented-Unverified` |
| 29 | `offer-comparison` | procurement | `offer_comparisons` | `Implemented-Unverified` |
| 30 | `purchase-order` | procurement | `purchase_orders` | `Implemented-Unverified` |
| 31 | `matching` | procurement | `matching_records` | `Implemented-Unverified` |
| 32 | `supplier` | supplier | `suppliers` | `Implemented-Unverified` |
| 33 | `supplier-invoice` | supplier | `supplier_invoices` | `Implemented-Unverified` |
| 34 | `cost-center` | finance | `cost_centers` | `Implemented-Unverified` |
| 35 | `budget` | finance | `budget_entries` | `Implemented-Unverified` |
| 36 | `finance-request` | finance | `finance_requests` | `Implemented-Unverified` |
| 37 | `bank-account` | treasury | `bank_accounts` | `Implemented-Unverified` |
| 38 | `treasury-execution` | treasury | `treasury_executions` | `Verified` |
| 39 | `chart-account` | accounting | `chart_of_accounts` | `Implemented-Unverified` |
| 40 | `accounting-period` | accounting | `accounting_periods` | `Implemented-Unverified` |
| 41 | `journal-entry` | accounting | `journal_entries` | `Implemented-Unverified` |
| 42 | `bank-reconciliation` | accounting | `bank_reconciliations` | `Implemented-Unverified` |
| 43 | `warehouse-master` | warehouse | `warehouses` | `Implemented-Unverified` |
| 44 | `location` | warehouse | `locations` | `Implemented-Unverified` |
| 45 | `inventory-item` | warehouse | `inventory_items` | `Implemented-Unverified` |
| 46 | `receipt` | warehouse | `receipts` | `Implemented-Unverified` |
| 47 | `reservation` | warehouse | `reservations` | `Implemented-Unverified` |
| 48 | `transfer` | warehouse | `transfers` | `Implemented-Unverified` |
| 49 | `adjustment` | warehouse | `adjustments` | `Implemented-Unverified` |
| 50 | `count` | warehouse | `counts` | `Implemented-Unverified` |
| 51 | `return` | warehouse | `returns` | `Implemented-Unverified` |
| 52 | `inventory-movement` | warehouse | `inventory_movements` | `Implemented-Unverified` |
| 53 | `shipment` | logistics | `shipments` | `Implemented-Unverified` |
| 54 | `delivery` | logistics | `deliveries` | `Implemented-Unverified` |
| 55 | `service-case` | service | `service_cases` | `Implemented-Unverified` |
| 56 | `service-evidence` | service | `service_evidence` | `Implemented-Unverified` |
| 57 | `support-case` | support | `support_cases` | `Implemented-Unverified` |
| 58 | `support-transaction` | support | `support_transactions` | `Implemented-Unverified` |
| 59 | `contract` | contract | `contracts` | `Implemented-Unverified` |
| 60 | `fixed-asset` | asset | `fixed_assets` | `Implemented-Unverified` |
| 61 | `asset-transfer` | asset | `asset_transfers` | `Implemented-Unverified` |
| 62 | `asset-maintenance` | asset | `asset_maintenance` | `Implemented-Unverified` |
| 63 | `task` | task | `tasks` | `Implemented-Unverified` |
| 64 | `chat` | communications | `chats` | `Implemented-Unverified` |
| 65 | `message` | communications | `messages` | `Implemented-Unverified` |
| 66 | `letter` | letter | `letters` | `Implemented-Unverified` |
| 67 | `document` | document | `documents` | `Implemented-Unverified` |

## وابستگی و Side effect

- `Verified` — وابستگی عملیاتی بیرونی همه قابلیت‌های بالا: هیچ‌کدام.
- `Verified` — Side effectها فقط mutation در IndexedDB، دانلود فایل/چاپ Browser، History API و local notification/SMS preview هستند.
- `Unknown` — `@google/genai` در dependencyها وجود دارد، اما استفاده فعال آن در مسیر `local-foundation` در این بررسی تأیید نشد.
