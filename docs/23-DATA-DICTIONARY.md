# فرهنگ داده و روابط مفهومی

> **وضعیت:** `Verified` بر اساس `model.ts`، `storage.ts`، `storeRegistry.ts` و payloadهای دامنه‌ای. این سند schema منطقی است؛ IndexedDB کلید خارجی فیزیکی ندارد.

## مشخصات پایگاه محلی

| مورد | مقدار |
|---|---|
| نام | `tapra2_local` |
| نسخه schema | `15` |
| نسخه seed | `complete-local-erp-v1.42-legal-inspection-foundation` |
| تعداد store | `109` |
| کلید پایه | `id` در همه storeها |
| migration | ایجاد store/index هنگام upgrade؛ migration معنایی payload وجود ندارد |
| transaction | `StorageAdapter.transaction(stores, mode, work)` |

## ER مفهومی

```mermaid
erDiagram
  COMPANY ||--o{ ORGANIZATIONAL_UNIT : contains
  ORGANIZATIONAL_UNIT ||--o{ PERSONNEL : employs
  ORGANIZATIONAL_POSITION ||--o{ PERSONNEL : assigned
  PERSONNEL o|--o| LOCAL_USER : linked
  LOCAL_USER }o--o{ SECURITY_ROLE : has
  ORGANIZATIONAL_UNIT ||--o{ SALES_STRUCTURE : hosts
  WORKFLOW_DEFINITION ||--o{ WORKFLOW_VERSION : versions
  WORKFLOW_DEFINITION ||--o{ OPERATIONAL_RECORD : governs
  OPERATIONAL_RECORD ||--o{ RECORD_HISTORY : records
  OPERATIONAL_RECORD ||--o{ AUDIT_EVENT : traces
  PURCHASE_REQUEST ||--o{ TREASURY_EXECUTION : handoff
  PERSONNEL ||--o{ EMPLOYEE_ADVANCE : beneficiary
```

روابط بالا در Service با شناسه کنترل می‌شوند و FK/unique constraint فیزیکی در IndexedDB ندارند.

## حقوقی و بازرسی — فاز اول مصنوعی

| Entity / Store | فیلدهای کلیدی | حساسیت | چرخه عمر و قواعد |
|---|---|---|---|
| `LegalEntity` / `organization_legal_entities` | tenant/company، نام، نوع شرکت، شناسه ملی/ثبت و کدپستی ماسک‌شده، تاریخ ثبت، نشانی مصنوعی، status، version | بالا | مرجع مالکیت حقوقی در خزانه؛ حذف فیزیکی ندارد و غیرفعال‌سازی نسخه‌دار است. |
| `LegalEntityOfficer` / `organization_legal_entity_officers` | entity، نام مصنوعی، کدملی ماسک‌شده، سمت، بازه مسئولیت، سهم‌الشرکه ریالی، status/version | بالا | مدیرعامل، رئیس/نایب‌رئیس، اعضا و شرکا؛ حذف از فرم فقط رکورد را inactive می‌کند. |
| `LegalEntityProfileHistory` / `organization_legal_entity_history` | sequence، action، کد فیلدهای تغییرکرده، تعداد افراد افزوده/ویرایش/خاتمه‌یافته، actor/correlation | بالا | append-only و بدون مقدار خام هویتی، نشانی یا داده بانکی. |
| `BankInstitution` / `bank_institutions` | code، displayName، status، version | متوسط | مرجع بانک؛ در projection فقط برای نقش حقوقی مجاز دیده می‌شود. |
| `CompanyBankAccountDetail` / `company_bank_account_details` | owner entity، bank id، account/IBAN/card خام، masked values، last4 | بسیار بالا | raw فقط در store محافظت‌شده؛ پرونده/history/audit/event فقط id و snapshot ماسک‌شده دارند. |
| `LegalCase` / `legal_cases` | tenant/company، owner entity، tracking `LEGAL-year-seq`، type/status/version، bank id و masked snapshot | بالا | `qaGenerated=true` و `realDataProhibited=true`؛ status/void نسخه‌دار، بدون delete. |
| `LegalCaseCompanyLink` / `legal_case_company_links` | case، legalEntity، role، status | بالا | ارتباط چندشخصیتی صریح در یک workspace امنیتی؛ هر `companyId` دیگر tenant جدا و ممنوع است. |
| `LegalPartyProfile` / `legal_party_profiles` | person/organization، نام، contact mask، identity/contact raw مصنوعی | بسیار بالا | identity فقط با مجوز مستقل و resource پرونده project می‌شود؛ merge خودکار ممنوع. |
| `LegalCaseParty` / `legal_case_parties` | case، party، role، display/identity snapshot | بالا | نقش‌های complainant/buyer/payer/cardholder/representative/counterparty مستقل‌اند. |
| `LegalCaseHistory` / `legal_case_history` | sequence، action، from/to status، reason category ثابت، actor snapshot، time | بالا | Timeline کامل append-only؛ توضیح آزاد و PII/بانک در آن ذخیره نمی‌شود. |
| `LegalCaseHistory` / `legal_case_history` | sequence، action، actor/effective user، reason category ثابت، correlation | بالا | append-only و metadata-only؛ توضیح آزاد و مقدار کامل بانکی/هویتی ندارد. |

Schema 15 هسته حقوقی، schema 16 عملیات پرونده و schema 17 دو store نسخه‌دار پروفایل شرکت را افزایشی اضافه می‌کنند. fixture مستقل قدیمی با storeهای خالی تازه ارتقا می‌یابد و اجرای دوباره migration داده قبلی را بازنویسی نمی‌کند. این فاز فقط روی localhost/test و برای داده مصنوعی فعال است؛ generic backup/restore با وجود هر ردیف حقوقی متوقف می‌شود.

## هویت و سازمان

| Entity / Store | فیلدهای کلیدی | حساسیت | چرخه عمر و قواعد |
|---|---|---|---|
| `LocalUser` / `users` | `username`, `passwordHash`, `roleIds`, grants/denials, company/unit/team, status | بالا | غیرفعال‌سازی soft؛ ادمین اصلی قابل غیرفعال‌سازی نیست. |
| `FoundationSession` / `sessions` | active user، acting admin، زمان QA، version | بالا | یک رکورد `active-session`؛ در IndexedDB نه Cookie/JWT. |
| `SecurityRole` / `security_roles` | name، scope، permissions، protected، version | متوسط | نقش محافظت‌شده حذف نمی‌شود؛ نسخه قبلی در `role_versions`. |
| `OrganizationalUnit` / `organizational_units` | name، type، parent، manager، order، status | متوسط | واحد و شعبه یک entity با type متفاوت؛ غیرفعال‌سازی soft. |
| `OrganizationalPosition` / `organizational_positions` | title، description، status | کم | حذف فقط با رعایت ارجاعات سرویس. |
| `PersonnelRecord` / `personnel` | کد، کدملی، تماس، نشانی، استخدام، واحد، سمت، شعبه، بانک | بسیار بالا | کد پرسنلی تولید سامانه؛ جابه‌جایی در history؛ پایان همکاری soft. |
| `PersonnelMovement` | kind، from/to، effectiveDate، reason، actor | بالا | append-only در پرونده؛ انتقال شعبه/واحد/سمت/فروش. |
| `PersonnelProfileChangeRequest` | requester، changed fields، reason، status، reviewer | بالا | self-service؛ اعمال نهایی فقط پس از review. |
| `SalesStructure` / `sales_structures` | branch، vice، manager، senior، call-center supervisor، version | متوسط | پس از انتصاب قفل معنایی؛ ساختار غیرفعال در انتخاب جدید نمایش داده نمی‌شود. |

## مجوز، Workflow و رویداد

| Entity / Store | فیلدهای کلیدی | قاعده |
|---|---|---|
| `PermissionCatalogItem` | `domain.resource.action`، label، availability | منبع UI انتخاب مجوز. |
| `PolicyDefinition` | kind، version، enabled | تعریف سطح بالا؛ اجرای واقعی در Guardهای کد است. |
| `WorkflowDefinition` | states، transitions، queue، assignment، stages، variants | state machine محافظت‌شده؛ routing قابل نسخه‌گذاری. |
| `workflow_versions` | snapshot کامل نسخه | پرونده قدیمی از همین نسخه استفاده می‌کند. |
| `OperationalRecord` | module، trackingCode، status، owner/assignee، amount، payload، version | optimistic concurrency با expectedVersion؛ route/version هنگام ایجاد freeze می‌شود. |
| `OperationalRecordHistory` | sequence، eventType، from/to، actor، snapshot | تاریخچه append-only منطقی. |
| `AuditEvent` | actor، effectiveUser، outcome، correlation، metadata | ثبت رخداد امنیتی/عملیاتی؛ append-only منطقی. |
| `DomainEvent` | aggregate، eventType، payload، correlation | رخداد محلی برای projection/trace؛ broker خارجی نیست. |
| `UserNotification` | user، kind، related record، dedupeKey، readAt | اعلان کاربر؛ index روی user/date/dedupe. |
| `idempotency_keys` | key، record، createdAt | جلوگیری از تکرار انتقال در عملیات پشتیبانی‌شده. |

## Payload درخواست خرید

| فیلد | نوع/فرمت | الزام | داده حساس |
|---|---|---|---|
| `requestDate` | جلالی `YYYY/MM/DD` در UI | بله | خیر |
| `purchaseType` | goods/service/mixed | بله | خیر |
| `lines[]` | شرح، گروه، مشخصات، مقدار، واحد، قیمت، supplier | حداقل یک ردیف | خیر |
| `quotationAttachments[]` | نام، MIME، size، data URL، زمان | اختیاری | ممکن است |
| `beneficiaryCardNumber` | ۱۶ رقم | بله | بسیار بالا |
| `beneficiaryLastName` | متن | بله | متوسط |
| `allocations[]` | شعبه، مرکز هزینه، مبلغ، یادداشت | حداقل یک سهم | مالی |

جمع تخصیص‌ها باید دقیقاً برابر مجموع ردیف‌ها باشد. attachment داخل IndexedDB و snapshot می‌رود؛ quota رسمی `Unknown` است.

## Payload مساعده

| گروه | فیلدهای ثابت‌شده |
|---|---|
| ذی‌نفع | personnel/user id، کد پرسنلی، نام، کدملی، موبایل |
| جایگاه | شعبه، واحد، سمت |
| مالی | بانک، شماره کارت، مبلغ اولیه و مصوب، اعتبار داخلی |
| نیابتی | ثبت نیابتی، ثبت‌کننده نیابتی، self approval |
| امضا | کاربر امضاکننده، نام، زمان |
| Trail | مرحله، عمل، actor، زمان، reason، مبلغ قبل/بعد |

## طبقه‌بندی داده

| سطح | نمونه | کنترل فعلی | کمبود |
|---|---|---|---|
| بسیار حساس | password hash، کارت، شبا، کدملی | hash، permission، masking UI، backup اختیاری رمزدار | encryption-at-rest مرورگر تضمین نشده |
| حساس | نشانی، موبایل، اسناد، تاریخچه شغلی | permission + audit | retention/redaction مصوب نیست |
| داخلی | نقش، ساختار، workflow، audit | scope + backup | امضای دیجیتال قانونی وجود ندارد |
| عمومی داخلی | کاتالوگ و عنوان‌ها | permission عمومی | طبقه‌بندی رسمی داده `Planned` |

## Index و Query

فقط indexهای صریح زیر وجود دارند:

- `audit_events`: `occurredAt`, `actorId`, `category`
- `domain_events`: `aggregateId`
- `notifications`: `userId`, `createdAt`, `dedupeKey`

`Implemented-Unverified` — جست‌وجو و sort بیشتر جدول‌ها پس از `getAll` در حافظه انجام می‌شود. برای ۵۰۰ کاربر احتمالاً قابل قبول است، اما benchmark رسمی وجود ندارد.

## حذف، نگه‌داری و بازیابی

- `Verified` — کاربران/واحدها/ساختارها عمدتاً غیرفعال می‌شوند و تاریخچه حفظ می‌شود.
- `Verified` — reset/restore عمومی در حضور هر داده حقوقی fail-closed است. فقط reset اختصاصی `legal-qa-scenarios-v1` اجازه حذف فیزیکی همان دیتاست مصنوعی را دارد؛ داده دستی حقوقی فقط void/inactive می‌شود.
- `Verified` — import snapshot پس از اعتبارسنجی schema/store/checksum کل داده را جایگزین می‌کند.
- `Unknown` — retention، legal hold، quota attachment و حذف امن داده شخصی تصویب نشده‌اند.

