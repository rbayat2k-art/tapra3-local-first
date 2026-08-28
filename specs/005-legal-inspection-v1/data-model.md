# Data Model: هسته واحد حقوقی و بازرسی

## Common invariants

- همه aggregateها `id`, `tenantId`, `companyId`, `status`, `version`, `createdAt`, `updatedAt` دارند مگر اینکه immutable reference باشند.
- ID و company/entity از مرجع داخل transaction اعتبارسنجی می‌شود؛ client authority نیست.
- هیچ مقدار کامل بانکی، هویت حساس یا document content وارد history/audit/event نمی‌شود.
- حذف فیزیکی وجود ندارد.

## LegalEntity

- `id`, `tenantId`, `companyId`, `displayName`, `registrationNumberMasked`, `status`
- رابطه: مالک صفر تا چند حساب و مالک/طرف پرونده.
- rule: `companyId` در tenant یکتا و معتبر؛ غیرفعال برای پرونده جدید قابل انتخاب نیست.

## BankInstitution

- `id`, `tenantId`, `companyId`, `code`, `displayName`, `status`
- reference غیرحساس؛ code در شرکت یکتا و مشاهده/تغییر آن فقط در tenant/company دقیق مجاز است.

## CompanyBankAccountDetail

- `id`, `tenantId`, `companyId`, `legalEntityId`, `bankInstitutionId`
- `accountNumber`, `iban`, `cardNumber` (raw sensitive storage only)
- `maskedAccountNumber`, `maskedIban`, `maskedCardNumber`, `last4`
- `status`, `version`, timestamps
- rule: دقیقاً یک LegalEntity مالک؛ full values در case/history/audit ممنوع.

## LegalPartyProfile

- `id`, `tenantId`, `companyId`, `kind: person|organization`
- public/minimal: `displayName`, `contactMasked`
- protected: `nationalId`, `mobile`, `address` در raw store/projection مجاز
- `dedupeKey` فقط در نسخه server آینده؛ در local prototype merge خودکار ممنوع.

## LegalCase

- `id`, `tenantId`, `companyId`, `owningLegalEntityId`
- `trackingCode`, `title`, `caseType`, `status: draft|open|on_hold|closed|void`
- `primaryOwnerUserId`, `supervisorUserId?`, `version`, timestamps
- `qaGenerated`, `realDataProhibited: true`
- optional masked bank snapshot: `bankAccountId`, `bankSnapshotMasked`
- transition phase 1: `draft -> open`, `draft/open -> void` با reason؛ no physical delete.

## LegalCaseCompanyLink

- `id`, `caseId`, `legalEntityId`, `role: owner|affected|counterparty|account_owner`
- unique `(caseId, legalEntityId, role)`.

## LegalCaseParty

- `id`, `caseId`, `partyId`, `role: complainant|buyer|payer|cardholder|representative|counterparty|other`
- `displaySnapshot`, `identitySnapshotMasked`
- unique role-aware link؛ یک party می‌تواند چند نقش صریح داشته باشد.

## LegalCaseHistory

- append-only metadata: caseId, sequence, action, actor/effective actor, occurredAt, reasonCategory, correlationId.
- no raw before/after snapshot.

## State and deletion

- master data: active/inactive.
- case: draft/open/on_hold/closed/void.
- party/link: active/void/superseded.
- purge در V1 وجود ندارد.
