export const LEGAL_INSPECTION_STORES = [
  'organization_legal_entities',
  'organization_legal_entity_officers',
  'organization_legal_entity_history',
  'bank_institutions',
  'company_bank_account_details',
  'legal_cases',
  'legal_case_company_links',
  'legal_party_profiles',
  'legal_case_parties',
  'legal_case_history',
  'legal_proceedings',
  'legal_notices',
  'legal_deadlines',
  'legal_document_metadata',
] as const;

/** Stores introduced by schema 17; schema 16 snapshots legitimately omit them. */
export const LEGAL_ENTITY_PROFILE_STORES = [
  'organization_legal_entity_officers',
  'organization_legal_entity_history',
] as const;

/** Stores introduced by schema 16; schema 15 snapshots legitimately omit them. */
export const LEGAL_OPERATION_STORES = [
  'legal_proceedings',
  'legal_notices',
  'legal_deadlines',
  'legal_document_metadata',
] as const;

export type LegalRecordStatus = 'active' | 'inactive';
export type LegalEntityForm = 'private_joint_stock' | 'limited_liability' | 'public_joint_stock' | 'cooperative' | 'other';
export type LegalEntityOfficerRole = 'chief_executive' | 'board_chair' | 'board_vice_chair' | 'board_member' | 'partner' | 'other';
export type LegalCaseStatus = 'draft' | 'open' | 'on_hold' | 'closed' | 'void';
export type LegalPartyKind = 'person' | 'organization';
export type LegalPartyRole = 'complainant' | 'buyer' | 'payer' | 'cardholder' | 'representative' | 'counterparty' | 'other';
export type LegalEntityCaseRole = 'owner' | 'affected' | 'counterparty' | 'account_owner';
export type LegalStatusReasonCategory = 'qa_lifecycle' | 'duplicate_synthetic' | 'entered_in_error' | 'scenario_completed';
export type LegalProceedingStatus = 'draft' | 'active' | 'on_hold' | 'closed' | 'void';
export type LegalNoticeStatus = 'received' | 'acknowledged' | 'superseded' | 'void';
export type LegalDeadlineStatus = 'open' | 'completed' | 'cancelled' | 'superseded';
export type LegalDocumentStatus = 'active' | 'superseded' | 'void';

export interface LegalEntity {
  id: string;
  tenantId: string;
  companyId: string;
  displayName: string;
  legalForm?: LegalEntityForm;
  nationalIdentifierMasked?: string;
  registrationNumberMasked?: string;
  registeredAt?: string;
  registeredAddress?: string;
  postalCodeMasked?: string;
  status: LegalRecordStatus;
  qaGenerated?: boolean;
  qaDatasetId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LegalEntityOfficer {
  id: string;
  tenantId: string;
  companyId: string;
  legalEntityId: string;
  displayName: string;
  nationalIdMasked?: string;
  role: LegalEntityOfficerRole;
  appointmentStartDate?: string;
  appointmentEndDate?: string;
  unlimitedTenure?: boolean;
  shareAmountRial?: string;
  status: LegalRecordStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LegalEntityProfileHistory {
  id: string;
  tenantId: string;
  companyId: string;
  legalEntityId: string;
  sequence: number;
  action: 'created' | 'profile_updated' | 'status_changed';
  actorId: string;
  effectiveUserId: string;
  occurredAt: string;
  entityVersion: number;
  changedFields: string[];
  officerAddedCount: number;
  officerUpdatedCount: number;
  officerEndedCount: number;
  correlationId: string;
}

export interface BankInstitution {
  id: string;
  tenantId: string;
  companyId: string;
  code: string;
  displayName: string;
  status: LegalRecordStatus;
  qaGenerated?: boolean;
  qaDatasetId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Raw banking values. This record must never be spread into FoundationState, history, audit or events. */
export interface CompanyBankAccountDetail {
  id: string;
  tenantId: string;
  companyId: string;
  legalEntityId: string;
  bankInstitutionId: string;
  accountNumber?: string;
  iban?: string;
  cardNumber?: string;
  maskedAccountNumber?: string;
  maskedIban?: string;
  maskedCardNumber?: string;
  last4: string;
  status: LegalRecordStatus;
  qaGenerated?: boolean;
  qaDatasetId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LegalBankAccountProjection {
  id: string;
  companyId: string;
  legalEntityId: string;
  bankInstitutionId: string;
  maskedAccountNumber?: string;
  maskedIban?: string;
  maskedCardNumber?: string;
  last4: string;
  accountNumber?: string;
  iban?: string;
  cardNumber?: string;
  status: LegalRecordStatus;
  qaDatasetId?: string;
  version: number;
}

export interface LegalPartyProfile {
  id: string;
  tenantId: string;
  companyId: string;
  kind: LegalPartyKind;
  displayName: string;
  contactMasked?: string;
  nationalId?: string;
  mobile?: string;
  address?: string;
  status: LegalRecordStatus;
  qaDatasetId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LegalPartyProjection {
  id: string;
  companyId: string;
  kind: LegalPartyKind;
  displayName: string;
  contactMasked?: string;
  nationalId?: string;
  mobile?: string;
  address?: string;
  status: LegalRecordStatus;
  qaDatasetId?: string;
  version: number;
}

export interface LegalCase {
  id: string;
  tenantId: string;
  companyId: string;
  owningLegalEntityId: string;
  trackingCode: string;
  title: string;
  caseType: string;
  status: LegalCaseStatus;
  primaryOwnerUserId: string;
  supervisorUserId?: string;
  bankAccountId?: string;
  bankSnapshotMasked?: string;
  /** Optional additive links to existing invoices; absent means no linked invoices. */
  invoiceIds?: string[];
  qaGenerated: boolean;
  qaDatasetId?: string;
  realDataProhibited: true;
  version: number;
  createdByActorId: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface LegalInvoiceSummary {
  id:string;
  trackingCode:string;
  title:string;
  status:string;
  amountRial?:string;
  createdAt:string;
  updatedAt:string;
}

export interface LegalCaseCompanyLink {
  id: string;
  caseId: string;
  legalEntityId: string;
  role: LegalEntityCaseRole;
  status: 'active' | 'void';
  createdAt: string;
}

export interface LegalCaseParty {
  id: string;
  caseId: string;
  partyId: string;
  role: LegalPartyRole;
  displaySnapshot: string;
  identitySnapshotMasked?: string;
  status: 'active' | 'void' | 'superseded';
  createdAt: string;
}

export interface LegalCaseHistory {
  id: string;
  caseId: string;
  sequence: number;
  action: string;
  actorId: string;
  effectiveUserId: string;
  actorDisplayName?: string;
  fromStatus?: LegalCaseStatus;
  toStatus?: LegalCaseStatus;
  occurredAt: string;
  reasonCategory?: LegalStatusReasonCategory | 'synthetic_prototype' | 'deterministic_synthetic_qa';
  resourceKind?: 'case' | 'proceeding' | 'notice' | 'deadline' | 'document';
  resourceId?: string;
  resourceVersion?: number;
  fromState?: string;
  toState?: string;
  summaryCode?: string;
  correlationId: string;
}

export interface LegalProceeding {
  id: string;
  tenantId: string;
  companyId: string;
  caseId: string;
  authorityType: 'court' | 'prosecutor' | 'administrative' | 'other';
  authorityName: string;
  stage: 'initial_review' | 'hearing' | 'judgment' | 'appeal' | 'execution';
  externalReferenceMasked?: string;
  primaryOwnerUserId: string;
  status: LegalProceedingStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LegalNotice {
  id: string;
  tenantId: string;
  companyId: string;
  caseId: string;
  proceedingId: string;
  noticeType: 'hearing' | 'response_required' | 'judgment' | 'execution' | 'other';
  issuedAt?: string;
  receivedAt: string;
  externalReferenceMasked?: string;
  status: LegalNoticeStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LegalDeadline {
  id: string;
  tenantId: string;
  companyId: string;
  caseId: string;
  sourceKind: 'notice' | 'proceeding';
  sourceId: string;
  dueAt: string;
  timezone: 'Asia/Tehran';
  priority: 'normal' | 'high' | 'critical';
  assigneeUserId: string;
  status: LegalDeadlineStatus;
  completedAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Metadata only. No blob, data URL, storage path or download URL is allowed locally. */
export interface LegalDocumentMetadata {
  id: string;
  tenantId: string;
  companyId: string;
  caseId: string;
  ownerKind: 'case' | 'proceeding' | 'notice';
  ownerId: string;
  documentType: 'notice' | 'petition' | 'ruling' | 'receipt' | 'other';
  classification: 'internal' | 'confidential' | 'highly_confidential';
  displayName: string;
  mimeType?: string;
  sizeBytes?: number;
  checksum?: string;
  contentState: 'metadata_only' | 'pending_secure_backend';
  status: LegalDocumentStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LegalInspectionProjection {
  syntheticDataOnly: true;
  legalEntities: LegalEntity[];
  bankInstitutions: BankInstitution[];
  bankAccounts: LegalBankAccountProjection[];
  cases: LegalCase[];
  companyLinks: LegalCaseCompanyLink[];
  parties: LegalPartyProjection[];
  caseParties: LegalCaseParty[];
  history: LegalCaseHistory[];
  proceedings: LegalProceeding[];
  notices: LegalNotice[];
  deadlines: LegalDeadline[];
  documents: LegalDocumentMetadata[];
  invoiceSummaries: LegalInvoiceSummary[];
}
