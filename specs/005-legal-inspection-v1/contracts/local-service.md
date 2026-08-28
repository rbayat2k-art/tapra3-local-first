# Local Service Contract: Legal Inspection Phase 1

## Projection

`loadState()` فقط LegalInspectionProjection مجاز برای actor جاری را برمی‌گرداند:

- `legalEntities`: فقط tenant/company مجاز، بدون شناسه ثبتی کامل.
- `bankAccounts`: masked by default؛ full fields فقط با `legal.bank.full.view` و resource scope.
- `legalCases`: basic fields برای `legal.case.basic.view`.
- `caseParties`: هویت protected فقط با `legal.party.identity.view` روی همان پرونده.
- `syntheticDataOnly: true` همیشه برای این فاز.

## Commands

### createLegalCase(input, commandId)

- input: title, caseType, owningLegalEntityId, companyLinks, partyLinks, optional bankAccountId.
- service derives tenant/company from current session and referenced entities.
- one transaction rechecks session, active user/roles, create permission, scope, references, duplicate command and tracking counter.
- output: refreshed authorized FoundationState.
- same command/payload replays; different payload conflicts.

### createLegalEntity(input, commandId)

- permission: `legal.master_data.manage`.
- company and tenant must be current and resource-authorized.

### createLegalBankAccount(input, commandId)

- permission: `legal.bank_account.manage`.
- exact owner entity and bank are resolved in the transaction.
- audit contains only account id, bank id and last4; never full values.

### setLegalRecordStatus(id, expectedVersion, status, reason, commandId)

- no delete endpoint exists.
- reason mandatory for inactive/void.
- CAS, session, scope, audit/event/receipt atomic.

## Deferred ports

- `LegalFinancePort`: only immutable integration intents in later phases; cannot mark payment complete in Phase 1.
- `LegalDocumentPort`: metadata/blob split after secure storage is available.
- `LegalExportPort`: no sensitive export in Phase 1.
