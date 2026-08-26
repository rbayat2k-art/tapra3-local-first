export const FOUNDATION_SCHEMA_VERSION = 11;
export const FOUNDATION_DB_NAME = 'tapra2_local';
export const FOUNDATION_SEED_VERSION = 'complete-local-erp-v1.30-access-safety';

export type ScopeType = 'COMPANY' | 'UNIT' | 'TEAM' | 'SELF' | 'RECORD';
/** Permission codes are registry-driven and always use domain.resource.action. */
export type PermissionCode = string;

export interface PermissionEntitlement {
  permission: PermissionCode;
  scope: ScopeType;
  source: 'role' | 'user-grant' | 'admin';
  sourceRoleId?: string;
}

export type UserStatus = 'active' | 'inactive';
export type SalesHierarchyLevel = 'sales_vice' | 'sales_manager' | 'senior_supervisor' | 'sales_supervisor' | 'seller';
export type SalesChannel = 'call_center' | 'branch' | 'field' | 'partner';
export type SalesCompensationMode = 'fixed_salary' | 'commission_only' | 'fixed_salary_plus_commission';
export type SalesCommissionBasis = 'invoice_collection';

export interface SalesCompensationRecord {
  id: string;
  mode: SalesCompensationMode;
  monthlyFixedSalaryRial?: string;
  commissionPercent?: string;
  commissionBasis: SalesCommissionBasis;
  effectiveFrom: string;
  reason: string;
  actorId: string;
  actorName: string;
  recordedAt: string;
}

export interface LocalUser {
  id: string;
  actorId: string;
  name: string;
  roleTitle: string;
  roles: string[];
  roleId: string;
  roleIds: string[];
  status: UserStatus;
  username: string;
  passwordHash: string;
  passwordUpdatedAt: string;
  positionId?: string;
  managerUserId?: string;
  personnelId?: string;
  isAdmin: boolean;
  description: string;
  companyId: string;
  unitId?: string;
  teamId?: string;
  scope: ScopeType;
  permissions: PermissionCode[];
  /** Effective permission sources. Authorization evaluates the scope of each source separately. */
  permissionEntitlements?: PermissionEntitlement[];
  /** Explicit permissions granted only to this user, without changing assigned roles. */
  permissionGrants?: PermissionCode[];
  /** Explicit permissions denied only to this user; denial wins over every assigned role. */
  permissionDenials?: PermissionCode[];
  accent: string;
  initials: string;
  branchUnitId?: string;
  /** Branches covered by an employee-advance role. `*` means every active branch. */
  advanceBranchIds?: string[];
  salesHierarchyLevel?: SalesHierarchyLevel;
  qaGenerated?: boolean;
}

export type PersonnelEmploymentStatus = 'active' | 'ending_scheduled' | 'ended' | 'rehire_scheduled';
export type PersonnelDepartureInitiator = 'employee' | 'organization';
export type PersonnelGender = 'female' | 'male' | 'unspecified';
export type PersonnelMaritalStatus = 'single' | 'married' | 'unspecified';

export type PersonnelLifecycleEventKind =
  | 'employment_started'
  | 'employment_end_scheduled'
  | 'employment_end_cancelled'
  | 'employment_ended'
  | 'rehire_scheduled'
  | 'rehired';

export interface PersonnelLifecycleEvent {
  id: string;
  kind: PersonnelLifecycleEventKind;
  effectiveDate: string;
  reason: string;
  handoffNotes?: string;
  departureInitiator?: PersonnelDepartureInitiator;
  actorId: string;
  actorName: string;
  recordedAt: string;
  previousEmploymentType?: string;
  employmentType?: string;
  unitId?: string;
  positionId?: string;
  branchUnitId?: string;
  managerPersonnelId?: string;
  roleIds?: string[];
}

export interface PendingPersonnelLifecycleChange {
  kind: 'end' | 'rehire';
  effectiveDate: string;
  reason: string;
  handoffNotes?: string;
  departureInitiator?: PersonnelDepartureInitiator;
  employmentType?: string;
  unitId?: string;
  positionId?: string;
  branchUnitId?: string;
  managerPersonnelId?: string;
  roleIds?: string[];
  scheduledByActorId: string;
  scheduledByActorName: string;
  scheduledAt: string;
}

export type PersonnelMovementKind = 'branch_transfer' | 'unit_change' | 'position_change' | 'sales_transfer';

export interface SalesStructure {
  id: string;
  code: string;
  branchUnitId: string;
  salesVicePersonnelId?: string;
  salesManagerPersonnelId: string;
  seniorSupervisorPersonnelId: string;
  callCenterSupervisorPersonnelId: string;
  status: UserStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonnelMovement {
  id: string;
  kind: PersonnelMovementKind;
  fromId?: string;
  toId: string;
  effectiveDate: string;
  previousEndedAt?: string;
  newStartedAt?: string;
  reason: string;
  actorId: string;
  actorName: string;
  recordedAt: string;
}

export interface PersonnelRecord {
  id: string;
  /** Persisted tenant provenance. Legacy records may omit it and are resolved fail-closed. */
  companyId?: string;
  personnelCode: string;
  firstName: string;
  lastName: string;
  fatherName?: string;
  nationalId?: string;
  identityNumber?: string;
  birthDate?: string;
  birthPlace?: string;
  gender: PersonnelGender;
  maritalStatus: PersonnelMaritalStatus;
  primaryMobile: string;
  secondaryMobile?: string;
  phone?: string;
  personalEmail?: string;
  province?: string;
  city?: string;
  address?: string;
  postalCode?: string;
  employmentStatus: PersonnelEmploymentStatus;
  employmentType: string;
  startDate: string;
  endDate?: string;
  unitId: string;
  positionId: string;
  managerPersonnelId?: string;
  workLocation?: string;
  bankName?: string;
  accountNumber?: string;
  cardNumber?: string;
  iban?: string;
  emergencyName?: string;
  emergencyRelation?: string;
  emergencyPhone?: string;
  linkedUserId?: string;
  branchUnitId?: string;
  salesHierarchyLevel?: SalesHierarchyLevel;
  /** Independent effective start of the person's current sales-network role. */
  salesAssignmentStartDate?: string;
  salesChannel?: SalesChannel;
  salesSupervisorPersonnelId?: string;
  salesBranchUnitId?: string;
  salesStructureId?: string;
  /** Append-only dated compensation terms for members of the sales hierarchy. */
  salesCompensationHistory?: SalesCompensationRecord[];
  qaGenerated?: boolean;
  movements?: PersonnelMovement[];
  /** Append-only employment lifecycle history. Existing personnel codes and identity are never recreated. */
  lifecycleHistory?: PersonnelLifecycleEvent[];
  /** A future-dated end or rehire waiting to become effective. */
  pendingLifecycleChange?: PendingPersonnelLifecycleChange;
  createdAt: string;
  updatedAt: string;
}

export type PersonnelProfileChangeField =
  | 'firstName' | 'lastName' | 'fatherName' | 'nationalId' | 'identityNumber' | 'birthDate' | 'birthPlace'
  | 'gender' | 'maritalStatus' | 'primaryMobile' | 'secondaryMobile' | 'phone' | 'personalEmail'
  | 'province' | 'city' | 'address' | 'postalCode'
  | 'bankName' | 'accountNumber' | 'cardNumber' | 'iban'
  | 'emergencyName' | 'emergencyRelation' | 'emergencyPhone';

export type PersonnelProfileChangeValues = Partial<Record<PersonnelProfileChangeField, string>>;

export interface PersonnelProfileChangeRequest {
  id: string;
  trackingCode: string;
  personnelId: string;
  requesterUserId: string;
  requesterName: string;
  status: 'submitted' | 'approved' | 'rejected';
  beforeValues: PersonnelProfileChangeValues;
  requestedValues: PersonnelProfileChangeValues;
  reason: string;
  reviewerUserId?: string;
  reviewerName?: string;
  reviewReason?: string;
  reviewedAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type CustomerType = 'individual' | 'legal';
export type CustomerStatus = 'active' | 'inactive' | 'prospect';
export interface CustomerPhone {id: string; label: string; number: string; primary: boolean;}
export interface CustomerAddress {id: string; label: string; province?: string; city?: string; address: string; postalCode?: string; primary: boolean;}
export interface CustomerRelationship {id: string; title: string; relatedCustomerId?: string; personName?: string; description?: string;}
export interface CustomerTimelineItem {id: string; type: 'note' | 'identity' | 'contact' | 'status' | 'merge' | 'import'; title: string; description?: string; actorName: string; occurredAt: string;}

export interface CustomerRecord {
  id: string;
  type: CustomerType;
  displayName: string;
  firstName?: string;
  lastName?: string;
  legalName?: string;
  nationalId?: string;
  businessId?: string;
  economicCode?: string;
  status: CustomerStatus;
  phones: CustomerPhone[];
  email?: string;
  addresses: CustomerAddress[];
  source: string;
  provenance: string;
  ownerPersonnelId?: string;
  notes: string;
  relationships: CustomerRelationship[];
  timeline: CustomerTimelineItem[];
  mergedIntoCustomerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerImportJob {
  id: string;
  fileName: string;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  invalidRows: number;
  actorName: string;
  createdAt: string;
}

export type OrganizationRecordStatus = 'active' | 'inactive';

export interface ActingUnitManagerAssignment {
  userId: string;
  reason: string;
  startsOn: string;
  endsOn: string;
  assignedAt: string;
  assignedByActorId: string;
}

export interface OrganizationalUnit {
  id: string;
  name: string;
  type: string;
  parentId?: string;
  managerUserId?: string;
  actingManager?: ActingUnitManagerAssignment;
  status: OrganizationRecordStatus;
  order: number;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationalPosition {
  id: string;
  title: string;
  description: string;
  /** Units in which this position may be assigned. Branches are not organizational units. */
  unitIds: string[];
  status: OrganizationRecordStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SecurityRole {
  id: string;
  name: string;
  description: string;
  status: OrganizationRecordStatus;
  protected: boolean;
  scope: ScopeType;
  permissions: PermissionCode[];
  createdAt: string;
  updatedAt: string;
  version?: number;
}

export interface PermissionCatalogItem {
  code: string;
  label: string;
  description: string;
  domain: string;
  available: boolean;
}

/** @deprecated Kept as a domain alias while old policy tests are migrated. */
export type QaPersona = LocalUser;

export interface FoundationSession {
  id: 'active-session';
  activeUserId: string;
  actingAdminUserId?: string;
  qaStartedAt?: string;
  /** Per-user reminder deferral; it never grants permissions or changes completion truth. */
  profileCompletionDeferredUntil?: string;
  signedOutAt?: string;
  switchedAt: string;
  version: number;
}

export type AuditCategory = 'session' | 'authorization' | 'data' | 'system';
export type AuditOutcome = 'success' | 'denied' | 'info';

export interface AuditEvent {
  id: string;
  sequence: number;
  companyId: string;
  category: AuditCategory;
  action: string;
  actorId: string;
  actorName: string;
  effectiveUserId: string;
  occurredAt: string;
  summary: string;
  reason?: string;
  outcome: AuditOutcome;
  correlationId: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface DomainEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  actorId: string;
  occurredAt: string;
  correlationId: string;
  payload: Record<string, unknown>;
}

export type UserNotificationKind = 'treasury_follow_up' | 'workflow' | 'system';

export interface UserNotification {
  id: string;
  userId: string;
  kind: UserNotificationKind;
  title: string;
  message: string;
  actorUserId?: string;
  relatedRecordId?: string;
  relatedModuleId?: string;
  dedupeKey?: string;
  createdAt: string;
  readAt?: string;
}

export interface PolicyDefinition {
  id: string;
  title: string;
  description: string;
  kind: 'scope' | 'resource' | 'workflow';
  version: number;
  enabled: boolean;
}

export type OperationalDomain = 'hr' | 'crm' | 'sales' | 'marketing' | 'catalog' | 'procurement' | 'supplier' | 'finance' | 'treasury' | 'accounting' | 'warehouse' | 'logistics' | 'service' | 'support' | 'contract' | 'asset' | 'task' | 'communications' | 'letter' | 'document' | 'workflow' | 'report';
export type RecordPriority = 'low' | 'normal' | 'high' | 'critical';
export type OperationalPayloadValue = string | number | boolean | null | OperationalPayloadValue[] | {[key: string]: OperationalPayloadValue};

export interface WorkflowTransitionDefinition {
  id: string;
  from: string[];
  to: string;
  label: string;
  permission: PermissionCode;
  reasonRequired?: boolean;
  makerChecker?: boolean;
  sensitive?: boolean;
  handoffModuleId?: string;
}

export type WorkflowStageScope = 'COMPANY' | 'UNIT' | 'BRANCH' | 'SELF';
export type WorkflowStageDecision = 'approve' | 'reject' | 'needs_correction' | 'return_previous' | 'handoff';
export type WorkflowStageAssignmentMode = 'role_queue' | 'specific_user' | 'branch_manager';

/**
 * Editable routing policy layered on top of the approved, immutable state machine.
 * Ordering, responsible roles, scope and allowed decisions are versioned. State
 * ids and transitions themselves remain owned by the product definition.
 */
export interface WorkflowApprovalStageDefinition {
  id: string;
  title: string;
  stateId: string;
  roleIds: string[];
  scope: WorkflowStageScope;
  decisions: WorkflowStageDecision[];
  required: boolean;
  allowSelfApproval: boolean;
  /** How the concrete user responsible for this stage is resolved at runtime. */
  assignmentMode?: WorkflowStageAssignmentMode;
  /** Required only when assignmentMode is specific_user. */
  assigneeUserId?: string;
  description?: string;
}

/**
 * A branch-specific routing override. The base approvalStages remain the
 * company-wide fallback. Active variants are matched by branch and priority;
 * the selected id is frozen on the operational record at creation time.
 */
export interface WorkflowRouteVariantDefinition {
  id: string;
  title: string;
  branchUnitIds: string[];
  priority: number;
  status: 'active' | 'inactive';
  /** Branch policy for employee self-service. Defaults to true for legacy routes. */
  allowSelfSubmission?: boolean;
  approvalStages: WorkflowApprovalStageDefinition[];
  description?: string;
}

export interface WorkflowDefinition {
  id: string;
  moduleId: string;
  title: string;
  version: number;
  status: 'draft' | 'published' | 'retired';
  initialState: string;
  stateLabels: Record<string, string>;
  transitions: WorkflowTransitionDefinition[];
  queueStrategy: 'owner' | 'assignee' | 'unit' | 'company';
  assignmentPolicy: string;
  approvalPolicyId?: string;
  approvalStages?: WorkflowApprovalStageDefinition[];
  routeVariants?: WorkflowRouteVariantDefinition[];
  /** Company-wide fallback for employee self-service. Defaults to true. */
  allowSelfSubmission?: boolean;
  changeSummary?: string;
  productDecisionRequired?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperationalRecord {
  id: string;
  moduleId: string;
  domain: OperationalDomain;
  trackingCode: string;
  title: string;
  description: string;
  status: string;
  priority: RecordPriority;
  companyId: string;
  unitId?: string;
  branchUnitId?: string;
  ownerPersonnelId?: string;
  assigneeUserId?: string;
  customerId?: string;
  relatedRecordId?: string;
  amountRial?: string;
  quantity?: string;
  dueAt?: string;
  slaDueAt?: string;
  createdByActorId: string;
  createdByUserId: string;
  updatedByActorId: string;
  /** نسخه گردش‌کاری که این پرونده با آن آغاز شده است؛ تا پایان عمر پرونده ثابت می‌ماند. */
  workflowVersion?: number;
  /** مسیر پایه یا استثنای شعبه‌ای انتخاب‌شده هنگام ایجاد؛ تا پایان پرونده ثابت است. */
  workflowRouteId?: string;
  version: number;
  payload: Record<string, OperationalPayloadValue>;
  createdAt: string;
  updatedAt: string;
}

export interface OperationalRecordHistory {
  id: string;
  recordId: string;
  moduleId: string;
  sequence: number;
  eventType: 'created' | 'edited' | 'transitioned' | 'assigned' | 'handoff' | 'comment' | 'corrected';
  fromState?: string;
  toState?: string;
  actorId: string;
  actorName: string;
  effectiveUserId: string;
  reason?: string;
  snapshot: Record<string, unknown>;
  occurredAt: string;
}

/** Raw identity-document content. It is intentionally excluded from FoundationState. */
export interface PersonnelDocumentFile {
  id: string;
  recordId: string;
  personnelId: string;
  companyId: string;
  mimeType: string;
  size: number;
  checksumSha256: string;
  dataUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationRequest {
  id: string;
  trackingCode: string;
  fullName: string;
  mobile: string;
  secondaryMobile: string;
  email?: string;
  nationalId: string;
  gender: PersonnelGender;
  province: string;
  city: string;
  address: string;
  postalCode?: string;
  bankName: string;
  cardNumber: string;
  requestedUsername: string;
  selfDeclaration: Record<string, string>;
  status: 'submitted' | 'in_review' | 'needs_correction' | 'approved' | 'rejected' | 'activated';
  reviewReason?: string;
  proposedRoleIds?: string[];
  proposedByUserId?: string;
  proposedAt?: string;
  activatedByUserId?: string;
  activatedAt?: string;
  linkedPersonnelId?: string;
  linkedUserId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface QaDatasetManifest {
  id: 'large-qa';
  status: 'empty' | 'generated';
  roleCount: number;
  userCount: number;
  generatedAt?: string;
  seed: string;
}

export interface ProjectionRecord {
  id: string;
  kind: 'module-counts' | 'queue-health' | 'inventory-balance' | 'general-ledger';
  rebuiltAt: string;
  version: number;
  data: Record<string, string | number | boolean>;
}

export interface MetaRecord {
  id: string;
  value: string | number | boolean;
}

export interface DemoResource {
  id: string;
  companyId: string;
  unitId?: string;
  teamId?: string;
  ownerId?: string;
  createdBy: string;
  state: string;
  allowedRecordActorIds?: string[];
}

export interface AuthorizationRequest {
  persona: QaPersona;
  permission: PermissionCode;
  resource?: DemoResource;
  action?: 'view' | 'create' | 'edit' | 'approve' | 'transition';
  targetState?: string;
  allowedTransitions?: Record<string, string[]>;
}

export interface AuthorizationDecision {
  allowed: boolean;
  code: string;
  reasonFa: string;
  permissionMatched: boolean;
  scopeMatched: boolean;
  policyMatched: boolean;
  workflowMatched: boolean;
}

export const FOUNDATION_STORES = [
  'meta',
  'users',
  'organizational_units',
  'organizational_positions',
  'security_roles',
  'personnel',
  'personnel_profile_change_requests',
  'sales_structures',
  'customers',
  'customer_imports',
  'qa_personas',
  'sessions',
  'policy_definitions',
  'audit_events',
  'domain_events',
  'notifications',
  'foundation_records',
  'workflow_definitions',
  'workflow_versions',
  'workflow_history',
  'registration_requests',
  'registration_reviews',
  'qa_dataset_manifests',
  'qa_scenario_runs',
  'projections',
  'idempotency_keys',
  'role_versions',
  'employment_contracts',
  'onboarding_cases',
  'offboarding_cases',
  'attendance_records',
  'shifts',
  'leave_requests',
  'missions',
  'overtime_requests',
  'employee_advances',
  'employee_loans',
  'performance_reviews',
  'training_records',
  'personnel_documents',
  'personnel_document_files',
  'recruitment_cases',
  'leads',
  'lead_assignments',
  'calls',
  'followups',
  'opportunities',
  'catalog_items',
  'price_lists',
  'campaigns',
  'promotions',
  'quotes',
  'sales',
  'invoices',
  'payments',
  'purchase_requests',
  'rfqs',
  'supplier_offers',
  'offer_comparisons',
  'purchase_orders',
  'suppliers',
  'supplier_invoices',
  'matching_records',
  'cost_centers',
  'budget_entries',
  'finance_requests',
  'bank_accounts',
  'treasury_executions',
  'chart_of_accounts',
  'accounting_periods',
  'journal_entries',
  'bank_reconciliations',
  'warehouses',
  'locations',
  'inventory_items',
  'inventory_movements',
  'receipts',
  'reservations',
  'transfers',
  'adjustments',
  'counts',
  'returns',
  'shipments',
  'deliveries',
  'service_cases',
  'service_evidence',
  'support_cases',
  'support_transactions',
  'contracts',
  'fixed_assets',
  'asset_transfers',
  'asset_maintenance',
  'tasks',
  'chats',
  'messages',
  'letters',
  'documents',
] as const;

export type FoundationStoreName = typeof FOUNDATION_STORES[number];

export interface SnapshotManifest {
  format: 'tapra2-local-snapshot';
  schemaVersion: number;
  seedVersion: string;
  exportedAt: string;
  checksum: string;
  stores: Record<FoundationStoreName, unknown[]>;
}

export interface EncryptedSnapshot {
  format: 'tapra2-local-snapshot-encrypted';
  version: 1;
  algorithm: 'AES-GCM';
  iterations: number;
  salt: string;
  iv: string;
  cipherText: string;
}

export interface FoundationState {
  users: LocalUser[];
  activeUser: LocalUser;
  session: FoundationSession;
  units: OrganizationalUnit[];
  positions: OrganizationalPosition[];
  roles: SecurityRole[];
  personnel: PersonnelRecord[];
  personnelProfileChangeRequests: PersonnelProfileChangeRequest[];
  salesStructures: SalesStructure[];
  customers: CustomerRecord[];
  customerImports: CustomerImportJob[];
  workflows: WorkflowDefinition[];
  workflowVersions: WorkflowDefinition[];
  operationalRecords: OperationalRecord[];
  operationalHistory: OperationalRecordHistory[];
  notifications: UserNotification[];
  registrationRequests: RegistrationRequest[];
  qaDataset: QaDatasetManifest;
  projections: ProjectionRecord[];
  audits: AuditEvent[];
  recordCount: number;
  lastPersistedAt: string;
}
