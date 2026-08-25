import {authorize, can, operationalRecordResource} from './authorization';
import type {
  AuditEvent, AuthorizationDecision, AuthorizationRequest, CustomerAddress, CustomerImportJob, CustomerPhone, CustomerRecord,
  DomainEvent, EncryptedSnapshot, FoundationSession, FoundationState, LocalUser, MetaRecord, OrganizationalPosition,
  OrganizationalUnit, PermissionCode, PersonnelMovement, PersonnelMovementKind, PersonnelProfileChangeField,
  PersonnelProfileChangeRequest, PersonnelProfileChangeValues, PersonnelRecord, SalesStructure, SecurityRole, SnapshotManifest, ScopeType, UserStatus,
  OperationalRecord, OperationalRecordHistory, RegistrationRequest, QaDatasetManifest, ProjectionRecord, WorkflowDefinition, WorkflowApprovalStageDefinition, WorkflowRouteVariantDefinition,
  FoundationStoreName, PersonnelDocumentFile, UserNotification,
} from './model';
import {FOUNDATION_SCHEMA_VERSION, FOUNDATION_SEED_VERSION, FOUNDATION_STORES} from './model';
import {
  COMPANY_ID, createSeedData, CUSTOMER_RECORDS, LOCAL_USERS, ORGANIZATIONAL_POSITIONS, ORGANIZATIONAL_UNITS,
  PERMISSION_CATALOG, PERSONNEL_RECORDS, resolveUserAccess, ROLE_TEMPLATES, SALES_STRUCTURES, SECURITY_ROLES,
} from './seed';
import {decryptSnapshot, encryptSnapshot, IndexedDBAdapter, type StorageAdapter, validateSnapshotShape} from './storage';
import {ERP_MODULES, ERP_OPERATIONAL_STORES, permissionFor, stateLabel} from './erpCatalog';
import {normalizeCardNumber, validateRequiredProfile, type ProfileCompletionInput} from './profileCompletion';
import {salesStructureHasAssignmentHistory, salesStructureSupervisorName} from './salesStructureIdentity';
import {positionIdForSalesHierarchy} from './salesPersonnelIdentity';
import {completeRequiredQaPersonnelRecords} from './qaPersonnelCompletion';
import {preparePurchaseRequestInput, purchasePayloadForRecord, readPurchaseRequestPayload} from './purchaseRequest';
import {canRequestTreasuryFollowUp, linkedTreasuryQueueRecords, treasuryFollowUpDedupeKey} from './purchaseFollowUp';
import {advanceBranchIds, canEmployeeAdvanceReviewerDecide, canProxyAdvance, canSelfSubmitAdvance, canUserTakeAdvanceStage, readEmployeeAdvancePayload, resolveAdvanceStageAssignee, type AdvanceDecision, type AdvanceStage, type EmployeeAdvanceInput} from './employeeAdvance';
import {isValidBankCard, isValidIranianLandline, isValidIranianMobile, isValidPostalCode} from '../utils/operationalFormat';
import {activeWorkflowFor, approvalStagesForRoute, defaultApprovalStages, roleIdsForWorkflowState, selectWorkflowRoute, validateWorkflowPolicy, workflowForRecord, workflowStageAllows} from './workflowPolicy';
import {createDefaultSalesCompensationRecord, validateSalesCompensationInput, type SalesCompensationInput} from './salesCompensation';
import {canRequestWorkforceForBranch, resolveWorkforceRequestScope} from './salesManagementScope';
import {normalizePositionUnitIds, positionSupportsUnit} from './unitPosition';
import {
  PERSONNEL_DOCUMENT_PERMISSION_MANAGE, PERSONNEL_DOCUMENT_PERMISSION_READ,
  activePersonnelDocuments, missingPersonnelDocuments, personnelDocumentDefinition,
  validatePersonnelDocumentFile, type PersonnelDocumentUploadInput,
} from './personnelDocuments';
import {
  assertDirectAccessAssignmentAllowed, assertProtectedRoleMutationAllowed, assertRoleDefinitionAllowed, PRIMARY_ADMIN_USER_ID,
  REGISTRATION_ASSIGNABLE_ROLE_IDS,
} from './accessPolicy';

export interface UnitInput {name: string; type: string; parentId?: string; managerUserId?: string; description: string;}
export interface PositionInput {title: string; description: string; unitIds?: string[];}
export interface UserInput {name: string; username: string; unitId: string; positionId: string; branchUnitId?: string; managerUserId?: string; roleIds: string[]; password?: string; personnelId?: string; permissionGrants?: PermissionCode[]; permissionDenials?: PermissionCode[];}
export interface SelfCredentialChangeInput {currentPassword: string; username: string; newPassword?: string;}
export interface RoleInput {name: string; description: string; scope: ScopeType; permissions: PermissionCode[];}
export type PersonnelInput = Omit<PersonnelRecord, 'id' | 'companyId' | 'createdAt' | 'updatedAt' | 'linkedUserId' | 'movements' | 'salesCompensationHistory' | 'lifecycleHistory' | 'pendingLifecycleChange'>;
export type {SalesCompensationInput} from './salesCompensation';
export interface PersonnelAssignmentChangeInput {kind: PersonnelMovementKind; targetId: string; targetPositionId?: string; effectiveDate: string; previousEndDate?: string; newStartDate?: string; reason: string;}
export interface PersonnelEndInput {effectiveDate: string; departureInitiator: 'employee' | 'organization'; reason: string; handoffNotes?: string;}
export interface PersonnelRehireInput {effectiveDate: string; reason: string; employmentType: string; unitId: string; positionId: string; branchUnitId?: string; managerPersonnelId?: string; roleIds: string[];}
export interface AssetCustodyInput {assetRecordId: string; personnelId: string; action: 'delivery' | 'return'; notes?: string;}
export interface LocalAssetCustodyChallenge {state: FoundationState; transferId: string; party: 'employee' | 'officer'; otp: string; expiresAt: string;}
export interface OwnAssetIssueInput {assetRecordId: string; issueType: 'damage' | 'lost' | 'other'; description: string;}
export type OffboardingClearanceArea = 'financial' | 'organizational';
export interface SalesStructureInput {branchUnitId: string; salesVicePersonnelId?: string; salesManagerPersonnelId: string; seniorSupervisorPersonnelId: string; callCenterSupervisorPersonnelId: string;}
export type CustomerInput = Omit<CustomerRecord, 'id' | 'displayName' | 'timeline' | 'createdAt' | 'updatedAt' | 'mergedIntoCustomerId'>;
export interface CustomerImportRow {type?: string; name: string; nationalId?: string; businessId?: string; phone?: string; email?: string; source?: string;}
export interface OperationalRecordInput {title: string; description?: string; priority?: OperationalRecord['priority']; unitId?: string; branchUnitId?: string; ownerPersonnelId?: string; assigneeUserId?: string; customerId?: string; relatedRecordId?: string; amountRial?: string; quantity?: string; dueAt?: string; payload?: OperationalRecord['payload'];}
export interface RecruitmentRequestInput {title: string; description: string; unitId: string; branchUnitId?: string; positionTitle: string; requestedHeadcount: string; employmentType: string; neededDate?: string; salaryRangeRial?: string; requestReason: string; proxyReason?: string;}
export interface RegistrationInput {fullName: string; mobile: string; secondaryMobile: string; email?: string; nationalId: string; gender: PersonnelRecord['gender']; province: string; city: string; address: string; postalCode?: string; bankName: string; cardNumber: string; requestedUsername: string; selfDeclaration?: Record<string, string>;}
export interface LocalSmsPreview {maskedMobile: string; message: string; verificationCode?: string;}
export interface OwnProfileChangeInput {requestedValues: PersonnelProfileChangeValues; reason: string;}
export type PurchaseRequestDecision = 'approve_and_forward' | 'needs_correction' | 'rejected';
export interface TreasuryPaymentInput {
  paidAt: string;
  paymentReference: string;
  note: string;
  receipt?: {id: string; fileName: string; mimeType: string; size: number; dataUrl: string};
}

function newId(prefix: string): string { return `${prefix}-${crypto.randomUUID()}`; }
function currentLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const HR_EXIT_ROLE_IDS = new Set(['role-hr-operator', 'role-hr-manager', 'role-personnel-reviewer']);
function canReviewEmploymentEnd(user: LocalUser): boolean {
  return user.isAdmin || user.roleIds.some((roleId) => HR_EXIT_ROLE_IDS.has(roleId));
}
function isPersonnelSupervisor(user: LocalUser, personnel: PersonnelRecord): boolean {
  return Boolean(user.personnelId && user.personnelId !== personnel.id && (personnel.managerPersonnelId === user.personnelId || personnel.salesSupervisorPersonnelId === user.personnelId));
}

function createLocalOtp(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(100000 + (bytes[0] % 900000));
}

async function hashLocalOtp(transferId: string, party: 'employee' | 'officer', otp: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${transferId}:${party}:${otp}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const PROFILE_CHANGE_FIELDS: PersonnelProfileChangeField[] = [
  'firstName', 'lastName', 'fatherName', 'nationalId', 'identityNumber', 'birthDate', 'birthPlace', 'gender', 'maritalStatus',
  'primaryMobile', 'secondaryMobile', 'phone', 'personalEmail', 'province', 'city', 'address', 'postalCode',
  'bankName', 'accountNumber', 'cardNumber', 'iban', 'emergencyName', 'emergencyRelation', 'emergencyPhone',
];
const PROFILE_BANKING_FIELDS = new Set<PersonnelProfileChangeField>(['bankName', 'accountNumber', 'cardNumber', 'iban']);

function normalizeProfileChangeValues(values: PersonnelProfileChangeValues): PersonnelProfileChangeValues {
  const normalized: PersonnelProfileChangeValues = {};
  for (const field of PROFILE_CHANGE_FIELDS) {
    if (!(field in values)) continue;
    const raw = String(values[field] ?? '').trim();
    if (field === 'nationalId') normalized[field] = normalizeNationalId(raw);
    else if (['primaryMobile', 'secondaryMobile', 'phone', 'emergencyPhone'].includes(field)) normalized[field] = normalizePhone(raw);
    else if (field === 'cardNumber') normalized[field] = normalizeCardNumber(raw);
    else if (field === 'postalCode' || field === 'accountNumber') normalized[field] = normalizeDigits(raw).replace(/\D/g, '');
    else if (field === 'iban') normalized[field] = normalizeIban(raw);
    else if (field === 'personalEmail') normalized[field] = raw.toLowerCase();
    else normalized[field] = raw;
  }
  return normalized;
}

function validateSelfServiceProfile(personnel: PersonnelRecord, allPersonnel: PersonnelRecord[], excludeId: string): void {
  if (personnel.firstName.trim().length < 2) throw new Error('نام باید حداقل ۲ نویسه داشته باشد.');
  if (personnel.lastName.trim().length < 2) throw new Error('نام خانوادگی باید حداقل ۲ نویسه داشته باشد.');
  if (normalizeNationalId(personnel.nationalId).length !== 10) throw new Error('کد ملی الزامی است و باید ۱۰ رقم باشد.');
  if (!isValidIranianNationalId(personnel.nationalId)) throw new Error('کد ملی معتبر نیست.');
  if (personnel.gender === 'unspecified') throw new Error('جنسیت باید مشخص باشد.');
  const primaryMobile = normalizePhone(personnel.primaryMobile);
  const secondaryMobile = normalizePhone(personnel.secondaryMobile);
  if (!/^09\d{9}$/.test(primaryMobile)) throw new Error('شماره همراه اصلی معتبر نیست.');
  if (!/^09\d{9}$/.test(secondaryMobile)) throw new Error('شماره تماس دوم معتبر نیست.');
  if (primaryMobile === secondaryMobile) throw new Error('شماره همراه اصلی و شماره تماس دوم باید متفاوت باشند.');
  if (!personnel.province?.trim()) throw new Error('استان الزامی است.');
  if (!personnel.city?.trim()) throw new Error('شهر الزامی است.');
  if (!personnel.address?.trim()) throw new Error('نشانی الزامی است.');
  if (personnel.postalCode && !isValidPostalCode(personnel.postalCode)) throw new Error('کد پستی باید دقیقاً ۱۰ رقم باشد.');
  if (!personnel.bankName?.trim()) throw new Error('نام بانک الزامی است.');
  const cardNumber = normalizeCardNumber(personnel.cardNumber ?? '');
  if (cardNumber.length !== 16) throw new Error('شماره کارت باید ۱۶ رقم باشد.');
  if (personnel.personalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personnel.personalEmail)) throw new Error('ایمیل شخصی معتبر نیست.');
  if (personnel.iban && !/^IR\d{24}$/.test(normalizeIban(personnel.iban))) throw new Error('شماره شبا باید با IR و ۲۴ رقم وارد شود.');
  if (allPersonnel.some((person) => person.id !== excludeId && normalizeNationalId(person.nationalId) === normalizeNationalId(personnel.nationalId))) throw new Error('این کد ملی قبلاً برای پرونده دیگری ثبت شده است.');
  const usedMobiles = new Set(allPersonnel.filter((person) => person.id !== excludeId).flatMap((person) => [normalizePhone(person.primaryMobile), normalizePhone(person.secondaryMobile)]).filter(Boolean));
  if (usedMobiles.has(primaryMobile) || usedMobiles.has(secondaryMobile)) throw new Error('یکی از شماره‌های همراه قبلاً برای پرونده دیگری ثبت شده است.');
}

export class LocalFoundationService {
  private readonly lifecycleExecutionToken = Symbol('approved-personnel-lifecycle');
  constructor(private readonly storage: StorageAdapter = new IndexedDBAdapter()) {}

  async initialize(): Promise<FoundationState> {
    const seedVersion = await this.storage.get<MetaRecord>('meta', 'seedVersion');
    if (!seedVersion) {
      await this.storage.replaceAll(createSeedData());
    } else {
      const [users, units, positions, roles, personnel, customers] = await Promise.all([
        this.storage.getAll<LocalUser>('users'), this.storage.getAll<OrganizationalUnit>('organizational_units'),
        this.storage.getAll<OrganizationalPosition>('organizational_positions'), this.storage.getAll<SecurityRole>('security_roles'),
        this.storage.getAll<PersonnelRecord>('personnel'), this.storage.getAll<CustomerRecord>('customers'),
      ]);
      if (!users.length || !units.length || !positions.length || !roles.length || !personnel.length || !customers.length || seedVersion.value !== FOUNDATION_SEED_VERSION) {
        await this.migrateLocalFoundation();
      }
    }
    await this.applyDuePersonnelLifecycleChanges();
    return this.loadState();
  }

  private async applyDuePersonnelLifecycleChanges(): Promise<void> {
    const state = await this.loadState();
    const today = currentLocalDate();
    for (const person of state.personnel) {
      const pending = person.pendingLifecycleChange;
      if (!pending || pending.effectiveDate > today) continue;
      const now = new Date().toISOString();
      const linkedUser = state.users.find((user) => user.id === person.linkedUserId);
      const auditUser = state.users.find((user) => user.actorId === pending.scheduledByActorId) ?? state.users.find((user) => user.isAdmin) ?? state.activeUser;
      const correlationId = newId('correlation');
      if (pending.kind === 'end') {
        const event = {
          id: newId('employment-event'), kind: 'employment_ended' as const, effectiveDate: pending.effectiveDate,
          reason: pending.reason, handoffNotes: pending.handoffNotes, departureInitiator: pending.departureInitiator, actorId: pending.scheduledByActorId,
          actorName: pending.scheduledByActorName, recordedAt: now, previousEmploymentType: person.employmentType,
          roleIds: linkedUser?.roleIds ?? [],
        };
        const updatedPerson: PersonnelRecord = {...person, employmentStatus: 'ended', endDate: pending.effectiveDate, pendingLifecycleChange: undefined, lifecycleHistory: [...(person.lifecycleHistory ?? []), event], updatedAt: now};
        const openCase = state.operationalRecords.find((record) => record.moduleId === 'offboarding' && record.ownerPersonnelId === person.id && !['completed', 'cancelled'].includes(record.status));
        const module = ERP_MODULES.find((item) => item.id === 'offboarding'); if (!module) throw new Error('گردش خروج در سامانه فعال نیست.');
        const pendingAssets = state.operationalRecords.filter((record) => record.moduleId === 'fixed-asset' && record.payload.custodianPersonnelId === person.id && record.status !== 'disposed');
        const assetOfficer = state.users.find((user) => user.status === 'active' && user.roleIds.includes('role-asset-manager'));
        const offboarding: OperationalRecord = openCase
          ? {...openCase, status: 'offboarding', assigneeUserId: assetOfficer?.id ?? auditUser.id, updatedByActorId: auditUser.actorId, version: openCase.version + 1, payload: {...openCase.payload, employmentEndDate: pending.effectiveDate, employmentEndReason: pending.reason, departureInitiator: pending.departureInitiator ?? openCase.payload.departureInitiator ?? 'organization', accountClosureStatus: 'disabled', assetClearanceStatus: pendingAssets.length ? 'pending' : 'clear', pendingAssetIds: pendingAssets.map((asset) => asset.id), handoffStatus: pending.handoffNotes?.trim() ? 'documented' : 'pending', organizationalClearanceStatus: 'pending', financialClearanceStatus: 'pending', currentWaitingFor: pendingAssets.length ? 'عودت دارایی‌ها و اموال' : 'تسویه مالی و سازمانی'}, updatedAt: now}
          : {id: newId('offboarding'), moduleId: 'offboarding', domain: 'hr', trackingCode: `${module.prefix}-${new Date().getFullYear()}-${String(state.operationalRecords.filter((record) => record.moduleId === 'offboarding').length + 1).padStart(4, '0')}`, title: `تسویه و خروج ${person.firstName} ${person.lastName}`, description: pending.handoffNotes?.trim() ?? '', status: 'offboarding', priority: 'normal', companyId: auditUser.companyId, unitId: person.unitId, branchUnitId: person.branchUnitId, ownerPersonnelId: person.id, assigneeUserId: assetOfficer?.id ?? auditUser.id, createdByActorId: auditUser.actorId, createdByUserId: auditUser.id, updatedByActorId: auditUser.actorId, workflowVersion: activeWorkflowFor(state, module).version, version: 1, payload: {personnelId: person.id, personnelCode: person.personnelCode, employmentEndDate: pending.effectiveDate, employmentEndReason: pending.reason, departureInitiator: pending.departureInitiator ?? 'organization', accountClosureStatus: 'disabled', assetClearanceStatus: pendingAssets.length ? 'pending' : 'clear', pendingAssetIds: pendingAssets.map((asset) => asset.id), handoffStatus: pending.handoffNotes?.trim() ? 'documented' : 'pending', organizationalClearanceStatus: 'pending', financialClearanceStatus: 'pending', currentWaitingFor: pendingAssets.length ? 'عودت دارایی‌ها و اموال' : 'تسویه مالی و سازمانی'}, createdAt: now, updatedAt: now};
        const history: OperationalRecordHistory = openCase
          ? this.makeHistory(state, offboarding, auditUser, 'transitioned', {fromState: openCase.status, toState: 'offboarding', reason: pending.reason, snapshot: {personnelId: person.id, pendingAssetIds: pendingAssets.map((asset) => asset.id)}})
          : {id: newId('history'), recordId: offboarding.id, moduleId: offboarding.moduleId, sequence: 1, eventType: 'created', actorId: auditUser.actorId, actorName: auditUser.name, effectiveUserId: auditUser.id, reason: pending.reason, snapshot: {personnelId: person.id, pendingAssetIds: pendingAssets.map((asset) => asset.id)}, occurredAt: now};
        await this.storage.transaction(['personnel', 'users', 'offboarding_cases', 'workflow_history', 'audit_events', 'domain_events', 'meta'], 'readwrite', async (tx) => {
          const latestPerson = await tx.get<PersonnelRecord>('personnel', person.id);
          if (!latestPerson || latestPerson.updatedAt !== person.updatedAt || latestPerson.pendingLifecycleChange?.scheduledAt !== pending.scheduledAt) return;
          if (openCase) {
            const latestCase = await tx.get<OperationalRecord>('offboarding_cases', openCase.id);
            if (!latestCase || latestCase.version !== openCase.version) throw new Error('پرونده خروج هم‌زمان تغییر کرده است؛ اجرای زمان‌بندی‌شده دوباره تلاش خواهد شد.');
          }
          const audits = await tx.getAll<AuditEvent>('audit_events');
          await tx.put('personnel', updatedPerson);
          if (linkedUser) {const currentUser=await tx.get<LocalUser>('users',linkedUser.id);if(!currentUser)throw new Error('حساب مرتبط پیدا نشد؛ اجرای زمان‌بندی دوباره تلاش خواهد شد.');if(currentUser.isAdmin)throw new Error('پایان همکاری زمان‌بندی‌شده برای حساب ادمین اصلی خودکار اجرا نمی‌شود.');await tx.put('users',{...currentUser,status:'inactive'});}
          await tx.put('offboarding_cases', offboarding);
          await tx.put('workflow_history', history);
          await tx.put('audit_events', {id: newId('audit'), sequence: nextSequence(audits), companyId: auditUser.companyId, category: 'system', action: 'organization.personnel.employment_ended_automatically', actorId: auditUser.actorId, actorName: auditUser.name, effectiveUserId: auditUser.id, occurredAt: now, summary: `پایان همکاری زمان‌بندی‌شده «${person.firstName} ${person.lastName}» اجرا شد.`, outcome: 'success', correlationId, metadata: {personnelId: person.id, effectiveDate: pending.effectiveDate, offboardingRecordId: offboarding.id}} satisfies AuditEvent);
          await tx.put('domain_events', {id: newId('event'), aggregateType: 'personnel-lifecycle', aggregateId: person.id, eventType: 'employment_ended_automatically', actorId: auditUser.actorId, occurredAt: now, correlationId, payload: {effectiveDate: pending.effectiveDate, offboardingRecordId: offboarding.id}} satisfies DomainEvent);
          await tx.put('meta', {id: 'lastPersistedAt', value: now});
        });
      } else {
        const roleIds = pending.roleIds ?? [];
        const event = {
          id: newId('employment-event'), kind: 'rehired' as const, effectiveDate: pending.effectiveDate,
          reason: pending.reason, actorId: pending.scheduledByActorId, actorName: pending.scheduledByActorName,
          recordedAt: now, employmentType: pending.employmentType, unitId: pending.unitId,
          positionId: pending.positionId, branchUnitId: pending.branchUnitId, managerPersonnelId: pending.managerPersonnelId,
          roleIds,
        };
        const updatedPerson: PersonnelRecord = {
          ...person, employmentStatus: 'active', startDate: pending.effectiveDate, endDate: undefined,
          employmentType: pending.employmentType ?? person.employmentType, unitId: pending.unitId ?? person.unitId,
          positionId: pending.positionId ?? person.positionId, branchUnitId: pending.branchUnitId,
          managerPersonnelId: pending.managerPersonnelId, pendingLifecycleChange: undefined,
          lifecycleHistory: [...(person.lifecycleHistory ?? []), event], updatedAt: now,
        };
        await this.storage.transaction(['personnel', 'users', 'security_roles', 'audit_events', 'domain_events', 'meta'], 'readwrite', async (tx) => {
          const latestPerson = await tx.get<PersonnelRecord>('personnel', person.id);
          if (!latestPerson || latestPerson.updatedAt !== person.updatedAt || latestPerson.pendingLifecycleChange?.scheduledAt !== pending.scheduledAt) return;
          const [currentUsers,currentRoles,audits]=await Promise.all([tx.getAll<LocalUser>('users'),tx.getAll<SecurityRole>('security_roles'),tx.getAll<AuditEvent>('audit_events')]);
          let updatedUser:LocalUser|undefined;
          if(linkedUser){const currentUser=currentUsers.find((user)=>user.id===linkedUser.id);if(!currentUser)throw new Error('حساب مرتبط پیدا نشد؛ اجرای زمان‌بندی دوباره تلاش خواهد شد.');if(roleIds.some((roleId)=>!currentRoles.some((role)=>role.id===roleId&&role.status==='active')))throw new Error('یکی از نقش‌های بازگشت به همکاری تغییر کرده یا غیرفعال شده است.');assertDirectAccessAssignmentAllowed(auditUser,currentUser,roleIds,[],[],currentRoles,state.session.actingAdminUserId);const managerUserId=currentUsers.find((user)=>user.personnelId===updatedPerson.managerPersonnelId)?.id;const roleId=roleIds[0]??currentUser.roleId;updatedUser=resolveUserAccess({...currentUser,status:'active',roleId,roleIds,unitId:updatedPerson.unitId,positionId:updatedPerson.positionId,branchUnitId:updatedPerson.branchUnitId,managerUserId},currentRoles);}
          await tx.put('personnel', updatedPerson);
          if (updatedUser) await tx.put('users', updatedUser);
          await tx.put('audit_events', {id: newId('audit'), sequence: nextSequence(audits), companyId: auditUser.companyId, category: 'system', action: 'organization.personnel.rehired_automatically', actorId: auditUser.actorId, actorName: auditUser.name, effectiveUserId: auditUser.id, occurredAt: now, summary: `بازگشت به همکاری زمان‌بندی‌شده «${person.firstName} ${person.lastName}» اجرا شد.`, outcome: 'success', correlationId, metadata: {personnelId: person.id, effectiveDate: pending.effectiveDate, roleIds: roleIds.join(',')}} satisfies AuditEvent);
          await tx.put('domain_events', {id: newId('event'), aggregateType: 'personnel-lifecycle', aggregateId: person.id, eventType: 'rehired_automatically', actorId: auditUser.actorId, occurredAt: now, correlationId, payload: {effectiveDate: pending.effectiveDate, roleIds}} satisfies DomainEvent);
          await tx.put('meta', {id: 'lastPersistedAt', value: now});
        });
      }
    }
  }

  private async ensureOffboardingCase(personnel: PersonnelRecord, actorUserId: string | undefined, effectiveDate: string, reason: string, handoffNotes?: string, departureInitiator?: 'employee' | 'organization'): Promise<void> {
    const state = await this.loadState();
    const module = ERP_MODULES.find((item) => item.id === 'offboarding'); if (!module) return;
    const actor = state.users.find((user) => user.id === actorUserId) ?? state.users.find((user) => user.isAdmin) ?? state.activeUser;
    const assetOfficer = state.users.find((user) => user.status === 'active' && user.roleIds.includes('role-asset-manager'));
    const pendingAssets = state.operationalRecords.filter((record) => record.moduleId === 'fixed-asset' && record.payload.custodianPersonnelId === personnel.id && record.status !== 'disposed');
    const openCase = state.operationalRecords.find((record) => record.moduleId === 'offboarding' && record.ownerPersonnelId === personnel.id && !['completed', 'cancelled'].includes(record.status));
    if (openCase && !['requested', 'scheduled'].includes(openCase.status)) return;
    if (openCase) {
      const now = new Date().toISOString();
      const updated: OperationalRecord = {...openCase, status: 'offboarding', assigneeUserId: assetOfficer?.id ?? actor.id, updatedByActorId: actor.actorId, version: openCase.version + 1, payload: {...openCase.payload, employmentEndDate: effectiveDate, employmentEndReason: reason, departureInitiator: departureInitiator ?? openCase.payload.departureInitiator ?? 'organization', accountClosureStatus: 'disabled', assetClearanceStatus: pendingAssets.length ? 'pending' : 'clear', pendingAssetIds: pendingAssets.map((asset) => asset.id), handoffStatus: handoffNotes?.trim() ? 'documented' : 'pending', organizationalClearanceStatus: 'pending', financialClearanceStatus: 'pending', currentWaitingFor: pendingAssets.length ? 'عودت دارایی‌ها و اموال' : 'تسویه مالی و سازمانی', approvedAt: openCase.payload.approvedAt ?? now}, updatedAt: now};
      const history = this.makeHistory(state, updated, actor, 'transitioned', {fromState: openCase.status, toState: 'offboarding', reason, snapshot: {personnelId: personnel.id, pendingAssetIds: pendingAssets.map((asset) => asset.id), accountClosureStatus: 'disabled'}});
      await this.persistOperationalChange(module.store, updated, history, actor, 'started', `فرایند اجرایی خروج «${personnel.firstName} ${personnel.lastName}» پس از تأیید منابع انسانی آغاز شد.`, reason);
      return;
    }
    const existing = state.operationalRecords.filter((record) => record.moduleId === 'offboarding'); const workflow = activeWorkflowFor(state, module); const now = new Date().toISOString();
    const record: OperationalRecord = {id: newId('offboarding'), moduleId: 'offboarding', domain: 'hr', trackingCode: `${module.prefix}-${new Date().getFullYear()}-${String(existing.length + 1).padStart(4, '0')}`, title: `تسویه و خروج ${personnel.firstName} ${personnel.lastName}`, description: handoffNotes?.trim() ?? '', status: 'offboarding', priority: 'normal', companyId: actor.companyId, unitId: personnel.unitId, branchUnitId: personnel.branchUnitId, ownerPersonnelId: personnel.id, assigneeUserId: assetOfficer?.id ?? actor.id, createdByActorId: actor.actorId, createdByUserId: actor.id, updatedByActorId: actor.actorId, workflowVersion: workflow.version, version: 1, payload: {personnelId: personnel.id, personnelCode: personnel.personnelCode, employmentEndDate: effectiveDate, employmentEndReason: reason, departureInitiator: departureInitiator ?? 'organization', accountClosureStatus: 'disabled', assetClearanceStatus: pendingAssets.length ? 'pending' : 'clear', pendingAssetIds: pendingAssets.map((asset) => asset.id), handoffStatus: handoffNotes?.trim() ? 'documented' : 'pending', organizationalClearanceStatus: 'pending', financialClearanceStatus: 'pending', currentWaitingFor: pendingAssets.length ? 'عودت دارایی‌ها و اموال' : 'تسویه مالی و سازمانی'}, createdAt: now, updatedAt: now};
    const history: OperationalRecordHistory = {id: newId('history'), recordId: record.id, moduleId: record.moduleId, sequence: 1, eventType: 'created', actorId: actor.actorId, actorName: actor.name, effectiveUserId: actor.id, reason, snapshot: {personnelId: personnel.id, pendingAssetIds: pendingAssets.map((asset) => asset.id), accountClosureStatus: 'disabled'}, occurredAt: now};
    await this.persistOperationalChange(module.store, record, history, actor, 'created', `پرونده تسویه و خروج «${personnel.firstName} ${personnel.lastName}» با ${pendingAssets.length.toLocaleString('en-US')} دارایی در انتظار عودت ایجاد شد.`);
  }

  private async migrateLocalFoundation(): Promise<void> {
    const now = new Date().toISOString();
    const seeded = createSeedData() as Record<FoundationStoreName, unknown[]>;
    const seededRecruitmentRecords = seeded.recruitment_cases as OperationalRecord[];
    const seededRecruitmentHistory = (seeded.workflow_history as OperationalRecordHistory[]).filter((item) => item.moduleId === 'recruitment-case');
    const seededWorkflowDefinitions = seeded.workflow_definitions as WorkflowDefinition[];
    const seededWorkflowVersions = seeded.workflow_versions as WorkflowDefinition[];
    const existingEntries = await this.storage.transaction([...FOUNDATION_STORES], 'readonly', (tx) =>
      Promise.all(FOUNDATION_STORES.map(async (store) => [store, await tx.getAll(store)] as const)),
    );
    const existing = Object.fromEntries(existingEntries) as Record<FoundationStoreName, unknown[]>;
    const migrationBasePersistedAt = (existing.meta as MetaRecord[]).find((item) => item.id === 'lastPersistedAt')?.value;
    for (const store of FOUNDATION_STORES) if (existing[store].length) seeded[store] = existing[store];
    const priorWorkflowDefinitions = existing.workflow_definitions as WorkflowDefinition[];
    seeded.workflow_definitions = [
      ...priorWorkflowDefinitions,
      ...seededWorkflowDefinitions.filter((candidate) => !priorWorkflowDefinitions.some((workflow) => workflow.moduleId === candidate.moduleId)),
    ];
    const priorWorkflowVersions = existing.workflow_versions as WorkflowDefinition[];
    seeded.workflow_versions = [
      ...priorWorkflowVersions,
      ...seededWorkflowVersions.filter((candidate) => !priorWorkflowVersions.some((workflow) => workflow.moduleId === candidate.moduleId && workflow.version === candidate.version)),
    ];
    const priorRecruitmentRecords = existing.recruitment_cases as OperationalRecord[];
    seeded.recruitment_cases = [
      ...priorRecruitmentRecords,
      ...seededRecruitmentRecords.filter((seedRecord) => !priorRecruitmentRecords.some((record) => record.id === seedRecord.id)),
    ];
    const migratedRecruitmentIds = new Set((seeded.recruitment_cases as OperationalRecord[]).map((record) => record.id));
    const priorWorkflowHistory = existing.workflow_history as OperationalRecordHistory[];
    seeded.workflow_history = [
      ...priorWorkflowHistory.filter((item) => !seededRecruitmentHistory.some((seedItem) => seedItem.id === item.id)),
      ...seededRecruitmentHistory.filter((item) => migratedRecruitmentIds.has(item.recordId)),
    ];

    const priorRoles = existing.security_roles as SecurityRole[];
    const customRoles = priorRoles.filter((role) => role.id !== 'role-seller' && !SECURITY_ROLES.some((template) => template.id === role.id));
    const securityPatchedRoleIds = new Set(['role-admin','role-system-admin','role-user-manager','role-registration-reviewer','role-workflow-admin','role-auditor']);
    seeded.security_roles = [...SECURITY_ROLES.map((template) => {
      const prior = priorRoles.find((role) => role.id === template.id);
      if (!prior) return {...template, version: 1};
      return securityPatchedRoleIds.has(template.id)
        ? {...prior, protected: template.protected, permissions: [...template.permissions], version:(prior.version??1)+1, updatedAt:now}
        : {...template, ...prior, version:prior.version??1};
    }), ...customRoles];
    const priorUnits = existing.organizational_units as OrganizationalUnit[];
    const customUnits = priorUnits.filter((unit) => !ORGANIZATIONAL_UNITS.some((template) => template.id === unit.id));
    seeded.organizational_units = [...ORGANIZATIONAL_UNITS.map((template) => {
      const prior = priorUnits.find((unit) => unit.id === template.id);
      return prior ? {...template, ...prior, name: template.name, type: template.type, parentId: template.parentId, order: template.order, updatedAt: now} : template;
    }), ...customUnits];
    const priorPositions = existing.organizational_positions as OrganizationalPosition[];
    const customPositions = priorPositions.filter((position) => !ORGANIZATIONAL_POSITIONS.some((template) => template.id === position.id));
    const migratedUnits = seeded.organizational_units as OrganizationalUnit[];
    const fallbackUnitIds = migratedUnits.filter((unit) => unit.status === 'active' && unit.type !== 'شعبه').map((unit) => unit.id);
    const positionPriorPersonnel = existing.personnel as PersonnelRecord[];
    const positionPriorUsers = existing.users as LocalUser[];
    const inferredUnitIds = (positionId: string) => normalizePositionUnitIds([
      ...positionPriorPersonnel.filter((person) => person.positionId === positionId).map((person) => person.unitId),
      ...positionPriorUsers.filter((user) => user.positionId === positionId).map((user) => user.unitId ?? ''),
    ]);
    seeded.organizational_positions = [...ORGANIZATIONAL_POSITIONS.map((template) => {
      const prior = priorPositions.find((position) => position.id === template.id);
      return prior ? {...prior, ...template, unitIds: [...template.unitIds], updatedAt: now} : {...template, unitIds: [...template.unitIds]};
    }), ...customPositions.map((position) => ({...position, unitIds: normalizePositionUnitIds(position.unitIds?.length ? position.unitIds : inferredUnitIds(position.id).length ? inferredUnitIds(position.id) : fallbackUnitIds)}))];
    const roles = seeded.security_roles as SecurityRole[];
    seeded.workflow_definitions = (seeded.workflow_definitions as WorkflowDefinition[]).map((workflow) => {
      const catalogWorkflow = ERP_MODULES.find((module) => module.id === workflow.moduleId)?.workflow;
      const approvalStages = workflow.approvalStages?.length ? workflow.approvalStages : defaultApprovalStages(workflow, roles);
      const migratedStages = workflow.moduleId === 'employee-advance'
        ? approvalStages.map((stage) => ({
          ...stage,
          scope: stage.stateId === 'branch_review' || stage.stateId === 'final_review' ? 'BRANCH' as const : stage.scope,
          assignmentMode: stage.assignmentMode ?? (stage.stateId === 'branch_review' ? 'branch_manager' as const : 'role_queue' as const),
          decisions: stage.stateId === 'final_review' && !stage.decisions.includes('return_previous')
            ? [...stage.decisions, 'return_previous' as const]
            : stage.decisions,
        }))
        : approvalStages;
      const routeVariants = workflow.routeVariants?.map((route) => ({
        ...route,
        allowSelfSubmission: route.allowSelfSubmission ?? true,
        approvalStages: route.approvalStages.map((stage) => ({
          ...stage,
          scope: stage.stateId === 'branch_review' || stage.stateId === 'final_review' ? 'BRANCH' as const : stage.scope,
          assignmentMode: stage.assignmentMode ?? (stage.stateId === 'branch_review' ? 'branch_manager' as const : 'role_queue' as const),
        })),
      }));
      return {...workflow, title: catalogWorkflow?.title ?? workflow.title, allowSelfSubmission: workflow.allowSelfSubmission ?? true, approvalStages: migratedStages, routeVariants, updatedAt: now};
    });
    seeded.workflow_versions = (seeded.workflow_versions as WorkflowDefinition[]).map((workflow) => {
      const catalogWorkflow = ERP_MODULES.find((module) => module.id === workflow.moduleId)?.workflow;
      return {...workflow, title: catalogWorkflow?.title ?? workflow.title};
    });
    const workflowVersionByModule = new Map((seeded.workflow_definitions as WorkflowDefinition[]).map((workflow) => [workflow.moduleId, workflow.version]));
    for (const store of ERP_OPERATIONAL_STORES) {
      seeded[store] = (seeded[store] as OperationalRecord[]).map((record) => record.workflowVersion
        ? record
        : {...record, workflowVersion: workflowVersionByModule.get(record.moduleId) ?? 1});
    }
    const priorPersonnel = existing.personnel as PersonnelRecord[];
    const customPersonnel = priorPersonnel.filter((person) => !PERSONNEL_RECORDS.some((template) => template.id === person.id));
    const mergedPersonnel = [...PERSONNEL_RECORDS.map((template) => {
      const prior = priorPersonnel.find((person) => person.id === template.id);
      if (!prior) return template;
      return {
        ...template,
        ...prior,
        // New required profile fields are backfilled only when an older seeded
        // record has no meaningful value. Real values entered by the user win.
        gender: prior.gender && prior.gender !== 'unspecified' ? prior.gender : template.gender,
        secondaryMobile: prior.secondaryMobile?.trim() || template.secondaryMobile,
        province: prior.province?.trim() || template.province,
        city: prior.city?.trim() || template.city,
        address: prior.address?.trim() || template.address,
        bankName: prior.bankName?.trim() || template.bankName,
        cardNumber: prior.cardNumber?.trim() || template.cardNumber,
        salesAssignmentStartDate: prior.salesAssignmentStartDate || template.salesAssignmentStartDate || (prior.salesHierarchyLevel ? prior.startDate : undefined),
        // Seed upgrades may add an account to an existing deterministic
        // personnel record. Preserve a real link, otherwise adopt the new one
        // so the user can sign in without resetting IndexedDB.
        linkedUserId: prior.linkedUserId || template.linkedUserId,
        updatedAt: prior.updatedAt ?? now,
      };
    }), ...customPersonnel].map((person) => {
      const salesAssignmentStartDate = person.salesHierarchyLevel ? person.salesAssignmentStartDate || person.startDate : undefined;
      const primaryUnitIsSales = person.unitId === 'unit-sales';
      const synchronized = person.salesHierarchyLevel ? {...person, ...(primaryUnitIsSales ? {positionId: positionIdForSalesHierarchy(person.salesHierarchyLevel)!} : {}), salesAssignmentStartDate, salesBranchUnitId: person.branchUnitId} : {...person, salesAssignmentStartDate: undefined};
      if (synchronized.salesCompensationHistory?.length) {
        const initialId = `sales-compensation-${synchronized.id}-initial`;
        return {...synchronized, salesCompensationHistory: synchronized.salesCompensationHistory.map((item) => item.id === initialId ? {...item, effectiveFrom: salesAssignmentStartDate || synchronized.startDate} : item)};
      }
      const initialCompensation = createDefaultSalesCompensationRecord(synchronized, synchronized.createdAt || now);
      return initialCompensation ? {...synchronized, salesCompensationHistory: [initialCompensation]} : synchronized;
    });
    const registrationRequests = existing.registration_requests as RegistrationRequest[];
    seeded.personnel = completeRequiredQaPersonnelRecords(mergedPersonnel, registrationRequests.map((item) => item.nationalId), registrationRequests.flatMap((item) => [item.mobile, item.secondaryMobile]));
    // Add newly approved deterministic sales paths while preserving every
    // locally edited or custom path and its assignment history.
    const priorSalesStructures = existing.sales_structures as Array<SalesStructure & {name?: string}>;
    const customSalesStructures = priorSalesStructures.filter((structure) => !SALES_STRUCTURES.some((template) => template.id === structure.id));
    seeded.sales_structures = [
      ...SALES_STRUCTURES.map((template) => {
        const prior = priorSalesStructures.find((structure) => structure.id === template.id);
        const merged = prior ? {...template, ...prior} : template;
        const {name: _legacyName, ...structure} = merged as SalesStructure & {name?: string};
        return structure;
      }),
      ...customSalesStructures.map(({name: _legacyName, ...structure}) => structure),
    ];
    const migratedPersonnel = seeded.personnel as PersonnelRecord[];
    const priorUsers = existing.users as LocalUser[];
    const customUsers = priorUsers.filter((user) => !LOCAL_USERS.some((template) => template.id === user.id));
    const mergedUsers = [...LOCAL_USERS.map((template) => {
      const prior = priorUsers.find((user) => user.id === template.id);
      if (!prior) return template;
      const salesRoleByPersona: Record<string, string> = {
        'persona-seller': 'role-sales-manager',
        'persona-sales-vice-network': 'role-sales-vice',
        'persona-sales-senior': 'role-senior-sales-supervisor',
        'persona-sales-senior-poonak': 'role-senior-sales-supervisor',
        'persona-callcenter-a': 'role-sales-supervisor',
        'persona-callcenter-b': 'role-sales-supervisor',
        'persona-callcenter-c': 'role-sales-supervisor',
        'persona-callcenter-poonak': 'role-sales-supervisor',
        'persona-sales-advance-approver': 'role-sales-vice',
      };
      const correctedSalesRole = salesRoleByPersona[prior.id];
      const hadLegacySellerRole = prior.roleIds.some((roleId) => ['role-sales-seller', 'role-seller'].includes(roleId));
      const preservedRoles = correctedSalesRole && hadLegacySellerRole ? prior.roleIds.filter((roleId) => !['role-sales-seller', 'role-seller'].includes(roleId)) : prior.roleIds;
      const roleIds = [...new Set([...preservedRoles, ...(correctedSalesRole && hadLegacySellerRole ? [correctedSalesRole] : [])])];
      const roleId = ['role-sales-seller', 'role-seller'].includes(prior.roleId) && correctedSalesRole && hadLegacySellerRole ? correctedSalesRole : prior.roleId;
      return {...template, ...prior, roleId, roleIds};
    }), ...customUsers];
    seeded.users = mergedUsers.map((value) => {
      const user = value as LocalUser;
      const fallback = LOCAL_USERS.find((item) => item.id === user.id) ?? LOCAL_USERS[0];
      const linkedPersonnel = migratedPersonnel.find((person) => person.id === user.personnelId || person.linkedUserId === user.id);
      const normalizedRoleIds = [...new Set((user.roleIds?.length ? user.roleIds : [user.roleId || fallback.roleId]).map((roleId) => roleId === 'role-seller' ? 'role-sales-seller' : roleId))];
      const normalizedRoleId = (user.roleId === 'role-seller' ? 'role-sales-seller' : user.roleId) || normalizedRoleIds[0];
      return resolveUserAccess({...fallback, ...user, ...(linkedPersonnel ? {unitId: linkedPersonnel.unitId, positionId: linkedPersonnel.positionId, branchUnitId: linkedPersonnel.branchUnitId, salesHierarchyLevel: linkedPersonnel.salesHierarchyLevel} : {}), roleId: normalizedRoleId, roleIds: normalizedRoleIds, permissionGrants: [], isAdmin: user.id === 'persona-product-owner'}, roles);
    });
    const purchaseSeed = (createSeedData().purchase_requests as OperationalRecord[]).find((record) => record.id === 'demo-purchase-request-1');
    seeded.purchase_requests = (seeded.purchase_requests as OperationalRecord[]).map((record) => {
      if (!purchaseSeed || record.id !== purchaseSeed.id) return record;
      if (!Array.isArray(record.payload.lines)) return {...record, title: purchaseSeed.title, description: purchaseSeed.description, amountRial: purchaseSeed.amountRial, quantity: purchaseSeed.quantity, dueAt: purchaseSeed.dueAt, assigneeUserId: purchaseSeed.assigneeUserId, createdByActorId: purchaseSeed.createdByActorId, createdByUserId: purchaseSeed.createdByUserId, payload: purchaseSeed.payload, updatedAt: now};
      if (Array.isArray(record.payload.quotationAttachments) && record.payload.beneficiaryCardNumber && record.payload.beneficiaryLastName) return record;
      return {...record, payload: {...record.payload, quotationAttachments: purchaseSeed.payload.quotationAttachments, beneficiaryCardNumber: purchaseSeed.payload.beneficiaryCardNumber, beneficiaryLastName: purchaseSeed.payload.beneficiaryLastName}, updatedAt: now};
    });
    const previousSession = (existing.sessions[0] as FoundationSession | undefined);
    const activeUserId = (seeded.users as LocalUser[]).some((user) => user.id === previousSession?.activeUserId) ? previousSession!.activeUserId : LOCAL_USERS[0].id;
    seeded.sessions = [{id: 'active-session', activeUserId, signedOutAt: previousSession?.signedOutAt, profileCompletionDeferredUntil: previousSession?.profileCompletionDeferredUntil, switchedAt: now, version: (previousSession?.version ?? 3) + 1} satisfies FoundationSession];
    const migratedDocumentFiles = [...(seeded.personnel_document_files as PersonnelDocumentFile[])];
    const migratedFileIds = new Set(migratedDocumentFiles.map((item) => item.id));
    const migratedDocuments: OperationalRecord[] = [];
    for (const document of seeded.personnel_documents as OperationalRecord[]) {
      const rawDataUrl = typeof document.payload.fileDataUrl === 'string' ? document.payload.fileDataUrl : undefined;
      if (!rawDataUrl) {
        migratedDocuments.push({...document, payload: removeSensitiveFileData(document.payload) as OperationalRecord['payload']});
        continue;
      }
      const fileId = typeof document.payload.fileRef === 'string' ? document.payload.fileRef : `personnel-document-file-${document.id}`;
      const ownerPersonnelId = document.ownerPersonnelId;
      const protectedPersonnelId = ownerPersonnelId ?? `unresolved-owner:${document.id}`;
      if (!migratedFileIds.has(fileId)) {
        const file: PersonnelDocumentFile = {
          id: fileId, recordId: document.id, personnelId: protectedPersonnelId, companyId: document.companyId,
          mimeType: typeof document.payload.fileType === 'string' ? document.payload.fileType : legacyDataUrlMime(rawDataUrl),
          size: typeof document.payload.fileSize === 'number' ? document.payload.fileSize : legacyDataUrlSize(rawDataUrl),
          checksumSha256: await sha256DataUrlContent(rawDataUrl), dataUrl: rawDataUrl,
          createdAt: document.createdAt, updatedAt: document.updatedAt,
        };
        migratedDocumentFiles.push(file); migratedFileIds.add(fileId);
      }
      migratedDocuments.push({...document, payload: {...(removeSensitiveFileData(document.payload) as OperationalRecord['payload']), fileRef: fileId, legacyUnclassified: true, legacyOwnerUnresolved: !ownerPersonnelId} as OperationalRecord['payload']});
    }
    seeded.personnel_documents = migratedDocuments;
    seeded.personnel_document_files = migratedDocumentFiles;
    seeded.workflow_history = (seeded.workflow_history as OperationalRecordHistory[]).map((item) => item.moduleId === 'personnel-document'
      ? {...item, snapshot: removeSensitiveFileData(item.snapshot) as Record<string, unknown>}
      : item);
    const systemMetaIds = new Set(['schemaVersion', 'seedVersion', 'seededAt', 'lastPersistedAt']);
    const preservedMeta = (existing.meta as MetaRecord[]).filter((item) => !systemMetaIds.has(item.id));
    seeded.meta = [...preservedMeta, {id: 'schemaVersion', value: FOUNDATION_SCHEMA_VERSION}, {id: 'seedVersion', value: FOUNDATION_SEED_VERSION}, {id: 'lastPersistedAt', value: now}];
    const migrationActor = (seeded.users as LocalUser[]).find((user)=>user.id===activeUserId) ?? (seeded.users as LocalUser[])[0];
    const migratedAudits = seeded.audit_events as AuditEvent[];
    seeded.audit_events = [...migratedAudits,{id:newId('audit'),sequence:nextSequence(migratedAudits),companyId:migrationActor.companyId,category:'data',action:'foundation.erp_v1.migrated',actorId:migrationActor.actorId,actorName:migrationActor.name,effectiveUserId:migrationActor.id,occurredAt:now,summary:'ساختار ERP محلی V1 بدون حذف داده‌های قبلی ارتقا یافت.',outcome:'success',correlationId:newId('correlation'),metadata:{schemaVersion:FOUNDATION_SCHEMA_VERSION,legacySellerRoleMigratedTo:'role-sales-seller'}} satisfies AuditEvent];
    await this.storage.transaction([...FOUNDATION_STORES], 'readwrite', async (tx) => {
      const latestEntries=await Promise.all(FOUNDATION_STORES.map(async(store)=>[store,await tx.getAll(store)] as const));
      const latest=Object.fromEntries(latestEntries) as Record<FoundationStoreName,unknown[]>;
      const latestPersistedAt=(latest.meta as MetaRecord[]).find((item)=>item.id==='lastPersistedAt')?.value;
      const storeChanged=FOUNDATION_STORES.some((store)=>JSON.stringify(latest[store])!==JSON.stringify(existing[store]));
      if(latestPersistedAt!==migrationBasePersistedAt||storeChanged)throw new Error('داده‌ها هنگام ارتقا در تب دیگری تغییر کردند؛ همه تب‌ها را ببندید و دوباره تلاش کنید.');
      for (const store of FOUNDATION_STORES) await tx.clear(store);
      for (const store of FOUNDATION_STORES) for (const value of seeded[store]) await tx.put(store, value);
    });
  }

  async loadState(): Promise<FoundationState> {
    const [rawUsers, units, positions, roles, personnel, profileChangeRequests, salesStructures, customers, customerImports, session, audits, records, persistedAt, workflows, workflowVersions, history, registrations, qaManifests, projections, notifications, operationalParts] = await Promise.all([
      this.storage.getAll<LocalUser>('users'), this.storage.getAll<OrganizationalUnit>('organizational_units'),
      this.storage.getAll<OrganizationalPosition>('organizational_positions'), this.storage.getAll<SecurityRole>('security_roles'),
      this.storage.getAll<PersonnelRecord>('personnel'), this.storage.getAll<PersonnelProfileChangeRequest>('personnel_profile_change_requests'),
      this.storage.getAll<SalesStructure>('sales_structures'), this.storage.getAll<CustomerRecord>('customers'), this.storage.getAll<CustomerImportJob>('customer_imports'),
      this.storage.get<FoundationSession>('sessions', 'active-session'), this.storage.getAll<AuditEvent>('audit_events'),
      this.storage.getAll('foundation_records'), this.storage.get<MetaRecord>('meta', 'lastPersistedAt'),
      this.storage.getAll<WorkflowDefinition>('workflow_definitions'), this.storage.getAll<WorkflowDefinition>('workflow_versions'), this.storage.getAll<OperationalRecordHistory>('workflow_history'),
      this.storage.getAll<RegistrationRequest>('registration_requests'), this.storage.getAll<QaDatasetManifest>('qa_dataset_manifests'),
      this.storage.getAll<ProjectionRecord>('projections'), this.storage.getAll<UserNotification>('notifications'),
      Promise.all(ERP_OPERATIONAL_STORES.map((store) => this.storage.getAll<OperationalRecord>(store))),
    ]);
    const users = rawUsers.map((user) => resolveUserAccess(user, roles));
    const activeUser = users.find((user) => user.id === session?.activeUserId) ?? users.find((user) => user.status === 'active');
    if (!activeUser || !session) throw new Error('کاربران محلی آماده نشده‌اند. بازنشانی داده را اجرا کنید.');
    const effectiveSession = activeUser.status === 'inactive' && !session.signedOutAt
      ? {...session, signedOutAt: session.switchedAt}
      : session;
    const normalizedAudits = audits.map((event) => ({...event, effectiveUserId: event.effectiveUserId ?? (event as AuditEvent & {effectivePersonaId?: string}).effectivePersonaId ?? activeUser.id}));
    const auditorView = activeUser.roleIds.includes('role-auditor');
    const projectedUsers = auditorView
      ? users.filter((user) => user.id === activeUser.id).map((user) => ({...user, passwordHash: ''}))
      : users;
    const projectedPersonnel = auditorView
      ? personnel.filter((person) => person.id === activeUser.personnelId || person.linkedUserId === activeUser.id)
      : personnel;
    // Until the product owner approves an auditor-specific reporting contract,
    // expose no event rows. Audit summaries and actor fields often contain PII.
    const projectedAudits = auditorView ? [] : normalizedAudits;
    const allOperationalRecords = operationalParts.flat();
    const operationalRecords = (auditorView ? [] : allOperationalRecords).filter((record) => {
      if (record.moduleId !== 'personnel-document') return true;
      const target = personnel.find((item) => item.id === record.ownerPersonnelId);
      if (!target) return false;
      if (activeUser.personnelId === target.id || target.linkedUserId === activeUser.id) return true;
      const permission = [PERSONNEL_DOCUMENT_PERMISSION_READ, PERSONNEL_DOCUMENT_PERMISSION_MANAGE, 'organization.personnel.documents.queue.view'].find((candidate) => activeUser.permissions.includes(candidate));
      return Boolean(permission && authorize({persona: activeUser, permission, action: 'view', resource: this.personnelResource({users, activeUser} as FoundationState, target)}).allowed);
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const projectedActiveUser = projectedUsers.find((user) => user.id === activeUser.id) ?? activeUser;
    return {users: projectedUsers, activeUser: projectedActiveUser, session: effectiveSession, units: units.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'fa')), positions: positions.sort((a, b) => a.title.localeCompare(b.title, 'fa')), roles: roles.sort((a, b) => Number(b.protected) - Number(a.protected) || a.name.localeCompare(b.name, 'fa')), personnel: projectedPersonnel.sort((a, b) => a.personnelCode.localeCompare(b.personnelCode, 'fa')), personnelProfileChangeRequests: auditorView ? [] : profileChangeRequests.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), salesStructures: auditorView ? [] : salesStructures.sort((a, b) => salesStructureSupervisorName(a, personnel).localeCompare(salesStructureSupervisorName(b, personnel), 'fa')), customers: auditorView ? [] : customers.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), customerImports: auditorView ? [] : customerImports.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), workflows, workflowVersions, operationalRecords, operationalHistory: auditorView ? [] : history.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), notifications: notifications.filter((item) => item.userId === activeUser.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), registrationRequests: auditorView ? [] : registrations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), qaDataset: qaManifests.find((item) => item.id === 'large-qa') ?? {id: 'large-qa', status: 'empty', roleCount: 0, userCount: 0, seed: 'tapra2-large-qa-v1'}, projections: auditorView ? [] : projections, audits: projectedAudits.sort((a, b) => b.sequence - a.sequence), recordCount: auditorView ? projectedAudits.length : records.length + personnel.length + profileChangeRequests.length + salesStructures.length + customers.length + operationalRecords.length + notifications.length, lastPersistedAt: typeof persistedAt?.value === 'string' ? persistedAt.value : effectiveSession.switchedAt};
  }

  async createSalesStructure(input: SalesStructureInput): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    requirePermission(actor, 'organization.personnel.manage', 'مجوز ساخت مسیر فروش را ندارید.');
    validateSalesStructureInput(input, state);
    const now = new Date().toISOString();
    const branchCount = state.salesStructures.filter((item) => item.branchUnitId === input.branchUnitId).length + 1;
    const structure: SalesStructure = {id: newId('sales-structure'), code: `SS-${String(state.salesStructures.length + 1).padStart(3, '0')}`, branchUnitId: input.branchUnitId, salesVicePersonnelId: input.salesVicePersonnelId || undefined, salesManagerPersonnelId: input.salesManagerPersonnelId, seniorSupervisorPersonnelId: input.seniorSupervisorPersonnelId, callCenterSupervisorPersonnelId: input.callCenterSupervisorPersonnelId, status: 'active', version: branchCount, createdAt: now, updatedAt: now};
    await this.storage.put('sales_structures', structure);
    await this.appendAudit({actor, effectiveUser: actor, category: 'system', action: 'organization.sales_structure.created', summary: `مسیر فروش سرپرست کال‌سنتر «${salesStructureSupervisorName(structure, state.personnel)}» ایجاد شد.`, outcome: 'success', metadata: {salesStructureId: structure.id, branchUnitId: structure.branchUnitId, callCenterSupervisorPersonnelId: structure.callCenterSupervisorPersonnelId, version: structure.version}});
    return this.loadState();
  }

  async updateSalesStructure(structureId: string, input: SalesStructureInput): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    requirePermission(actor, 'organization.personnel.manage', 'مجوز ویرایش مسیر فروش را ندارید.');
    const existing = state.salesStructures.find((item) => item.id === structureId);
    if (!existing) throw new Error('مسیر فروش پیدا نشد.');
    if (salesStructureHasAssignmentHistory(structureId, state.personnel)) throw new Error('این مسیر سابقه انتساب پرسنل دارد و برای حفظ تاریخچه قابل ویرایش نیست؛ مسیر جدید بسازید.');
    validateSalesStructureInput(input, state, structureId);
    const updated: SalesStructure = {...existing, branchUnitId: input.branchUnitId, salesVicePersonnelId: input.salesVicePersonnelId || undefined, salesManagerPersonnelId: input.salesManagerPersonnelId, seniorSupervisorPersonnelId: input.seniorSupervisorPersonnelId, callCenterSupervisorPersonnelId: input.callCenterSupervisorPersonnelId, updatedAt: new Date().toISOString()};
    await this.storage.put('sales_structures', updated);
    await this.appendAudit({actor, effectiveUser: actor, category: 'system', action: 'organization.sales_structure.updated', summary: `مسیر فروش سرپرست کال‌سنتر «${salesStructureSupervisorName(updated, state.personnel)}» ویرایش شد.`, outcome: 'success', metadata: {salesStructureId: updated.id, branchUnitId: updated.branchUnitId, callCenterSupervisorPersonnelId: updated.callCenterSupervisorPersonnelId}});
    return this.loadState();
  }

  async setSalesStructureStatus(structureId: string, status: UserStatus): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    requirePermission(actor, 'organization.personnel.manage', 'مجوز تغییر وضعیت مسیر فروش را ندارید.');
    const structure = state.salesStructures.find((item) => item.id === structureId); if (!structure) throw new Error('مسیر فروش پیدا نشد.');
    if (status === 'active' && state.salesStructures.some((item) => item.id !== structureId && item.status === 'active' && item.callCenterSupervisorPersonnelId === structure.callCenterSupervisorPersonnelId)) throw new Error('این سرپرست کال‌سنتر مسیر فعال دیگری دارد و این مسیر قابل فعال‌سازی نیست.');
    const updated: SalesStructure = {...structure, status, updatedAt: new Date().toISOString()};
    const affectedSellerCount = state.personnel.filter((item) => item.employmentStatus === 'active' && item.salesStructureId === structureId).length;
    await this.storage.put('sales_structures', updated);
    await this.appendAudit({actor, effectiveUser: actor, category: 'system', action: 'organization.sales_structure.status_changed', summary: `مسیر فروش سرپرست کال‌سنتر «${salesStructureSupervisorName(structure, state.personnel)}» ${status === 'active' ? 'فعال' : 'غیرفعال'} شد.`, reason: status === 'inactive' && affectedSellerCount ? `${affectedSellerCount.toLocaleString('en-US')} فروشنده فعال باید به مسیر دیگری منتقل شوند.` : undefined, outcome: 'success', metadata: {salesStructureId: structure.id, callCenterSupervisorPersonnelId: structure.callCenterSupervisorPersonnelId, status, affectedSellerCount}});
    return this.loadState();
  }

  async createUnit(input: UnitInput): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    requirePermission(actor, 'organization.units.manage', 'مجوز ایجاد واحد سازمانی را ندارید.');
    validateUnitInput(input, state.units);
    const now = new Date().toISOString();
    const siblings = state.units.filter((unit) => unit.parentId === input.parentId);
    const unit: OrganizationalUnit = {id: newId('unit'), name: input.name.trim(), type: input.type.trim(), parentId: input.parentId || undefined, managerUserId: input.managerUserId || undefined, status: 'active', order: Math.max(0, ...siblings.map((item) => item.order)) + 1, description: input.description.trim(), createdAt: now, updatedAt: now};
    await this.storage.put('organizational_units', unit);
    await this.appendAudit({actor, effectiveUser: actor, category: 'system', action: 'organization.unit.created', summary: `واحد سازمانی «${unit.name}» ایجاد شد.`, outcome: 'success', metadata: {unitId: unit.id, unitType: unit.type}});
    return this.loadState();
  }

  async updateUnit(unitId: string, input: UnitInput): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    requirePermission(actor, 'organization.units.manage', 'مجوز ویرایش واحد سازمانی را ندارید.');
    const existing = state.units.find((unit) => unit.id === unitId); if (!existing) throw new Error('واحد سازمانی پیدا نشد.');
    validateUnitInput(input, state.units, unitId);
    if (input.parentId && wouldCreateCycle(unitId, input.parentId, state.units)) throw new Error('انتخاب این والد یک چرخه نامعتبر در ساختار سازمان ایجاد می‌کند.');
    const updated: OrganizationalUnit = {...existing, name: input.name.trim(), type: input.type.trim(), parentId: input.parentId || undefined, managerUserId: input.managerUserId || undefined, description: input.description.trim(), updatedAt: new Date().toISOString()};
    await this.storage.put('organizational_units', updated);
    await this.appendAudit({actor, effectiveUser: actor, category: 'system', action: 'organization.unit.updated', summary: `واحد سازمانی «${updated.name}» ویرایش شد.`, outcome: 'success', metadata: {unitId}});
    return this.loadState();
  }

  async setUnitStatus(unitId: string, status: UserStatus): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    requirePermission(actor, 'organization.units.manage', 'مجوز تغییر وضعیت واحد را ندارید.');
    const unit = state.units.find((item) => item.id === unitId); if (!unit) throw new Error('واحد سازمانی پیدا نشد.');
    const hasActiveAssignments = unit.type === 'شعبه'
      ? state.personnel.some((person) => person.branchUnitId === unitId && person.employmentStatus === 'active') || state.users.some((user) => !user.personnelId && user.branchUnitId === unitId && user.status === 'active')
      : state.personnel.some((person) => person.unitId === unitId && person.employmentStatus === 'active') || state.users.some((user) => user.unitId === unitId && user.status === 'active');
    if (status === 'inactive' && hasActiveAssignments) throw new Error(unit.type === 'شعبه' ? 'ابتدا انتقال پرسنل مستقر در این شعبه را ثبت کنید.' : 'ابتدا تغییر واحد پرسنل فعال این واحد را ثبت کنید.');
    if (status === 'inactive' && state.units.some((item) => item.parentId === unitId && item.status === 'active')) throw new Error('ابتدا وضعیت واحدهای زیرمجموعه را تعیین کنید.');
    const updated = {...unit, status, updatedAt: new Date().toISOString()}; await this.storage.put('organizational_units', updated);
    await this.appendAudit({actor, effectiveUser: actor, category: 'system', action: 'organization.unit.status_changed', summary: `واحد «${unit.name}» ${status === 'active' ? 'فعال' : 'غیرفعال'} شد.`, outcome: 'success', metadata: {unitId, status}});
    return this.loadState();
  }

  async createPosition(input: PositionInput): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser; requirePermission(actor, 'organization.positions.manage', 'مجوز ایجاد سمت را ندارید.'); validatePositionInput(input, state);
    const now = new Date().toISOString(); const position: OrganizationalPosition = {id: newId('position'), title: input.title.trim(), description: input.description.trim(), unitIds: normalizePositionUnitIds(input.unitIds ?? []), status: 'active', createdAt: now, updatedAt: now}; await this.storage.put('organizational_positions', position);
    await this.appendAudit({actor, effectiveUser: actor, category: 'system', action: 'organization.position.created', summary: `سمت سازمانی «${position.title}» برای ${position.unitIds.length.toLocaleString('en-US')} واحد ایجاد شد.`, outcome: 'success', metadata: {positionId: position.id, unitIds: position.unitIds.join(',')}}); return this.loadState();
  }

  async updatePosition(positionId: string, input: PositionInput): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser; requirePermission(actor, 'organization.positions.manage', 'مجوز ویرایش سمت را ندارید.'); const existing = state.positions.find((item) => item.id === positionId); if (!existing) throw new Error('سمت سازمانی پیدا نشد.'); validatePositionInput(input, state, positionId);
    const nextUnitIds = normalizePositionUnitIds(input.unitIds ?? []);
    const removedUnitIds = existing.unitIds.filter((unitId) => !nextUnitIds.includes(unitId));
    const assignedInRemovedUnit = state.personnel.some((person) => person.positionId === positionId && person.employmentStatus === 'active' && removedUnitIds.includes(person.unitId)) || state.users.some((user) => user.positionId === positionId && user.status === 'active' && !user.personnelId && Boolean(user.unitId && removedUnitIds.includes(user.unitId)));
    if (assignedInRemovedUnit) throw new Error('این سمت در یکی از واحدهای حذف‌شده به فرد فعال تخصیص دارد؛ ابتدا جایگاه افراد آن واحد را تغییر دهید.');
    const updated = {...existing, title: input.title.trim(), description: input.description.trim(), unitIds: nextUnitIds, updatedAt: new Date().toISOString()}; await this.storage.put('organizational_positions', updated); await this.appendAudit({actor, effectiveUser: actor, category: 'system', action: 'organization.position.updated', summary: `سمت سازمانی «${updated.title}» ویرایش شد.`, outcome: 'success', metadata: {positionId, unitIds: updated.unitIds.join(',')}}); return this.loadState();
  }

  async setPositionStatus(positionId: string, status: UserStatus): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser; requirePermission(actor, 'organization.positions.manage', 'مجوز تغییر وضعیت سمت را ندارید.'); const position = state.positions.find((item) => item.id === positionId); if (!position) throw new Error('سمت سازمانی پیدا نشد.'); if (status === 'inactive' && (state.users.some((user) => user.positionId === positionId && user.status === 'active') || state.personnel.some((person) => person.positionId === positionId && person.employmentStatus === 'active'))) throw new Error('این سمت به فرد فعال اختصاص دارد. ابتدا انتساب را تغییر دهید.');
    await this.storage.put('organizational_positions', {...position, status, updatedAt: new Date().toISOString()}); await this.appendAudit({actor, effectiveUser: actor, category: 'system', action: 'organization.position.status_changed', summary: `سمت «${position.title}» ${status === 'active' ? 'فعال' : 'غیرفعال'} شد.`, outcome: 'success', metadata: {positionId, status}}); return this.loadState();
  }

  async deletePosition(positionId: string): Promise<FoundationState> {
    const state = await this.loadState();
    const actor = state.activeUser;
    requirePermission(actor, 'organization.positions.manage', 'مجوز حذف سمت را ندارید.');
    const position = state.positions.find((item) => item.id === positionId);
    if (!position) throw new Error('سمت سازمانی پیدا نشد.');
    const assignedPersonnel = state.personnel.filter((person) => person.positionId === positionId);
    const assignedStandaloneUsers = state.users.filter((user) => user.positionId === positionId && !user.personnelId);
    const assignmentCount = assignedPersonnel.length + assignedStandaloneUsers.length;
    if (assignmentCount) throw new Error(`سمت «${position.title}» به ${assignmentCount.toLocaleString('en-US')} نفر تخصیص دارد؛ ابتدا سمت فعلی آن‌ها را تغییر دهید.`);
    await this.storage.delete('organizational_positions', positionId);
    await this.appendAudit({
      actor,
      effectiveUser: actor,
      category: 'system',
      action: 'organization.position.deleted',
      summary: `سمت سازمانی «${position.title}» حذف شد؛ سابقه آن برای گزارش‌گیری و ممیزی حفظ شد.`,
      reason: 'حذف سمت بدون تخصیص جاری',
      outcome: 'success',
      metadata: {positionId, positionTitle: position.title, description: position.description, assignmentCount: 0},
    });
    return this.loadState();
  }

  async createUser(input: UserInput): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser; requirePermission(actor, 'organization.users.create', 'مجوز ایجاد کاربر را ندارید.'); requirePermission(actor, 'organization.roles.assign', 'مجوز انتساب نقش و ریزمجوز به کاربر را ندارید.'); validateUserInput(input, state); if (!input.password || input.password.length < 8) throw new Error('رمز عبور اولیه باید حداقل ۸ نویسه باشد.');
    assertDirectAccessAssignmentAllowed(actor, undefined, input.roleIds, input.permissionGrants ?? [], input.permissionDenials ?? [], state.roles, state.session.actingAdminUserId);
    const now = new Date().toISOString(); const id = newId('user'); const primaryRole = state.roles.find((role) => role.id === input.roleIds[0])!;
    const overrides = normalizeUserPermissionOverrides(input, state);
    const created = resolveUserAccess({id, actorId: newId('actor'), name: input.name.trim(), username: input.username.trim().toLowerCase(), passwordHash: await hashPassword(input.password), passwordUpdatedAt: now, roleId: primaryRole.id, roleIds: [...input.roleIds], roles: [], roleTitle: primaryRole.name, status: 'active', isAdmin: false, description: primaryRole.description, companyId: COMPANY_ID, unitId: input.unitId, positionId: input.positionId, branchUnitId: input.branchUnitId, managerUserId: input.managerUserId || undefined, personnelId: input.personnelId, scope: primaryRole.scope, permissions: [], permissionGrants: overrides.grants, permissionDenials: overrides.denials, accent: avatarColor(state.users.length), initials: makeInitials(input.name)}, state.roles);
    const correlationId = newId('correlation');
    await this.storage.transaction(['users','security_roles','registration_requests','audit_events','domain_events','meta'], 'readwrite', async (tx) => {
      const [currentUsers, currentRoles, currentRequests] = await Promise.all([
        tx.getAll<LocalUser>('users'),
        tx.getAll<SecurityRole>('security_roles'),
        tx.getAll<RegistrationRequest>('registration_requests'),
      ]);
      if (currentUsers.some((user) => user.username.toLowerCase() === created.username.toLowerCase())) throw new Error('این نام کاربری هم‌زمان ثبت شده است؛ نام دیگری انتخاب کنید.');
      if (currentRequests.some((request) => !request.linkedUserId && request.requestedUsername.toLowerCase() === created.username.toLowerCase())) throw new Error('این نام کاربری برای یک درخواست ثبت‌نام رزرو شده است.');
      if (created.personnelId && currentUsers.some((user) => user.personnelId === created.personnelId)) throw new Error('برای این پرونده پرسنلی هم‌زمان حساب دیگری ساخته شده است.');
      if (created.roleIds.some((roleId) => !currentRoles.some((role) => role.id === roleId && role.status === 'active'))) throw new Error('یکی از نقش‌ها هم‌زمان تغییر کرده یا غیرفعال شده است.');
      assertDirectAccessAssignmentAllowed(actor, undefined, created.roleIds, created.permissionGrants ?? [], created.permissionDenials ?? [], currentRoles, state.session.actingAdminUserId);
      const committed = resolveUserAccess(created, currentRoles);
      const audits = await tx.getAll<AuditEvent>('audit_events');
      await tx.put('users', committed);
      await tx.put('audit_events', {id:newId('audit'),sequence:nextSequence(audits),companyId:actor.companyId,category:'authorization',action:'organization.user.created',actorId:actor.actorId,actorName:actor.name,effectiveUserId:committed.id,occurredAt:now,summary:`کاربر «${committed.name}» ایجاد شد.`,outcome:'success',correlationId,metadata:{userId:committed.id,username:committed.username,roleIds:committed.roleIds.join(',')}} satisfies AuditEvent);
      await tx.put('domain_events', {id:newId('event'),aggregateType:'user',aggregateId:committed.id,eventType:'UserCreated',actorId:actor.actorId,occurredAt:now,correlationId,payload:{roleIds:committed.roleIds}} satisfies DomainEvent);
      await tx.put('meta',{id:'lastPersistedAt',value:now});
    });
    return this.loadState();
  }

  async updateUser(userId: string, expectedVersionToken: string, input: Partial<UserInput> & {name: string; roleId?: string}): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser; requirePermission(actor, 'foundation.users.edit', 'مجوز ویرایش کاربر را ندارید.'); const existing = state.users.find((user) => user.id === userId); if (!existing) throw new Error('کاربر پیدا نشد.');
    const roleIds = input.roleIds?.length ? input.roleIds : input.roleId ? [input.roleId] : existing.roleIds; const complete: UserInput = {name: input.name, username: input.username ?? existing.username, unitId: input.unitId ?? existing.unitId ?? '', positionId: input.positionId ?? existing.positionId ?? '', branchUnitId: input.branchUnitId ?? existing.branchUnitId, managerUserId: input.managerUserId, roleIds, permissionGrants: input.permissionGrants ?? existing.permissionGrants, permissionDenials: input.permissionDenials ?? existing.permissionDenials}; validateUserInput(complete, state, userId);
    const accessChanged = !sameStrings(existing.roleIds, roleIds)
      || !sameStrings(existing.permissionGrants ?? [], complete.permissionGrants ?? [])
      || !sameStrings(existing.permissionDenials ?? [], complete.permissionDenials ?? []);
    if (accessChanged) requirePermission(actor, 'organization.roles.assign', 'مجوز انتساب نقش و ریزمجوز به کاربر را ندارید.');
    if (state.session.actingAdminUserId) throw new Error('در حالت مشاهده آزمایشی، ویرایش کاربر مجاز نیست.');
    if (accessChanged) assertDirectAccessAssignmentAllowed(actor, existing, roleIds, complete.permissionGrants ?? [], complete.permissionDenials ?? [], state.roles, state.session.actingAdminUserId);
    if (existing.isAdmin && !roleIds.includes('role-admin')) throw new Error('نقش پایه ادمین از حساب اصلی قابل حذف نیست.');
    if (existing.isAdmin && ((complete.permissionGrants?.length ?? 0) || (complete.permissionDenials?.length ?? 0))) throw new Error('دسترسی ادمین محافظت‌شده است و استثنای کاربری نمی‌پذیرد.');
    const overrides = normalizeUserPermissionOverrides(complete, state);
    const primaryRole = state.roles.find((role) => role.id === roleIds[0])!; const updated = resolveUserAccess({...existing, name: complete.name.trim(), username: complete.username.trim().toLowerCase(), unitId: complete.unitId, positionId: complete.positionId, managerUserId: complete.managerUserId || undefined, roleId: primaryRole.id, roleIds: [...roleIds], permissionGrants: overrides.grants, permissionDenials: overrides.denials, initials: makeInitials(complete.name)}, state.roles);
    const added = roleIds.filter((id) => !existing.roleIds.includes(id)); const removed = existing.roleIds.filter((id) => !roleIds.includes(id));
    const overridesChanged = !sameStrings(existing.permissionGrants ?? [], overrides.grants) || !sameStrings(existing.permissionDenials ?? [], overrides.denials);
    const now = new Date().toISOString(); const correlationId = newId('correlation');
    await this.storage.transaction(['users','security_roles','registration_requests','audit_events','domain_events','meta'], 'readwrite', async (tx) => {
      const current = await tx.get<LocalUser>('users', userId);
      if (!current || userConcurrencyToken(current) !== expectedVersionToken) throw new Error('حساب کاربر در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');
      const [currentUsers, currentRoles, currentRequests] = await Promise.all([
        tx.getAll<LocalUser>('users'),
        tx.getAll<SecurityRole>('security_roles'),
        tx.getAll<RegistrationRequest>('registration_requests'),
      ]);
      if (currentUsers.some((item) => item.id !== userId && item.username.toLowerCase() === updated.username.toLowerCase())) throw new Error('این نام کاربری هم‌زمان برای حساب دیگری ثبت شده است.');
      if (currentRequests.some((request) => request.linkedUserId !== userId && request.requestedUsername.toLowerCase() === updated.username.toLowerCase())) throw new Error('این نام کاربری برای یک درخواست ثبت‌نام رزرو شده است.');
      if (updated.roleIds.some((roleId) => !currentRoles.some((role) => role.id === roleId && role.status === 'active'))) throw new Error('یکی از نقش‌ها هم‌زمان تغییر کرده یا غیرفعال شده است.');
      if (accessChanged) assertDirectAccessAssignmentAllowed(actor, current, updated.roleIds, updated.permissionGrants ?? [], updated.permissionDenials ?? [], currentRoles, state.session.actingAdminUserId);
      const committed = resolveUserAccess({...updated, passwordHash: current.passwordHash, passwordUpdatedAt: current.passwordUpdatedAt}, currentRoles);
      const audits = await tx.getAll<AuditEvent>('audit_events');
      await tx.put('users', committed);
      const auditSequence = nextSequence(audits);
      await tx.put('audit_events', {id:newId('audit'),sequence:auditSequence,companyId:actor.companyId,category:'authorization',action:'organization.user.updated',actorId:actor.actorId,actorName:actor.name,effectiveUserId:committed.id,occurredAt:now,summary:`اطلاعات و دسترسی کاربر «${committed.name}» به‌روزرسانی شد.`,outcome:'success',correlationId,metadata:{userId,username:committed.username,addedRoleIds:added.join(','),removedRoleIds:removed.join(','),grantedPermissions:overridesChanged?overrides.grants.join(','):'',deniedPermissions:overridesChanged?overrides.denials.join(','):''}} satisfies AuditEvent);
      if (overridesChanged) await tx.put('audit_events', {id:newId('audit'),sequence:auditSequence+1,companyId:actor.companyId,category:'authorization',action:'organization.user.permission_overrides_changed',actorId:actor.actorId,actorName:actor.name,effectiveUserId:committed.id,occurredAt:now,summary:`استثناهای دسترسی کاربر «${committed.name}» به‌روزرسانی شد.`,outcome:'success',correlationId,metadata:{userId,grantedPermissions:overrides.grants.join(','),deniedPermissions:overrides.denials.join(','),effectivePermissionCount:committed.permissions.length}} satisfies AuditEvent);
      await tx.put('domain_events', {id:newId('event'),aggregateType:'user',aggregateId:userId,eventType:'UserAccessUpdated',actorId:actor.actorId,occurredAt:now,correlationId,payload:{addedRoleIds:added,removedRoleIds:removed,overridesChanged}} satisfies DomainEvent);
      await tx.put('meta',{id:'lastPersistedAt',value:now});
    });
    return this.loadState();
  }

  async setUserPassword(userId: string, expectedVersionToken: string, password: string): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser; requirePermission(actor, 'organization.users.password.manage', 'مجوز تنظیم رمز عبور را ندارید.'); if (password.length < 8) throw new Error('رمز عبور باید حداقل ۸ نویسه باشد.'); const target = state.users.find((user) => user.id === userId); if (!target) throw new Error('کاربر پیدا نشد.'); if (state.session.actingAdminUserId) throw new Error('در حالت مشاهده آزمایشی، بازنشانی رمز مجاز نیست.'); if (target.id === PRIMARY_ADMIN_USER_ID && actor.id !== PRIMARY_ADMIN_USER_ID) throw new Error('رمز حساب اصلی فقط توسط صاحب همان حساب تغییر می‌کند.');
    const now=new Date().toISOString();const passwordHash=await hashPassword(password);const correlationId=newId('correlation');
    await this.storage.transaction(['users','audit_events','domain_events','meta'],'readwrite',async(tx)=>{const current=await tx.get<LocalUser>('users',userId);if(!current||userConcurrencyToken(current)!==expectedVersionToken)throw new Error('حساب کاربر در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');const updated={...current,passwordHash,passwordUpdatedAt:now};const audits=await tx.getAll<AuditEvent>('audit_events');await tx.put('users',updated);await tx.put('audit_events',{id:newId('audit'),sequence:nextSequence(audits),companyId:actor.companyId,category:'system',action:'organization.user.password_reset',actorId:actor.actorId,actorName:actor.name,effectiveUserId:updated.id,occurredAt:now,summary:`رمز عبور کاربر «${updated.name}» بازنشانی شد.`,outcome:'success',correlationId,metadata:{userId}} satisfies AuditEvent);await tx.put('domain_events',{id:newId('event'),aggregateType:'user',aggregateId:userId,eventType:'UserPasswordReset',actorId:actor.actorId,occurredAt:now,correlationId,payload:{}} satisfies DomainEvent);await tx.put('meta',{id:'lastPersistedAt',value:now});});return this.loadState();
  }

  async changeOwnCredentials(expectedVersionToken: string, input: SelfCredentialChangeInput): Promise<FoundationState> {
    const state = await this.loadState();
    const user = await this.storage.get<LocalUser>('users', state.activeUser.id) ?? state.activeUser;
    if (state.session.actingAdminUserId) throw new Error('در حالت مشاهده دسترسی کاربر، تغییر اطلاعات ورود مجاز نیست؛ با حساب واقعی کاربر وارد شوید.');
    if (user.status !== 'active') throw new Error('حساب غیرفعال امکان تغییر اطلاعات ورود ندارد.');
    if (!await verifyPassword(input.currentPassword, user.passwordHash)) throw new Error('رمز عبور فعلی صحیح نیست.');

    const username = input.username.trim().toLowerCase();
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) throw new Error('نام کاربری باید ۳ تا ۳۲ نویسه لاتین، عدد، نقطه، خط تیره یا زیرخط باشد.');
    if (state.users.some((item) => item.id !== user.id && item.username.toLowerCase() === username) || state.registrationRequests.some((request) => request.linkedUserId !== user.id && request.requestedUsername.toLowerCase() === username)) throw new Error('این نام کاربری قبلاً استفاده شده یا برای یک درخواست ثبت‌نام رزرو شده است.');
    const newPassword = input.newPassword ?? '';
    if (newPassword && newPassword.length < 8) throw new Error('رمز عبور جدید باید حداقل ۸ نویسه باشد.');

    const usernameChanged = username !== user.username.toLowerCase();
    const passwordChanged = Boolean(newPassword);
    if (!usernameChanged && !passwordChanged) throw new Error('نام کاربری جدید یا رمز عبور جدید را وارد کنید.');
    if (passwordChanged && await verifyPassword(newPassword, user.passwordHash)) throw new Error('رمز عبور جدید باید با رمز فعلی متفاوت باشد.');

    const now = new Date().toISOString();
    const passwordHash=passwordChanged?await hashPassword(newPassword):user.passwordHash;const correlationId=newId('correlation');
    await this.storage.transaction(['users','registration_requests','audit_events','domain_events','meta'],'readwrite',async(tx)=>{const current=await tx.get<LocalUser>('users',user.id);if(!current||userConcurrencyToken(current)!==expectedVersionToken)throw new Error('حساب در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');const [currentUsers,currentRequests,audits]=await Promise.all([tx.getAll<LocalUser>('users'),tx.getAll<RegistrationRequest>('registration_requests'),tx.getAll<AuditEvent>('audit_events')]);if(currentUsers.some((item)=>item.id!==current.id&&item.username.toLowerCase()===username)||currentRequests.some((request)=>request.linkedUserId!==current.id&&request.requestedUsername.toLowerCase()===username))throw new Error('این نام کاربری هم‌زمان استفاده یا رزرو شده است.');const updated={...current,username,passwordHash,passwordUpdatedAt:passwordChanged?now:current.passwordUpdatedAt};await tx.put('users',updated);await tx.put('audit_events',{id:newId('audit'),sequence:nextSequence(audits),companyId:current.companyId,category:'system',action:'organization.user.credentials_changed',actorId:current.actorId,actorName:current.name,effectiveUserId:current.id,occurredAt:now,summary:`اطلاعات ورود حساب «${current.name}» توسط خود کاربر تغییر کرد.`,reason:'تغییر شخصی اطلاعات ورود پس از تأیید رمز فعلی',outcome:'success',correlationId,metadata:{userId:current.id,usernameChanged,passwordChanged,username}} satisfies AuditEvent);await tx.put('domain_events',{id:newId('event'),aggregateType:'user',aggregateId:current.id,eventType:'UserCredentialsChanged',actorId:current.actorId,occurredAt:now,correlationId,payload:{usernameChanged,passwordChanged}} satisfies DomainEvent);await tx.put('meta',{id:'lastPersistedAt',value:now});});
    return this.loadState();
  }

  async setUserStatus(userId: string, expectedVersionToken: string, status: UserStatus): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser; requirePermission(actor, 'foundation.users.status.manage', 'مجوز فعال‌سازی یا غیرفعال‌سازی کاربر را ندارید.'); const target = state.users.find((user) => user.id === userId); if (!target) throw new Error('کاربر پیدا نشد.'); if (target.id === actor.id) throw new Error('نمی‌توانید وضعیت حسابی را که با آن وارد شده‌اید تغییر دهید.'); if (target.isAdmin) throw new Error('حساب اصلی ادمین قابل غیرفعال‌سازی نیست.');
    if (state.session.actingAdminUserId) throw new Error('در حالت مشاهده آزمایشی، تغییر وضعیت حساب مجاز نیست.');
    const linkedPersonnel = state.personnel.find((person) => person.id === target.personnelId || person.linkedUserId === target.id);
    if (status === 'active' && linkedPersonnel && linkedPersonnel.employmentStatus !== 'active') throw new Error('حساب پرسنلی که همکاری فعال ندارد از این بخش فعال نمی‌شود؛ ابتدا «بازگشت به همکاری» را ثبت کنید.');
    const now=new Date().toISOString();const correlationId=newId('correlation');await this.storage.transaction(['users','personnel','audit_events','domain_events','meta'],'readwrite',async(tx)=>{const current=await tx.get<LocalUser>('users',userId);if(!current||userConcurrencyToken(current)!==expectedVersionToken)throw new Error('حساب کاربر در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');const currentPersonnelRecords=await tx.getAll<PersonnelRecord>('personnel');const currentPersonnel=currentPersonnelRecords.find((person)=>person.id===current.personnelId||person.linkedUserId===current.id);if(status==='active'&&currentPersonnel&&currentPersonnel.employmentStatus!=='active')throw new Error('حساب پرسنلی که همکاری فعال ندارد از این بخش فعال نمی‌شود؛ ابتدا «بازگشت به همکاری» را ثبت کنید.');const updated={...current,status};const audits=await tx.getAll<AuditEvent>('audit_events');await tx.put('users',updated);await tx.put('audit_events',{id:newId('audit'),sequence:nextSequence(audits),companyId:actor.companyId,category:'system',action:status==='active'?'organization.user.activated':'organization.user.deactivated',actorId:actor.actorId,actorName:actor.name,effectiveUserId:updated.id,occurredAt:now,summary:`کاربر «${updated.name}» ${status==='active'?'فعال':'غیرفعال'} شد.`,outcome:'success',correlationId,metadata:{userId,status}} satisfies AuditEvent);await tx.put('domain_events',{id:newId('event'),aggregateType:'user',aggregateId:userId,eventType:status==='active'?'UserActivated':'UserDeactivated',actorId:actor.actorId,occurredAt:now,correlationId,payload:{status}} satisfies DomainEvent);await tx.put('meta',{id:'lastPersistedAt',value:now});});return this.loadState();
  }

  async createPersonnel(input: PersonnelInput): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    requirePermission(actor, 'organization.personnel.manage', 'مجوز ایجاد پرونده پرسنلی را ندارید.');
    const inputWithSystemCode = synchronizeSalesPersonnelInput({...input, personnelCode: nextPersonnelCode(state.personnel)}, state);
    validatePersonnelInput(inputWithSystemCode, state);
    const now = new Date().toISOString();
    const normalizedInput = normalizePersonnelInput(inputWithSystemCode);
    const baseRecord: PersonnelRecord = {...normalizedInput, id: newId('personnel'), companyId: actor.companyId, movements: [], lifecycleHistory: [{id: newId('employment-event'), kind: 'employment_started', effectiveDate: normalizedInput.startDate, reason: 'ایجاد پرونده و شروع همکاری', actorId: actor.actorId, actorName: actor.name, recordedAt: now, employmentType: normalizedInput.employmentType, unitId: normalizedInput.unitId, positionId: normalizedInput.positionId, branchUnitId: normalizedInput.branchUnitId, managerPersonnelId: normalizedInput.managerPersonnelId}], createdAt: now, updatedAt: now};
    const initialCompensation = createDefaultSalesCompensationRecord(baseRecord, now, actor.actorId, actor.name);
    const record: PersonnelRecord = initialCompensation ? {...baseRecord, salesCompensationHistory: [initialCompensation]} : baseRecord;
    await this.storage.put('personnel', record);
    await this.appendAudit({actor, effectiveUser: actor, category: 'system', action: 'organization.personnel.created', summary: `پرونده پرسنلی «${record.firstName} ${record.lastName}» ایجاد شد.`, outcome: 'success', metadata: {personnelId: record.id, personnelCode: record.personnelCode}});
    return this.loadState();
  }

  async updatePersonnel(personnelId: string, expectedUpdatedAt: string, input: PersonnelInput): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    requirePermission(actor, 'organization.personnel.manage', 'مجوز ویرایش پرونده پرسنلی را ندارید.');
    const existing = state.personnel.find((item) => item.id === personnelId); if (!existing) throw new Error('پرونده پرسنلی پیدا نشد.');
    const inputWithSystemCode = synchronizeSalesPersonnelInput({...input, personnelCode: existing.personnelCode}, state);
    if (existing.unitId !== inputWithSystemCode.unitId || existing.branchUnitId !== inputWithSystemCode.branchUnitId) throw new Error('تغییر واحد یا شعبه باید از فرایند ثبت تغییر جایگاه انجام شود.');
    if (existing.positionId !== inputWithSystemCode.positionId && !inputWithSystemCode.salesHierarchyLevel) throw new Error('تغییر سمت باید از فرایند ثبت تغییر جایگاه انجام شود.');
    if (existing.salesStructureId !== inputWithSystemCode.salesStructureId) throw new Error('تغییر سرپرست کال‌سنتر یا شعبه فروش باید از فرایند انتقال فروشنده انجام شود.');
    if (existing.employmentStatus !== inputWithSystemCode.employmentStatus || existing.startDate !== inputWithSystemCode.startDate || existing.endDate !== inputWithSystemCode.endDate) throw new Error('وضعیت و تاریخ‌های همکاری فقط از فرایند «پایان همکاری / بازگشت به همکاری» تغییر می‌کنند.');
    validatePersonnelInput(inputWithSystemCode, state, personnelId);
    const bankingChanged = ['bankName', 'accountNumber', 'cardNumber', 'iban'].some((key) => existing[key as keyof PersonnelRecord] !== input[key as keyof PersonnelInput]);
    if (bankingChanged) requirePermission(actor, 'organization.personnel.banking.manage', 'مجوز ویرایش اطلاعات بانکی پرسنل را ندارید.');
    const normalized = normalizePersonnelInput(inputWithSystemCode);
    const now = new Date().toISOString();
    const initialCompensationId = `sales-compensation-${existing.id}-initial`;
    const existingCompensation = (existing.salesCompensationHistory ?? []).map((item) => item.id === initialCompensationId && normalized.salesAssignmentStartDate && existing.salesAssignmentStartDate !== normalized.salesAssignmentStartDate ? {...item, effectiveFrom: normalized.salesAssignmentStartDate} : item);
    const initialCompensation = !existing.salesHierarchyLevel && normalized.salesHierarchyLevel && !existingCompensation.length
      ? createDefaultSalesCompensationRecord({...existing, ...normalized}, now, actor.actorId, actor.name)
      : undefined;
    const updated: PersonnelRecord = {...existing, ...normalized, linkedUserId: existing.linkedUserId, movements: existing.movements ?? [], lifecycleHistory: existing.lifecycleHistory ?? [], pendingLifecycleChange: existing.pendingLifecycleChange, salesCompensationHistory: initialCompensation ? [initialCompensation] : existingCompensation, updatedAt: now};
    const changedAreas = personnelChangeAreas(existing, updated);
    const linkedUser=existing.linkedUserId?state.users.find((item)=>item.id===existing.linkedUserId):undefined;const correlationId=newId('correlation');
    await this.storage.transaction(['personnel','users','security_roles','audit_events','domain_events','meta'],'readwrite',async(tx)=>{
      const currentPersonnel=await tx.get<PersonnelRecord>('personnel',personnelId);
      if(!currentPersonnel||currentPersonnel.updatedAt!==expectedUpdatedAt||existing.updatedAt!==expectedUpdatedAt)throw new Error('پرونده پرسنلی در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');
      const [currentUsers,currentRoles,audits]=await Promise.all([tx.getAll<LocalUser>('users'),tx.getAll<SecurityRole>('security_roles'),tx.getAll<AuditEvent>('audit_events')]);
      let currentLinkedUser:LocalUser|undefined;
      if(existing.linkedUserId){currentLinkedUser=currentUsers.find((item)=>item.id===existing.linkedUserId);if(!currentLinkedUser||!linkedUser||userConcurrencyToken(currentLinkedUser)!==userConcurrencyToken(linkedUser))throw new Error('حساب مرتبط در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');const managerUserId=currentUsers.find((item)=>item.personnelId===updated.managerPersonnelId)?.id;currentLinkedUser=resolveUserAccess({...currentLinkedUser,name:`${updated.firstName} ${updated.lastName}`,initials:makeInitials(`${updated.firstName} ${updated.lastName}`),unitId:updated.unitId,positionId:updated.positionId,managerUserId,salesHierarchyLevel:updated.salesHierarchyLevel},currentRoles);}
      await tx.put('personnel',updated);if(currentLinkedUser)await tx.put('users',currentLinkedUser);
      const entries:Array<Pick<AuditEvent,'category'|'action'|'summary'|'metadata'>>=[{category:'system',action:'organization.personnel.updated',summary:`پرونده پرسنلی «${updated.firstName} ${updated.lastName}» ویرایش شد.`,metadata:{personnelId,changedAreas:changedAreas.join(',')}}];
      for(const area of changedAreas.filter((item)=>['unit','position','manager','employment'].includes(item)))entries.push({category:'system',action:`organization.personnel.${area}_changed`,summary:`${personnelAreaLabel(area)} «${updated.firstName} ${updated.lastName}» تغییر کرد.`,metadata:{personnelId,changedArea:area}});
      if(changedAreas.includes('sales_hierarchy'))entries.push({category:'system',action:'organization.personnel.sales_hierarchy_changed',summary:`جایگاه «${updated.firstName} ${updated.lastName}» در شبکه فروش تغییر کرد.`,metadata:{personnelId,previousLevel:existing.salesHierarchyLevel??'',newLevel:updated.salesHierarchyLevel??'',previousSalesStartDate:existing.salesAssignmentStartDate??'',newSalesStartDate:updated.salesAssignmentStartDate??'',previousSupervisorId:existing.salesSupervisorPersonnelId??'',newSupervisorId:updated.salesSupervisorPersonnelId??'',previousSalesBranchId:existing.salesBranchUnitId??'',newSalesBranchId:updated.salesBranchUnitId??'',previousChannel:existing.salesChannel??'',newChannel:updated.salesChannel??''}});
      if(bankingChanged)entries.push({category:'authorization',action:'organization.personnel.banking_changed',summary:`اطلاعات بانکی پرونده «${updated.firstName} ${updated.lastName}» تغییر کرد.`,metadata:{personnelId,bankingChanged:true}});
      let sequence=nextSequence(audits);for(const entry of entries)await tx.put('audit_events',{id:newId('audit'),sequence:sequence++,companyId:actor.companyId,category:entry.category,action:entry.action,actorId:actor.actorId,actorName:actor.name,effectiveUserId:actor.id,occurredAt:now,summary:entry.summary,outcome:'success',correlationId,metadata:entry.metadata} satisfies AuditEvent);
      await tx.put('domain_events',{id:newId('event'),aggregateType:'personnel',aggregateId:personnelId,eventType:'PersonnelUpdated',actorId:actor.actorId,occurredAt:now,correlationId,payload:{changedAreas}} satisfies DomainEvent);await tx.put('meta',{id:'lastPersistedAt',value:now});
    });
    return this.loadState();
  }

  async submitPersonnelEndRequest(personnelId: string, input: PersonnelEndInput): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    const person = state.personnel.find((item) => item.id === personnelId); if (!person) throw new Error('پرونده پرسنلی پیدا نشد.');
    if (actor.personnelId === person.id) throw new Error('پرسنل نمی‌تواند درخواست پایان همکاری خودش را در سامانه ثبت کند.');
    if (!canReviewEmploymentEnd(actor) && !isPersonnelSupervisor(actor, person)) throw new Error('فقط سرپرست مستقیم این پرسنل یا منابع انسانی مجاز به ثبت درخواست است.');
    if (person.employmentStatus !== 'active') throw new Error('درخواست پایان همکاری فقط برای پرسنل فعال ثبت می‌شود.');
    const effectiveDate = input.effectiveDate.trim(); const reason = input.reason.trim();
    if (!['employee', 'organization'].includes(input.departureInitiator)) throw new Error('مشخص کنید درخواست به دلیل استعفای پرسنل است یا تصمیم سازمان.');
    if (!effectiveDate || effectiveDate < currentLocalDate()) throw new Error('تاریخ پیشنهادی پایان همکاری نمی‌تواند قبل از امروز باشد.');
    if (reason.length < 3) throw new Error('شرح و دلیل درخواست الزامی است.');
    if (state.operationalRecords.some((record) => record.moduleId === 'offboarding' && record.ownerPersonnelId === personnelId && !['completed', 'cancelled'].includes(record.status))) throw new Error('برای این پرسنل یک درخواست پایان همکاری باز وجود دارد.');
    const module = ERP_MODULES.find((item) => item.id === 'offboarding'); if (!module) throw new Error('گردش خروج در سامانه فعال نیست.');
    const assignee = state.users.find((user) => user.status === 'active' && user.roleIds.includes('role-hr-manager'))
      ?? state.users.find((user) => user.status === 'active' && user.roleIds.includes('role-personnel-reviewer'))
      ?? state.users.find((user) => user.status === 'active' && user.roleIds.includes('role-hr-operator'));
    if (!assignee) throw new Error('کاربر فعالی برای بررسی منابع انسانی تعیین نشده است.');
    const now = new Date().toISOString(); const existing = state.operationalRecords.filter((record) => record.moduleId === 'offboarding'); const workflow = activeWorkflowFor(state, module);
    const record: OperationalRecord = {id: newId('offboarding'), moduleId: 'offboarding', domain: 'hr', trackingCode: `${module.prefix}-${new Date().getFullYear()}-${String(existing.length + 1).padStart(4, '0')}`, title: `درخواست بررسی پایان همکاری ${person.firstName} ${person.lastName}`, description: input.handoffNotes?.trim() ?? '', status: 'requested', priority: 'normal', companyId: actor.companyId, unitId: person.unitId, branchUnitId: person.branchUnitId, ownerPersonnelId: person.id, assigneeUserId: assignee.id, createdByActorId: actor.actorId, createdByUserId: actor.id, updatedByActorId: actor.actorId, workflowVersion: workflow.version, version: 1, payload: {personnelId: person.id, personnelCode: person.personnelCode, proposedEmploymentEndDate: effectiveDate, employmentEndDate: effectiveDate, employmentEndReason: reason, departureInitiator: input.departureInitiator, requesterPersonnelId: actor.personnelId ?? null, requesterName: actor.name, requesterRelationship: isPersonnelSupervisor(actor, person) ? 'direct_supervisor' : 'human_resources', accountClosureStatus: 'active', assetClearanceStatus: 'not_started', pendingAssetIds: [], handoffStatus: 'not_started', organizationalClearanceStatus: 'not_started', financialClearanceStatus: 'not_started', currentWaitingFor: 'بررسی منابع انسانی', requestHasOperationalEffect: false}, createdAt: now, updatedAt: now};
    const history: OperationalRecordHistory = {id: newId('history'), recordId: record.id, moduleId: record.moduleId, sequence: 1, eventType: 'created', actorId: actor.actorId, actorName: actor.name, effectiveUserId: actor.id, reason, snapshot: {personnelId: person.id, proposedEmploymentEndDate: effectiveDate, departureInitiator: input.departureInitiator, requestHasOperationalEffect: false}, occurredAt: now};
    await this.persistOperationalChange(module.store, record, history, actor, 'requested', `درخواست بررسی پایان همکاری «${person.firstName} ${person.lastName}» برای منابع انسانی ثبت شد؛ هیچ تغییری در حساب یا همکاری او اعمال نشد.`, reason);
    return this.loadState();
  }

  async approvePersonnelEndRequest(recordId: string, expectedVersion: number, note: string): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    if (!canReviewEmploymentEnd(actor)) throw new Error('فقط منابع انسانی مجاز به تأیید و اجرای درخواست پایان همکاری است.');
    const record = state.operationalRecords.find((item) => item.id === recordId && item.moduleId === 'offboarding'); if (!record) throw new Error('درخواست پایان همکاری پیدا نشد.');
    if (record.createdByUserId === actor.id || record.createdByActorId === actor.actorId) throw new Error('ثبت‌کننده درخواست نمی‌تواند همان درخواست پایان همکاری را تأیید کند.');
    if (record.version !== expectedVersion) throw new Error('این درخواست در تب دیگری تغییر کرده است. صفحه را تازه‌سازی و دوباره تلاش کنید.');
    if (record.status !== 'requested') throw new Error('فقط درخواست در انتظار بررسی منابع انسانی قابل تأیید است.');
    const person = state.personnel.find((item) => item.id === record.ownerPersonnelId); if (!person) throw new Error('پرونده پرسنلی مرتبط پیدا نشد.');
    const decisionNote = note.trim(); if (decisionNote.length < 3) throw new Error('توضیح تصمیم منابع انسانی الزامی است.');
    return this.schedulePersonnelEnd(person.id, person.updatedAt, {effectiveDate: String(record.payload.proposedEmploymentEndDate ?? record.payload.employmentEndDate ?? ''), departureInitiator: record.payload.departureInitiator === 'employee' ? 'employee' : 'organization', reason: String(record.payload.employmentEndReason ?? ''), handoffNotes: record.description || undefined}, this.lifecycleExecutionToken, {recordId, expectedVersion, note: decisionNote});
  }

  async cancelPersonnelEndRequest(personnelId: string, reason: string, expectedVersion?: number): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    const person = state.personnel.find((item) => item.id === personnelId); if (!person) throw new Error('پرونده پرسنلی پیدا نشد.');
    const record = state.operationalRecords.find((item) => item.moduleId === 'offboarding' && item.ownerPersonnelId === personnelId && ['requested', 'scheduled'].includes(item.status));
    if (!record) throw new Error('درخواست باز یا پایان همکاری زمان‌بندی‌شده‌ای برای لغو وجود ندارد.');
    if (expectedVersion !== undefined && record.version !== expectedVersion) throw new Error('این درخواست در تب دیگری تغییر کرده است. صفحه را تازه‌سازی و دوباره تلاش کنید.');
    const isRequester = record.createdByUserId === actor.id;
    if (!isRequester && !canReviewEmploymentEnd(actor)) throw new Error('فقط ثبت‌کننده درخواست یا منابع انسانی مجاز به لغو آن است.');
    const cancellationReason = reason.trim(); if (cancellationReason.length < 3) throw new Error('دلیل لغو درخواست الزامی است.');
    const now = new Date().toISOString();
    if (record.status === 'scheduled' && person.employmentStatus === 'ending_scheduled' && person.pendingLifecycleChange?.kind === 'end') {
      const event = {id: newId('employment-event'), kind: 'employment_end_cancelled' as const, effectiveDate: person.pendingLifecycleChange.effectiveDate, reason: cancellationReason, actorId: actor.actorId, actorName: actor.name, recordedAt: now};
      await this.storage.put('personnel', {...person, employmentStatus: 'active', endDate: undefined, pendingLifecycleChange: undefined, lifecycleHistory: [...(person.lifecycleHistory ?? []), event], updatedAt: now});
    }
    const updated: OperationalRecord = {...record, status: 'cancelled', updatedByActorId: actor.actorId, version: record.version + 1, payload: {...record.payload, cancelledByUserId: actor.id, cancelledByName: actor.name, cancelledAt: now, cancellationReason, requestHasOperationalEffect: false, currentWaitingFor: 'درخواست لغو شده'}, updatedAt: now};
    const history = this.makeHistory(state, updated, actor, 'transitioned', {fromState: record.status, toState: 'cancelled', reason: cancellationReason, snapshot: {personnelId, previousStatus: record.status}});
    await this.persistOperationalChange('offboarding_cases', updated, history, actor, 'cancelled', `درخواست پایان همکاری «${person.firstName} ${person.lastName}» لغو شد و حساب و همکاری او فعال باقی ماند.`, cancellationReason);
    return this.loadState();
  }

  async schedulePersonnelEnd(personnelId: string, expectedUpdatedAt: string, input: PersonnelEndInput, executionToken?: symbol, approval?: {recordId: string; expectedVersion: number; note: string}): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    if (!actor.isAdmin && executionToken !== this.lifecycleExecutionToken) throw new Error('اجرای مستقیم پایان همکاری فقط مسیر اضطراری ادمین است؛ منابع انسانی باید درخواست مستقل بسازد و تأییدکننده دیگری آن را تصویب کند.');
    const person = state.personnel.find((item) => item.id === personnelId); if (!person) throw new Error('پرونده پرسنلی پیدا نشد.');
    if (person.employmentStatus !== 'active') throw new Error('فقط همکاری فعال را می‌توان خاتمه داد.');
    if (actor.personnelId === person.id) throw new Error('ثبت‌کننده نمی‌تواند پایان همکاری خودش را ثبت کند.');
    const effectiveDate = input.effectiveDate.trim(); const reason = input.reason.trim();
    if (!['employee', 'organization'].includes(input.departureInitiator)) throw new Error('مشخص کنید پایان همکاری به درخواست پرسنل است یا با تصمیم سازمان.');
    if (!effectiveDate || effectiveDate < currentLocalDate()) throw new Error('تاریخ پایان همکاری نمی‌تواند قبل از امروز باشد.');
    if (reason.length < 3) throw new Error('دلیل پایان همکاری الزامی است.');
    const now = new Date().toISOString(); const immediate = effectiveDate === currentLocalDate();
    const linkedUser = state.users.find((user) => user.id === person.linkedUserId);
    const approvalRecord = approval ? state.operationalRecords.find((item) => item.id === approval.recordId && item.moduleId === 'offboarding') : undefined;
    if (approval && (!approvalRecord || approvalRecord.version !== approval.expectedVersion || approvalRecord.status !== 'requested' || approvalRecord.ownerPersonnelId !== person.id)) throw new Error('درخواست پایان همکاری هم‌زمان تغییر کرده است؛ صفحه را تازه کنید.');
    if (!approval && state.operationalRecords.some((item) => item.moduleId === 'offboarding' && item.ownerPersonnelId === person.id && item.status === 'requested')) throw new Error('برای این پرسنل درخواست بررسی باز وجود دارد؛ همان درخواست باید توسط تأییدکننده مستقل تصویب شود.');
    const scheduledEvent = {id: newId('employment-event'), kind: immediate ? 'employment_ended' as const : 'employment_end_scheduled' as const, effectiveDate, reason, handoffNotes: input.handoffNotes?.trim(), departureInitiator: input.departureInitiator, actorId: actor.actorId, actorName: actor.name, recordedAt: now, previousEmploymentType: person.employmentType, roleIds: linkedUser?.roleIds ?? []};
    const updated: PersonnelRecord = {...person, employmentStatus: immediate ? 'ended' : 'ending_scheduled', endDate: effectiveDate, lifecycleHistory: [...(person.lifecycleHistory ?? []), scheduledEvent], pendingLifecycleChange: immediate ? undefined : {kind: 'end', effectiveDate, reason, handoffNotes: input.handoffNotes?.trim(), departureInitiator: input.departureInitiator, scheduledByActorId: actor.actorId, scheduledByActorName: actor.name, scheduledAt: now}, updatedAt: now};
    const module = ERP_MODULES.find((item) => item.id === 'offboarding'); if (!module) throw new Error('گردش خروج در سامانه فعال نیست.');
    const pendingAssets = state.operationalRecords.filter((record) => record.moduleId === 'fixed-asset' && record.payload.custodianPersonnelId === person.id && record.status !== 'disposed');
    const assetOfficer = state.users.find((user) => user.status === 'active' && user.roleIds.includes('role-asset-manager'));
    const targetStatus = immediate ? 'offboarding' : 'scheduled';
    const approvalPayload = approval ? {approvedByUserId: actor.id, approvedByName: actor.name, approvedAt: now, approvalNote: approval.note, requestHasOperationalEffect: true} : {requestHasOperationalEffect: true};
    const commonPayload = immediate
      ? {employmentEndDate: effectiveDate, employmentEndReason: reason, departureInitiator: input.departureInitiator, accountClosureStatus: 'disabled', assetClearanceStatus: pendingAssets.length ? 'pending' : 'clear', pendingAssetIds: pendingAssets.map((asset) => asset.id), handoffStatus: input.handoffNotes?.trim() ? 'documented' : 'pending', organizationalClearanceStatus: 'pending', financialClearanceStatus: 'pending', currentWaitingFor: pendingAssets.length ? 'عودت دارایی‌ها و اموال' : 'تسویه مالی و سازمانی'}
      : {employmentEndDate: effectiveDate, employmentEndReason: reason, departureInitiator: input.departureInitiator, accountClosureStatus: 'active', currentWaitingFor: `اجرای پایان همکاری در ${effectiveDate}`};
    const existing = state.operationalRecords.filter((record) => record.moduleId === 'offboarding');
    const offboarding: OperationalRecord = approvalRecord
      ? {...approvalRecord, status: targetStatus, assigneeUserId: immediate ? assetOfficer?.id ?? actor.id : approvalRecord.assigneeUserId, updatedByActorId: actor.actorId, version: approvalRecord.version + 1, payload: {...approvalRecord.payload, ...commonPayload, ...approvalPayload}, updatedAt: now}
      : {id: newId('offboarding'), moduleId: 'offboarding', domain: 'hr', trackingCode: `${module.prefix}-${new Date().getFullYear()}-${String(existing.length + 1).padStart(4, '0')}`, title: `${immediate ? 'تسویه و خروج' : 'پایان همکاری زمان‌بندی‌شده'} ${person.firstName} ${person.lastName}`, description: input.handoffNotes?.trim() ?? '', status: targetStatus, priority: 'normal', companyId: actor.companyId, unitId: person.unitId, branchUnitId: person.branchUnitId, ownerPersonnelId: person.id, assigneeUserId: immediate ? assetOfficer?.id ?? actor.id : actor.id, createdByActorId: actor.actorId, createdByUserId: actor.id, updatedByActorId: actor.actorId, workflowVersion: activeWorkflowFor(state, module).version, version: 1, payload: {personnelId: person.id, personnelCode: person.personnelCode, ...commonPayload, ...approvalPayload}, createdAt: now, updatedAt: now};
    const history: OperationalRecordHistory = approvalRecord
      ? this.makeHistory(state, offboarding, actor, 'transitioned', {fromState: approvalRecord.status, toState: targetStatus, reason: approval?.note ?? reason, snapshot: {personnelId, effectiveDate, immediate}})
      : {id: newId('history'), recordId: offboarding.id, moduleId: offboarding.moduleId, sequence: 1, eventType: 'created', actorId: actor.actorId, actorName: actor.name, effectiveUserId: actor.id, reason, snapshot: {personnelId, effectiveDate, immediate}, occurredAt: now};
    const shouldDisableLinkedUser = Boolean(immediate && linkedUser);
    const auditActor = await this.resolveAuditActor(actor); const correlationId = newId('correlation');
    await this.storage.transaction(['personnel', 'users', 'offboarding_cases', 'workflow_history', 'audit_events', 'domain_events', 'meta'], 'readwrite', async (tx) => {
      const latestPerson = await tx.get<PersonnelRecord>('personnel', person.id);
      if (!latestPerson || latestPerson.updatedAt !== expectedUpdatedAt || person.updatedAt !== expectedUpdatedAt || latestPerson.employmentStatus !== person.employmentStatus) throw new Error('پرونده پرسنلی هم‌زمان تغییر کرده است؛ صفحه را تازه کنید.');
      if (approvalRecord) {
        const latestRequest = await tx.get<OperationalRecord>('offboarding_cases', approvalRecord.id);
        if (!latestRequest || latestRequest.version !== approvalRecord.version || latestRequest.status !== 'requested') throw new Error('درخواست پایان همکاری هم‌زمان تغییر کرده است؛ صفحه را تازه کنید.');
      }
      const audits = await tx.getAll<AuditEvent>('audit_events');
      await tx.put('personnel', updated);
      if (shouldDisableLinkedUser && linkedUser) {const currentUser=await tx.get<LocalUser>('users',linkedUser.id);if(!currentUser||userConcurrencyToken(currentUser)!==userConcurrencyToken(linkedUser))throw new Error('حساب مرتبط در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');if(currentUser.isAdmin)throw new Error('پایان همکاری مستقیم برای حساب ادمین اصلی مجاز نیست.');await tx.put('users',{...currentUser,status:'inactive'});}
      await tx.put('offboarding_cases', offboarding);
      await tx.put('workflow_history', history);
      await tx.put('audit_events', {id: newId('audit'), sequence: nextSequence(audits), companyId: actor.companyId, category: 'system', action: immediate ? 'organization.personnel.employment_ended' : 'organization.personnel.employment_end_scheduled', actorId: auditActor.actorId, actorName: auditActor.name, effectiveUserId: actor.id, occurredAt: now, summary: immediate ? `${input.departureInitiator === 'employee' ? 'استعفای' : 'قطع همکاری'} «${person.firstName} ${person.lastName}» ثبت و حساب او غیرفعال شد.` : `${input.departureInitiator === 'employee' ? 'استعفا' : 'قطع همکاری'} برای «${person.firstName} ${person.lastName}» در تاریخ ${effectiveDate} زمان‌بندی شد.`, reason, outcome: 'success', correlationId, metadata: {personnelId, effectiveDate, immediate, departureInitiator: input.departureInitiator, linkedUserId: linkedUser?.id ?? '', offboardingRecordId: offboarding.id}} satisfies AuditEvent);
      await tx.put('domain_events', {id: newId('event'), aggregateType: 'personnel-lifecycle', aggregateId: person.id, eventType: immediate ? 'employment_ended' : 'employment_end_scheduled', actorId: auditActor.actorId, occurredAt: now, correlationId, payload: {effectiveUserId: actor.id, effectiveDate, offboardingRecordId: offboarding.id}} satisfies DomainEvent);
      await tx.put('meta', {id: 'lastPersistedAt', value: now});
    });
    return this.loadState();
  }

  async cancelPersonnelEnd(personnelId: string, expectedUpdatedAt: string, reason: string): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    requirePermission(actor, 'organization.personnel.manage', 'مجوز لغو پایان همکاری را ندارید.');
    const person = state.personnel.find((item) => item.id === personnelId); if (!person) throw new Error('پرونده پرسنلی پیدا نشد.');
    if (person.employmentStatus !== 'ending_scheduled' || person.pendingLifecycleChange?.kind !== 'end') throw new Error('پایان همکاری زمان‌بندی‌شده‌ای برای لغو وجود ندارد.');
    if (reason.trim().length < 3) throw new Error('دلیل لغو پایان همکاری الزامی است.');
    const now = new Date().toISOString();
    const event = {id: newId('employment-event'), kind: 'employment_end_cancelled' as const, effectiveDate: person.pendingLifecycleChange.effectiveDate, reason: reason.trim(), actorId: actor.actorId, actorName: actor.name, recordedAt: now};
    const updated={...person,employmentStatus:'active' as const,endDate:undefined,pendingLifecycleChange:undefined,lifecycleHistory:[...(person.lifecycleHistory??[]),event],updatedAt:now};const correlationId=newId('correlation');
    await this.storage.transaction(['personnel','audit_events','domain_events','meta'],'readwrite',async(tx)=>{const current=await tx.get<PersonnelRecord>('personnel',personnelId);if(!current||current.updatedAt!==expectedUpdatedAt||person.updatedAt!==expectedUpdatedAt||current.pendingLifecycleChange?.scheduledAt!==person.pendingLifecycleChange?.scheduledAt)throw new Error('پرونده پرسنلی در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');const audits=await tx.getAll<AuditEvent>('audit_events');await tx.put('personnel',updated);await tx.put('audit_events',{id:newId('audit'),sequence:nextSequence(audits),companyId:actor.companyId,category:'system',action:'organization.personnel.employment_end_cancelled',actorId:actor.actorId,actorName:actor.name,effectiveUserId:actor.id,occurredAt:now,summary:`پایان همکاری زمان‌بندی‌شده «${person.firstName} ${person.lastName}» لغو شد.`,reason:reason.trim(),outcome:'success',correlationId,metadata:{personnelId}} satisfies AuditEvent);await tx.put('domain_events',{id:newId('event'),aggregateType:'personnel-lifecycle',aggregateId:personnelId,eventType:'PersonnelEndCancelled',actorId:actor.actorId,occurredAt:now,correlationId,payload:{}} satisfies DomainEvent);await tx.put('meta',{id:'lastPersistedAt',value:now});});
    return this.loadState();
  }

  async rehirePersonnel(personnelId: string, expectedUpdatedAt: string, input: PersonnelRehireInput): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    requirePermission(actor, 'organization.personnel.manage', 'مجوز ثبت بازگشت به همکاری را ندارید.');
    const person = state.personnel.find((item) => item.id === personnelId); if (!person) throw new Error('پرونده پرسنلی پیدا نشد.');
    if (person.employmentStatus !== 'ended') throw new Error('بازگشت به همکاری فقط برای پرونده خاتمه‌یافته ثبت می‌شود.');
    const effectiveDate = input.effectiveDate.trim(); const reason = input.reason.trim();
    if (!effectiveDate || effectiveDate < currentLocalDate()) throw new Error('تاریخ بازگشت نمی‌تواند قبل از امروز باشد.');
    if (reason.length < 3) throw new Error('دلیل بازگشت به همکاری الزامی است.');
    if (!input.employmentType.trim() || !input.unitId || !input.positionId) throw new Error('نوع همکاری، واحد و سمت جدید الزامی هستند.');
    const targetPosition = state.positions.find((position) => position.id === input.positionId && position.status === 'active');
    if (!targetPosition || !positionSupportsUnit(targetPosition, input.unitId)) throw new Error('سمت انتخاب‌شده برای واحد دوره همکاری جدید مجاز نیست.');
    const linkedUser = state.users.find((user) => user.id === person.linkedUserId);
    if (linkedUser) requirePermission(actor, 'organization.roles.assign', 'برای فعال‌سازی دوباره حساب، تأیید مدیر دسترسی و مجوز انتساب نقش لازم است.');
    if (linkedUser && !input.roleIds.length) throw new Error('برای فعال‌شدن دوباره حساب، حداقل یک نقش جدید انتخاب کنید؛ نقش‌های قبلی خودکار برنمی‌گردند.');
    if (input.roleIds.some((id) => !state.roles.some((role) => role.id === id && role.status === 'active'))) throw new Error('یکی از نقش‌های انتخاب‌شده فعال یا معتبر نیست.');
    if (linkedUser) assertDirectAccessAssignmentAllowed(actor, linkedUser, input.roleIds, [], [], state.roles, state.session.actingAdminUserId);
    const now = new Date().toISOString(); const immediate = effectiveDate === currentLocalDate();
    const lifecycleData = {effectiveDate, reason, employmentType: input.employmentType.trim(), unitId: input.unitId, positionId: input.positionId, branchUnitId: input.branchUnitId, managerPersonnelId: input.managerPersonnelId, roleIds: [...new Set(input.roleIds)]};
    const event = {id: newId('employment-event'), kind: immediate ? 'rehired' as const : 'rehire_scheduled' as const, ...lifecycleData, actorId: actor.actorId, actorName: actor.name, recordedAt: now};
    const updated: PersonnelRecord = immediate ? {...person, employmentStatus: 'active', startDate: effectiveDate, endDate: undefined, employmentType: lifecycleData.employmentType, unitId: input.unitId, positionId: input.positionId, branchUnitId: input.branchUnitId, managerPersonnelId: input.managerPersonnelId, pendingLifecycleChange: undefined, lifecycleHistory: [...(person.lifecycleHistory ?? []), event], updatedAt: now} : {...person, employmentStatus: 'rehire_scheduled', pendingLifecycleChange: {kind: 'rehire', ...lifecycleData, scheduledByActorId: actor.actorId, scheduledByActorName: actor.name, scheduledAt: now}, lifecycleHistory: [...(person.lifecycleHistory ?? []), event], updatedAt: now};
    let updatedLinkedUser: LocalUser | undefined;
    if (immediate && linkedUser) {
      const managerUserId = state.users.find((user) => user.personnelId === input.managerPersonnelId)?.id;
      const roleIds = lifecycleData.roleIds; const roleId = roleIds[0];
      updatedLinkedUser = resolveUserAccess({...linkedUser, status: 'active', roleId, roleIds, unitId: input.unitId, positionId: input.positionId, branchUnitId: input.branchUnitId, managerUserId}, state.roles);
    }
    const action = immediate ? 'organization.personnel.rehired' : 'organization.personnel.rehire_scheduled';
    const summary = immediate ? `بازگشت به همکاری «${person.firstName} ${person.lastName}» ثبت و حساب او با نقش‌های جدید فعال شد.` : `بازگشت به همکاری «${person.firstName} ${person.lastName}» برای ${effectiveDate} زمان‌بندی شد.`;
    const correlationId = newId('correlation');
    await this.storage.transaction(['personnel','users','security_roles','audit_events','domain_events','meta'], 'readwrite', async (tx) => {
      const current = await tx.get<PersonnelRecord>('personnel', personnelId);
      if (!current || current.updatedAt !== expectedUpdatedAt || person.updatedAt !== expectedUpdatedAt || current.employmentStatus !== 'ended') throw new Error('پرونده پرسنلی در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');
      const [currentRoles,currentUsers] = await Promise.all([tx.getAll<SecurityRole>('security_roles'),tx.getAll<LocalUser>('users')]);
      if (lifecycleData.roleIds.some((id)=>!currentRoles.some((role)=>role.id===id&&role.status==='active'))) throw new Error('یکی از نقش‌های انتخاب‌شده هم‌زمان تغییر کرده یا غیرفعال شده است؛ تازه‌سازی کنید.');
      if (linkedUser) {
        const currentUser=await tx.get<LocalUser>('users',linkedUser.id);
        if(!currentUser||userMutationFingerprint(currentUser)!==userMutationFingerprint(linkedUser))throw new Error('حساب مرتبط در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');
        assertDirectAccessAssignmentAllowed(actor,currentUser,lifecycleData.roleIds,[],[],currentRoles,state.session.actingAdminUserId);
        if(immediate){const managerUserId=currentUsers.find((user)=>user.personnelId===input.managerPersonnelId)?.id;const roleId=lifecycleData.roleIds[0];updatedLinkedUser=resolveUserAccess({...currentUser,status:'active',roleId,roleIds:lifecycleData.roleIds,unitId:input.unitId,positionId:input.positionId,branchUnitId:input.branchUnitId,managerUserId},currentRoles);}
      }
      const audits = await tx.getAll<AuditEvent>('audit_events');
      await tx.put('personnel', updated);
      if (updatedLinkedUser) await tx.put('users', updatedLinkedUser);
      await tx.put('audit_events', {id:newId('audit'), sequence:nextSequence(audits), companyId:actor.companyId, category:'authorization', action, actorId:actor.actorId, actorName:actor.name, effectiveUserId:updatedLinkedUser?.id ?? actor.id, occurredAt:now, summary, reason, outcome:'success', correlationId, metadata:{personnelId,effectiveDate,immediate,roleIds:lifecycleData.roleIds.join(',')}} satisfies AuditEvent);
      await tx.put('domain_events', {id:newId('event'), aggregateType:'personnel', aggregateId:personnelId, eventType:immediate?'PersonnelRehired':'PersonnelRehireScheduled', actorId:actor.actorId, occurredAt:now, correlationId, payload:{linkedUserId:updatedLinkedUser?.id ?? null,roleIds:lifecycleData.roleIds}} satisfies DomainEvent);
      await tx.put('meta', {id:'lastPersistedAt',value:now});
    });
    return this.loadState();
  }

  private personnelResource(state: FoundationState, personnel: PersonnelRecord) {
    const linkedUser = state.users.find((user) => user.id === personnel.linkedUserId || user.personnelId === personnel.id);
    const unitCompanyIds = [...new Set(state.users.filter((user) => user.unitId === personnel.unitId).map((user) => user.companyId))];
    const companyId = personnel.companyId ?? linkedUser?.companyId ?? (unitCompanyIds.length === 1 ? unitCompanyIds[0] : `unresolved-company:${personnel.id}`);
    return {id: personnel.id, companyId, unitId: personnel.unitId, ownerId: linkedUser?.actorId, createdBy: 'system', state: personnel.employmentStatus};
  }

  private assertPersonnelDocumentAccess(state: FoundationState, personnel: PersonnelRecord, permission: string): void {
    const actor = state.activeUser;
    if (!actor.permissions.includes(permission)) throw new Error('مجوز لازم برای مدارک پرسنلی را ندارید.');
    const decision = authorize({persona: actor, permission, resource: this.personnelResource(state, personnel), action: permission === PERSONNEL_DOCUMENT_PERMISSION_MANAGE ? 'edit' : 'view'});
    if (!decision.allowed) throw new Error(decision.reasonFa);
  }

  async savePersonnelDocument(personnelId: string, input: PersonnelDocumentUploadInput): Promise<FoundationState> {
    const state = await this.loadState();
    const effectiveUser = state.activeUser;
    if (state.session.actingAdminUserId) throw new Error('ثبت مدرک هویتی در حالت مشاهده دسترسی مجاز نیست؛ کاربر باید مستقیماً وارد شود.');
    const personnel = state.personnel.find((item) => item.id === personnelId);
    if (!personnel) throw new Error('پرونده پرسنلی پیدا نشد.');
    if (effectiveUser.status !== 'active' || personnel.employmentStatus === 'ended') throw new Error('برای حساب یا همکاری غیرفعال امکان ثبت مدرک وجود ندارد.');
    const ownPersonnel = effectiveUser.personnelId === personnel.id || personnel.linkedUserId === effectiveUser.id;
    if (!ownPersonnel) this.assertPersonnelDocumentAccess(state, personnel, PERSONNEL_DOCUMENT_PERMISSION_MANAGE);
    const definition = personnelDocumentDefinition(input.kind);
    const validated = await validatePersonnelDocumentFile(input.kind, input);
    const currentDocuments = activePersonnelDocuments(state.operationalRecords, personnel.id);
    const requestedReplacement = input.replaceDocumentId
      ? currentDocuments.find((record) => record.id === input.replaceDocumentId && record.payload.documentKind === input.kind)
      : undefined;
    if (input.replaceDocumentId && !requestedReplacement) throw new Error('نسخه فعالی که باید جایگزین شود پیدا نشد.');
    const implicitReplacement = !definition.repeatable
      ? currentDocuments.find((record) => record.payload.documentKind === input.kind)
      : undefined;
    const replaced = requestedReplacement ?? implicitReplacement;
    const now = new Date().toISOString();
    const recordId = newId('personnel-document');
    const fileId = newId('personnel-document-file');
    const module = ERP_MODULES.find((item) => item.id === 'personnel-document');
    if (!module) throw new Error('ماژول مدارک پرسنلی آماده نیست.');
    const record: OperationalRecord = {
      id: recordId, moduleId: 'personnel-document', domain: module.domain,
      trackingCode: `DOC-${new Date().getFullYear()}-${recordId.slice(-8).toUpperCase()}`,
      title: `${definition.label} — ${personnel.firstName} ${personnel.lastName}`,
      description: definition.description, status: 'linked', priority: definition.required ? 'high' : 'normal',
      companyId: this.personnelResource(state, personnel).companyId, unitId: personnel.unitId, branchUnitId: personnel.branchUnitId,
      ownerPersonnelId: personnel.id, assigneeUserId: effectiveUser.id,
      createdByActorId: effectiveUser.actorId, createdByUserId: effectiveUser.id, updatedByActorId: effectiveUser.actorId,
      version: 1,
      payload: {
        documentKind: input.kind, documentLabel: definition.label, required: definition.required,
        fileRef: fileId, fileName: validated.fileName, mimeType: validated.mimeType, fileSize: validated.size,
        checksumSha256: validated.checksumSha256, uploadedAt: now, uploadedByUserId: effectiveUser.id,
        uploadedByName: effectiveUser.name, uploadedBySelfService: ownPersonnel,
        replacesDocumentId: replaced?.id ?? null,
      },
      createdAt: now, updatedAt: now,
    };
    const file: PersonnelDocumentFile = {id: fileId, recordId, personnelId: personnel.id, companyId: record.companyId, mimeType: validated.mimeType, size: validated.size, checksumSha256: validated.checksumSha256, dataUrl: validated.dataUrl, createdAt: now, updatedAt: now};
    const replacedRecord = replaced ? {...replaced, status: 'replaced', payload: {...replaced.payload, replacedByDocumentId: recordId}, updatedByActorId: effectiveUser.actorId, updatedAt: now, version: replaced.version + 1} : undefined;
    const auditActor = await this.resolveAuditActor(effectiveUser);
    const correlationId = newId('correlation');
    await this.storage.transaction(['personnel_documents', 'personnel_document_files', 'workflow_history', 'audit_events', 'domain_events', 'meta'], 'readwrite', async (tx) => {
      const activeSameKind = (await tx.getAll<OperationalRecord>('personnel_documents')).filter((item) => item.ownerPersonnelId === personnel.id && item.status === 'linked' && item.payload.documentKind === input.kind);
      if (!definition.repeatable && (replaced ? activeSameKind.some((item) => item.id !== replaced.id) : activeSameKind.length > 0)) {
        throw new Error('نسخه مدرک در تب دیگری تغییر کرده است. صفحه را تازه‌سازی کنید.');
      }
      if (replaced) {
        const latest = await tx.get<OperationalRecord>('personnel_documents', replaced.id);
        if (!latest || latest.version !== replaced.version || latest.status !== 'linked') throw new Error('نسخه مدرک در تب دیگری تغییر کرده است. صفحه را تازه‌سازی کنید.');
        await tx.put('personnel_documents', replacedRecord!);
      }
      const audits = await tx.getAll<AuditEvent>('audit_events');
      await tx.put('personnel_documents', record);
      await tx.put('personnel_document_files', file);
      await tx.put('workflow_history', {id: newId('history'), recordId, moduleId: 'personnel-document', sequence: 1, eventType: replaced ? 'corrected' : 'created', actorId: effectiveUser.actorId, actorName: effectiveUser.name, effectiveUserId: effectiveUser.id, snapshot: {documentKind: input.kind, required: definition.required, checksumSha256: validated.checksumSha256, replacesDocumentId: replaced?.id ?? null}, occurredAt: now} satisfies OperationalRecordHistory);
      await tx.put('audit_events', {id: newId('audit'), sequence: nextSequence(audits), companyId: record.companyId, category: 'authorization', action: replaced ? 'organization.personnel.document_replaced' : 'organization.personnel.document_uploaded', actorId: auditActor.actorId, actorName: auditActor.name, effectiveUserId: effectiveUser.id, occurredAt: now, summary: `${definition.label} پرونده «${personnel.firstName} ${personnel.lastName}» ${replaced ? 'جایگزین' : 'ثبت'} شد.`, outcome: 'success', correlationId, metadata: {personnelId: personnel.id, recordId, documentKind: input.kind, completedBySelfService: ownPersonnel, replacedDocumentId: replaced?.id ?? null}} satisfies AuditEvent);
      await tx.put('domain_events', {id: newId('event'), aggregateType: 'personnel-document', aggregateId: recordId, eventType: replaced ? 'PersonnelDocumentReplaced' : 'PersonnelDocumentUploaded', actorId: auditActor.actorId, occurredAt: now, correlationId, payload: {personnelId: personnel.id, documentKind: input.kind, required: definition.required, checksumSha256: validated.checksumSha256, effectiveUserId: effectiveUser.id}} satisfies DomainEvent);
      await tx.put('meta', {id: 'lastPersistedAt', value: now});
    });
    return this.loadState();
  }

  async getPersonnelDocumentFile(recordId: string): Promise<PersonnelDocumentFile> {
    const state = await this.loadState();
    if (state.session.actingAdminUserId) throw new Error('دریافت مدرک هویتی در حالت مشاهده دسترسی مجاز نیست.');
    const record = state.operationalRecords.find((item) => item.id === recordId && item.moduleId === 'personnel-document');
    if (!record || typeof record.payload.fileRef !== 'string') throw new Error('فایل مدرک پیدا نشد.');
    const personnel = state.personnel.find((item) => item.id === record.ownerPersonnelId);
    if (!personnel) throw new Error('پرونده مرتبط پیدا نشد.');
    const ownPersonnel = state.activeUser.personnelId === personnel.id || personnel.linkedUserId === state.activeUser.id;
    if (!ownPersonnel) this.assertPersonnelDocumentAccess(state, personnel, PERSONNEL_DOCUMENT_PERMISSION_READ);
    const file = await this.storage.get<PersonnelDocumentFile>('personnel_document_files', record.payload.fileRef);
    if (!file || file.recordId !== record.id || file.personnelId !== personnel.id) throw new Error('محتوای فایل با پرونده مطابقت ندارد.');
    return file;
  }

  async completeOwnPersonnelProfile(input: ProfileCompletionInput): Promise<FoundationState> {
    const state = await this.loadState();
    if (state.session.actingAdminUserId) throw new Error('تکمیل پرونده در حالت مشاهده دسترسی مجاز نیست؛ کاربر باید مستقیماً وارد شود.');
    const effectiveUser = state.activeUser;
    const actor = state.session.actingAdminUserId ? state.users.find((user) => user.id === state.session.actingAdminUserId) ?? effectiveUser : effectiveUser;
    const existing = state.personnel.find((person) => person.id === effectiveUser.personnelId || person.linkedUserId === effectiveUser.id);
    if (!existing) throw new Error('پرونده پرسنلی به این حساب متصل نشده است؛ با ادمین سازمان تماس بگیرید.');
    const normalizedProfile: ProfileCompletionInput = {
      nationalId: normalizeNationalId(input.nationalId),
      gender: input.gender,
      secondaryMobile: normalizePhone(input.secondaryMobile),
      province: input.province?.trim(),
      city: input.city?.trim(),
      address: input.address?.trim(),
      postalCode: normalizeDigits(input.postalCode).replace(/\D/g, ''),
      bankName: input.bankName?.trim(),
      cardNumber: normalizeCardNumber(input.cardNumber ?? ''),
    };
    const errors = validateRequiredProfile(normalizedProfile);
    if (errors.length) throw new Error(errors[0]);
    if (!isValidIranianNationalId(normalizedProfile.nationalId)) throw new Error('کد ملی معتبر نیست.');
    if (state.personnel.some((person) => person.id !== existing.id && normalizeNationalId(person.nationalId) === normalizedProfile.nationalId)) throw new Error('این کد ملی قبلاً برای پرونده دیگری ثبت شده است.');
    const missingDocuments = missingPersonnelDocuments(state.operationalRecords, existing.id);
    if (missingDocuments.length) throw new Error(`مدارک اجباری پرونده کامل نیست: ${missingDocuments.map((item) => item.label).join('، ')}.`);
    const updated: PersonnelRecord = {...existing, ...normalizedProfile, updatedAt: new Date().toISOString()};
    const now = updated.updatedAt;
    const auditActor = await this.resolveAuditActor(effectiveUser);
    const correlationId = newId('correlation');
    await this.storage.transaction(['personnel', 'audit_events', 'domain_events', 'meta'], 'readwrite', async (tx) => {
      const audits = await tx.getAll<AuditEvent>('audit_events');
      await tx.put('personnel', updated);
      await tx.put('audit_events', {id: newId('audit'), sequence: nextSequence(audits), companyId: effectiveUser.companyId, category: 'authorization', action: 'organization.personnel.profile_completed', actorId: auditActor.actorId, actorName: auditActor.name, effectiveUserId: effectiveUser.id, occurredAt: now, summary: `اطلاعات الزامی پرونده «${updated.firstName} ${updated.lastName}» تکمیل شد.`, outcome: 'success', correlationId, metadata: {personnelId: updated.id, completedBySelfService: true}} satisfies AuditEvent);
      await tx.put('domain_events', {id: newId('event'), aggregateType: 'personnel', aggregateId: updated.id, eventType: 'PersonnelProfileCompleted', actorId: auditActor.actorId, occurredAt: now, correlationId, payload: {effectiveUserId: effectiveUser.id}} satisfies DomainEvent);
      await tx.put('meta', {id: 'lastPersistedAt', value: now});
    });
    return this.loadState();
  }

  async deferOwnPersonnelProfileCompletion(): Promise<FoundationState> {
    const state = await this.loadState();
    const user = state.activeUser;
    if (state.session.actingAdminUserId) throw new Error('تعویق تکمیل پرونده در حالت مشاهده دسترسی مجاز نیست.');
    if (!user.personnelId && !state.personnel.some((person) => person.linkedUserId === user.id)) throw new Error('پرونده پرسنلی به این حساب متصل نشده است.');
    const now = new Date();
    const deferredUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const occurredAt = now.toISOString();
    const correlationId = newId('correlation');
    await this.storage.transaction(['sessions', 'meta', 'audit_events', 'domain_events'], 'readwrite', async (tx) => {
      const audits = await tx.getAll<AuditEvent>('audit_events');
      const session: FoundationSession = {...state.session, profileCompletionDeferredUntil: deferredUntil, version: state.session.version + 1};
      await tx.put('sessions', session);
      await tx.put('meta', {id: `profileCompletionDeferredUntil:${user.id}`, value: deferredUntil});
      await tx.put('meta', {id: 'lastPersistedAt', value: occurredAt});
      await tx.put('audit_events', {id: newId('audit'), sequence: nextSequence(audits), companyId: user.companyId, category: 'authorization', action: 'organization.personnel.profile_completion_deferred', actorId: user.actorId, actorName: user.name, effectiveUserId: user.id, occurredAt, summary: `تکمیل پرونده «${user.name}» برای هفت روز به تعویق افتاد.`, outcome: 'info', correlationId, metadata: {userId: user.id, deferredUntil}} satisfies AuditEvent);
      await tx.put('domain_events', {id: newId('event'), aggregateType: 'personnel', aggregateId: user.personnelId ?? user.id, eventType: 'PersonnelProfileCompletionDeferred', actorId: user.actorId, occurredAt, correlationId, payload: {userId: user.id, deferredUntil}} satisfies DomainEvent);
    });
    return this.loadState();
  }

  async submitOwnProfileChange(input: OwnProfileChangeInput): Promise<FoundationState> {
    const state = await this.loadState();
    const requester = state.activeUser;
    if (state.session.actingAdminUserId) throw new Error('ثبت درخواست تغییر در حالت مشاهده دسترسی مجاز نیست؛ کاربر باید با حساب خودش وارد شود.');
    const personnel = state.personnel.find((person) => person.id === requester.personnelId || person.linkedUserId === requester.id);
    if (!personnel) throw new Error('پرونده پرسنلی به این حساب متصل نشده است.');
    if (state.personnelProfileChangeRequests.some((request) => request.requesterUserId === requester.id && request.status === 'submitted')) throw new Error('یک درخواست تغییر در انتظار بررسی دارید؛ پس از تصمیم منابع انسانی درخواست بعدی را ثبت کنید.');
    if (input.reason.trim().length < 5) throw new Error('دلیل درخواست باید حداقل ۵ نویسه باشد.');

    const requestedValues = normalizeProfileChangeValues(input.requestedValues);
    const changedEntries = Object.entries(requestedValues).filter(([key, value]) => String(personnel[key as PersonnelProfileChangeField] ?? '') !== value);
    if (!changedEntries.length) throw new Error('حداقل یک مقدار را نسبت به اطلاعات فعلی تغییر دهید.');
    const changes = Object.fromEntries(changedEntries) as PersonnelProfileChangeValues;
    const merged = {...personnel, ...changes} as PersonnelRecord;
    validateSelfServiceProfile(merged, state.personnel, personnel.id);

    const now = new Date().toISOString();
    const beforeValues = Object.fromEntries(changedEntries.map(([key]) => [key, String(personnel[key as PersonnelProfileChangeField] ?? '')])) as PersonnelProfileChangeValues;
    const request: PersonnelProfileChangeRequest = {
      id: newId('profile-change'),
      trackingCode: `PCR-${String(state.personnelProfileChangeRequests.length + 1).padStart(5, '0')}`,
      personnelId: personnel.id,
      requesterUserId: requester.id,
      requesterName: requester.name,
      status: 'submitted',
      beforeValues,
      requestedValues: changes,
      reason: input.reason.trim(),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.storage.put('personnel_profile_change_requests', request);
    await this.appendAudit({actor: requester, effectiveUser: requester, category: 'system', action: 'organization.personnel.profile_change_requested', summary: `درخواست تغییر اطلاعات «${requester.name}» با کد ${request.trackingCode} ثبت شد.`, reason: request.reason, outcome: 'success', metadata: {requestId: request.id, personnelId: personnel.id, changedFields: Object.keys(changes).join(','), version: request.version}});
    return this.loadState();
  }

  async reviewProfileChangeRequest(requestId: string, decision: 'approved' | 'rejected', reason: string, expectedVersion: number): Promise<FoundationState> {
    const state = await this.loadState();
    const reviewer = state.activeUser;
    requirePermission(reviewer, 'organization.personnel.changes.review', 'مجوز بررسی صف تغییرات پرسنل را ندارید.');
    const request = state.personnelProfileChangeRequests.find((item) => item.id === requestId);
    if (!request) throw new Error('درخواست تغییر اطلاعات پیدا نشد.');
    if (request.status !== 'submitted') throw new Error('این درخواست قبلاً بررسی شده است.');
    if (request.version !== expectedVersion) throw new Error('نسخه درخواست تغییر کرده است؛ صفحه را تازه‌سازی کنید.');
    if (request.requesterUserId === reviewer.id) throw new Error('ثبت‌کننده درخواست نمی‌تواند درخواست خودش را تأیید یا رد کند.');
    if (reason.trim().length < 3) throw new Error('دلیل تصمیم منابع انسانی الزامی است.');
    const personnel = state.personnel.find((person) => person.id === request.personnelId);
    if (!personnel) throw new Error('پرونده پرسنلی مرتبط پیدا نشد.');
    const bankingChanged = Object.keys(request.requestedValues).some((field) => PROFILE_BANKING_FIELDS.has(field as PersonnelProfileChangeField));
    if (decision === 'approved' && bankingChanged) requirePermission(reviewer, 'organization.personnel.banking.manage', 'برای تأیید تغییر اطلاعات بانکی، مجوز اطلاعات بانکی پرسنل لازم است.');

    const now = new Date().toISOString();
    const reviewed: PersonnelProfileChangeRequest = {...request, status: decision, reviewerUserId: reviewer.id, reviewerName: reviewer.name, reviewReason: reason.trim(), reviewedAt: now, updatedAt: now, version: request.version + 1};
    if (decision === 'rejected') {
      await this.storage.put('personnel_profile_change_requests', reviewed);
    } else {
      const updatedPersonnel = {...personnel, ...request.requestedValues, updatedAt: now} as PersonnelRecord;
      validateSelfServiceProfile(updatedPersonnel, state.personnel, personnel.id);
      const linkedUser = state.users.find((user) => user.id === personnel.linkedUserId || user.personnelId === personnel.id);
      const updatedUser = linkedUser ? resolveUserAccess({...linkedUser, name: `${updatedPersonnel.firstName} ${updatedPersonnel.lastName}`.trim(), initials: makeInitials(`${updatedPersonnel.firstName} ${updatedPersonnel.lastName}`)}, state.roles) : undefined;
      await this.storage.transaction(['personnel_profile_change_requests', 'personnel', 'users'], 'readwrite', async (transaction) => {
        await transaction.put('personnel_profile_change_requests', reviewed);
        await transaction.put('personnel', updatedPersonnel);
        if (updatedUser) await transaction.put('users', updatedUser);
      });
    }
    await this.appendAudit({actor: reviewer, effectiveUser: reviewer, category: 'system', action: decision === 'approved' ? 'organization.personnel.profile_change_approved' : 'organization.personnel.profile_change_rejected', summary: `درخواست ${request.trackingCode} برای «${request.requesterName}» ${decision === 'approved' ? 'تأیید و اعمال' : 'رد'} شد.`, reason: reason.trim(), outcome: 'success', metadata: {requestId: request.id, personnelId: request.personnelId, requesterUserId: request.requesterUserId, reviewerUserId: reviewer.id, changedFields: Object.keys(request.requestedValues).join(','), version: reviewed.version}});
    return this.loadState();
  }

  async addSalesCompensation(personnelId: string, input: SalesCompensationInput): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    requirePermission(actor, 'organization.personnel.manage', 'مجوز ثبت شرایط مالی پرسنل فروش را ندارید.');
    const personnel = state.personnel.find((item) => item.id === personnelId);
    if (!personnel) throw new Error('پرونده پرسنلی پیدا نشد.');
    if (!personnel.salesHierarchyLevel) throw new Error('شرایط حقوق و پورسانت فقط برای پرسنل متصل به ساختار فروش ثبت می‌شود.');
    validateSalesCompensationInput(input);
    const now = new Date().toISOString();
    const fixedRequired = input.mode === 'fixed_salary' || input.mode === 'fixed_salary_plus_commission';
    const commissionRequired = input.mode === 'commission_only' || input.mode === 'fixed_salary_plus_commission';
    const compensation = {
      id: newId('sales-compensation'),
      mode: input.mode,
      monthlyFixedSalaryRial: fixedRequired ? input.monthlyFixedSalaryRial?.replace(/\D/g, '') : undefined,
      commissionPercent: commissionRequired ? input.commissionPercent?.trim() : undefined,
      commissionBasis: 'invoice_collection' as const,
      effectiveFrom: input.effectiveFrom,
      reason: input.reason.trim(),
      actorId: actor.actorId,
      actorName: actor.name,
      recordedAt: now,
    };
    await this.storage.put('personnel', {...personnel, salesCompensationHistory: [...(personnel.salesCompensationHistory ?? []), compensation], updatedAt: now});
    await this.appendAudit({actor, effectiveUser: actor, category: 'system', action: 'organization.personnel.sales_compensation_changed', summary: `شرایط حقوق و پورسانت «${personnel.firstName} ${personnel.lastName}» از تاریخ ${input.effectiveFrom} ثبت شد.`, reason: compensation.reason, outcome: 'success', metadata: {personnelId, compensationId: compensation.id, mode: compensation.mode, effectiveFrom: compensation.effectiveFrom, monthlyFixedSalaryRial: compensation.monthlyFixedSalaryRial ?? '', commissionPercent: compensation.commissionPercent ?? '', commissionBasis: compensation.commissionBasis}});
    return this.loadState();
  }

  async changePersonnelAssignment(personnelId: string, input: PersonnelAssignmentChangeInput): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    requirePermission(actor, 'organization.personnel.manage', 'مجوز ثبت تغییر جایگاه پرسنل را ندارید.');
    if (state.session.actingAdminUserId) throw new Error('در حالت مشاهده آزمایشی، تغییر جایگاه پرسنل مجاز نیست.');
    const existing = state.personnel.find((item) => item.id === personnelId); if (!existing) throw new Error('پرونده پرسنلی پیدا نشد.');
    if (existing.employmentStatus !== 'active') throw new Error('برای پرسنل خاتمه‌یافته نمی‌توان تغییر جایگاه ثبت کرد.');
    if (!input.reason.trim()) throw new Error('ثبت دلیل تغییر الزامی است.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)) throw new Error('تاریخ اجرای تغییر معتبر نیست.');

    const field = input.kind === 'unit_change' ? 'unitId' : input.kind === 'position_change' ? 'positionId' : input.kind === 'sales_transfer' ? 'salesStructureId' : 'branchUnitId';
    const fromId = existing[field];
    if (fromId === input.targetId) throw new Error('مقصد جدید با مقدار فعلی یکسان است.');

    if (input.kind === 'sales_transfer') {
      if (existing.salesHierarchyLevel !== 'seller') throw new Error('این فرایند فقط برای انتقال فروشنده است.');
      const target = state.salesStructures.find((item) => item.id === input.targetId && item.status === 'active');
      if (!target) throw new Error('کال‌سنتر مقصد معتبر یا فعال نیست.');
      const branch = state.units.find((item) => item.id === target.branchUnitId && item.type === 'شعبه' && item.status === 'active');
      if (!branch) throw new Error('شعبه مسیر مقصد غیرفعال یا نامعتبر است.');
    } else if (input.kind === 'position_change') {
      if (existing.salesHierarchyLevel) throw new Error('سمت عضو شبکه فروش از رده فروش او محاسبه می‌شود و مستقل قابل تغییر نیست.');
      const target = state.positions.find((item) => item.id === input.targetId && item.status === 'active');
      if (!target) throw new Error('سمت سازمانی مقصد معتبر یا فعال نیست.');
      if (!positionSupportsUnit(target, existing.unitId)) throw new Error('سمت انتخاب‌شده برای واحد فعلی این پرسنل مجاز نیست.');
    } else {
      if (input.kind === 'branch_transfer' && existing.salesHierarchyLevel === 'seller') throw new Error('شعبه فروشنده همراه مسیر سرپرست کال‌سنتر تغییر می‌کند؛ از فرایند انتقال فروشنده استفاده کنید.');
      const target = state.units.find((item) => item.id === input.targetId && item.status === 'active');
      if (!target) throw new Error(input.kind === 'branch_transfer' ? 'شعبه مقصد معتبر یا فعال نیست.' : 'واحد سازمانی مقصد معتبر یا فعال نیست.');
      if (input.kind === 'branch_transfer' && target.type !== 'شعبه') throw new Error('برای انتقال شعبه فقط یکی از شعبه‌های فعال شرکت را انتخاب کنید.');
      if (input.kind === 'unit_change' && target.type === 'شعبه') throw new Error('شعبه، واحد سازمانی نیست؛ انتقال شعبه را از فرایند مخصوص آن ثبت کنید.');
      if (input.kind === 'unit_change') {
        const targetPosition = state.positions.find((position) => position.id === input.targetPositionId && position.status === 'active');
        if (!targetPosition || !positionSupportsUnit(targetPosition, input.targetId)) throw new Error('برای واحد جدید، یک سمت سازمانی مجاز انتخاب کنید.');
      }
    }

    if (input.kind === 'branch_transfer' || input.kind === 'sales_transfer') {
      if (!input.newStartDate) throw new Error('تاریخ شروع استقرار جدید الزامی است.');
      if (fromId && !input.previousEndDate) throw new Error('تاریخ پایان استقرار در شعبه قبلی الزامی است.');
      if (fromId && input.previousEndDate && input.newStartDate < input.previousEndDate) throw new Error('تاریخ شروع در شعبه جدید نمی‌تواند قبل از تاریخ پایان شعبه قبلی باشد.');
    }

    const now = new Date().toISOString();
    const datedTransfer = input.kind === 'branch_transfer' || input.kind === 'sales_transfer';
    const movement: PersonnelMovement = {id: newId('movement'), kind: input.kind, fromId, toId: input.targetId, effectiveDate: input.effectiveDate, previousEndedAt: datedTransfer && fromId ? input.previousEndDate : undefined, newStartedAt: datedTransfer ? input.newStartDate : undefined, reason: input.reason.trim(), actorId: actor.actorId, actorName: actor.name, recordedAt: now};
    const positionMovement: PersonnelMovement | undefined = input.kind === 'unit_change' && input.targetPositionId && input.targetPositionId !== existing.positionId ? {id: newId('movement'), kind: 'position_change', fromId: existing.positionId, toId: input.targetPositionId, effectiveDate: input.effectiveDate, reason: `تغییر هم‌زمان با واحد: ${input.reason.trim()}`, actorId: actor.actorId, actorName: actor.name, recordedAt: now} : undefined;
    const targetSalesStructure = input.kind === 'sales_transfer' ? state.salesStructures.find((item) => item.id === input.targetId)! : undefined;
    const updated: PersonnelRecord = input.kind === 'sales_transfer'
      ? {...existing, salesStructureId: targetSalesStructure!.id, salesBranchUnitId: targetSalesStructure!.branchUnitId, branchUnitId: targetSalesStructure!.branchUnitId, salesSupervisorPersonnelId: targetSalesStructure!.callCenterSupervisorPersonnelId, salesChannel: 'call_center', managerPersonnelId: targetSalesStructure!.callCenterSupervisorPersonnelId, movements: [...(existing.movements ?? []), movement], updatedAt: now}
      : input.kind === 'branch_transfer' && existing.salesHierarchyLevel
        ? {...existing, branchUnitId: input.targetId, salesBranchUnitId: input.targetId, movements: [...(existing.movements ?? []), movement], updatedAt: now}
        : input.kind === 'unit_change'
          ? {...existing, unitId: input.targetId, positionId: input.targetPositionId!, movements: [...(existing.movements ?? []), movement, ...(positionMovement ? [positionMovement] : [])], updatedAt: now}
          : {...existing, [field]: input.targetId, movements: [...(existing.movements ?? []), movement], updatedAt: now};
    let updatedLinkedUser: LocalUser | undefined;
    if (existing.linkedUserId) {
      const linkedUser = state.users.find((item) => item.id === existing.linkedUserId);
      if (linkedUser) {
        const managerUserId = state.users.find((item) => item.personnelId === updated.managerPersonnelId)?.id;
        const linkedUpdate = input.kind === 'sales_transfer'
          ? {...linkedUser, branchUnitId: targetSalesStructure!.branchUnitId, managerUserId}
          : input.kind === 'unit_change'
            ? {...linkedUser, unitId: input.targetId, positionId: input.targetPositionId}
            : {...linkedUser, [field]: input.targetId};
        updatedLinkedUser = resolveUserAccess(linkedUpdate, state.roles);
      }
    }

    const sourceName = assignmentName(state, input.kind, fromId);
    const targetName = assignmentName(state, input.kind, input.targetId);
    const action = input.kind === 'sales_transfer' ? 'organization.personnel.sales_transferred' : input.kind === 'branch_transfer' ? 'organization.personnel.branch_transferred' : input.kind === 'unit_change' ? 'organization.personnel.unit_changed' : 'organization.personnel.position_changed';
    const summary = input.kind === 'sales_transfer'
      ? `انتقال فروشنده «${existing.firstName} ${existing.lastName}» از «${sourceName}» به «${targetName}» ثبت شد.`
      : input.kind === 'branch_transfer'
      ? `انتقال شعبه «${existing.firstName} ${existing.lastName}» از «${sourceName}» به «${targetName}» ثبت شد.`
      : `${input.kind === 'unit_change' ? 'تغییر واحد' : 'تغییر سمت'} «${existing.firstName} ${existing.lastName}» از «${sourceName}» به «${targetName}» ثبت شد.`;
    const correlationId = newId('correlation');
    await this.storage.transaction(['personnel', 'users', 'security_roles', 'audit_events', 'domain_events', 'meta'], 'readwrite', async (tx) => {
      const current = await tx.get<PersonnelRecord>('personnel', personnelId);
      if (!current || current.updatedAt !== existing.updatedAt) throw new Error('پرونده پرسنلی در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');
      let committedLinkedUser = updatedLinkedUser;
      if (updatedLinkedUser && existing.linkedUserId) {
        const currentUser = await tx.get<LocalUser>('users', existing.linkedUserId);
        if (!currentUser || userConcurrencyToken(currentUser) !== userConcurrencyToken(state.users.find((item) => item.id === existing.linkedUserId)!)) throw new Error('حساب مرتبط در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');
        const currentRoles = await tx.getAll<SecurityRole>('security_roles');
        committedLinkedUser = resolveUserAccess({...currentUser, unitId: updatedLinkedUser.unitId, positionId: updatedLinkedUser.positionId, branchUnitId: updatedLinkedUser.branchUnitId, managerUserId: updatedLinkedUser.managerUserId}, currentRoles);
      }
      const audits = await tx.getAll<AuditEvent>('audit_events');
      await tx.put('personnel', updated);
      if (committedLinkedUser) await tx.put('users', committedLinkedUser);
      await tx.put('audit_events', {id: newId('audit'), sequence: nextSequence(audits), companyId: actor.companyId, category: 'system', action, actorId: actor.actorId, actorName: actor.name, effectiveUserId: actor.id, occurredAt: now, summary, reason: input.reason.trim(), outcome: 'success', correlationId, metadata: {personnelId, linkedUserId: updatedLinkedUser?.id ?? '', movementId: movement.id, positionMovementId: positionMovement?.id ?? '', kind: input.kind, fromId: fromId ?? '', toId: input.targetId, targetPositionId: input.targetPositionId ?? '', effectiveDate: input.effectiveDate, previousEndedAt: movement.previousEndedAt ?? '', newStartedAt: movement.newStartedAt ?? ''}} satisfies AuditEvent);
      await tx.put('domain_events', {id: newId('event'), aggregateType: 'personnel', aggregateId: personnelId, eventType: 'PersonnelAssignmentChanged', actorId: actor.actorId, occurredAt: now, correlationId, payload: {kind: input.kind, fromId: fromId ?? null, toId: input.targetId, linkedUserId: updatedLinkedUser?.id ?? null}} satisfies DomainEvent);
      await tx.put('meta', {id: 'lastPersistedAt', value: now});
    });
    return this.loadState();
  }

  async createUserForPersonnel(personnelId: string, input: {username: string; password: string; roleIds: string[]; status?: UserStatus}): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    requirePermission(actor, 'organization.personnel.account.manage', 'مجوز ایجاد حساب کاربری برای پرسنل را ندارید.');
    requirePermission(actor, 'organization.users.create', 'مجوز ایجاد کاربر را ندارید.');
    requirePermission(actor, 'organization.roles.assign', 'مجوز انتساب نقش به حساب تازه را ندارید.');
    const record = state.personnel.find((item) => item.id === personnelId); if (!record) throw new Error('پرونده پرسنلی پیدا نشد.');
    if (record.linkedUserId || state.users.some((item) => item.personnelId === personnelId)) throw new Error('این پرسنل قبلاً به یک حساب کاربری متصل شده است.');
    if (record.employmentStatus !== 'active') throw new Error('برای پرسنل خاتمه‌یافته نمی‌توان حساب فعال ایجاد کرد.');
    const managerUserId = state.users.find((user) => user.personnelId === record.managerPersonnelId)?.id;
    const name=`${record.firstName} ${record.lastName}`.trim();
    const userInput:UserInput={name,username:input.username,password:input.password,roleIds:input.roleIds,unitId:record.unitId,positionId:record.positionId,branchUnitId:record.branchUnitId,managerUserId,personnelId};
    validateUserInput(userInput,state);
    if(input.password.length<8)throw new Error('رمز عبور اولیه باید حداقل ۸ نویسه باشد.');
    assertDirectAccessAssignmentAllowed(actor,undefined,input.roleIds,[],[],state.roles,state.session.actingAdminUserId);
    const now=new Date().toISOString();const userId=newId('user');const primary=state.roles.find((role)=>role.id===input.roleIds[0])!;
    const created=resolveUserAccess({id:userId,actorId:newId('actor'),name,username:input.username.trim().toLowerCase(),passwordHash:await hashPassword(input.password),passwordUpdatedAt:now,roleId:primary.id,roleIds:[...input.roleIds],roles:[],roleTitle:primary.name,status:input.status??'active',isAdmin:false,description:primary.description,companyId:record.companyId??COMPANY_ID,unitId:record.unitId,positionId:record.positionId,branchUnitId:record.branchUnitId,managerUserId,personnelId,scope:primary.scope,permissions:[],accent:avatarColor(state.users.length),initials:makeInitials(name),salesHierarchyLevel:record.salesHierarchyLevel},state.roles);
    const linkedPersonnel={...record,linkedUserId:userId,updatedAt:now};const correlationId=newId('correlation');
    await this.storage.transaction(['users','personnel','security_roles','registration_requests','audit_events','domain_events','meta'],'readwrite',async(tx)=>{const current=await tx.get<PersonnelRecord>('personnel',personnelId);if(!current||current.updatedAt!==record.updatedAt||current.linkedUserId)throw new Error('پرونده پرسنلی در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');const [currentUsers,currentRoles,currentRequests]=await Promise.all([tx.getAll<LocalUser>('users'),tx.getAll<SecurityRole>('security_roles'),tx.getAll<RegistrationRequest>('registration_requests')]);if(currentUsers.some((item)=>item.username.toLowerCase()===created.username.toLowerCase())||currentRequests.some((request)=>!request.linkedUserId&&request.requestedUsername.toLowerCase()===created.username.toLowerCase()))throw new Error('نام کاربری هم‌زمان استفاده یا رزرو شده است.');if(created.roleIds.some((roleId)=>!currentRoles.some((role)=>role.id===roleId&&role.status==='active')))throw new Error('یکی از نقش‌ها هم‌زمان تغییر کرده یا غیرفعال شده است.');assertDirectAccessAssignmentAllowed(actor,undefined,created.roleIds,[],[],currentRoles,state.session.actingAdminUserId);const committed=resolveUserAccess(created,currentRoles);const audits=await tx.getAll<AuditEvent>('audit_events');await tx.put('users',committed);await tx.put('personnel',linkedPersonnel);await tx.put('audit_events',{id:newId('audit'),sequence:nextSequence(audits),companyId:actor.companyId,category:'authorization',action:'organization.personnel.user_linked',actorId:actor.actorId,actorName:actor.name,effectiveUserId:userId,occurredAt:now,summary:`حساب کاربری به پرونده پرسنلی «${name}» متصل شد.`,outcome:'success',correlationId,metadata:{personnelId,userId,status:committed.status,roleIds:committed.roleIds.join(',')}} satisfies AuditEvent);await tx.put('domain_events',{id:newId('event'),aggregateType:'personnel',aggregateId:personnelId,eventType:'PersonnelUserLinked',actorId:actor.actorId,occurredAt:now,correlationId,payload:{userId,roleIds:committed.roleIds}} satisfies DomainEvent);await tx.put('meta',{id:'lastPersistedAt',value:now});});
    return this.loadState();
  }

  async createCustomer(input: CustomerInput): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    requirePermission(actor, 'crm.customers.create', 'مجوز ایجاد مشتری را ندارید.');
    validateCustomerInput(input);
    const now = new Date().toISOString(); const displayName = customerDisplayName(input);
    const customer: CustomerRecord = {...normalizeCustomerInput(input), id: newId('customer'), displayName, timeline: [{id: newId('timeline'), type: 'identity', title: 'پرونده مشتری ایجاد شد', actorName: actor.name, occurredAt: now}], createdAt: now, updatedAt: now};
    await this.storage.put('customers', customer);
    await this.appendAudit({actor, effectiveUser: actor, category: 'system', action: 'crm.customer.created', summary: `مشتری «${displayName}» ایجاد شد.`, outcome: 'success', metadata: {customerId: customer.id, customerType: customer.type, source: customer.source}});
    return this.loadState();
  }

  async updateCustomer(customerId: string, input: CustomerInput): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    requirePermission(actor, 'crm.customers.edit', 'مجوز ویرایش مشتری را ندارید.');
    const existing = state.customers.find((item) => item.id === customerId && !item.mergedIntoCustomerId); if (!existing) throw new Error('پرونده مشتری پیدا نشد.');
    if (input.status !== existing.status) requirePermission(actor, 'crm.customers.status.manage', 'مجوز تغییر وضعیت مشتری را ندارید.');
    validateCustomerInput(input);
    const normalized = normalizeCustomerInput(input); const now = new Date().toISOString(); const displayName = customerDisplayName(input);
    const contactChanged = JSON.stringify(existing.phones) !== JSON.stringify(normalized.phones) || existing.email !== normalized.email;
    const addressChanged = JSON.stringify(existing.addresses) !== JSON.stringify(normalized.addresses);
    const updated: CustomerRecord = {...existing, ...normalized, displayName, timeline: [...existing.timeline, {id: newId('timeline'), type: input.status !== existing.status ? 'status' : contactChanged || addressChanged ? 'contact' : 'identity', title: input.status !== existing.status ? `وضعیت به «${customerStatusLabel(input.status)}» تغییر کرد` : 'اطلاعات مشتری ویرایش شد', actorName: actor.name, occurredAt: now}], updatedAt: now};
    await this.storage.put('customers', updated);
    await this.appendAudit({actor, effectiveUser: actor, category: 'system', action: 'crm.customer.updated', summary: `پرونده مشتری «${displayName}» ویرایش شد.`, outcome: 'success', metadata: {customerId, contactChanged, addressChanged}});
    if (contactChanged) await this.appendAudit({actor, effectiveUser: actor, category: 'system', action: 'crm.customer.contact_changed', summary: `راه‌های تماس مشتری «${displayName}» تغییر کرد.`, outcome: 'success', metadata: {customerId, contactChanged: true}});
    if (addressChanged) await this.appendAudit({actor, effectiveUser: actor, category: 'system', action: 'crm.customer.address_changed', summary: `نشانی‌های مشتری «${displayName}» تغییر کرد.`, outcome: 'success', metadata: {customerId, addressChanged: true}});
    if (input.status !== existing.status) await this.appendAudit({actor, effectiveUser: actor, category: 'system', action: 'crm.customer.status_changed', summary: `وضعیت مشتری «${displayName}» به ${customerStatusLabel(input.status)} تغییر کرد.`, outcome: 'success', metadata: {customerId, status: input.status}});
    return this.loadState();
  }

  async setCustomerStatus(customerId: string, status: CustomerRecord['status']): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    requirePermission(actor, 'crm.customers.status.manage', 'مجوز تغییر وضعیت مشتری را ندارید.');
    const existing = state.customers.find((item) => item.id === customerId && !item.mergedIntoCustomerId); if (!existing) throw new Error('پرونده مشتری پیدا نشد.');
    const now = new Date().toISOString(); const updated = {...existing, status, updatedAt: now, timeline: [...existing.timeline, {id: newId('timeline'), type: 'status' as const, title: `وضعیت به «${customerStatusLabel(status)}» تغییر کرد`, actorName: actor.name, occurredAt: now}]};
    await this.storage.put('customers', updated);
    await this.appendAudit({actor, effectiveUser: actor, category: 'system', action: 'crm.customer.status_changed', summary: `وضعیت مشتری «${existing.displayName}» به ${customerStatusLabel(status)} تغییر کرد.`, outcome: 'success', metadata: {customerId, status}});
    return this.loadState();
  }

  async mergeCustomers(winnerId: string, duplicateId: string): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    requirePermission(actor, 'crm.customers.merge', 'مجوز ادغام پرونده مشتری را ندارید.');
    if (winnerId === duplicateId) throw new Error('پرونده مقصد و تکراری نمی‌توانند یکسان باشند.');
    const winner = state.customers.find((item) => item.id === winnerId && !item.mergedIntoCustomerId); const duplicate = state.customers.find((item) => item.id === duplicateId && !item.mergedIntoCustomerId);
    if (!winner || !duplicate) throw new Error('یکی از پرونده‌های ادغام پیدا نشد.');
    const now = new Date().toISOString();
    const phones = [...winner.phones]; for (const phone of duplicate.phones) if (!phones.some((item) => normalizePhone(item.number) === normalizePhone(phone.number))) phones.push({...phone, id: newId('phone'), primary: false});
    const addresses = [...winner.addresses]; for (const address of duplicate.addresses) if (!addresses.some((item) => normalizeText(item.address) === normalizeText(address.address))) addresses.push({...address, id: newId('address'), primary: false});
    const mergedWinner: CustomerRecord = {...winner, phones, addresses, relationships: [...winner.relationships, ...duplicate.relationships.map((item) => ({...item, id: newId('relation')}))], notes: [winner.notes, duplicate.notes && `یادداشت منتقل‌شده از «${duplicate.displayName}»: ${duplicate.notes}`].filter(Boolean).join('\n'), provenance: `${winner.provenance}؛ ادغام‌شده از ${duplicate.provenance}`, timeline: [...winner.timeline, ...duplicate.timeline, {id: newId('timeline'), type: 'merge', title: `پرونده «${duplicate.displayName}» ادغام شد`, actorName: actor.name, occurredAt: now}], updatedAt: now};
    const mergedDuplicate: CustomerRecord = {...duplicate, status: 'inactive', mergedIntoCustomerId: winner.id, timeline: [...duplicate.timeline, {id: newId('timeline'), type: 'merge', title: `در پرونده «${winner.displayName}» ادغام شد`, actorName: actor.name, occurredAt: now}], updatedAt: now};
    await this.storage.transaction(['customers'], 'readwrite', async (tx) => {await tx.put('customers', mergedWinner); await tx.put('customers', mergedDuplicate);});
    await this.appendAudit({actor, effectiveUser: actor, category: 'system', action: 'crm.customer.merged', summary: `پرونده تکراری «${duplicate.displayName}» با «${winner.displayName}» ادغام شد.`, outcome: 'success', metadata: {winnerCustomerId: winnerId, duplicateCustomerId: duplicateId}});
    return this.loadState();
  }

  async importCustomers(rows: CustomerImportRow[], fileName: string): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    requirePermission(actor, 'crm.customers.import', 'مجوز ورود گروهی مشتریان را ندارید.');
    const now = new Date().toISOString(); let importedRows = 0; let duplicateRows = 0; let invalidRows = 0; const known = [...state.customers];
    for (const row of rows) {
      const type = row.type === 'legal' || row.type === 'حقوقی' ? 'legal' : 'individual';
      const nameParts = row.name.trim().split(/\s+/); const input: CustomerInput = {type, firstName: type === 'individual' ? nameParts.slice(0, -1).join(' ') || nameParts[0] : undefined, lastName: type === 'individual' ? nameParts.at(-1) : undefined, legalName: type === 'legal' ? row.name.trim() : undefined, nationalId: row.nationalId, businessId: row.businessId, status: 'active', phones: row.phone ? [{id: newId('phone'), label: 'اصلی', number: row.phone, primary: true}] : [], email: row.email, addresses: [], source: row.source?.trim() || 'ورود CSV', provenance: `فایل ${fileName}`, notes: '', relationships: []};
      try { validateCustomerInput(input); } catch { invalidRows += 1; continue; }
      if (findDuplicateCustomers(known, input).length) {duplicateRows += 1; continue;}
      const record: CustomerRecord = {...normalizeCustomerInput(input), id: newId('customer'), displayName: customerDisplayName(input), timeline: [{id: newId('timeline'), type: 'import', title: `ورود از فایل ${fileName}`, actorName: actor.name, occurredAt: now}], createdAt: now, updatedAt: now};
      await this.storage.put('customers', record); known.push(record); importedRows += 1;
    }
    const job: CustomerImportJob = {id: newId('import'), fileName, totalRows: rows.length, importedRows, duplicateRows, invalidRows, actorName: actor.name, createdAt: now};
    await this.storage.put('customer_imports', job);
    await this.appendAudit({actor, effectiveUser: actor, category: 'data', action: 'crm.customer.imported', summary: `ورود مشتریان از «${fileName}» پایان یافت: ${importedRows.toLocaleString('en-US')} رکورد جدید.`, outcome: 'success', metadata: {importJobId: job.id, totalRows: rows.length, importedRows, duplicateRows, invalidRows}});
    return this.loadState();
  }

async createRole(input: RoleInput): Promise<FoundationState> { const state = await this.loadState(); const actor = state.activeUser; requirePermission(actor, 'organization.roles.manage', 'مجوز ایجاد نقش را ندارید.'); assertRoleDefinitionAllowed(actor, input.permissions, state.session.actingAdminUserId); validateRoleInput(input, state.roles); const now = new Date().toISOString(); const role: SecurityRole = {id: newId('role'), name: input.name.trim(), description: input.description.trim(), scope: input.scope, permissions: [...new Set(input.permissions)], status: 'active', protected: false, version: 1, createdAt: now, updatedAt: now}; const correlationId=newId('correlation'); await this.storage.transaction(['security_roles','role_versions','audit_events','domain_events','meta'],'readwrite',async(tx)=>{const currentRoles=await tx.getAll<SecurityRole>('security_roles');if(currentRoles.some((item)=>item.name.trim().toLocaleLowerCase('fa-IR')===role.name.trim().toLocaleLowerCase('fa-IR')))throw new Error('نقشی با این نام هم‌زمان ساخته شده است.');const audits=await tx.getAll<AuditEvent>('audit_events');await tx.put('security_roles',role);await tx.put('role_versions',{...role,id:`${role.id}-v1`,roleId:role.id});await tx.put('audit_events',{id:newId('audit'),sequence:nextSequence(audits),companyId:actor.companyId,category:'authorization',action:'organization.role.created',actorId:actor.actorId,actorName:actor.name,effectiveUserId:actor.id,occurredAt:now,summary:`نقش دسترسی «${role.name}» ایجاد شد.`,outcome:'success',correlationId,metadata:{roleId:role.id,permissionCount:role.permissions.length,version:1}} satisfies AuditEvent);await tx.put('domain_events',{id:newId('event'),aggregateType:'role',aggregateId:role.id,eventType:'RoleCreated',actorId:actor.actorId,occurredAt:now,correlationId,payload:{permissionCount:role.permissions.length}} satisfies DomainEvent);await tx.put('meta',{id:'lastPersistedAt',value:now});}); return this.loadState(); }

async updateRole(roleId: string, expectedVersion: number, input: RoleInput): Promise<FoundationState> { const state = await this.loadState(); const actor = state.activeUser; requirePermission(actor, 'organization.roles.manage', 'مجوز ویرایش نقش را ندارید.'); const existing = state.roles.find((role) => role.id === roleId); if (!existing) throw new Error('نقش پیدا نشد.'); assertProtectedRoleMutationAllowed(actor, existing, state.session.actingAdminUserId); assertRoleDefinitionAllowed(actor, input.permissions, state.session.actingAdminUserId); validateRoleInput(input, state.roles, roleId); const now=new Date().toISOString(); const updated: SecurityRole = {...existing, name: input.name.trim(), description: input.description.trim(), scope: input.scope, permissions: [...new Set(input.permissions)], version: (existing.version ?? 1) + 1, updatedAt: now}; const affectedUserCount=state.users.filter((user)=>user.roleIds.includes(roleId)).length; const correlationId=newId('correlation'); await this.storage.transaction(['security_roles','role_versions','audit_events','domain_events','meta'],'readwrite',async(tx)=>{const current=await tx.get<SecurityRole>('security_roles',roleId);if(!current||(current.version??1)!==expectedVersion||(existing.version??1)!==expectedVersion)throw new Error('نقش در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');const currentRoles=await tx.getAll<SecurityRole>('security_roles');if(currentRoles.some((item)=>item.id!==roleId&&item.name.trim().toLocaleLowerCase('fa-IR')===updated.name.trim().toLocaleLowerCase('fa-IR')))throw new Error('نقش دیگری هم‌زمان با این نام ذخیره شده است.');const audits=await tx.getAll<AuditEvent>('audit_events');await tx.put('role_versions',{...existing,id:`${existing.id}-v${existing.version??1}`,roleId:existing.id});await tx.put('security_roles',updated);await tx.put('audit_events',{id:newId('audit'),sequence:nextSequence(audits),companyId:actor.companyId,category:'authorization',action:'organization.role.updated',actorId:actor.actorId,actorName:actor.name,effectiveUserId:actor.id,occurredAt:now,summary:`نقش «${updated.name}» ویرایش و نسخه جدید منتشر شد.`,outcome:'success',correlationId,metadata:{roleId,permissionCount:updated.permissions.length,version:updated.version??1,affectedUserCount:affectedUserCount}} satisfies AuditEvent);await tx.put('domain_events',{id:newId('event'),aggregateType:'role',aggregateId:roleId,eventType:'RoleUpdated',actorId:actor.actorId,occurredAt:now,correlationId,payload:{affectedUserCount:affectedUserCount}} satisfies DomainEvent);await tx.put('meta',{id:'lastPersistedAt',value:now});});return this.loadState(); }

  async cloneRole(roleId: string): Promise<FoundationState> { const state = await this.loadState(); const source = state.roles.find((role) => role.id === roleId); if (!source) throw new Error('نقش مبدأ پیدا نشد.'); return this.createRole({name: `${source.name} - کپی`, description: `کپی از نقش ${source.name}`, scope: source.scope, permissions: [...source.permissions]}); }

async setRoleStatus(roleId: string, expectedVersion: number, status: UserStatus): Promise<FoundationState> { const state = await this.loadState(); const actor = state.activeUser; requirePermission(actor, 'organization.roles.manage', 'مجوز تغییر وضعیت نقش را ندارید.'); const role = state.roles.find((item) => item.id === roleId); if (!role) throw new Error('نقش پیدا نشد.'); assertProtectedRoleMutationAllowed(actor, role, state.session.actingAdminUserId); if (role.id === 'role-admin' && status === 'inactive') throw new Error('نقش پایه ادمین قابل غیرفعال‌سازی نیست.'); const now=new Date().toISOString();const correlationId=newId('correlation');await this.storage.transaction(['security_roles','users','audit_events','domain_events','meta'],'readwrite',async(tx)=>{const current=await tx.get<SecurityRole>('security_roles',roleId);if(!current||(current.version??1)!==expectedVersion||(role.version??1)!==expectedVersion)throw new Error('نقش در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');assertProtectedRoleMutationAllowed(actor,current,state.session.actingAdminUserId);if(current.id==='role-admin'&&status==='inactive')throw new Error('نقش پایه ادمین قابل غیرفعال‌سازی نیست.');const [currentUsers,audits]=await Promise.all([tx.getAll<LocalUser>('users'),tx.getAll<AuditEvent>('audit_events')]);const affectedUserCount=currentUsers.filter((user)=>user.roleIds.includes(roleId)).length;const updated={...current,status,version:(current.version??1)+1,updatedAt:now};await tx.put('security_roles',updated);await tx.put('audit_events',{id:newId('audit'),sequence:nextSequence(audits),companyId:actor.companyId,category:'authorization',action:'organization.role.status_changed',actorId:actor.actorId,actorName:actor.name,effectiveUserId:actor.id,occurredAt:now,summary:`نقش «${current.name}» ${status==='active'?'فعال':'غیرفعال'} شد.`,outcome:'success',correlationId,metadata:{roleId,status,affectedUserCount}} satisfies AuditEvent);await tx.put('domain_events',{id:newId('event'),aggregateType:'role',aggregateId:roleId,eventType:'RoleStatusChanged',actorId:actor.actorId,occurredAt:now,correlationId,payload:{status}} satisfies DomainEvent);await tx.put('meta',{id:'lastPersistedAt',value:now});});return this.loadState(); }

  async deleteRole(roleId: string, expectedVersion: number): Promise<FoundationState> {
    const state = await this.loadState();
    const actor = state.activeUser;
    requirePermission(actor, 'organization.roles.manage', 'مجوز حذف نقش را ندارید.');
    const role = state.roles.find((item) => item.id === roleId);
    if (!role) throw new Error('نقش پیدا نشد.');
    assertProtectedRoleMutationAllowed(actor, role, state.session.actingAdminUserId);
    if (role.protected) throw new Error('نقش پایه محافظت‌شده قابل حذف نیست.');
    const now=new Date().toISOString();const correlationId=newId('correlation');
    await this.storage.transaction(['security_roles','users','audit_events','domain_events','meta'],'readwrite',async(tx)=>{
      const current=await tx.get<SecurityRole>('security_roles',roleId);
      if(!current||(current.version??1)!==expectedVersion||(role.version??1)!==expectedVersion)throw new Error('نقش در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');
      assertProtectedRoleMutationAllowed(actor,current,state.session.actingAdminUserId);
      if(current.protected)throw new Error('نقش پایه محافظت‌شده قابل حذف نیست.');
      const [currentUsers,audits]=await Promise.all([tx.getAll<LocalUser>('users'),tx.getAll<AuditEvent>('audit_events')]);
      const assignedUsers=currentUsers.filter((user)=>user.roleIds.includes(roleId));
      if(assignedUsers.length)throw new Error(`نقش «${current.name}» به ${assignedUsers.length.toLocaleString('en-US')} کاربر تخصیص دارد؛ ابتدا تخصیص جاری را بردارید.`);
      const wasPreviouslyAssigned=audits.some((audit)=>(audit.action.includes('role.assignment')||audit.action.endsWith('role.assigned'))&&JSON.stringify(audit.metadata??{}).includes(roleId));
      await tx.delete('security_roles',roleId);
      await tx.put('audit_events',{id:newId('audit'),sequence:nextSequence(audits),companyId:actor.companyId,category:'authorization',action:'organization.role.deleted',actorId:actor.actorId,actorName:actor.name,effectiveUserId:actor.id,occurredAt:now,summary:`نقش «${current.name}» حذف شد؛ نسخه‌ها و سابقه تخصیص آن برای گزارش‌گیری حفظ شدند.`,reason:'حذف نقش بدون تخصیص جاری',outcome:'success',correlationId,metadata:{roleId,roleName:current.name,roleVersion:current.version??1,permissionCount:current.permissions.length,wasPreviouslyAssigned}} satisfies AuditEvent);
      await tx.put('domain_events',{id:newId('event'),aggregateType:'role',aggregateId:roleId,eventType:'RoleDeleted',actorId:actor.actorId,occurredAt:now,correlationId,payload:{}} satisfies DomainEvent);
      await tx.put('meta',{id:'lastPersistedAt',value:now});
    });
    return this.loadState();
  }

  private async refreshUsersForRole(roleId: string, users: LocalUser[], roles: SecurityRole[]) { for (const user of users.filter((item) => item.roleIds.includes(roleId))) await this.storage.put('users', resolveUserAccess(user, roles)); }

  async signIn(username: string, password: string): Promise<FoundationState> {
    const state = await this.loadState();
    if (state.session.actingAdminUserId) throw new Error('ابتدا مشاهده دسترسی کاربر را پایان دهید.');
    const normalizedUsername = username.trim().toLowerCase();
    const rawUsers = await this.storage.getAll<LocalUser>('users');
    const target = rawUsers.find((user) => user.username.toLowerCase() === normalizedUsername);
    const validPassword = target ? await verifyPassword(password, target.passwordHash) : false;
    if (!target || !validPassword) throw new Error('نام کاربری یا رمز عبور درست نیست.');
    if (target.status !== 'active') throw new Error('این حساب غیرفعال است. با ادمین سازمان تماس بگیرید.');
    const previous = state.activeUser;
    const now = new Date().toISOString();
    const correlationId = newId('correlation');
    await this.storage.transaction(['sessions', 'audit_events', 'domain_events', 'meta'], 'readwrite', async (tx) => {
      const audits = await tx.getAll<AuditEvent>('audit_events');
      const deferred = await tx.get<MetaRecord>('meta', `profileCompletionDeferredUntil:${target.id}`);
      const session: FoundationSession = {id: 'active-session', activeUserId: target.id, profileCompletionDeferredUntil: typeof deferred?.value === 'string' ? deferred.value : undefined, switchedAt: now, version: state.session.version + 1};
      const audit: AuditEvent = {id: newId('audit'), sequence: nextSequence(audits), companyId: target.companyId, category: 'session', action: 'organization.session.signed_in', actorId: target.actorId, actorName: target.name, effectiveUserId: target.id, occurredAt: now, summary: `کاربر «${target.name}» با حساب محلی وارد شد.`, reason: 'ورود مستقیم کاربر', outcome: 'success', correlationId, metadata: {username: target.username, previousUserId: previous.id}};
      await Promise.all([
        tx.put('sessions', session), tx.put('audit_events', audit),
        tx.put('domain_events', {id: newId('event'), aggregateType: 'session', aggregateId: session.id, eventType: 'LocalUserSignedIn', actorId: target.actorId, occurredAt: now, correlationId, payload: {userId: target.id}} satisfies DomainEvent),
        tx.put('meta', {id: 'lastPersistedAt', value: now}),
      ]);
    });
    return this.loadState();
  }

  async signOut(): Promise<FoundationState> {
    const state = await this.loadState();
    if (state.session.actingAdminUserId) throw new Error('ابتدا مشاهده دسترسی کاربر را پایان دهید.');
    const user = state.activeUser;
    const now = new Date().toISOString();
    const correlationId = newId('correlation');
    await this.storage.transaction(['sessions', 'audit_events', 'domain_events', 'meta'], 'readwrite', async (tx) => {
      const audits = await tx.getAll<AuditEvent>('audit_events');
      const session: FoundationSession = {...state.session, signedOutAt: now, switchedAt: now, version: state.session.version + 1};
      const audit: AuditEvent = {id: newId('audit'), sequence: nextSequence(audits), companyId: user.companyId, category: 'session', action: 'organization.session.signed_out', actorId: user.actorId, actorName: user.name, effectiveUserId: user.id, occurredAt: now, summary: `کاربر «${user.name}» از سامانه خارج شد.`, reason: 'خروج مستقیم کاربر', outcome: 'success', correlationId, metadata: {username: user.username}};
      await Promise.all([
        tx.put('sessions', session), tx.put('audit_events', audit),
        tx.put('domain_events', {id: newId('event'), aggregateType: 'session', aggregateId: session.id, eventType: 'LocalUserSignedOut', actorId: user.actorId, occurredAt: now, correlationId, payload: {userId: user.id}} satisfies DomainEvent),
        tx.put('meta', {id: 'lastPersistedAt', value: now}),
      ]);
    });
    return this.loadState();
  }

  async requestPasswordRecovery(username: string, mobileValue: string): Promise<LocalSmsPreview> {
    const [users, personnelRecords] = await Promise.all([this.storage.getAll<LocalUser>('users'), this.storage.getAll<PersonnelRecord>('personnel')]);
    const mobile = normalizePhone(mobileValue);
    const target = users.find((user) => user.username.toLowerCase() === username.trim().toLowerCase());
    const personnel = target ? personnelRecords.find((person) => person.id === target.personnelId || person.linkedUserId === target.id) : undefined;
    if (!target || target.status !== 'active' || !/^09\d{9}$/.test(mobile) || normalizePhone(personnel?.primaryMobile) !== mobile) throw new Error('نام کاربری و شماره همراه با یک حساب فعال تطابق ندارند.');
    const verificationCode = await recoveryCodeFor(target, mobile);
    await this.appendSystemAudit('organization.session.password_recovery_requested', 'درخواست بازیابی رمز عبور از صفحه ورود ثبت شد.', target.id, {userId: target.id, channel: 'local-sms-simulation'});
    return {maskedMobile: maskMobile(mobile), verificationCode, message: `کد بازیابی رمز شاهراه: ${verificationCode}`};
  }

  async completePasswordRecovery(username: string, mobileValue: string, verificationCode: string, newPassword: string): Promise<void> {
    const [users, personnelRecords] = await Promise.all([this.storage.getAll<LocalUser>('users'), this.storage.getAll<PersonnelRecord>('personnel')]);
    const mobile = normalizePhone(mobileValue);
    const target = users.find((user) => user.username.toLowerCase() === username.trim().toLowerCase());
    const personnel = target ? personnelRecords.find((person) => person.id === target.personnelId || person.linkedUserId === target.id) : undefined;
    if (!target || target.status !== 'active' || normalizePhone(personnel?.primaryMobile) !== mobile) throw new Error('اطلاعات بازیابی معتبر نیست.');
    if ((await recoveryCodeFor(target, mobile)) !== normalizeDigits(verificationCode)) throw new Error('کد تأیید درست نیست.');
    if (newPassword.length < 8) throw new Error('رمز عبور جدید باید حداقل ۸ نویسه داشته باشد.');
    const now = new Date().toISOString();
    const passwordHash=await hashPassword(newPassword);const correlationId=newId('correlation');
    await this.storage.transaction(['users','personnel','audit_events','domain_events','meta'],'readwrite',async(tx)=>{
      const current=await tx.get<LocalUser>('users',target.id);
      if(!current||current.status!=='active'||userConcurrencyToken(current)!==userConcurrencyToken(target))throw new Error('حساب در زمان بازیابی تغییر کرده است؛ فرایند را دوباره آغاز کنید.');
      const currentPersonnel=current.personnelId?await tx.get<PersonnelRecord>('personnel',current.personnelId):undefined;
      if(!currentPersonnel||normalizePhone(currentPersonnel.primaryMobile)!==mobile)throw new Error('اطلاعات بازیابی در زمان ثبت تغییر کرده است؛ فرایند را دوباره آغاز کنید.');
      const audits=await tx.getAll<AuditEvent>('audit_events');
      await tx.put('users',{...current,passwordHash,passwordUpdatedAt:now});
      await tx.put('audit_events',{id:newId('audit'),sequence:nextSequence(audits),companyId:current.companyId,category:'system',action:'organization.session.password_recovered',actorId:current.actorId,actorName:current.name,effectiveUserId:current.id,occurredAt:now,summary:'رمز عبور از مسیر بازیابی محلی تغییر کرد.',reason:'بازیابی رمز با کد تأیید محلی',outcome:'success',correlationId,metadata:{userId:current.id,channel:'local-sms-simulation'}} satisfies AuditEvent);
      await tx.put('domain_events',{id:newId('event'),aggregateType:'user',aggregateId:current.id,eventType:'UserPasswordRecovered',actorId:current.actorId,occurredAt:now,correlationId,payload:{channel:'local-sms-simulation'}} satisfies DomainEvent);
      await tx.put('meta',{id:'lastPersistedAt',value:now});
    });
  }

  async requestUsernameReminder(mobileValue: string): Promise<LocalSmsPreview> {
    const [users, personnel] = await Promise.all([this.storage.getAll<LocalUser>('users'), this.storage.getAll<PersonnelRecord>('personnel')]);
    const mobile = normalizePhone(mobileValue);
    if (!/^09\d{9}$/.test(mobile)) throw new Error('شماره همراه معتبر وارد کنید.');
    const personnelIds = personnel.filter((person) => normalizePhone(person.primaryMobile) === mobile).map((person) => person.id);
    const targets = users.filter((user) => user.status === 'active' && (personnelIds.includes(user.personnelId ?? '') || personnel.some((person) => person.linkedUserId === user.id && normalizePhone(person.primaryMobile) === mobile)));
    if (!targets.length) throw new Error('حساب فعالی برای این شماره همراه پیدا نشد.');
    const usernames = targets.map((user) => user.username).join('، ');
    await this.appendSystemAudit('organization.session.username_reminder_requested', 'درخواست یادآوری نام کاربری از صفحه ورود ثبت شد.', targets[0].id, {userIds: targets.map((user) => user.id).join(','), channel: 'local-sms-simulation'});
    return {maskedMobile: maskMobile(mobile), message: `نام کاربری شاهراه: ${usernames}`};
  }

  async createEmployeeAdvance(input: EmployeeAdvanceInput): Promise<FoundationState> {
    const module = ERP_MODULES.find((item) => item.id === 'employee-advance');
    if (!module) throw new Error('ماژول مساعده پیدا نشد.');
    const state = await this.loadState();
    const actor = state.activeUser;
    requirePermission(actor, permissionFor('employee-advance', 'create'), 'مجوز ثبت درخواست مساعده را ندارید.');
    if (actor.status !== 'active') throw new Error('حساب کاربری غیرفعال اجازه ثبت مساعده ندارد.');
    const beneficiary = state.personnel.find((person) => person.id === input.beneficiaryPersonnelId && person.employmentStatus === 'active');
    if (!beneficiary) throw new Error('پرسنل فعال انتخاب‌شده پیدا نشد.');
    const beneficiaryUser = state.users.find((user) => user.id === beneficiary.linkedUserId && user.status === 'active');
    const ownRequest = beneficiary.linkedUserId === actor.id || beneficiary.id === actor.personnelId;
    if (!ownRequest && !canProxyAdvance(actor, beneficiary, state)) throw new Error('ثبت نیابتی فقط برای تأییدکننده اصلی و پرسنل شعب تحت پوشش مجاز است.');
    const branchUnitId = beneficiary.salesBranchUnitId || beneficiary.branchUnitId || '';
    const amountRial = normalizeDecimal(input.amountRial);
    if (!amountRial || BigInt(amountRial) <= 0n) throw new Error('مبلغ مساعده باید بیشتر از صفر باشد.');
    if (!input.signatureAccepted) throw new Error('تأیید و امضای دیجیتال درخواست الزامی است.');
    if (!beneficiary.bankName?.trim()) throw new Error('نام بانک در پرونده پرسنلی ثبت نشده است.');
    const cardNumber = normalizeDigits(beneficiary.cardNumber).replace(/\D/g, '');
    if (cardNumber.length !== 16) throw new Error('شماره کارت ۱۶ رقمی معتبر در پرونده پرسنلی ثبت نشده است.');
    const now = new Date().toISOString();
    const workflow = activeWorkflowFor(state, module);
    const selectedRoute = selectWorkflowRoute(workflow, state.roles, branchUnitId);
    const routeStates = selectedRoute.approvalStages.map((stage) => stage.stateId as AdvanceStage);
    const branch = state.units.find((unit) => unit.id === branchUnitId);
    const unit = state.units.find((item) => item.id === beneficiary.unitId);
    const position = state.positions.find((item) => item.id === beneficiary.positionId);
    const assignmentContext = {branchUnitId, unitId: beneficiary.unitId, beneficiaryUserId: beneficiaryUser?.id};
    const finalReviewStage = selectedRoute.approvalStages.find((stage) => stage.stateId === 'final_review');
    const isMainApprover = Boolean(finalReviewStage && canUserTakeAdvanceStage(actor, finalReviewStage, state, assignmentContext));
    if (ownRequest && !canSelfSubmitAdvance(branchUnitId, state) && !isMainApprover) throw new Error('ثبت مستقیم مساعده برای این شعبه غیرفعال است؛ مسئول مجاز می‌تواند نیابتی ثبت کند.');
    if (ownRequest && isMainApprover && input.approveAtCreation === true && finalReviewStage?.allowSelfApproval !== true) throw new Error('سیاست این مرحله تأیید درخواست خود را مجاز نمی‌داند.');
    const approvedAtCreation = isMainApprover && input.approveAtCreation === true && (!ownRequest || finalReviewStage?.allowSelfApproval === true);
    const normalStart = routeStates.find((stage) => stage !== 'sent_to_treasury');
    const status: AdvanceStage | undefined = approvedAtCreation ? routeStates.find((stage) => stage === 'accounting_review') : normalStart;
    if (!status) throw new Error('مسیر تأیید این شعبه مرحله قابل شروع ندارد. تنظیمات گردش‌کار را بررسی کنید.');
    const initialAssignee = resolveAdvanceStageAssignee(state, workflow, selectedRoute.id, status, assignmentContext);
    if (!initialAssignee) throw new Error('کاربر فعال و مجاز برای نخستین مرحله این مسیر تعیین نشده است.');
    const existing = state.operationalRecords.filter((item) => item.moduleId === 'employee-advance');
    const record: OperationalRecord = {
      id: newId('employee-advance'), moduleId: 'employee-advance', domain: module.domain,
      trackingCode: `ADV-${new Date().getFullYear()}-${String(existing.length + 1).padStart(4, '0')}`,
      title: `مساعده ${beneficiary.firstName} ${beneficiary.lastName}`, description: input.note.trim(), status, priority: 'normal', companyId: actor.companyId,
      unitId: beneficiary.unitId, branchUnitId, ownerPersonnelId: beneficiary.id,
      assigneeUserId: initialAssignee.id, amountRial, quantity: '1',
      createdByActorId: actor.actorId, createdByUserId: actor.id, updatedByActorId: actor.actorId, workflowVersion: workflow.version, workflowRouteId: selectedRoute.id, version: 1,
      payload: {
        kind: 'employee_advance', beneficiaryPersonnelId: beneficiary.id, beneficiaryUserId: beneficiaryUser?.id ?? '', personnelCode: beneficiary.personnelCode,
        firstName: beneficiary.firstName, lastName: beneficiary.lastName, nationalId: beneficiary.nationalId ?? '', primaryMobile: beneficiary.primaryMobile,
        branchUnitId, branchName: branch?.name ?? 'تعیین نشده', unitId: beneficiary.unitId,
        unitName: unit?.name ?? 'تعیین نشده', positionId: beneficiary.positionId, positionName: position?.title ?? 'تعیین نشده', bankName: beneficiary.bankName,
        cardNumber, requestDate: now.slice(0, 10), originalAmountRial: amountRial, approvedAmountRial: amountRial, internalCreditEligible: true,
        submittedOnBehalf: !ownRequest, proxyByUserId: !ownRequest ? actor.id : null, proxyByName: !ownRequest ? actor.name : null,
        selfApprovedAt: approvedAtCreation ? now : null, workflowRouteTitle: selectedRoute.title, signedByUserId: actor.id, signedByName: actor.name, signedAt: now,
        trail: [{id: newId('advance-trail'), stage: status, action: approvedAtCreation ? 'proxy_created_and_approved' : 'submitted', actorId: actor.id, actorName: actor.name, occurredAt: now, reason: input.note.trim() || null, previousAmountRial: null, amountRial}],
      }, createdAt: now, updatedAt: now,
    };
    const history = this.makeHistory(state, record, actor, 'created', {toState: status, reason: input.note.trim() || undefined, snapshot: {beneficiaryPersonnelId: beneficiary.id, amountRial, approvedAtCreation, workflowRouteId: selectedRoute.id, workflowRouteTitle: selectedRoute.title}});
    await this.persistOperationalChange(module.store, record, history, actor, approvedAtCreation ? 'proxy_created_and_approved' : 'submitted', approvedAtCreation ? `مساعده نیابتی «${record.title}» ثبت و برای حسابداری ارسال شد.` : `درخواست «${record.title}» امضا و برای ${stateLabel(workflow, status)} ارسال شد.`);
    return this.loadState();
  }

  async updateEmployeeAdvance(recordId: string, expectedVersion: number, input: EmployeeAdvanceInput): Promise<FoundationState> {
    const module = ERP_MODULES.find((item) => item.id === 'employee-advance');
    if (!module) throw new Error('ماژول مساعده پیدا نشد.');
    const state = await this.loadState();
    const actor = state.activeUser;
    requirePermission(actor, permissionFor('employee-advance', 'edit'), 'مجوز اصلاح درخواست مساعده را ندارید.');
    const record = state.operationalRecords.find((item) => item.id === recordId && item.moduleId === 'employee-advance');
    if (!record) throw new Error('درخواست مساعده پیدا نشد.');
    if (record.version !== expectedVersion) throw new Error('این درخواست در تب دیگری تغییر کرده است. تازه‌سازی کنید و دوباره تلاش کنید.');
    if (!['branch_review', 'needs_correction'].includes(record.status)) throw new Error('ویرایش مساعده فقط پیش از تصمیم مدیر شعبه یا در وضعیت نیازمند اصلاح مجاز است.');
    const payload = readEmployeeAdvancePayload(record);
    const isOwner = payload.beneficiaryUserId === actor.id || record.createdByUserId === actor.id;
    if (!isOwner && !actor.isAdmin) throw new Error('فقط درخواست‌کننده یا ثبت‌کننده نیابتی می‌تواند این فرم را اصلاح کند.');
    if (input.beneficiaryPersonnelId !== payload.beneficiaryPersonnelId) throw new Error('پرسنل دریافت‌کننده پس از ثبت درخواست قابل تغییر نیست.');
    if (!input.signatureAccepted) throw new Error('تأیید و امضای دیجیتال نسخه اصلاحی الزامی است.');
    const amountRial = normalizeDecimal(input.amountRial);
    if (!amountRial || BigInt(amountRial) <= 0n) throw new Error('مبلغ مساعده باید بیشتر از صفر باشد.');
    const beneficiary = state.personnel.find((person) => person.id === payload.beneficiaryPersonnelId && person.employmentStatus === 'active');
    if (!beneficiary) throw new Error('پرونده فعال پرسنل دریافت‌کننده پیدا نشد.');
    if (!beneficiary.bankName?.trim()) throw new Error('نام بانک در پرونده پرسنلی ثبت نشده است.');
    const cardNumber = normalizeDigits(beneficiary.cardNumber).replace(/\D/g, '');
    if (cardNumber.length !== 16) throw new Error('شماره کارت ۱۶ رقمی معتبر در پرونده پرسنلی ثبت نشده است.');

    const resumeStage = record.status === 'needs_correction' ? (payload.resumeStage ?? 'branch_review') : 'branch_review';
    const boundWorkflow = workflowForRecord(state, module, record);
    const assigneeUserId = resolveAdvanceStageAssignee(state, boundWorkflow, record.workflowRouteId, resumeStage, {
      branchUnitId: payload.branchUnitId,
      unitId: payload.unitId,
      beneficiaryUserId: payload.beneficiaryUserId,
    })?.id;
    if (!assigneeUserId) throw new Error('کاربر فعال مرحله بازگشت برای ادامه گردش تعیین نشده است.');

    const unit = state.units.find((item) => item.id === beneficiary.unitId);
    const position = state.positions.find((item) => item.id === beneficiary.positionId);
    const now = new Date().toISOString();
    const updated: OperationalRecord = {
      ...record,
      description: input.note.trim(),
      status: resumeStage,
      assigneeUserId,
      amountRial,
      updatedByActorId: actor.actorId,
      version: record.version + 1,
      updatedAt: now,
      payload: {
        ...record.payload,
        nationalId: beneficiary.nationalId ?? payload.nationalId,
        primaryMobile: beneficiary.primaryMobile || payload.primaryMobile,
        unitId: beneficiary.unitId,
        unitName: unit?.name ?? payload.unitName,
        positionId: beneficiary.positionId,
        positionName: position?.title ?? payload.positionName,
        bankName: beneficiary.bankName,
        cardNumber,
        approvedAmountRial: amountRial,
        resumeStage: null,
        signedByUserId: actor.id,
        signedByName: actor.name,
        signedAt: now,
        trail: [...payload.trail, {id: newId('advance-trail'), stage: resumeStage, action: 'corrected_and_resubmitted', actorId: actor.id, actorName: actor.name, occurredAt: now, reason: input.note.trim() || null, previousAmountRial: record.amountRial ?? null, amountRial}],
      },
    };
    const history = this.makeHistory(state, updated, actor, 'corrected', {
      fromState: record.status,
      toState: resumeStage,
      reason: input.note.trim() || 'نسخه اصلاحی امضا و برای ادامه گردش ارسال شد.',
      snapshot: {beforeVersion: record.version, previousAmountRial: record.amountRial, amountRial, resumeStage, signedAt: now},
    });
    await this.persistOperationalChange(module.store, updated, history, actor, 'corrected', `نسخه اصلاحی «${record.title}» امضا و به ${stateLabel(module.workflow, resumeStage)} ارسال شد.`, input.note.trim());
    return this.loadState();
  }

  async decideEmployeeAdvance(recordId: string, decision: AdvanceDecision, reason = '', amountRial?: string): Promise<FoundationState> {
    const module = ERP_MODULES.find((item) => item.id === 'employee-advance');
    if (!module) throw new Error('ماژول مساعده پیدا نشد.');
    const state = await this.loadState(); const actor = state.activeUser;
    const record = state.operationalRecords.find((item) => item.id === recordId && item.moduleId === 'employee-advance');
    if (!record) throw new Error('درخواست مساعده پیدا نشد.');
    const payload = readEmployeeAdvancePayload(record);
    const boundWorkflow = workflowForRecord(state, module, record);
    const routeStages = approvalStagesForRoute(boundWorkflow, state.roles, record.workflowRouteId).map((item) => item.stateId as AdvanceStage);
    if (record.assigneeUserId !== actor.id && !actor.isAdmin && !canEmployeeAdvanceReviewerDecide(record, state)) throw new Error('این درخواست در کارتابل یا محدوده مجاز شما نیست.');
    const isBeneficiary = payload.beneficiaryUserId === actor.id || record.createdByUserId === actor.id;
    const stage = record.status as AdvanceStage;
    const configuredDecision = decision === 'reject' ? 'reject'
      : decision === 'needs_correction' ? 'needs_correction'
        : decision === 'accounting_recheck' ? 'return_previous'
          : 'approve';
    if (['branch_review','accounting_review','final_review'].includes(stage)
      && !workflowStageAllows(state, 'employee-advance', stage, configuredDecision, ['approve','reject','needs_correction'], record.workflowVersion, record.workflowRouteId)) {
      throw new Error('این تصمیم در نسخه فعال گردش‌کار برای مرحله فعلی مجاز نیست.');
    }
    let next: AdvanceStage; let assigneeUserId: string | undefined; let actionLabel = '';
    const assignmentContext = {branchUnitId: payload.branchUnitId, unitId: payload.unitId, beneficiaryUserId: payload.beneficiaryUserId};
    const stageDefinition = (stageId: string) => approvalStagesForRoute(boundWorkflow, state.roles, record.workflowRouteId).find((item) => item.stateId === stageId);
    const actorMayReview = (stageId: string, _fallback: string[]) => {
      const configured = stageDefinition(stageId);
      const isActualBeneficiary = payload.beneficiaryUserId === actor.id;
      if (isActualBeneficiary && configured?.allowSelfApproval !== true) return false;
      return actor.isAdmin || Boolean(configured && canUserTakeAdvanceStage(actor, configured, state, assignmentContext));
    };
    const activeStageUser = (stageId: string, _fallback: string[]) => resolveAdvanceStageAssignee(state, boundWorkflow, record.workflowRouteId, stageId, assignmentContext);
    const nextConfiguredStage = (current: AdvanceStage) => {
      const currentIndex = routeStages.indexOf(current);
      const remaining = currentIndex >= 0 ? routeStages.slice(currentIndex + 1) : routeStages;
      return remaining.find((candidate) => !(payload.selfApprovedAt && candidate === 'final_review'));
    };
    if (stage === 'needs_correction') {
      if (!isBeneficiary) throw new Error('فقط ثبت‌کننده یا صاحب درخواست می‌تواند اصلاحات را دوباره ارسال کند.');
      if (decision !== 'approve') throw new Error('پس از اصلاح فقط ارسال مجدد مجاز است.');
      next = payload.resumeStage ?? 'branch_review';
      assigneeUserId = next === 'branch_review' ? activeStageUser('branch_review',['role-advance-branch-manager'])?.id : next === 'accounting_review' ? activeStageUser('accounting_review',['role-advance-accounting-reviewer'])?.id : activeStageUser('final_review',['role-sales-advance-approver'])?.id;
      actionLabel = 'اصلاح و ارسال مجدد';
    } else if (decision === 'needs_correction' || decision === 'reject') {
      if (!['branch_review','accounting_review','final_review'].includes(stage)) throw new Error('این تصمیم در وضعیت فعلی مجاز نیست.');
      if (!actorMayReview(stage, stage==='branch_review'?['role-advance-branch-manager']:stage==='accounting_review'?['role-advance-accounting-reviewer']:['role-sales-advance-approver'])) throw new Error('نقش شما مجوز تصمیم‌گیری این مرحله مساعده را ندارد.');
      next = decision === 'reject' ? 'rejected' : 'needs_correction';
      assigneeUserId = decision === 'reject' ? undefined : (payload.beneficiaryUserId || record.createdByUserId);
      actionLabel = decision === 'reject' ? 'رد درخواست' : 'نیازمند اصلاح';
    } else if (stage === 'branch_review' && decision === 'approve') {
      if (!actorMayReview('branch_review',['role-advance-branch-manager'])) throw new Error('فقط نقش تنظیم‌شده برای بررسی شعبه می‌تواند این مرحله را تأیید کند.');
      next = nextConfiguredStage(stage) ?? 'sent_to_treasury'; assigneeUserId = activeStageUser(next, next === 'accounting_review' ? ['role-advance-accounting-reviewer'] : next === 'final_review' ? ['role-sales-advance-approver'] : ['role-treasury-executor-v1'])?.id; actionLabel = `تأیید مدیر شعبه و ارجاع به ${stateLabel(boundWorkflow, next)}`;
    } else if (stage === 'accounting_review' && decision === 'approve') {
      if (!actorMayReview('accounting_review',['role-advance-accounting-reviewer'])) throw new Error('فقط نقش تنظیم‌شده حسابداری می‌تواند این مرحله را تأیید کند.');
      next = nextConfiguredStage(stage) ?? 'sent_to_treasury';
      assigneeUserId = activeStageUser(next, next === 'final_review' ? ['role-sales-advance-approver'] : ['role-treasury-executor-v1'])?.id;
      actionLabel = next === 'sent_to_treasury' ? 'تأیید حسابداری و ارسال به خزانه' : 'تأیید حسابداری و ارجاع به تأییدکننده اصلی';
    } else if (stage === 'final_review' && ['approve_to_treasury','accounting_recheck'].includes(decision)) {
      if (!actorMayReview('final_review',['role-sales-advance-approver'])) throw new Error('فقط نقش تنظیم‌شده تأییدکننده اصلی می‌تواند این تصمیم را ثبت کند.');
      next = decision === 'accounting_recheck' ? 'accounting_review' : (nextConfiguredStage(stage) ?? 'sent_to_treasury');
      assigneeUserId = decision === 'accounting_recheck' ? activeStageUser('accounting_review',['role-advance-accounting-reviewer'])?.id : activeStageUser('sent_to_treasury',['role-treasury-executor-v1'])?.id;
      actionLabel = decision === 'accounting_recheck' ? 'تغییر مبلغ و ارجاع مجدد به حسابداری' : 'تأیید نهایی و ارسال به خزانه';
    } else throw new Error('این اقدام در وضعیت فعلی مساعده مجاز نیست.');
    if (!assigneeUserId && !['rejected'].includes(next)) throw new Error('کاربر فعال مرحله بعد تعیین نشده است.');
    const normalizedAmount = amountRial === undefined ? record.amountRial : normalizeDecimal(amountRial);
    if (!normalizedAmount || BigInt(normalizedAmount) <= 0n) throw new Error('مبلغ مساعده باید بیشتر از صفر باشد.');
    const now = new Date().toISOString();
    const updated: OperationalRecord = {...record, status: next, assigneeUserId, amountRial: normalizedAmount, updatedByActorId: actor.actorId, version: record.version + 1, updatedAt: now, payload: {...record.payload, approvedAmountRial: normalizedAmount, resumeStage: next === 'needs_correction' ? stage : null, trail: [...payload.trail, {id: newId('advance-trail'), stage: next, action: decision, actorId: actor.id, actorName: actor.name, occurredAt: now, reason: reason.trim() || null, previousAmountRial: record.amountRial ?? null, amountRial: normalizedAmount}]}};
    const history = this.makeHistory(state, updated, actor, next === 'sent_to_treasury' ? 'handoff' : 'transitioned', {fromState: record.status, toState: next, reason: reason.trim() || actionLabel, snapshot: {decision, previousAmountRial: record.amountRial, amountRial: normalizedAmount}});
    await this.persistOperationalChange(module.store, updated, history, actor, 'decision', `${actionLabel}: «${record.title}».`, reason.trim());
    if (next === 'sent_to_treasury' && assigneeUserId) await this.createAdvanceTreasuryHandoff(updated, actor, assigneeUserId, reason.trim() || actionLabel);
    return this.loadState();
  }

  async loginAsUser(targetUserId: string): Promise<FoundationState> { const state = await this.loadState(); const admin = state.activeUser; if (state.session.actingAdminUserId) throw new Error('ابتدا مشاهده دسترسی فعلی را پایان دهید.'); if (!admin.isAdmin || !can(admin, 'foundation.users.qa_login')) throw new Error('فقط ادمین اصلی می‌تواند دسترسی کاربران را مشاهده کند.'); const target = state.users.find((user) => user.id === targetUserId); if (!target) throw new Error('کاربر انتخاب‌شده پیدا نشد.'); if (target.status !== 'active') throw new Error('مشاهده دسترسی کاربر غیرفعال ممکن نیست.'); if (target.id === admin.id) throw new Error('همین حالا با این حساب وارد شده‌اید.'); const now = new Date().toISOString(); const correlationId = newId('correlation'); await this.storage.transaction(['sessions', 'audit_events', 'domain_events', 'meta'], 'readwrite', async (tx) => {const audits = await tx.getAll<AuditEvent>('audit_events'); const session: FoundationSession = {id: 'active-session', activeUserId: target.id, actingAdminUserId: admin.id, qaStartedAt: now, switchedAt: now, version: state.session.version + 1}; const audit: AuditEvent = {id: newId('audit'), sequence: nextSequence(audits), companyId: admin.companyId, category: 'session', action: 'organization.access_view.started', actorId: admin.actorId, actorName: admin.name, effectiveUserId: target.id, occurredAt: now, summary: `ادمین مشاهده با دسترسی «${target.name}» را آغاز کرد.`, reason: 'بررسی دسترسی مؤثر کاربر', outcome: 'success', correlationId, metadata: {actingAdminUserId: admin.id, targetUserId: target.id}}; await Promise.all([tx.put('sessions', session), tx.put('audit_events', audit), tx.put('domain_events', {id: newId('event'), aggregateType: 'access-view', aggregateId: session.id, eventType: 'UserAccessViewStarted', actorId: admin.actorId, occurredAt: now, correlationId, payload: {targetUserId: target.id}} satisfies DomainEvent), tx.put('meta', {id: 'lastPersistedAt', value: now})]);}); return this.loadState(); }

  async endQaSession(): Promise<FoundationState> { const state = await this.loadState(); const admin = state.users.find((user) => user.id === state.session.actingAdminUserId); if (!admin) throw new Error('مشاهده دسترسی فعالی وجود ندارد.'); const target = state.activeUser; const now = new Date().toISOString(); const correlationId = newId('correlation'); await this.storage.transaction(['sessions', 'audit_events', 'domain_events', 'meta'], 'readwrite', async (tx) => {const audits = await tx.getAll<AuditEvent>('audit_events'); const session: FoundationSession = {id: 'active-session', activeUserId: admin.id, switchedAt: now, version: state.session.version + 1}; const audit: AuditEvent = {id: newId('audit'), sequence: nextSequence(audits), companyId: admin.companyId, category: 'session', action: 'organization.access_view.ended', actorId: admin.actorId, actorName: admin.name, effectiveUserId: target.id, occurredAt: now, summary: `مشاهده دسترسی «${target.name}» پایان یافت.`, reason: 'بازگشت به دسترسی ادمین', outcome: 'success', correlationId, metadata: {actingAdminUserId: admin.id, targetUserId: target.id}}; await Promise.all([tx.put('sessions', session), tx.put('audit_events', audit), tx.put('domain_events', {id: newId('event'), aggregateType: 'access-view', aggregateId: session.id, eventType: 'UserAccessViewEnded', actorId: admin.actorId, occurredAt: now, correlationId, payload: {targetUserId: target.id}} satisfies DomainEvent), tx.put('meta', {id: 'lastPersistedAt', value: now})]);}); return this.loadState(); }

  async createAssetCustodyChallenge(input: AssetCustodyInput): Promise<LocalAssetCustodyChallenge> {
    const state = await this.loadState(); const actor = state.activeUser;
    const ownReturn = input.action === 'return' && actor.personnelId === input.personnelId && !state.session.actingAdminUserId;
    if (!ownReturn) requirePermission(actor, permissionFor('asset-transfer', 'create'), 'مجوز ثبت تحویل یا عودت دارایی را ندارید.');
    const asset = state.operationalRecords.find((record) => record.id === input.assetRecordId && record.moduleId === 'fixed-asset');
    if (!asset) throw new Error('دارایی انتخاب‌شده پیدا نشد.');
    if (asset.status === 'disposed') throw new Error('دارایی واگذارشده قابل تحویل یا عودت نیست.');
    const personnel = state.personnel.find((person) => person.id === input.personnelId);
    if (!personnel) throw new Error('پرونده پرسنلی تحویل‌گیرنده پیدا نشد.');
    const isActorEmployee = actor.personnelId === personnel.id && !state.session.actingAdminUserId;
    const isActorOfficer = !isActorEmployee && !state.session.actingAdminUserId && (actor.isAdmin || can(actor, permissionFor('asset-transfer', 'approve')));
    if (!isActorEmployee && !isActorOfficer) throw new Error('ایجاد فرایند و دریافت رمز فقط برای خود پرسنل یا مسئول مستقل اموال مجاز است.');
    if (input.action === 'delivery' && personnel.employmentStatus !== 'active') throw new Error('تحویل دارایی فقط به پرسنل دارای همکاری فعال مجاز است.');
    const currentCustodian = typeof asset.payload.custodianPersonnelId === 'string' ? asset.payload.custodianPersonnelId : undefined;
    if (input.action === 'return' && currentCustodian !== personnel.id) throw new Error('این دارایی در حال حاضر در اختیار پرسنل انتخاب‌شده نیست.');
    if (input.action === 'delivery' && currentCustodian) throw new Error('این دارایی ابتدا باید از تحویل‌گیرنده فعلی عودت داده شود.');
    const hasOpenTransfer = state.operationalRecords.some((record) => record.moduleId === 'asset-transfer' && record.relatedRecordId === asset.id && ['submitted', 'approved'].includes(record.status));
    if (hasOpenTransfer) throw new Error('برای این دارایی یک فرایند تحویل یا عودت باز وجود دارد.');
    const module = ERP_MODULES.find((item) => item.id === 'asset-transfer')!; const workflow = activeWorkflowFor(state, module); const now = new Date().toISOString();
    const transferId = newId('asset-transfer'); const employeeOtp = createLocalOtp(); const officerOtp = createLocalOtp(); const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const [employeeOtpHash, officerOtpHash] = await Promise.all([hashLocalOtp(transferId, 'employee', employeeOtp), hashLocalOtp(transferId, 'officer', officerOtp)]);
    const existing = state.operationalRecords.filter((record) => record.moduleId === 'asset-transfer');
    const transfer: OperationalRecord = {id: transferId, moduleId: 'asset-transfer', domain: 'asset', trackingCode: `${module.prefix}-${new Date().getFullYear()}-${String(existing.length + 1).padStart(4, '0')}`, title: `${input.action === 'delivery' ? 'تحویل' : 'عودت'} ${asset.title} — ${personnel.firstName} ${personnel.lastName}`, description: input.notes?.trim() ?? '', status: 'submitted', priority: 'normal', companyId: actor.companyId, unitId: personnel.unitId, branchUnitId: personnel.branchUnitId, ownerPersonnelId: personnel.id, assigneeUserId: actor.id, relatedRecordId: asset.id, createdByActorId: actor.actorId, createdByUserId: actor.id, updatedByActorId: actor.actorId, workflowVersion: workflow.version, version: 1, payload: {assetRecordId: asset.id, assetTrackingCode: asset.trackingCode, personnelId: personnel.id, personnelCode: personnel.personnelCode, action: input.action, employeeConfirmed: false, officerConfirmed: false, employeeOtpHash, officerOtpHash, employeeOtpExpiresAt: expiresAt, officerOtpExpiresAt: expiresAt, confirmationPolicy: 'employee_and_asset_officer_otp'}, createdAt: now, updatedAt: now};
    const history: OperationalRecordHistory = {id: newId('history'), recordId: transfer.id, moduleId: transfer.moduleId, sequence: 1, eventType: 'created', actorId: actor.actorId, actorName: actor.name, effectiveUserId: actor.id, snapshot: {transferId: transfer.id, assetRecordId: asset.id, personnelId: personnel.id, action: input.action, otpExpiresAt: expiresAt}, occurredAt: now};
    await this.persistOperationalChange(module.store, transfer, history, actor, 'created', `فرایند ${input.action === 'delivery' ? 'تحویل' : 'عودت'} دارایی «${asset.title}» با تأیید دوطرفه ایجاد شد.`);
    if (ownReturn) {
      const recipients = state.users.filter((user) => user.status === 'active' && user.roleIds.includes('role-asset-manager') && user.id !== actor.id);
      for (const recipient of recipients) await this.storage.put('notifications', {id: newId('notification'), userId: recipient.id, kind: 'workflow', title: `درخواست عودت ${asset.trackingCode}`, message: `${actor.name} درخواست عودت دارایی «${asset.title}» را ثبت کرد.`, actorUserId: actor.id, relatedRecordId: transfer.id, relatedModuleId: 'asset-transfer', createdAt: now} satisfies UserNotification);
    }
    const party = isActorEmployee ? 'employee' : 'officer';
    return {state: await this.loadState(), transferId, party, otp: party === 'employee' ? employeeOtp : officerOtp, expiresAt};
  }

  async issueAssetCustodyOtp(transferId: string, party: 'employee' | 'officer'): Promise<LocalAssetCustodyChallenge> {
    const state = await this.loadState(); const actor = state.activeUser;
    if (state.session.actingAdminUserId) throw new Error('رمز یک‌بارمصرف فقط در ورود مستقیم هر طرف نمایش داده می‌شود.');
    const transfer = state.operationalRecords.find((record) => record.id === transferId && record.moduleId === 'asset-transfer');
    if (!transfer || !['submitted', 'approved'].includes(transfer.status)) throw new Error('فرایند تحویل یا عودت فعال پیدا نشد.');
    const targetPersonnelId = String(transfer.payload.personnelId ?? '');
    const isEmployee = actor.personnelId === targetPersonnelId;
    const isAssetOfficer = actor.isAdmin || can(actor, permissionFor('asset-transfer', 'approve'));
    if (party === 'employee' && !isEmployee) throw new Error('رمز پرسنل فقط به حساب همان پرسنل نمایش داده می‌شود.');
    if (party === 'officer' && (!isAssetOfficer || isEmployee)) throw new Error('رمز مسئول اموال فقط به مسئول مجاز و مستقل نمایش داده می‌شود.');
    const otherParty = party === 'employee' ? 'officer' : 'employee';
    if (transfer.payload[`${otherParty}ConfirmedByUserId`] === actor.id) throw new Error('یک کاربر نمی‌تواند تأیید هر دو طرف را ثبت کند.');
    if (transfer.payload[`${party}Confirmed`] === true) throw new Error('تأیید این طرف قبلاً ثبت شده است.');
    const otp = createLocalOtp(); const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const otpHash = await hashLocalOtp(transfer.id, party, otp);
    const updated: OperationalRecord = {...transfer, payload: {...transfer.payload, [`${party}OtpHash`]: otpHash, [`${party}OtpExpiresAt`]: expiresAt}, updatedByActorId: actor.actorId, updatedAt: new Date().toISOString(), version: transfer.version + 1};
    await this.storage.put('asset_transfers', updated);
    await this.appendAudit({actor, effectiveUser: actor, category: 'authorization', action: `asset.custody.${party}_otp_issued`, summary: `رمز یک‌بارمصرف ${party === 'employee' ? 'پرسنل' : 'مسئول اموال'} فقط برای طرف مجاز صادر شد.`, outcome: 'success', metadata: {transferId: transfer.id, party}});
    return {state: await this.loadState(), transferId, party, otp, expiresAt};
  }

  async confirmAssetCustodyOtp(transferId: string, party: 'employee' | 'officer', otp: string): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    const transfer = state.operationalRecords.find((record) => record.id === transferId && record.moduleId === 'asset-transfer');
    if (!transfer || !['submitted', 'approved'].includes(transfer.status)) throw new Error('فرایند تحویل یا عودت فعال پیدا نشد.');
    const targetPersonnelId = String(transfer.payload.personnelId ?? '');
    const isEmployee = actor.personnelId === targetPersonnelId;
    const isAssetOfficer = actor.isAdmin || can(actor, permissionFor('asset-transfer', 'approve'));
    if (state.session.actingAdminUserId) throw new Error('تأیید دارایی در حالت مشاهده دسترسی مجاز نیست؛ هر طرف باید مستقیم وارد حساب خود شود.');
    if (party === 'employee' && !isEmployee) throw new Error('تأیید پرسنل فقط توسط خود همان پرسنل قابل ثبت است.');
    if (party === 'officer' && (!isAssetOfficer || isEmployee)) throw new Error('تأیید مسئول اموال فقط توسط مسئول مجاز و مستقل قابل ثبت است.');
    const otherParty = party === 'employee' ? 'officer' : 'employee';
    if (transfer.payload[`${otherParty}ConfirmedByUserId`] === actor.id) throw new Error('یک کاربر نمی‌تواند تأیید هر دو طرف را ثبت کند.');
    const expiresAt = String(transfer.payload[`${party}OtpExpiresAt`] ?? transfer.payload.otpExpiresAt ?? '');
    if (!expiresAt || new Date(expiresAt).getTime() < Date.now()) throw new Error('رمز یک‌بارمصرف منقضی شده است؛ فرایند جدیدی ایجاد کنید.');
    const confirmedKey = party === 'employee' ? 'employeeConfirmed' : 'officerConfirmed';
    if (transfer.payload[confirmedKey] === true) throw new Error('این طرف قبلاً تحویل را تأیید کرده است.');
    const hashKey = party === 'employee' ? 'employeeOtpHash' : 'officerOtpHash'; const expectedHash = String(transfer.payload[hashKey] ?? '');
    if (!/^\d{6}$/.test(otp) || await hashLocalOtp(transfer.id, party, otp) !== expectedHash) throw new Error('رمز یک‌بارمصرف معتبر نیست.');
    const now = new Date().toISOString(); const payload = {...transfer.payload, [confirmedKey]: true, [hashKey]: null, [`${party}OtpExpiresAt`]: null, [`${party}ConfirmedAt`]: now, [`${party}ConfirmedByUserId`]: actor.id};
    const bothConfirmed = (party === 'employee' || transfer.payload.employeeConfirmed === true) && (party === 'officer' || transfer.payload.officerConfirmed === true);
    const updated: OperationalRecord = {...transfer, status: bothConfirmed ? 'completed' : 'approved', payload, updatedByActorId: actor.actorId, updatedAt: now, version: transfer.version + 1};
    const history = this.makeHistory(state, updated, actor, 'transitioned', {fromState: transfer.status, toState: updated.status, reason: party === 'employee' ? 'تأیید رمز یک‌بارمصرف تحویل‌گیرنده' : 'تأیید رمز یک‌بارمصرف مسئول اموال', snapshot: {party, bothConfirmed}});
    let updatedAsset: OperationalRecord | undefined;
    let updatedOffboarding: OperationalRecord | undefined;
    let custodyAction: 'delivery' | 'return' | undefined;
    if (bothConfirmed) {
      const asset = state.operationalRecords.find((record) => record.id === transfer.relatedRecordId && record.moduleId === 'fixed-asset');
      if (!asset) throw new Error('دارایی مرتبط با این انتقال پیدا نشد.');
      custodyAction = transfer.payload.action === 'return' ? 'return' : 'delivery';
      updatedAsset = {...asset, status: 'active', ownerPersonnelId: custodyAction === 'delivery' ? targetPersonnelId : undefined, payload: {...asset.payload, custodianPersonnelId: custodyAction === 'delivery' ? targetPersonnelId : null, custodyStatus: custodyAction === 'delivery' ? 'delivered' : 'returned', lastCustodyTransferId: transfer.id, lastCustodyChangedAt: now}, updatedByActorId: actor.actorId, updatedAt: now, version: asset.version + 1};
      if (custodyAction === 'return') {
        const offboarding = state.operationalRecords.find((record) => record.moduleId === 'offboarding' && record.ownerPersonnelId === targetPersonnelId && !['completed', 'cancelled'].includes(record.status));
        if (offboarding) {
          const pendingAssetIds = state.operationalRecords.filter((record) => record.moduleId === 'fixed-asset' && record.id !== asset.id && record.payload.custodianPersonnelId === targetPersonnelId && record.status !== 'disposed').map((record) => record.id);
          updatedOffboarding = {...offboarding, payload: {...offboarding.payload, pendingAssetIds, assetClearanceStatus: pendingAssetIds.length ? 'pending' : 'clear', currentWaitingFor: pendingAssetIds.length ? 'عودت دارایی‌ها و اموال' : 'تسویه مالی و سازمانی'}, updatedByActorId: actor.actorId, updatedAt: now, version: offboarding.version + 1};
        }
      }
    }
    const auditActor = await this.resolveAuditActor(actor);
    const correlationId = newId('correlation');
    const confirmationSummary = `${party === 'employee' ? 'تحویل‌گیرنده' : 'مسئول اموال'} فرایند «${transfer.title}» را با رمز یک‌بارمصرف تأیید کرد.`;
    await this.storage.transaction(['asset_transfers', 'fixed_assets', 'offboarding_cases', 'workflow_history', 'audit_events', 'domain_events', 'meta'], 'readwrite', async (tx) => {
      const latestTransfer = await tx.get<OperationalRecord>('asset_transfers', transfer.id);
      if (!latestTransfer || latestTransfer.version !== transfer.version || latestTransfer.status !== transfer.status) throw new Error('این فرایند هم‌زمان در پنجره دیگری تغییر کرده است؛ صفحه را تازه کنید.');
      if (updatedAsset) {
        const latestAsset = await tx.get<OperationalRecord>('fixed_assets', updatedAsset.id);
        if (!latestAsset || latestAsset.version + 1 !== updatedAsset.version) throw new Error('دارایی مرتبط هم‌زمان تغییر کرده است؛ صفحه را تازه کنید.');
      }
      if (updatedOffboarding) {
        const latestOffboarding = await tx.get<OperationalRecord>('offboarding_cases', updatedOffboarding.id);
        if (!latestOffboarding || latestOffboarding.version + 1 !== updatedOffboarding.version) throw new Error('پرونده خروج هم‌زمان تغییر کرده است؛ صفحه را تازه کنید.');
      }
      const audits = await tx.getAll<AuditEvent>('audit_events');
      const auditSequence = nextSequence(audits);
      await tx.put('asset_transfers', updated);
      await tx.put('workflow_history', history);
      if (updatedAsset) await tx.put('fixed_assets', updatedAsset);
      if (updatedOffboarding) await tx.put('offboarding_cases', updatedOffboarding);
      await tx.put('audit_events', {id: newId('audit'), sequence: auditSequence, companyId: updated.companyId, category: 'system', action: `${updated.domain}.${updated.moduleId}.confirmed`, actorId: auditActor.actorId, actorName: auditActor.name, effectiveUserId: actor.id, occurredAt: now, summary: confirmationSummary, outcome: 'success', correlationId, metadata: {recordId: updated.id, moduleId: updated.moduleId, version: updated.version, actingAdminUserId: auditActor.id === actor.id ? null : auditActor.id}} satisfies AuditEvent);
      await tx.put('domain_events', {id: newId('event'), aggregateType: updated.moduleId, aggregateId: updated.id, eventType: 'confirmed', actorId: auditActor.actorId, occurredAt: now, correlationId, payload: {effectiveUserId: actor.id, status: updated.status, version: updated.version}} satisfies DomainEvent);
      if (updatedAsset && custodyAction) {
        await tx.put('audit_events', {id: newId('audit'), sequence: auditSequence + 1, companyId: updatedAsset.companyId, category: 'system', action: custodyAction === 'delivery' ? 'asset.custody.delivered' : 'asset.custody.returned', actorId: auditActor.actorId, actorName: auditActor.name, effectiveUserId: actor.id, occurredAt: now, summary: `${custodyAction === 'delivery' ? 'تحویل' : 'عودت'} دارایی «${updatedAsset.title}» با تأیید دوطرفه قطعی شد.`, outcome: 'success', correlationId, metadata: {assetId: updatedAsset.id, transferId: transfer.id, personnelId: targetPersonnelId}} satisfies AuditEvent);
        await tx.put('domain_events', {id: newId('event'), aggregateType: 'asset-custody', aggregateId: updatedAsset.id, eventType: custodyAction === 'delivery' ? 'delivered' : 'returned', actorId: auditActor.actorId, occurredAt: now, correlationId, payload: {transferId: transfer.id, personnelId: targetPersonnelId}} satisfies DomainEvent);
      }
      await tx.put('meta', {id: 'lastPersistedAt', value: now});
    });
    return this.loadState();
  }

  async reportOwnAssetIssue(input: OwnAssetIssueInput): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    if (state.session.actingAdminUserId) throw new Error('ثبت گزارش دارایی در حالت مشاهده دسترسی مجاز نیست؛ کاربر باید مستقیم وارد حساب خود شود.');
    if (!actor.personnelId) throw new Error('حساب کاربری به پرونده پرسنلی متصل نیست.');
    const asset = state.operationalRecords.find((record) => record.id === input.assetRecordId && record.moduleId === 'fixed-asset');
    if (!asset || asset.payload.custodianPersonnelId !== actor.personnelId || asset.status === 'disposed') throw new Error('این دارایی در اختیار حساب کاربری شما نیست.');
    if (input.description.trim().length < 5) throw new Error('شرح مشکل باید حداقل ۵ نویسه باشد.');
    const module = ERP_MODULES.find((item) => item.id === 'asset-maintenance')!;
    const recipients = state.users.filter((user) => user.status === 'active' && user.roleIds.includes('role-asset-manager') && user.id !== actor.id);
    const now = new Date().toISOString(); const existing = state.operationalRecords.filter((item) => item.moduleId === module.id);
    const issueLabel = input.issueType === 'damage' ? 'خرابی' : input.issueType === 'lost' ? 'مفقودی' : 'مشکل';
    const record: OperationalRecord = {id: newId('asset-maintenance'), moduleId: module.id, domain: module.domain, trackingCode: `${module.prefix}-${new Date().getFullYear()}-${String(existing.length + 1).padStart(4, '0')}`, title: `گزارش ${issueLabel} ${asset.title}`, description: input.description.trim(), status: 'submitted', priority: input.issueType === 'lost' ? 'critical' : 'normal', companyId: actor.companyId, unitId: actor.unitId, branchUnitId: actor.branchUnitId, ownerPersonnelId: actor.personnelId, assigneeUserId: recipients[0]?.id, relatedRecordId: asset.id, createdByActorId: actor.actorId, createdByUserId: actor.id, updatedByActorId: actor.actorId, workflowVersion: activeWorkflowFor(state, module).version, version: 1, payload: {assetRecordId: asset.id, assetTrackingCode: asset.trackingCode, reportedByPersonnelId: actor.personnelId, issueType: input.issueType, reportedAt: now, selfService: true}, createdAt: now, updatedAt: now};
    const history = this.makeHistory(state, record, actor, 'created', {reason: input.description.trim(), snapshot: {assetRecordId: asset.id, issueType: input.issueType}});
    await this.persistOperationalChange(module.store, record, history, actor, 'reported', `${actor.name} ${issueLabel} دارایی «${asset.title}» را گزارش کرد.`, input.description.trim());
    for (const recipient of recipients) await this.storage.put('notifications', {id: newId('notification'), userId: recipient.id, kind: 'workflow', title: `${issueLabel} دارایی ${asset.trackingCode}`, message: `${actor.name}: ${input.description.trim()}`, actorUserId: actor.id, relatedRecordId: record.id, relatedModuleId: module.id, createdAt: now} satisfies UserNotification);
    return this.loadState();
  }

  async updateOffboardingClearance(recordId: string, expectedVersion: number, area: OffboardingClearanceArea, cleared: boolean, note: string): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    const record = state.operationalRecords.find((item) => item.id === recordId && item.moduleId === 'offboarding');
    if (!record) throw new Error('پرونده خروج پیدا نشد.');
    if (record.version !== expectedVersion) throw new Error('پرونده خروج در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');
    if (record.status === 'completed') throw new Error('پرونده خروج بسته‌شده قابل تغییر نیست.');
    if (note.trim().length < 3) throw new Error('توضیح این تصمیم باید حداقل ۳ نویسه باشد.');
    const financialRoles = new Set(['role-accountant', 'role-senior-accountant', 'role-chief-accountant']);
    const organizationalRoles = new Set(['role-hr-operator', 'role-hr-manager', 'role-personnel-reviewer']);
    const allowed = actor.isAdmin || actor.roleIds.some((roleId) => (area === 'financial' ? financialRoles : organizationalRoles).has(roleId));
    if (!allowed) throw new Error(area === 'financial' ? 'فقط حسابداری مجاز به ثبت تسویه مالی است.' : 'فقط منابع انسانی مجاز به ثبت تسویه سازمانی است.');
    const now = new Date().toISOString();
    const statusKey = area === 'financial' ? 'financialClearanceStatus' : 'organizationalClearanceStatus';
    const noteKey = area === 'financial' ? 'financialClearanceNote' : 'organizationalClearanceNote';
    const atKey = area === 'financial' ? 'financialClearedAt' : 'organizationalClearedAt';
    const byKey = area === 'financial' ? 'financialClearedByUserId' : 'organizationalClearedByUserId';
    const payload = {...record.payload, [statusKey]: cleared ? 'clear' : 'pending', [noteKey]: note.trim(), [atKey]: cleared ? now : null, [byKey]: cleared ? actor.id : null};
    const pendingAssets = Array.isArray(payload.pendingAssetIds) ? payload.pendingAssetIds.length : 0;
    payload.currentWaitingFor = pendingAssets
      ? 'عودت دارایی‌ها و اموال'
      : payload.financialClearanceStatus !== 'clear'
        ? 'تسویه مالی'
        : payload.organizationalClearanceStatus !== 'clear'
          ? 'تسویه سازمانی'
          : 'بستن نهایی پرونده خروج';
    const updated: OperationalRecord = {...record, payload, updatedByActorId: actor.actorId, updatedAt: now, version: record.version + 1};
    const label = area === 'financial' ? 'تسویه مالی' : 'تسویه سازمانی';
    const history = this.makeHistory(state, updated, actor, 'comment', {reason: note.trim(), snapshot: {area, cleared, status: payload[statusKey]}});
    await this.persistOperationalChange('offboarding_cases', updated, history, actor, 'clearance_updated', `${label} پرونده «${record.title}» ${cleared ? 'تأیید' : 'بازگشایی'} شد.`, note.trim());
    return this.loadState();
  }

  async completeOffboarding(recordId: string, expectedVersion: number, reason: string): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    const record = state.operationalRecords.find((item) => item.id === recordId && item.moduleId === 'offboarding');
    if (!record) throw new Error('پرونده خروج پیدا نشد.');
    if (record.version !== expectedVersion) throw new Error('پرونده خروج در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');
    if (record.status === 'completed') return state;
    if (!actor.isAdmin && !actor.roleIds.some((roleId) => ['role-hr-manager', 'role-personnel-reviewer'].includes(roleId))) throw new Error('فقط مدیر یا بازبین منابع انسانی مجاز به بستن پرونده خروج است.');
    if (reason.trim().length < 3) throw new Error('توضیح بستن پرونده الزامی است.');
    const blockers: string[] = [];
    if (record.payload.accountClosureStatus !== 'disabled') blockers.push('حساب کاربری هنوز بسته نشده است');
    if (record.payload.assetClearanceStatus !== 'clear' || (Array.isArray(record.payload.pendingAssetIds) && record.payload.pendingAssetIds.length)) blockers.push('عودت اموال کامل نشده است');
    if (record.payload.financialClearanceStatus !== 'clear') blockers.push('تسویه مالی تأیید نشده است');
    if (record.payload.organizationalClearanceStatus !== 'clear') blockers.push('تسویه سازمانی تأیید نشده است');
    if (blockers.length) throw new Error(`بستن پرونده ممکن نیست: ${blockers.join('، ')}.`);
    const now = new Date().toISOString();
    const updated: OperationalRecord = {...record, status: 'completed', assigneeUserId: actor.id, payload: {...record.payload, currentWaitingFor: 'پرونده خروج بسته شده', closedAt: now, closedByUserId: actor.id, closureReason: reason.trim()}, updatedByActorId: actor.actorId, updatedAt: now, version: record.version + 1};
    const history = this.makeHistory(state, updated, actor, 'transitioned', {fromState: record.status, toState: 'completed', reason: reason.trim(), snapshot: {allClearancesCompleted: true}});
    await this.persistOperationalChange('offboarding_cases', updated, history, actor, 'completed', `پرونده خروج «${record.title}» پس از تکمیل همه تسویه‌ها بسته شد.`, reason.trim());
    return this.loadState();
  }

  async createOperationalRecord(moduleId: string, input: OperationalRecordInput): Promise<FoundationState> {
    return this.createOperationalRecordInternal(moduleId, input, false);
  }

  private async createOperationalRecordInternal(moduleId: string, input: OperationalRecordInput, allowSpecialized: boolean): Promise<FoundationState> {
    const module = ERP_MODULES.find((item) => item.id === moduleId); if (!module) throw new Error('ماژول عملیاتی پیدا نشد.');
    if (moduleId === 'recruitment-case' && !allowSpecialized) throw new Error('پرونده جذب فقط از مسیر اختصاصی اعلام نیاز نیرو قابل ایجاد است.');
    if (moduleId === 'personnel-document' && !allowSpecialized) throw new Error('مدرک پرسنلی فقط از بخش «مدارک پرسنلی» پرونده یا حساب خود فرد ثبت می‌شود.');
    if (moduleId === 'employee-advance') throw new Error('مساعده فقط از مسیر اختصاصی مساعده ثبت می‌شود.');
    const state = await this.loadState(); const effectiveUser = state.activeUser;
    requirePermission(effectiveUser, permissionFor(moduleId, 'create'), 'مجوز ایجاد رکورد در این ماژول را ندارید.');
    const preparedInput = moduleId === 'purchase-request' ? preparePurchaseRequestInput(state, input) : input;
    if (preparedInput.title.trim().length < 2) throw new Error('عنوان رکورد باید حداقل ۲ نویسه باشد.');
    const now = new Date().toISOString(); const existing = state.operationalRecords.filter((item) => item.moduleId === moduleId);
    const ownerPersonnelId = preparedInput.ownerPersonnelId || effectiveUser.personnelId;
    const salesOwner = moduleId === 'sale' ? state.personnel.find((item) => item.id === ownerPersonnelId) : undefined;
    const salesAttribution = salesOwner ? {sellerPersonnelId: salesOwner.id, salesHierarchyLevel: salesOwner.salesHierarchyLevel ?? null, salesChannel: salesOwner.salesChannel ?? null, salesSupervisorPersonnelId: salesOwner.salesSupervisorPersonnelId ?? null, salesBranchUnitId: salesOwner.salesBranchUnitId ?? null} : undefined;
    const workflow = activeWorkflowFor(state, module);
    const record: OperationalRecord = {id: newId(moduleId), moduleId, domain: module.domain, trackingCode: `${module.prefix}-${new Date().getFullYear()}-${String(existing.length + 1).padStart(4, '0')}`, title: preparedInput.title.trim(), description: preparedInput.description?.trim() ?? '', status: workflow.initialState, priority: preparedInput.priority ?? 'normal', companyId: effectiveUser.companyId, unitId: preparedInput.unitId || effectiveUser.unitId, branchUnitId: preparedInput.branchUnitId || salesOwner?.salesBranchUnitId || effectiveUser.branchUnitId, ownerPersonnelId, assigneeUserId: preparedInput.assigneeUserId || effectiveUser.id, customerId: preparedInput.customerId, relatedRecordId: preparedInput.relatedRecordId, amountRial: normalizeDecimal(preparedInput.amountRial), quantity: normalizeDecimal(preparedInput.quantity), dueAt: preparedInput.dueAt, createdByActorId: effectiveUser.actorId, createdByUserId: effectiveUser.id, updatedByActorId: effectiveUser.actorId, workflowVersion: workflow.version, version: 1, payload: {...(preparedInput.payload ?? {}), ...(salesAttribution ?? {})}, createdAt: now, updatedAt: now};
    const history: OperationalRecordHistory = {id: newId('history'), recordId: record.id, moduleId, sequence: 1, eventType: 'created', actorId: effectiveUser.actorId, actorName: effectiveUser.name, effectiveUserId: effectiveUser.id, snapshot: {...record}, occurredAt: now};
    await this.persistOperationalChange(module.store, record, history, effectiveUser, 'created', `«${record.title}» در ${module.title} ایجاد شد.`);
    return this.loadState();
  }

  async createRecruitmentRequest(input: RecruitmentRequestInput): Promise<FoundationState> {
    const state = await this.loadState();
    const actor = state.activeUser;
    requirePermission(actor, permissionFor('recruitment-case', 'create'), 'مجوز ثبت اعلام نیاز نیرو را ندارید.');
    const targetUnit = state.units.find((unit) => unit.id === input.unitId && unit.status === 'active');
    if (!targetUnit) throw new Error('واحد سازمانی فعال برای اعلام نیاز پیدا نشد.');
    const targetBranch = state.units.find((unit) => unit.id === input.branchUnitId && unit.type === 'شعبه' && unit.status === 'active');
    if (!targetBranch) throw new Error('شعبه محل استقرار نیروی جدید را انتخاب کنید.');
    const isRecruitmentManager = actor.isAdmin || actor.roleIds.includes('role-recruitment-manager');
    const isOwnManagedUnit = actor.unitId === input.unitId && actor.roleIds.includes('role-workforce-requester');
    if (!isRecruitmentManager && !isOwnManagedUnit) throw new Error('مدیر فقط می‌تواند برای واحد تحت مدیریت خودش اعلام نیاز نیرو ثبت کند.');
    if (!isRecruitmentManager && !canRequestWorkforceForBranch(state, targetBranch.id, actor)) throw new Error('این شعبه در حوزه مدیریت فعال شما نیست و امکان ثبت اعلام نیاز برای آن را ندارید.');
    const isProxy = isRecruitmentManager && actor.unitId !== input.unitId;
    if (isProxy && (input.proxyReason?.trim().length ?? 0) < 5) throw new Error('در ثبت نیابتی، دلیل و مبنای درخواست مدیر واحد الزامی است.');
    if (input.title.trim().length < 3) throw new Error('عنوان نیاز نیرو را کامل وارد کنید.');
    if (input.positionTitle.trim().length < 2) throw new Error('سمت موردنیاز الزامی است.');
    const headcount = Number(input.requestedHeadcount);
    if (!Number.isInteger(headcount) || headcount < 1) throw new Error('تعداد نیروی موردنیاز باید حداقل یک نفر باشد.');
    if (input.requestReason.trim().length < 5) throw new Error('دلیل نیاز به نیرو را کامل وارد کنید.');
    const hrAssignee = state.users.find((user) => user.status === 'active' && user.roleIds.includes('role-recruitment-operator'));
    if (!hrAssignee) throw new Error('کارشناس جذب فعال برای دریافت درخواست تعریف نشده است.');
    const managerialScope = resolveWorkforceRequestScope(state, actor);
    const selectedSalesStructures = managerialScope.source === 'active_sales_structure'
      ? state.salesStructures.filter((structure) => managerialScope.structureIds.includes(structure.id) && structure.branchUnitId === targetBranch.id)
      : [];
    return this.createOperationalRecordInternal('recruitment-case', {
      title: input.title, description: input.description, unitId: input.unitId, branchUnitId: targetBranch.id,
      ownerPersonnelId: actor.personnelId, assigneeUserId: hrAssignee.id, dueAt: input.neededDate,
      payload: {
        positionTitle: input.positionTitle, requestedHeadcount: headcount, employmentType: input.employmentType,
        neededDate: input.neededDate ?? null, salaryRangeRial: input.salaryRangeRial ?? null, requestReason: input.requestReason.trim(),
        requestChannel: isProxy ? 'ثبت نیابتی منابع انسانی' : 'ثبت توسط مدیر واحد', proxySubmission: isProxy,
        proxyReason: isProxy ? input.proxyReason!.trim() : null, requestedByUserId: actor.id, requestedByName: actor.name,
        requestedForBranchId: targetBranch.id, requestedForBranchName: targetBranch.name,
        managerialScopeSource: managerialScope.source,
        managerialStructureIds: selectedSalesStructures.map((structure) => structure.id),
        managerialSeniorSupervisorPersonnelIds: [...new Set(selectedSalesStructures.map((structure) => structure.seniorSupervisorPersonnelId))],
        candidateName: 'هنوز انتخاب نشده', candidateAccount: 'هنوز ساخته نشده', personnelStatus: 'متقاضی',
        currentWaitingFor: 'کارشناس جذب منابع انسانی', digitalSignatures: [],
      },
    }, true);
  }

  async updateOperationalRecord(moduleId: string, recordId: string, expectedVersion: number, input: Partial<OperationalRecordInput>): Promise<FoundationState> {
    const module = ERP_MODULES.find((item) => item.id === moduleId); if (!module) throw new Error('ماژول عملیاتی پیدا نشد.');
    if (moduleId === 'personnel-document') throw new Error('جایگزینی مدرک فقط از بخش «مدارک پرسنلی» انجام می‌شود تا نسخه قبلی حفظ شود.');
    if (moduleId === 'employee-advance') throw new Error('ویرایش مساعده فقط از مسیر اختصاصی مساعده انجام می‌شود.');
    const state = await this.loadState(); const effectiveUser = state.activeUser; requirePermission(effectiveUser, permissionFor(moduleId, 'edit'), 'مجوز ویرایش این رکورد را ندارید.');
    const record = state.operationalRecords.find((item) => item.id === recordId && item.moduleId === moduleId); if (!record) throw new Error('رکورد پیدا نشد.');
    this.assertRecordScope(effectiveUser, record, 'edit'); if (record.version !== expectedVersion) throw new Error('این رکورد در تب دیگری تغییر کرده است. تازه‌سازی کنید و دوباره تلاش کنید.');
    if (moduleId === 'purchase-request' && !['draft', 'needs_correction'].includes(record.status)) throw new Error('ویرایش درخواست خرید فقط در پیش‌نویس یا وضعیت نیازمند اصلاح مجاز است.');
    if (moduleId === 'purchase-request' && record.createdByUserId !== effectiveUser.id) throw new Error('فقط سازنده درخواست خرید می‌تواند پیش‌نویس یا اصلاحات آن را ویرایش کند.');
    const mergedInput: OperationalRecordInput = {...purchasePayloadForRecord(record), ...input, payload: input.payload ? {...record.payload, ...input.payload} : record.payload};
    const preparedInput = moduleId === 'purchase-request' ? preparePurchaseRequestInput(state, mergedInput) : mergedInput;
    const now = new Date().toISOString(); const updated: OperationalRecord = {...record, ...preparedInput, title: preparedInput.title?.trim() || record.title, description: preparedInput.description?.trim() ?? record.description, amountRial: preparedInput.amountRial === undefined ? record.amountRial : normalizeDecimal(preparedInput.amountRial), quantity: preparedInput.quantity === undefined ? record.quantity : normalizeDecimal(preparedInput.quantity), payload: preparedInput.payload ? {...record.payload, ...preparedInput.payload} : record.payload, updatedByActorId: effectiveUser.actorId, version: record.version + 1, updatedAt: now};
    const history = this.makeHistory(state, updated, effectiveUser, 'edited', {snapshot: {beforeVersion: record.version, after: updated}});
    await this.persistOperationalChange(module.store, updated, history, effectiveUser, 'edited', `«${updated.title}» ویرایش شد.`);
    return this.loadState();
  }

  async transitionOperationalRecord(moduleId: string, recordId: string, transitionId: string, reason = '', idempotencyKey?: string): Promise<FoundationState> {
    if (moduleId === 'personnel-document') throw new Error('گردش مدرک پرسنلی فقط از بخش تخصصی مدارک مدیریت می‌شود.');
    if (moduleId === 'employee-advance') throw new Error('تصمیم مساعده فقط از مسیر اختصاصی مساعده انجام می‌شود.');
    const module = ERP_MODULES.find((item) => item.id === moduleId); if (!module) throw new Error('ماژول عملیاتی پیدا نشد.');
    const state = await this.loadState(); const effectiveUser = state.activeUser; const record = state.operationalRecords.find((item) => item.id === recordId && item.moduleId === moduleId); if (!record) throw new Error('رکورد پیدا نشد.');
    const workflow = workflowForRecord(state, module, record);
    const transition = workflow.transitions.find((item) => item.id === transitionId && item.from.includes(record.status)); if (!transition) throw new Error('این انتقال از وضعیت فعلی مجاز نیست.');
    requirePermission(effectiveUser, transition.permission, 'مجوز این انتقال گردش‌کار را ندارید.'); this.assertRecordScope(effectiveUser, record, transition.makerChecker ? 'approve' : 'transition');
    if (moduleId === 'recruitment-case' && !effectiveUser.isAdmin && record.assigneeUserId !== effectiveUser.id) throw new Error('فقط مسئول ثبت‌شده مرحله فعلی پرونده جذب می‌تواند این انتقال را انجام دهد.');
    if (transition.makerChecker && record.createdByActorId === effectiveUser.actorId) throw new Error('سازنده رکورد نمی‌تواند همان رکورد را تأیید کند.');
    if (moduleId === 'purchase-request' && ['draft', 'needs_correction'].includes(record.status) && ['submitted', 'cancelled'].includes(transition.to) && record.createdByUserId !== effectiveUser.id) throw new Error('فقط درخواست‌کننده اصلی می‌تواند پیش‌نویس را ارسال، اصلاح یا لغو کند.');
    if (transition.sensitive && state.session.actingAdminUserId) throw new Error('تأیید حساس در حالت ورود آزمایشی غیرفعال است؛ کاربر باید مستقیماً وارد شود.');
    if (transition.reasonRequired && reason.trim().length < 3) throw new Error('ثبت دلیل برای این انتقال الزامی است.');
    if (moduleId === 'purchase-request' && ['submitted', 'purchase_approved', 'sent_to_treasury'].includes(transition.to)) preparePurchaseRequestInput(state, purchasePayloadForRecord(record));
    this.validateBusinessTransition(state, record, transition.to, effectiveUser, reason);
    const key = idempotencyKey || `${record.id}:${record.version}:${transition.id}`;
    if (await this.storage.get('idempotency_keys', key)) return state;
    const now = new Date().toISOString();
    const purchaseAssignee = moduleId === 'purchase-request' && ['needs_correction', 'rejected'].includes(transition.to)
      ? record.createdByUserId
      : moduleId === 'purchase-request' && transition.to === 'submitted' && typeof record.payload.returnToApproverUserId === 'string'
        ? record.payload.returnToApproverUserId
        : record.assigneeUserId;
    const purchasePayload = moduleId === 'purchase-request' && transition.to === 'needs_correction'
      ? {...record.payload, returnToApproverUserId: effectiveUser.id}
      : record.payload;
    const recruitmentAssignee = moduleId === 'recruitment-case' ? this.resolveRecruitmentAssignee(state, transition.to, effectiveUser, record) : undefined;
    const recruitmentWaitingFor: Record<string, string> = {
      hr_review: 'کارشناس جذب منابع انسانی', ready_to_publish: 'کارشناس جذب برای انتشار آگهی', published: 'دریافت و تکمیل پرونده متقاضی',
      candidate_review: 'بررسی منابع انسانی', interview_scheduled: 'ارزیاب مصاحبه', evaluated: 'مدیر جذب منابع انسانی', offer_sent: 'پاسخ و امضای متقاضی',
      offer_accepted: 'تکمیل مدارک منابع انسانی', ready_to_start: 'سرپرست شروع همکاری', training: 'ارزیابی دوره آموزشی توسط سرپرست', contracted: 'تکمیل‌شده',
      needs_correction: 'مدیر درخواست‌کننده نیرو', on_hold: 'متوقف تا تصمیم منابع انسانی', withdrawn: 'بسته‌شده', rejected: 'بسته‌شده',
    };
    const updated: OperationalRecord = {...record, status: transition.to, assigneeUserId: recruitmentAssignee?.id ?? purchaseAssignee, updatedByActorId: effectiveUser.actorId, version: record.version + 1, updatedAt: now, payload: {...purchasePayload, ...(moduleId === 'recruitment-case' ? {currentWaitingFor: recruitmentWaitingFor[transition.to] ?? 'مرحله بعدی'} : {}), lastTransitionReason: reason.trim() || null}};
    const history = this.makeHistory(state, updated, effectiveUser, transition.handoffModuleId ? 'handoff' : 'transitioned', {fromState: record.status, toState: transition.to, reason: reason.trim() || undefined, snapshot: {transitionId: transition.id, workflowVersion: workflow.version}});
    await this.persistOperationalChange(module.store, updated, history, effectiveUser, 'transitioned', `وضعیت «${record.title}» از ${stateLabel(workflow, record.status)} به ${stateLabel(workflow, transition.to)} تغییر کرد.`, reason, key);
    if (transition.handoffModuleId) {
      if (moduleId === 'purchase-request' && transition.to === 'sent_to_treasury') await this.createPurchaseTreasuryHandoffs(updated, effectiveUser, reason);
      else await this.createHandoffRecord(transition.handoffModuleId, updated, effectiveUser, reason);
    }
    return this.loadState();
  }

  private resolveRecruitmentAssignee(state: FoundationState, targetState: string, actor: LocalUser, record: OperationalRecord): LocalUser | undefined {
    const roleByState: Record<string, string> = {
      hr_review: 'role-recruitment-manager', ready_to_publish: 'role-recruitment-operator', published: 'role-recruitment-operator', candidate_review: 'role-recruitment-operator',
      interview_scheduled: 'role-recruitment-interviewer', evaluated: 'role-recruitment-manager', offer_sent: 'role-recruitment-manager', offer_accepted: 'role-recruitment-manager',
      ready_to_start: 'role-onboarding-supervisor', training: 'role-onboarding-supervisor', contracted: 'role-recruitment-manager',
    };
    if (targetState === 'needs_correction') return state.users.find((user) => user.id === record.createdByUserId && user.status === 'active');
    const roleId = roleByState[targetState];
    if (!roleId) return actor;
    const candidates = state.users.filter((user) => user.status === 'active' && user.roleIds.includes(roleId));
    if (['role-recruitment-interviewer','role-onboarding-supervisor'].includes(roleId)) {
      return candidates.find((user) => user.unitId === record.unitId && (!record.branchUnitId || user.branchUnitId === record.branchUnitId)) ?? candidates[0];
    }
    return candidates[0];
  }

  async decidePurchaseRequest(recordId: string, decision: PurchaseRequestDecision, targetUserId: string, reason: string): Promise<FoundationState> {
    const module = ERP_MODULES.find((item) => item.id === 'purchase-request');
    if (!module) throw new Error('ماژول درخواست خرید پیدا نشد.');
    const state = await this.loadState();
    const actor = state.activeUser;
    const record = state.operationalRecords.find((item) => item.id === recordId && item.moduleId === 'purchase-request');
    if (!record) throw new Error('درخواست خرید پیدا نشد.');
    if (!['submitted', 'purchase_review', 'purchase_approved'].includes(record.status)) throw new Error('این درخواست در وضعیت قابل تصمیم‌گیری نیست.');
    if (actor.status !== 'active') throw new Error('حساب کاربری غیرفعال اجازه تصمیم‌گیری ندارد.');
    requirePermission(actor, permissionFor('purchase-request', 'approve'), 'مجوز تأیید درخواست خرید را ندارید.');
    const decisionRoleIds = roleIdsForWorkflowState(state, 'purchase-request', record.status === 'submitted' ? 'submitted' : 'purchase_review', ['role-purchase-approver'], record.workflowVersion);
    if (!actor.isAdmin && !actor.roleIds.some((roleId) => decisionRoleIds.includes(roleId))) throw new Error('نقش شما در نسخه فعال این مرحله گردش‌کار مسئول تأیید نیست.');
    const configuredDecision = decision === 'approve_and_forward' ? 'approve' : decision === 'rejected' ? 'reject' : 'needs_correction';
    const configuredState = record.status === 'submitted' ? 'submitted' : 'purchase_review';
    if (!workflowStageAllows(state, 'purchase-request', configuredState, configuredDecision, ['approve','reject','needs_correction'], record.workflowVersion)) throw new Error('این تصمیم در نسخه گردش‌کار پرونده برای مرحله فعلی مجاز نیست.');
    this.assertRecordScope(actor, record, 'approve');
    if (record.createdByActorId === actor.actorId) throw new Error('درخواست‌کننده نمی‌تواند درخواست خرید خودش را تأیید کند.');
    if (reason.trim().length < 3) throw new Error('ثبت توضیح تصمیم الزامی است.');

    const creator = state.users.find((user) => user.id === record.createdByUserId && user.status === 'active');
    let target: LocalUser | undefined;
    let targetState: string;
    let eventSummary: string;
    let handoffToTreasury = false;

    if (decision === 'approve_and_forward') {
      target = state.users.find((user) => user.id === targetUserId && user.status === 'active');
      if (!target) throw new Error('مقصد ارجاع را انتخاب کنید.');
      if (target.id === actor.id) throw new Error('تأییدکننده بعدی باید فرد دیگری باشد.');
      if (target.id === record.createdByUserId) throw new Error('ارجاع تأیید به سازنده درخواست مجاز نیست.');
      const approverRoleIds = roleIdsForWorkflowState(state, 'purchase-request', 'purchase_review', ['role-purchase-approver'], record.workflowVersion);
      const payerRoleIds = roleIdsForWorkflowState(state, 'purchase-request', 'sent_to_treasury', ['role-treasury-executor-v1'], record.workflowVersion);
      const isNextApprover = target.roleIds.some((roleId) => approverRoleIds.includes(roleId)) && can(target, permissionFor('purchase-request', 'approve'));
      const isPaymentExecutor = target.roleIds.some((roleId) => payerRoleIds.includes(roleId)) && can(target, permissionFor('treasury-execution', 'transition'));
      if (!isNextApprover && !isPaymentExecutor) throw new Error('کاربر مقصد باید تأییدکننده درخواست خرید یا پرداخت‌کننده خزانه باشد.');
      handoffToTreasury = isPaymentExecutor && !isNextApprover;
      targetState = handoffToTreasury ? 'sent_to_treasury' : 'purchase_review';
      eventSummary = handoffToTreasury
        ? `«${record.title}» تأیید و به ${target.name} در صف پرداخت ارجاع شد.`
        : `«${record.title}» تأیید و به تأییدکننده بعدی، ${target.name}، ارجاع شد.`;
      preparePurchaseRequestInput(state, purchasePayloadForRecord(record));
    } else if (decision === 'needs_correction') {
      target = creator;
      targetState = 'needs_correction';
      eventSummary = `«${record.title}» برای اصلاح به درخواست‌کننده بازگردانده شد.`;
    } else {
      target = creator;
      targetState = 'rejected';
      eventSummary = `«${record.title}» رد و بسته شد.`;
    }

    const now = new Date().toISOString();
    const approvalTrail = Array.isArray(record.payload.approvalTrail) ? record.payload.approvalTrail : [];
    const updated: OperationalRecord = {
      ...record,
      status: targetState,
      assigneeUserId: target?.id ?? record.createdByUserId,
      updatedByActorId: actor.actorId,
      version: record.version + 1,
      updatedAt: now,
      payload: {
        ...record.payload,
        lastTransitionReason: reason.trim(),
        ...(decision === 'needs_correction' ? {returnToApproverUserId: actor.id} : {}),
        approvalTrail: [...approvalTrail, {decision, actorUserId: actor.id, targetUserId: target?.id ?? null, occurredAt: now, reason: reason.trim()}],
      },
    };
    const history = this.makeHistory(state, updated, actor, handoffToTreasury ? 'handoff' : 'transitioned', {
      fromState: record.status,
      toState: targetState,
      reason: reason.trim(),
      snapshot: {decision, targetUserId: target?.id ?? null, workflowVersion: record.workflowVersion ?? activeWorkflowFor(state, module).version},
    });
    const key = `${record.id}:${record.version}:purchase-decision:${decision}:${target?.id ?? 'creator'}`;
    await this.persistOperationalChange(module.store, updated, history, actor, 'decision', eventSummary, reason.trim(), key);
    if (handoffToTreasury && target) await this.createPurchaseTreasuryHandoffs(updated, actor, reason.trim(), target.id);
    return this.loadState();
  }

  async recordTreasuryPayment(recordId: string, input: TreasuryPaymentInput): Promise<FoundationState> {
    const module = ERP_MODULES.find((item) => item.id === 'treasury-execution');
    if (!module) throw new Error('ماژول خزانه پیدا نشد.');
    const state = await this.loadState();
    const actor = state.activeUser;
    const record = state.operationalRecords.find((item) => item.id === recordId && item.moduleId === 'treasury-execution');
    if (!record) throw new Error('پرونده پرداخت پیدا نشد.');
    if (!['queued', 'claimed'].includes(record.status)) throw new Error('این پرونده در وضعیت قابل پرداخت قرار ندارد.');
    if (record.assigneeUserId !== actor.id) throw new Error('فقط مجری خزانه تعیین‌شده می‌تواند پرداخت این پرونده را ثبت کند.');
    if (actor.status !== 'active') throw new Error('حساب کاربری غیرفعال اجازه ثبت پرداخت ندارد.');
    const transition = module.workflow.transitions.find((item) => item.from.includes(record.status) && item.to === 'payment_recorded');
    if (!transition) throw new Error('انتقال ثبت پرداخت در گردش‌کار پیدا نشد.');
    requirePermission(actor, transition.permission, 'مجوز ثبت پرداخت خزانه را ندارید.');
    this.assertRecordScope(actor, record, 'transition');
    if (!input.paidAt) throw new Error('تاریخ پرداخت الزامی است.');
    if (input.receipt && (!input.receipt.dataUrl || !input.receipt.fileName || input.receipt.size <= 0)) throw new Error('فایل رسید پرداخت کامل نیست؛ فایل را دوباره انتخاب کنید یا رسید را خالی بگذارید.');
    if (input.receipt && input.receipt.size > 5 * 1024 * 1024) throw new Error('حجم رسید پرداخت نباید بیشتر از ۵ مگابایت باشد.');
    if (input.receipt && !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(input.receipt.mimeType)) throw new Error('رسید پرداخت باید تصویر JPG، PNG، WEBP یا فایل PDF باشد.');

    const now = new Date().toISOString();
    const updated: OperationalRecord = {
      ...record,
      status: 'payment_recorded',
      updatedByActorId: actor.actorId,
      version: record.version + 1,
      updatedAt: now,
      payload: {
        ...record.payload,
        payment: {
          paidAt: input.paidAt,
          paymentReference: input.paymentReference.trim(),
          note: input.note.trim(),
          amountRial: record.amountRial ?? '0',
          receipt: input.receipt,
          recordedByUserId: actor.id,
          recordedAt: now,
        },
      },
    };
    const reason = input.note.trim()
      || (input.paymentReference.trim() ? `پرداخت با شماره پیگیری ${input.paymentReference.trim()} ثبت شد.` : 'پرداخت توسط مجری خزانه ثبت شد.');
    const history = this.makeHistory(state, updated, actor, 'transitioned', {
      fromState: record.status,
      toState: 'payment_recorded',
      reason,
      snapshot: {transitionId: transition.id, paymentReference: input.paymentReference.trim() || null, receiptFileName: input.receipt?.fileName ?? null, workflowVersion: module.workflow.version},
    });
    const key = `${record.id}:${record.version}:treasury-payment:${input.paymentReference.trim() || 'without-reference'}`;
    await this.persistOperationalChange(module.store, updated, history, actor, 'payment_recorded', `پرداخت «${record.title}»${input.receipt ? ' همراه رسید' : ''} ثبت شد.`, reason, key);
    const source = state.operationalRecords.find((item) => item.id === record.relatedRecordId && item.moduleId === 'employee-advance');
    if (source) {
      const paid: OperationalRecord = {...source, status: 'paid', assigneeUserId: actor.id, updatedByActorId: actor.actorId, version: source.version + 1, updatedAt: now, payload: {...source.payload, paidAt: input.paidAt, treasuryRecordId: record.id, paymentReference: input.paymentReference.trim() || null}};
      const sourceHistory = this.makeHistory(state, paid, actor, 'transitioned', {fromState: source.status, toState: 'paid', reason, snapshot: {treasuryRecordId: record.id, paymentReference: input.paymentReference.trim() || null}});
      await this.persistOperationalChange('employee_advances', paid, sourceHistory, actor, 'paid', `مساعده «${source.title}» پرداخت شد.`, reason);
    }
    return this.loadState();
  }

  async reviseTreasuryPayment(recordId: string, input: TreasuryPaymentInput, revisionReason: string): Promise<FoundationState> {
    const module = ERP_MODULES.find((item) => item.id === 'treasury-execution');
    if (!module) throw new Error('ماژول خزانه پیدا نشد.');
    const state = await this.loadState();
    const actor = state.activeUser;
    const record = state.operationalRecords.find((item) => item.id === recordId && item.moduleId === 'treasury-execution');
    if (!record) throw new Error('پرونده پرداخت پیدا نشد.');
    if (record.status !== 'payment_recorded') throw new Error('اصلاح پرداخت فقط پیش از راستی‌آزمایی مجاز است.');
    if (record.assigneeUserId !== actor.id) throw new Error('فقط مجری خزانه تعیین‌شده می‌تواند اطلاعات این پرداخت را اصلاح کند.');
    if (actor.status !== 'active') throw new Error('حساب کاربری غیرفعال اجازه اصلاح پرداخت ندارد.');
    requirePermission(actor, permissionFor('treasury-execution', 'edit'), 'مجوز اصلاح اطلاعات پرداخت را ندارید.');
    this.assertRecordScope(actor, record, 'edit');
    if (revisionReason.trim().length < 3) throw new Error('دلیل اصلاح اطلاعات پرداخت را وارد کنید.');
    if (!input.paidAt) throw new Error('تاریخ پرداخت الزامی است.');
    if (input.receipt && (!input.receipt.dataUrl || !input.receipt.fileName || input.receipt.size <= 0)) throw new Error('فایل رسید پرداخت کامل نیست؛ فایل را دوباره انتخاب کنید یا رسید را خالی بگذارید.');
    if (input.receipt && input.receipt.size > 5 * 1024 * 1024) throw new Error('حجم رسید پرداخت نباید بیشتر از ۵ مگابایت باشد.');
    if (input.receipt && !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(input.receipt.mimeType)) throw new Error('رسید پرداخت باید تصویر JPG، PNG، WEBP یا فایل PDF باشد.');
    const currentPayment = record.payload.payment;
    if (!currentPayment || typeof currentPayment !== 'object' || Array.isArray(currentPayment)) throw new Error('اطلاعات پرداخت قبلی برای اصلاح پیدا نشد.');

    const now = new Date().toISOString();
    const paymentHistory = Array.isArray(record.payload.paymentHistory) ? record.payload.paymentHistory : [];
    const updated: OperationalRecord = {
      ...record,
      updatedByActorId: actor.actorId,
      updatedAt: now,
      version: record.version + 1,
      payload: {
        ...record.payload,
        paymentHistory: [...paymentHistory, {...currentPayment, archivedAt: now, archivedByUserId: actor.id, archiveAction: 'revised', archiveReason: revisionReason.trim()}],
        payment: {
          paidAt: input.paidAt,
          paymentReference: input.paymentReference.trim(),
          note: input.note.trim(),
          amountRial: record.amountRial ?? '0',
          receipt: input.receipt,
          recordedByUserId: actor.id,
          recordedAt: now,
        },
      },
    };
    const history = this.makeHistory(state, updated, actor, 'corrected', {
      fromState: record.status,
      toState: record.status,
      reason: revisionReason.trim(),
      snapshot: {previousPayment: currentPayment, paymentReference: input.paymentReference.trim() || null, receiptFileName: input.receipt?.fileName ?? null, workflowVersion: module.workflow.version},
    });
    const key = `${record.id}:${record.version}:treasury-payment-revision`;
    await this.persistOperationalChange(module.store, updated, history, actor, 'payment_corrected', `اطلاعات پرداخت «${record.title}» با حفظ نسخه قبلی اصلاح شد.`, revisionReason.trim(), key);
    return this.loadState();
  }

  async revertTreasuryPayment(recordId: string, reason: string): Promise<FoundationState> {
    const module = ERP_MODULES.find((item) => item.id === 'treasury-execution');
    if (!module) throw new Error('ماژول خزانه پیدا نشد.');
    const state = await this.loadState();
    const actor = state.activeUser;
    const record = state.operationalRecords.find((item) => item.id === recordId && item.moduleId === 'treasury-execution');
    if (!record) throw new Error('پرونده پرداخت پیدا نشد.');
    if (record.status !== 'payment_recorded') throw new Error('بازگشت از پرداخت فقط پیش از راستی‌آزمایی مجاز است.');
    if (record.assigneeUserId !== actor.id) throw new Error('فقط مجری خزانه تعیین‌شده می‌تواند از ثبت این پرداخت بازگردد.');
    if (actor.status !== 'active') throw new Error('حساب کاربری غیرفعال اجازه بازگشت از پرداخت ندارد.');
    const transition = module.workflow.transitions.find((item) => item.from.includes(record.status) && item.to === 'queued');
    if (!transition) throw new Error('مسیر بازگشت از پرداخت در گردش‌کار پیدا نشد.');
    requirePermission(actor, transition.permission, 'مجوز بازگشت از پرداخت را ندارید.');
    this.assertRecordScope(actor, record, 'transition');
    if (reason.trim().length < 3) throw new Error('دلیل بازگشت از پرداخت را وارد کنید.');
    const currentPayment = record.payload.payment;
    if (!currentPayment || typeof currentPayment !== 'object' || Array.isArray(currentPayment)) throw new Error('اطلاعات پرداخت ثبت‌شده پیدا نشد.');

    const now = new Date().toISOString();
    const paymentHistory = Array.isArray(record.payload.paymentHistory) ? record.payload.paymentHistory : [];
    const {payment: _removedPayment, ...payloadWithoutCurrentPayment} = record.payload;
    const updated: OperationalRecord = {
      ...record,
      status: 'queued',
      updatedByActorId: actor.actorId,
      updatedAt: now,
      version: record.version + 1,
      payload: {
        ...payloadWithoutCurrentPayment,
        paymentHistory: [...paymentHistory, {...currentPayment, archivedAt: now, archivedByUserId: actor.id, archiveAction: 'reverted', archiveReason: reason.trim()}],
      },
    };
    const history = this.makeHistory(state, updated, actor, 'transitioned', {
      fromState: record.status,
      toState: 'queued',
      reason: reason.trim(),
      snapshot: {transitionId: transition.id, previousPayment: currentPayment, workflowVersion: module.workflow.version},
    });
    const key = `${record.id}:${record.version}:treasury-payment-revert`;
    await this.persistOperationalChange(module.store, updated, history, actor, 'payment_reverted', `ثبت پرداخت «${record.title}» با حفظ سابقه به مجری بازگردانده شد.`, reason.trim(), key);
    return this.loadState();
  }

  async requestTreasuryFollowUp(recordId: string): Promise<FoundationState> {
    const state = await this.loadState();
    const actor = state.activeUser;
    const record = state.operationalRecords.find((item) => item.id === recordId && item.moduleId === 'purchase-request');
    if (!record) throw new Error('درخواست خرید پیدا نشد.');
    if (record.createdByUserId !== actor.id || !actor.roleIds.includes('role-purchase-requester')) throw new Error('فقط درخواست‌کننده خرید می‌تواند درخواست پیگیری پرونده خودش را ثبت کند.');
    if (record.status !== 'sent_to_treasury' || !linkedTreasuryQueueRecords(state, record).length) throw new Error('پیگیری فقط برای درخواست باقی‌مانده در صف پرداخت خزانه مجاز است.');
    if (!canRequestTreasuryFollowUp(state, record)) throw new Error('درخواست پیگیری از روز بعد از ورود پرونده به صف پرداخت خزانه فعال می‌شود.');

    const now = new Date().toISOString();
    const dedupeKey = treasuryFollowUpDedupeKey(record.id);
    const existing = await this.storage.getAll<UserNotification>('notifications');
    if (existing.some((item) => item.dedupeKey === dedupeKey)) throw new Error('برای این درخواست امروز قبلاً پیگیری ثبت شده است.');

    const recipients = state.users.filter((user) => user.status === 'active' && user.roleIds.includes('role-treasury-executor-v1'));
    if (!recipients.length) throw new Error('هیچ مجری خزانه فعالی برای دریافت پیگیری وجود ندارد.');
    const queueRecords = linkedTreasuryQueueRecords(state, record);
    const history = this.makeHistory(state, record, actor, 'comment', {
      reason: 'درخواست پیگیری از خزانه ثبت شد.',
      snapshot: {dedupeKey, recipientUserIds: recipients.map((user) => user.id), queueRecordIds: queueRecords.map((item) => item.id)},
      occurredAt: now,
    });
    const correlationId = newId('correlation');

    await this.storage.transaction(['notifications', 'workflow_history', 'domain_events', 'idempotency_keys', 'meta'], 'readwrite', async (tx) => {
      if (await tx.get('idempotency_keys', dedupeKey)) throw new Error('برای این درخواست امروز قبلاً پیگیری ثبت شده است.');
      await tx.put('idempotency_keys', {id: dedupeKey, recordId: record.id, createdAt: now});
      for (const recipient of recipients) {
        const notification: UserNotification = {
          id: newId('notification'),
          userId: recipient.id,
          kind: 'treasury_follow_up',
          title: `پیگیری پرداخت ${record.trackingCode}`,
          message: `${actor.name} برای درخواست «${record.title}» پیگیری خزانه ثبت کرد.`,
          actorUserId: actor.id,
          relatedRecordId: record.id,
          relatedModuleId: 'treasury-execution',
          dedupeKey,
          createdAt: now,
        };
        await tx.put('notifications', notification);
      }
      await tx.put('workflow_history', history);
      await tx.put('domain_events', {
        id: newId('event'), aggregateType: 'purchase-request', aggregateId: record.id,
        eventType: 'TreasuryFollowUpRequested', actorId: actor.actorId, occurredAt: now, correlationId,
        payload: {effectiveUserId: actor.id, recipientUserIds: recipients.map((user) => user.id), queueRecordIds: queueRecords.map((item) => item.id)},
      } satisfies DomainEvent);
      await tx.put('meta', {id: 'lastPersistedAt', value: now});
    });
    await this.appendAudit({
      actor, effectiveUser: actor, category: 'system', action: 'procurement.purchase_request.treasury_follow_up_requested',
      summary: `برای درخواست «${record.title}» پیگیری خزانه ثبت و به مجریان فعال اطلاع داده شد.`, outcome: 'success',
      metadata: {recordId: record.id, recipientCount: recipients.length, dedupeKey},
    });
    return this.loadState();
  }

  async markNotificationRead(notificationId: string): Promise<FoundationState> {
    const state = await this.loadState();
    const notification = await this.storage.get<UserNotification>('notifications', notificationId);
    if (!notification || notification.userId !== state.activeUser.id) throw new Error('اعلان برای این حساب کاربری قابل دسترسی نیست.');
    if (!notification.readAt) await this.storage.put('notifications', {...notification, readAt: new Date().toISOString()});
    return this.loadState();
  }

  async markAllNotificationsRead(): Promise<FoundationState> {
    const state = await this.loadState();
    const all = await this.storage.getAll<UserNotification>('notifications');
    const unread = all.filter((item) => item.userId === state.activeUser.id && !item.readAt);
    if (!unread.length) return state;
    const now = new Date().toISOString();
    await this.storage.transaction(['notifications', 'meta'], 'readwrite', async (tx) => {
      for (const notification of unread) await tx.put('notifications', {...notification, readAt: now});
      await tx.put('meta', {id: 'lastPersistedAt', value: now});
    });
    return this.loadState();
  }

  async assignOperationalRecord(moduleId: string, recordId: string, assigneeUserId: string, reason: string): Promise<FoundationState> {
    if (moduleId === 'personnel-document') throw new Error('تخصیص مدرک پرسنلی از مسیر عمومی مجاز نیست.');
    if (moduleId === 'employee-advance') throw new Error('تخصیص مساعده فقط از مسیر اختصاصی و مرحله مصوب آن انجام می‌شود.');
    const module = ERP_MODULES.find((item) => item.id === moduleId); if (!module) throw new Error('ماژول عملیاتی پیدا نشد.');
    const state = await this.loadState(); const effectiveUser = state.activeUser; requirePermission(effectiveUser, permissionFor(moduleId, 'manage'), 'مجوز تخصیص این رکورد را ندارید.');
    const record = state.operationalRecords.find((item) => item.id === recordId); const target = state.users.find((item) => item.id === assigneeUserId && item.status === 'active'); if (!record || !target) throw new Error('رکورد یا کاربر مقصد معتبر نیست.'); if (reason.trim().length < 3) throw new Error('دلیل تخصیص را وارد کنید.');
    const updated = {...record, assigneeUserId: target.id, updatedByActorId: effectiveUser.actorId, version: record.version + 1, updatedAt: new Date().toISOString()}; const history = this.makeHistory(state, updated, effectiveUser, 'assigned', {reason, snapshot: {fromAssignee: record.assigneeUserId ?? null, toAssignee: target.id}});
    await this.persistOperationalChange(module.store, updated, history, effectiveUser, 'assigned', `«${record.title}» به ${target.name} تخصیص یافت.`, reason); return this.loadState();
  }

  async submitRegistration(input: RegistrationInput): Promise<FoundationState> {
    const state = await this.loadState();
    const username = input.requestedUsername.trim().toLowerCase();
    const mobile = normalizePhone(input.mobile);
    const secondaryMobile = normalizePhone(input.secondaryMobile);
    const nationalId = normalizeNationalId(input.nationalId);
    const cardNumber = normalizeCardNumber(input.cardNumber);
    if (input.fullName.trim().length < 3) throw new Error('نام و نام خانوادگی را کامل وارد کنید.');
    if (!/^09\d{9}$/.test(mobile)) throw new Error('شماره همراه اصلی معتبر نیست.');
    if (!/^09\d{9}$/.test(secondaryMobile)) throw new Error('شماره تماس دوم معتبر نیست.');
    if (mobile === secondaryMobile) throw new Error('شماره تماس دوم باید با همراه اصلی متفاوت باشد.');
    if (!nationalId || !isValidIranianNationalId(nationalId)) throw new Error('کد ملی الزامی است و باید معتبر باشد.');
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) throw new Error('نام کاربری باید ۳ تا ۳۲ نویسه انگلیسی معتبر داشته باشد.');
    const profileErrors = validateRequiredProfile({nationalId, gender: input.gender, secondaryMobile, province: input.province, city: input.city, address: input.address, postalCode: input.postalCode, bankName: input.bankName, cardNumber});
    if (profileErrors.length) throw new Error(profileErrors[0]);
    if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) throw new Error('ایمیل واردشده معتبر نیست.');

    if (state.users.some((user) => user.username.toLowerCase() === username) || state.registrationRequests.some((request) => request.requestedUsername.toLowerCase() === username)) throw new Error('این نام کاربری قبلاً ثبت شده یا در صف بررسی است.');
    if (state.personnel.some((person) => normalizeNationalId(person.nationalId) === nationalId) || state.registrationRequests.some((request) => normalizeNationalId(request.nationalId) === nationalId)) throw new Error('برای این کد ملی قبلاً پرونده یا درخواست ثبت‌نام وجود دارد.');
    const requestedPhones = new Set([mobile, secondaryMobile]);
    if (state.personnel.some((person) => [person.primaryMobile, person.secondaryMobile].some((value) => requestedPhones.has(normalizePhone(value)))) || state.registrationRequests.some((request) => [request.mobile, request.secondaryMobile].some((value) => requestedPhones.has(normalizePhone(value))))) throw new Error('برای یکی از شماره‌های همراه قبلاً پرونده یا درخواست ثبت‌نام وجود دارد.');

    const now = new Date().toISOString(); const actor = state.activeUser; const correlationId = newId('correlation');
    await this.storage.transaction(['users','personnel','registration_requests','audit_events','domain_events','meta'], 'readwrite', async (tx) => {
      const [currentUsers,currentPersonnel,currentRequests,audits] = await Promise.all([tx.getAll<LocalUser>('users'),tx.getAll<PersonnelRecord>('personnel'),tx.getAll<RegistrationRequest>('registration_requests'),tx.getAll<AuditEvent>('audit_events')]);
      if (currentUsers.some((user)=>user.username.toLowerCase()===username) || currentRequests.some((request)=>request.requestedUsername.toLowerCase()===username)) throw new Error('این نام کاربری هم‌زمان ثبت شده یا در صف بررسی است.');
      if (currentPersonnel.some((person)=>normalizeNationalId(person.nationalId)===nationalId) || currentRequests.some((request)=>normalizeNationalId(request.nationalId)===nationalId)) throw new Error('برای این کد ملی هم‌زمان پرونده یا درخواست ثبت‌نام ایجاد شده است.');
      if (currentPersonnel.some((person)=>[person.primaryMobile,person.secondaryMobile].some((value)=>requestedPhones.has(normalizePhone(value)))) || currentRequests.some((request)=>[request.mobile,request.secondaryMobile].some((value)=>requestedPhones.has(normalizePhone(value))))) throw new Error('برای یکی از شماره‌های همراه هم‌زمان پرونده یا درخواست ثبت‌نام ایجاد شده است.');
      const record: RegistrationRequest = {id:newId('registration'),trackingCode:`REG-${String(currentRequests.length+1).padStart(5,'0')}`,fullName:input.fullName.trim(),mobile,secondaryMobile,email:input.email?.trim().toLowerCase(),nationalId,gender:input.gender,province:input.province.trim(),city:input.city.trim(),address:input.address.trim(),postalCode:normalizeDigits(input.postalCode).replace(/\D/g,''),bankName:input.bankName.trim(),cardNumber,requestedUsername:username,selfDeclaration:input.selfDeclaration??{},status:'submitted',version:1,createdAt:now,updatedAt:now};
      await tx.put('registration_requests',record);
      await tx.put('audit_events',{id:newId('audit'),sequence:nextSequence(audits),companyId:actor.companyId,category:'authorization',action:'organization.registration.submitted',actorId:actor.actorId,actorName:actor.name,effectiveUserId:actor.id,occurredAt:now,summary:`درخواست ثبت‌نام «${record.fullName}» دریافت شد.`,outcome:'success',correlationId,metadata:{registrationId:record.id,submittedAt:now}} satisfies AuditEvent);
      await tx.put('domain_events',{id:newId('event'),aggregateType:'registration',aggregateId:record.id,eventType:'RegistrationSubmitted',actorId:actor.actorId,occurredAt:now,correlationId,payload:{trackingCode:record.trackingCode}} satisfies DomainEvent);
      await tx.put('meta',{id:'lastPersistedAt',value:now});
    });
    return this.loadState();
  }

  async reviewRegistration(registrationId: string, expectedVersion: number, decision: 'in_review'|'needs_correction'|'rejected'|'approved', reason: string, roleIds: string[] = [], _initialPassword = ''): Promise<FoundationState> {
    const state = await this.loadState(); const effectiveUser = state.activeUser; requirePermission(effectiveUser, 'organization.registrations.review', 'مجوز بررسی ثبت‌نام را ندارید.'); const request = state.registrationRequests.find((item) => item.id === registrationId); if (!request) throw new Error('درخواست ثبت‌نام پیدا نشد.');
    if (state.session.actingAdminUserId) throw new Error('در حالت مشاهده آزمایشی، بررسی ثبت‌نام مجاز نیست.');
    if (request.status === 'activated') throw new Error('این درخواست قبلاً فعال شده است.');
    if (['needs_correction','rejected'].includes(decision) && reason.trim().length < 3) throw new Error('دلیل تصمیم الزامی است.'); const now = new Date().toISOString(); let updated: RegistrationRequest = {...request, status: decision, reviewReason: reason.trim() || undefined, version: request.version + 1, updatedAt: now};
    if (decision === 'approved') {
      if (!roleIds.length) throw new Error('حداقل یک نقش ورودی مجاز پیشنهاد کنید.');
      if (roleIds.some((roleId) => !REGISTRATION_ASSIGNABLE_ROLE_IDS.has(roleId))) throw new Error('یکی از نقش‌ها برای ثبت‌نام اولیه مجاز نیست و باید بعداً از فرایند مدیریت دسترسی داده شود.');
      if (roleIds.some((roleId) => !state.roles.some((role) => role.id === roleId && role.status === 'active'))) throw new Error('یکی از نقش‌های پیشنهادی معتبر یا فعال نیست.');
      updated = {...updated, proposedRoleIds: [...new Set(roleIds)], proposedByUserId: effectiveUser.id, proposedAt: now};
    } else if (decision === 'needs_correction' || decision === 'rejected') {
      updated = {...updated, proposedRoleIds: undefined, proposedByUserId: undefined, proposedAt: undefined};
    }
    const correlationId = newId('correlation');
    await this.storage.transaction(['registration_requests','registration_reviews','security_roles','audit_events','domain_events','meta'], 'readwrite', async (tx) => {
      const current = await tx.get<RegistrationRequest>('registration_requests', registrationId);
      if (!current || current.version !== expectedVersion || request.version !== expectedVersion || current.status === 'activated') throw new Error('درخواست در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');
      if (decision === 'approved') {const currentRoles=await tx.getAll<SecurityRole>('security_roles');if(roleIds.some((roleId)=>!REGISTRATION_ASSIGNABLE_ROLE_IDS.has(roleId)||!currentRoles.some((role)=>role.id===roleId&&role.status==='active')))throw new Error('نقش پیشنهادی هم‌زمان تغییر کرده یا غیرفعال شده است؛ تازه‌سازی کنید.');}
      const audits = await tx.getAll<AuditEvent>('audit_events');
      await tx.put('registration_requests', updated);
      await tx.put('registration_reviews', {id:newId('registration-review'),registrationId,decision,reason:reason.trim(),reviewerUserId:effectiveUser.id,occurredAt:now});
      await tx.put('audit_events', {id:newId('audit'),sequence:nextSequence(audits),companyId:effectiveUser.companyId,category:'authorization',action:`organization.registration.${updated.status}`,actorId:effectiveUser.actorId,actorName:effectiveUser.name,effectiveUserId:effectiveUser.id,occurredAt:now,summary:`درخواست ثبت‌نام «${request.fullName}» به وضعیت ${updated.status} رفت.`,reason:reason.trim()||undefined,outcome:'success',correlationId,metadata:{registrationId,registeredAt:request.createdAt,reviewedAt:now,assignedRoleIds:decision==='approved'?roleIds.join(','):''}} satisfies AuditEvent);
      await tx.put('domain_events', {id:newId('event'),aggregateType:'registration',aggregateId:registrationId,eventType:'RegistrationReviewed',actorId:effectiveUser.actorId,occurredAt:now,correlationId,payload:{decision,roleIds:decision==='approved'?roleIds:[]}} satisfies DomainEvent);
      await tx.put('meta',{id:'lastPersistedAt',value:now});
    });
    return this.loadState();
  }

  async activateRegistration(registrationId: string, expectedVersion: number, initialPassword: string): Promise<FoundationState> {
    const state = await this.loadState(); const actor = state.activeUser;
    requirePermission(actor, 'organization.registrations.activate', 'مجوز فعال‌سازی نهایی حساب ثبت‌نام را ندارید.');
    if (state.session.actingAdminUserId) throw new Error('فعال‌سازی حساب در حالت مشاهده آزمایشی مجاز نیست.');
    if (initialPassword.length < 8) throw new Error('رمز عبور اولیه باید حداقل ۸ نویسه باشد.');
    const request = state.registrationRequests.find((item) => item.id === registrationId); if (!request) throw new Error('درخواست ثبت‌نام پیدا نشد.');
    if (request.status !== 'approved' || !request.proposedRoleIds?.length) throw new Error('این درخواست هنوز پیشنهاد نقش تأییدشده برای فعال‌سازی ندارد.');
    if (request.proposedByUserId === actor.id) throw new Error('پیشنهاددهنده نقش نمی‌تواند همان درخواست را فعال کند؛ تفکیک بررسی و فعال‌سازی الزامی است.');
    const roleIds = [...new Set(request.proposedRoleIds)];
    if (roleIds.some((roleId) => !REGISTRATION_ASSIGNABLE_ROLE_IDS.has(roleId) || !state.roles.some((role) => role.id === roleId && role.status === 'active'))) throw new Error('پیشنهاد نقش منقضی یا نامعتبر شده است؛ منابع انسانی باید دوباره بررسی کند.');
    if (state.users.some((user) => user.username.toLowerCase() === request.requestedUsername.toLowerCase()) || state.registrationRequests.some((item) => item.id !== request.id && item.requestedUsername.toLowerCase() === request.requestedUsername.toLowerCase())) throw new Error('نام کاربری این درخواست در فاصله بررسی استفاده شده است؛ فعال‌سازی متوقف شد.');
    if (state.personnel.some((person) => normalizeNationalId(person.nationalId) === normalizeNationalId(request.nationalId)) || state.registrationRequests.some((item) => item.id !== request.id && normalizeNationalId(item.nationalId) === normalizeNationalId(request.nationalId))) throw new Error('کد ملی این درخواست قبلاً به پرونده یا درخواست دیگری متصل شده است؛ فعال‌سازی متوقف شد.');
    const requestPhones = new Set([normalizePhone(request.mobile), normalizePhone(request.secondaryMobile)]);
    if (state.personnel.some((person) => [person.primaryMobile, person.secondaryMobile].some((value) => requestPhones.has(normalizePhone(value)))) || state.registrationRequests.some((item) => item.id !== request.id && [item.mobile, item.secondaryMobile].some((value) => requestPhones.has(normalizePhone(value))))) throw new Error('یکی از شماره‌های همراه این درخواست قبلاً استفاده شده است؛ فعال‌سازی متوقف شد.');
    const profileErrors = validateRequiredProfile(request); if (profileErrors.length) throw new Error(`درخواست ناقص است: ${profileErrors[0]}`);
    const now = new Date().toISOString(); const primary = state.roles.find((role) => role.id === roleIds[0])!;
    const [firstName, ...lastParts] = request.fullName.split(/\s+/); const personnelId = newId('personnel'); const userId = newId('user');
    const personnel: PersonnelRecord = {id: personnelId, companyId: COMPANY_ID, personnelCode: nextPersonnelCode(state.personnel), firstName, lastName: lastParts.join(' ') || 'ثبت‌نام', nationalId: request.nationalId, gender: request.gender, maritalStatus: 'unspecified', primaryMobile: request.mobile, secondaryMobile: request.secondaryMobile, personalEmail: request.email, province: request.province, city: request.city, address: request.address, postalCode: request.postalCode, bankName: request.bankName, cardNumber: request.cardNumber, employmentStatus: 'active', employmentType: 'در انتظار تعیین نوع همکاری', startDate: now.slice(0,10), unitId: 'unit-management', positionId: 'position-specialist', linkedUserId: userId, createdAt: now, updatedAt: now};
    const user = resolveUserAccess({id: userId, actorId: newId('actor'), name: request.fullName, username: request.requestedUsername, passwordHash: await hashPassword(initialPassword), passwordUpdatedAt: now, roleId: primary.id, roleIds, roles: [], roleTitle: primary.name, status: 'active', isAdmin: false, description: primary.description, companyId: COMPANY_ID, unitId: personnel.unitId, positionId: personnel.positionId, personnelId, scope: primary.scope, permissions: [], accent: avatarColor(state.users.length), initials: makeInitials(request.fullName)}, state.roles);
    const updated: RegistrationRequest = {...request, status: 'activated', linkedPersonnelId: personnelId, linkedUserId: userId, activatedByUserId: actor.id, activatedAt: now, version: request.version + 1, updatedAt: now};
    const correlationId = newId('correlation');
    await this.storage.transaction(['personnel','users','security_roles','registration_requests','registration_reviews','audit_events','domain_events','meta'], 'readwrite', async (tx) => {
      const current = await tx.get<RegistrationRequest>('registration_requests', registrationId);
      if (!current || current.version !== expectedVersion || request.version !== expectedVersion || current.status !== 'approved') throw new Error('درخواست در تب دیگری تغییر کرده است؛ تازه‌سازی کنید.');
      const [currentUsers,currentPersonnel,currentRequests,currentRoles] = await Promise.all([tx.getAll<LocalUser>('users'),tx.getAll<PersonnelRecord>('personnel'),tx.getAll<RegistrationRequest>('registration_requests'),tx.getAll<SecurityRole>('security_roles')]);
      if(roleIds.some((roleId)=>!REGISTRATION_ASSIGNABLE_ROLE_IDS.has(roleId)||!currentRoles.some((role)=>role.id===roleId&&role.status==='active')))throw new Error('نقش پیشنهادی هم‌زمان تغییر کرده یا غیرفعال شده است؛ فعال‌سازی متوقف شد.');
      if (currentUsers.some((item)=>item.username.toLowerCase()===request.requestedUsername.toLowerCase()) || currentRequests.some((item)=>item.id!==request.id&&item.requestedUsername.toLowerCase()===request.requestedUsername.toLowerCase())) throw new Error('نام کاربری این درخواست هم‌زمان استفاده شده است؛ فعال‌سازی متوقف شد.');
      if (currentPersonnel.some((item)=>normalizeNationalId(item.nationalId)===normalizeNationalId(request.nationalId)) || currentRequests.some((item)=>item.id!==request.id&&normalizeNationalId(item.nationalId)===normalizeNationalId(request.nationalId))) throw new Error('کد ملی این درخواست هم‌زمان استفاده شده است؛ فعال‌سازی متوقف شد.');
      if (currentPersonnel.some((item)=>[item.primaryMobile,item.secondaryMobile].some((value)=>requestPhones.has(normalizePhone(value)))) || currentRequests.some((item)=>item.id!==request.id&&[item.mobile,item.secondaryMobile].some((value)=>requestPhones.has(normalizePhone(value))))) throw new Error('شماره همراه این درخواست هم‌زمان استفاده شده است؛ فعال‌سازی متوقف شد.');
      const committedPersonnel: PersonnelRecord = {...personnel, personnelCode: nextPersonnelCode(currentPersonnel)};
      if (currentPersonnel.some((item) => item.personnelCode === committedPersonnel.personnelCode)) throw new Error('کد پرسنلی هم‌زمان رزرو شده است؛ فعال‌سازی را دوباره انجام دهید.');
      const committedUser = resolveUserAccess({...user, unitId: committedPersonnel.unitId, positionId: committedPersonnel.positionId}, currentRoles);
      const audits = await tx.getAll<AuditEvent>('audit_events');
      await tx.put('personnel', committedPersonnel); await tx.put('users', committedUser); await tx.put('registration_requests', updated);
      await tx.put('registration_reviews', {id: newId('registration-review'), registrationId, decision: 'activated', reason: 'فعال‌سازی نهایی مدیر سامانه', reviewerUserId: actor.id, occurredAt: now});
      await tx.put('audit_events', {id: newId('audit'), sequence: nextSequence(audits), companyId: actor.companyId, category: 'authorization', action: 'organization.registration.activated', actorId: actor.actorId, actorName: actor.name, effectiveUserId: user.id, occurredAt: now, summary: `حساب «${request.fullName}» پس از تأیید منابع انسانی فعال شد.`, outcome: 'success', correlationId, metadata: {registrationId, personnelId, userId, proposedByUserId: request.proposedByUserId ?? '', assignedRoleIds: roleIds.join(',')}} satisfies AuditEvent);
      await tx.put('domain_events', {id: newId('event'), aggregateType: 'registration', aggregateId: registrationId, eventType: 'RegistrationActivated', actorId: actor.actorId, occurredAt: now, correlationId, payload: {personnelId, userId, roleIds}} satisfies DomainEvent);
      await tx.put('meta', {id: 'lastPersistedAt', value: now});
    });
    return this.loadState();
  }

  async generateLargeQaDataset(perRole = 10): Promise<FoundationState> {
    const state = await this.loadState(); const effectiveUser = state.activeUser; requirePermission(effectiveUser, 'foundation.qa.manage', 'مجوز ساخت داده آزمون حجیم را ندارید.'); if (state.qaDataset.status === 'generated') return state;
    const passwordHash = await hashPassword('Tapra2@QA'); const now = new Date().toISOString(); const qaUsers: LocalUser[] = []; const qaPersonnel: PersonnelRecord[] = [];
    for (const [roleIndex, role] of state.roles.filter((item) => item.status === 'active' && item.id !== 'role-admin').entries()) for (let index = 1; index <= perRole; index += 1) {const suffix = `${String(roleIndex + 1).padStart(2,'0')}${String(index).padStart(2,'0')}`; const personnelId = `qa-personnel-${role.id}-${index}`; const userId = `qa-user-${role.id}-${index}`; const unitId = role.scope === 'UNIT' ? 'unit-warehouse' : role.scope === 'TEAM' ? 'unit-sales' : 'unit-management'; qaPersonnel.push({id: personnelId, personnelCode: `QA-${suffix}`, firstName: 'کاربر', lastName: `${role.name} ${index}`, gender: 'unspecified', maritalStatus: 'unspecified', primaryMobile: `0999${suffix.padStart(7,'0').slice(-7)}`, employmentStatus: 'active', employmentType: 'QA محلی', startDate: now.slice(0,10), unitId, positionId: 'position-specialist', linkedUserId: userId, qaGenerated: true, createdAt: now, updatedAt: now}); qaUsers.push(resolveUserAccess({id: userId, actorId: `qa-actor-${role.id}-${index}`, name: `کاربر ${role.name} ${index}`, username: `qa.${roleIndex + 1}.${index}`, passwordHash, passwordUpdatedAt: now, roleId: role.id, roleIds: [role.id], roles: [], roleTitle: role.name, status: 'active', isAdmin: false, description: 'کاربر قطعی داده آزمون حجیم', companyId: COMPANY_ID, unitId, positionId: 'position-specialist', personnelId, scope: role.scope, permissions: [], accent: avatarColor(roleIndex), initials: `ک.${index}`, qaGenerated: true}, state.roles));}
    const completedQaPersonnel = completeRequiredQaPersonnelRecords(qaPersonnel, state.personnel.map((item) => item.nationalId ?? ''), state.personnel.flatMap((item) => [item.primaryMobile, item.secondaryMobile ?? '']));
    const manifest: QaDatasetManifest = {id: 'large-qa', status: 'generated', roleCount: state.roles.length - 1, userCount: qaUsers.length, generatedAt: now, seed: 'tapra2-large-qa-v1'};
    await this.storage.transaction(['users','personnel','qa_dataset_manifests'], 'readwrite', async (tx) => {for (const item of completedQaPersonnel) await tx.put('personnel', item); for (const item of qaUsers) await tx.put('users', item); await tx.put('qa_dataset_manifests', manifest);}); await this.appendAudit({actor: effectiveUser, effectiveUser, category: 'data', action: 'foundation.qa.large_dataset.generated', summary: `${qaUsers.length.toLocaleString('en-US')} کاربر آزمون قطعی ساخته شد.`, outcome: 'success', metadata: {userCount: qaUsers.length, roleCount: manifest.roleCount}}); return this.loadState();
  }

  async resetLargeQaDataset(): Promise<FoundationState> {
    const state = await this.loadState(); const effectiveUser = state.activeUser; requirePermission(effectiveUser, 'foundation.qa.manage', 'مجوز بازنشانی داده آزمون را ندارید.'); if (effectiveUser.qaGenerated) throw new Error('بازنشانی از داخل حساب QA مجاز نیست.'); const users = state.users.filter((item) => !item.qaGenerated); const personnel = state.personnel.filter((item) => !item.qaGenerated); const manifest: QaDatasetManifest = {id: 'large-qa', status: 'empty', roleCount: 0, userCount: 0, seed: 'tapra2-large-qa-v1'};
    await this.storage.transaction(['users','personnel','qa_dataset_manifests'], 'readwrite', async (tx) => {await tx.clear('users'); await tx.clear('personnel'); for (const item of users) await tx.put('users', item); for (const item of personnel) await tx.put('personnel', item); await tx.clear('qa_dataset_manifests'); await tx.put('qa_dataset_manifests', manifest);}); await this.appendAudit({actor: effectiveUser, effectiveUser, category: 'data', action: 'foundation.qa.large_dataset.reset', summary: 'فقط داده آزمون حجیم حذف شد و داده نمایشی عادی باقی ماند.', outcome: 'success'}); return this.loadState();
  }

  async rebuildProjections(): Promise<FoundationState> {
    const state = await this.loadState(); const effectiveUser = state.activeUser; requirePermission(effectiveUser, 'foundation.data.manage', 'مجوز بازسازی Projectionها را ندارید.'); const now = new Date().toISOString(); const byModule = Object.fromEntries(ERP_MODULES.map((module) => [module.id, state.operationalRecords.filter((record) => record.moduleId === module.id).length])); const projection: ProjectionRecord = {id: 'projection-module-counts', kind: 'module-counts', rebuiltAt: now, version: (state.projections.find((item) => item.id === 'projection-module-counts')?.version ?? 0) + 1, data: {recordCount: state.operationalRecords.length, ...byModule}}; await this.storage.put('projections', projection); await this.appendAudit({actor: effectiveUser, effectiveUser, category: 'data', action: 'foundation.projections.rebuilt', summary: 'Projectionهای گزارش و صف از داده مرجع بازسازی شدند.', outcome: 'success', metadata: {recordCount: state.operationalRecords.length}}); return this.loadState();
  }

  async runQaScenarios(): Promise<FoundationState> {
    const state = await this.loadState(); const effectiveUser = state.activeUser; requirePermission(effectiveUser, 'foundation.qa.manage', 'مجوز اجرای سناریوهای QA را ندارید.'); const now = new Date().toISOString(); const checks = [
      {id:'module-registry', passed: ERP_MODULES.length >= 65},
      {id:'workflow-completeness', passed: state.workflows.length === ERP_MODULES.length && state.workflows.every((item)=>item.transitions.length>0)},
      {id:'maker-checker', passed: state.workflows.some((item)=>item.transitions.some((transition)=>transition.makerChecker))},
      {id:'operational-seed', passed: ERP_MODULES.every((module)=>state.operationalRecords.some((record)=>record.moduleId===module.id))},
      {id:'role-library', passed: state.roles.length >= 50},
      {id:'audit-persistence', passed: state.audits.length > 0},
      {id:'recruitment-five-deterministic-cases', passed: ['recruitment-case-001','recruitment-case-002','recruitment-case-003','recruitment-case-004','recruitment-case-005'].every((id)=>state.operationalRecords.some((item)=>item.moduleId==='recruitment-case'&&item.id===id))},
      {id:'recruitment-request-role', passed: state.roles.some((role)=>role.id==='role-workforce-requester'&&role.permissions.includes('hr.recruitment_case.create'))},
      {id:'recruitment-hr-role', passed: state.roles.some((role)=>role.id==='role-recruitment-manager'&&role.permissions.includes('hr.recruitment_case.approve'))},
      {id:'recruitment-interviewer-isolation', passed: state.users.some((user)=>user.id==='persona-callcenter-a'&&user.roleIds.includes('role-recruitment-interviewer'))},
      {id:'recruitment-single-dossier', passed: state.operationalRecords.filter((item)=>item.moduleId==='recruitment-case').every((item)=>Boolean(item.payload.currentWaitingFor)&&Boolean(item.workflowVersion))},
    ]; const failed = checks.filter((item)=>!item.passed).length; const run = {id:newId('qa-run'), executedAt:now, executedByUserId:effectiveUser.id, status:failed?'failed':'passed', passed:checks.length-failed, failed, checks}; await this.storage.put('qa_scenario_runs', run); await this.appendAudit({actor:effectiveUser,effectiveUser,category:'data',action:'foundation.qa.scenarios.executed',summary:`${checks.length.toLocaleString('en-US')} سناریوی یکپارچگی اجرا شد؛ ${failed?`${failed.toLocaleString('en-US')} مورد ناموفق`:'همه موفق'}.`,outcome:failed?'denied':'success',metadata:{passed:checks.length-failed,failed}}); return this.loadState();
  }

  async updateWorkflowPolicy(moduleId: string, expectedVersion: number, input: Pick<WorkflowDefinition,'queueStrategy'|'assignmentPolicy'> & {approvalPolicyId?: string; allowSelfSubmission?: boolean; approvalStages: WorkflowApprovalStageDefinition[]; routeVariants?: WorkflowRouteVariantDefinition[]; changeSummary: string}): Promise<FoundationState> {
    const state = await this.loadState();
    const effectiveUser = state.activeUser;
    requirePermission(effectiveUser, 'foundation.workflow.manage', 'مجوز مدیریت گردش‌کار را ندارید.');
    const existing = state.workflows.find((item) => item.moduleId === moduleId);
    if (!existing) throw new Error('گردش‌کار پیدا نشد.');
    if (moduleId !== 'employee-advance') throw new Error('ویرایش این گردش‌کار تا اتصال کامل موتور اجرایی غیرفعال است؛ فقط سیاست مساعده اکنون قابل انتشار است.');
    if (existing.version !== expectedVersion) throw new Error('نسخه گردش‌کار تغییر کرده است؛ صفحه را تازه‌سازی کنید.');
    if (input.assignmentPolicy.trim().length < 5) throw new Error('قانون تعیین مسئول پرونده را شفاف وارد کنید.');
    if (input.changeSummary.trim().length < 5) throw new Error('دلیل انتشار نسخه جدید را شفاف وارد کنید.');
    const validationErrors = validateWorkflowPolicy(existing, input.approvalStages, state.roles, input.routeVariants ?? [], state.users);
    if (validationErrors.length) throw new Error(validationErrors.join('\n'));
    const now = new Date().toISOString();
    const approvalStages = input.approvalStages.map((stage) => ({...stage, required:true, title:stage.title.trim(), roleIds:[...stage.roleIds], decisions:[...stage.decisions], assigneeUserId:stage.assignmentMode === 'specific_user' ? stage.assigneeUserId : undefined, description:stage.description?.trim() || undefined}));
    const routeVariants = (input.routeVariants ?? []).map((variant) => ({...variant, allowSelfSubmission:variant.allowSelfSubmission ?? true, title:variant.title.trim(), description:variant.description?.trim() || undefined, branchUnitIds:[...new Set(variant.branchUnitIds)], approvalStages:variant.approvalStages.map((stage) => ({...stage, required:true, title:stage.title.trim(), roleIds:[...stage.roleIds], decisions:[...stage.decisions], assigneeUserId:stage.assignmentMode === 'specific_user' ? stage.assigneeUserId : undefined, description:stage.description?.trim() || undefined}))}));
    const updated: WorkflowDefinition = {...existing, queueStrategy: existing.queueStrategy, assignmentPolicy: input.assignmentPolicy.trim(), approvalPolicyId: input.approvalPolicyId?.trim() || undefined, allowSelfSubmission:input.allowSelfSubmission ?? existing.allowSelfSubmission ?? true, approvalStages, routeVariants, changeSummary: input.changeSummary.trim(), version: existing.version + 1, updatedAt: now};
    await this.storage.transaction(['workflow_definitions','workflow_versions'], 'readwrite', async (tx) => {
      await tx.put('workflow_versions', {...existing, id: `${existing.id}-v${existing.version}`, workflowId: existing.id});
      await tx.put('workflow_definitions', updated);
    });
    await this.appendAudit({actor: effectiveUser, effectiveUser, category: 'system', action: 'foundation.workflow.policy_updated', summary: `مسیر تأیید و سیاست «${existing.title}» نسخه جدید گرفت.`, reason: input.changeSummary.trim(), outcome: 'success', metadata: {moduleId, beforeVersion: existing.version, afterVersion: updated.version, stageCount: approvalStages.length, routeVariantCount: routeVariants.length, beforeStages: JSON.stringify(existing.approvalStages ?? []), afterStages: JSON.stringify(approvalStages), beforeRouteVariants: JSON.stringify(existing.routeVariants ?? []), afterRouteVariants: JSON.stringify(routeVariants)}});
    return this.loadState();
  }

  async inspectAuthorization(request: AuthorizationRequest): Promise<{decision: AuthorizationDecision; state: FoundationState}> { const decision = authorize(request); await this.appendAudit({actor: request.persona, effectiveUser: request.persona, category: 'authorization', action: request.permission, summary: decision.allowed ? 'آزمایش دسترسی با موفقیت عبور کرد.' : 'آزمایش دسترسی طبق سیاست رد شد.', reason: decision.reasonFa, outcome: decision.allowed ? 'success' : 'denied', metadata: {decisionCode: decision.code, requestedAction: request.action ?? 'view'}}); return {decision, state: await this.loadState()}; }
  async exportSnapshot(password?: string): Promise<SnapshotManifest | EncryptedSnapshot> {
    const state = await this.loadState();
    if (state.session.actingAdminUserId) throw new Error('دریافت پشتیبان در حالت مشاهده دسترسی مجاز نیست.');
    requirePermission(state.activeUser, 'foundation.data.export', 'مجوز دریافت پشتیبان داده را ندارید.');
    const sensitiveFiles = await this.storage.getAll<PersonnelDocumentFile>('personnel_document_files');
    if (sensitiveFiles.length) {
      if (!password) throw new Error('به دلیل وجود مدارک هویتی، فقط پشتیبان رمزگذاری‌شده مجاز است.');
      const contentPermission = state.activeUser.permissions.includes(PERSONNEL_DOCUMENT_PERMISSION_READ)
        ? PERSONNEL_DOCUMENT_PERMISSION_READ
        : state.activeUser.permissions.includes(PERSONNEL_DOCUMENT_PERMISSION_MANAGE) ? PERSONNEL_DOCUMENT_PERMISSION_MANAGE : undefined;
      if (!contentPermission) throw new Error('برای پشتیبان‌گیری از مدارک هویتی، مجوز صریح مشاهده محتوای مدارک لازم است.');
      for (const personnelId of new Set(sensitiveFiles.map((file) => file.personnelId))) {
        const personnel = state.personnel.find((item) => item.id === personnelId);
        if (!personnel) throw new Error('پشتیبان‌گیری به دلیل وجود فایل بدون پرونده معتبر متوقف شد.');
        this.assertPersonnelDocumentAccess(state, personnel, contentPermission);
      }
    }
    await this.appendAudit({actor: state.activeUser, effectiveUser: state.activeUser, category: 'data', action: password ? 'foundation.backup.encrypted' : 'foundation.backup.export', summary: password ? 'پشتیبان رمزگذاری‌شده ایجاد شد.' : 'پشتیبان محلی ایجاد شد.', outcome: 'success'});
    const snapshot = await this.storage.exportSnapshot();
    return password ? encryptSnapshot(snapshot, password) : snapshot;
  }
  async importSnapshot(input: unknown, password?: string): Promise<FoundationState> { const before = await this.loadState(); let snapshot: SnapshotManifest; if (isEncryptedSnapshot(input)) {if (!password) throw new Error('این پشتیبان رمزگذاری شده است؛ رمز را وارد کنید.'); snapshot = await decryptSnapshot(input, password);} else {validateSnapshotShape(input); snapshot = input;} await this.storage.importSnapshot(snapshot); const restored = await this.loadState(); await this.appendAudit({actor: before.activeUser, effectiveUser: restored.activeUser, category: 'data', action: 'foundation.backup.restored', summary: 'داده محلی از فایل پشتیبان بازیابی شد.', outcome: 'success', metadata: {restoredSeedVersion: snapshot.seedVersion, restoredUserId: restored.activeUser.id}}); return this.loadState(); }
  async reset(): Promise<FoundationState> { const before = await this.loadState(); await this.storage.replaceAll(createSeedData()); const seededAdmin = (await this.storage.getAll<LocalUser>('users'))[0]; await this.appendAudit({actor: before.activeUser, effectiveUser: seededAdmin, category: 'data', action: 'foundation.local.reset', summary: 'داده‌های محلی به سناریوی قطعی ERP V1 بازنشانی شد.', reason: 'بازنشانی دستی پذیرش محصول', outcome: 'success', metadata: {seedVersion: FOUNDATION_SEED_VERSION}}); return this.loadState(); }

  async recordPersonnelExport(personnelCount: number, movementCount: number, includesBanking: boolean): Promise<FoundationState> {
    const state = await this.loadState();
    const actor = state.activeUser;
    requirePermission(actor, 'foundation.data.export', 'مجوز دریافت خروجی داده را ندارید.');
    requirePermission(actor, 'organization.personnel.view', 'مجوز مشاهده اطلاعات پرسنل را ندارید.');
    if (includesBanking) requirePermission(actor, 'organization.personnel.banking.view', 'مجوز مشاهده اطلاعات بانکی پرسنل را ندارید.');
    await this.appendAudit({actor, effectiveUser: actor, category: 'data', action: 'organization.personnel.exported', summary: `خروجی جامع ${personnelCount.toLocaleString('en-US')} پرونده پرسنلی دریافت شد.`, outcome: 'success', metadata: {personnelCount, movementCount, includesBanking}});
    return this.loadState();
  }

  private assertRecordScope(user: LocalUser, record: OperationalRecord, action: 'edit'|'approve'|'transition') {
    // A SELF-scoped worker owns a record while it is explicitly assigned to
    // that worker. The immutable creator remains separate, so maker/checker
    // and self-approval checks are never bypassed by an assignment.
    const decision = authorize({persona: user, permission: permissionFor(record.moduleId, action === 'approve' ? 'approve' : action === 'edit' ? 'edit' : 'transition'), action, resource: operationalRecordResource(user, record)});
    if (!decision.allowed) throw new Error(decision.reasonFa);
  }
  private validateBusinessTransition(state:FoundationState, record:OperationalRecord, targetState:string, user:LocalUser, reason:string) {
    if(record.moduleId==='onboarding'&&targetState==='completed'){
      const missing=[['accountReady','ساخت و تحویل حساب کاربری'],['documentsReady','تکمیل مدارک پرسنلی'],['contractReady','ثبت قرارداد'],['assetsReady','تحویل تجهیزات و دارایی'],['orientationReady','معرفی واحد و آموزش اولیه']].filter(([key])=>record.payload[key]!==true).map(([,label])=>label);
      if(missing.length)throw new Error(`شروع همکاری تا تکمیل این موارد قابل بستن نیست: ${missing.join('، ')}`);
    }
    if(record.moduleId==='invoice'&&targetState==='financially_cleared'){const approved=state.operationalRecords.filter((item)=>item.moduleId==='payment'&&item.relatedRecordId===record.id&&item.status==='approved').reduce((sum,item)=>sum+BigInt(item.amountRial??'0'),0n);const invoice=BigInt(record.amountRial??'0');if(approved!==invoice)throw new Error(approved>invoice?'مجموع پرداخت تأییدشده از مبلغ فاکتور بیشتر است. ابتدا اصلاح پرداخت را انجام دهید.':'تأیید مالی فقط وقتی مجاز است که مجموع پرداخت‌های تأییدشده دقیقاً برابر مبلغ فاکتور باشد.');}
    if(record.moduleId==='reservation'&&targetState==='allocated'){const invoice=state.operationalRecords.find((item)=>item.id===record.relatedRecordId&&item.moduleId==='invoice');if(!invoice||invoice.status!=='financially_cleared')throw new Error('رزرو موجودی فقط برای ردیف فاکتور دارای تأیید مالی مجاز است.');}
    if(record.moduleId==='support-case'&&targetState==='closed'){const financialRows=state.operationalRecords.filter((item)=>item.moduleId==='support-transaction'&&item.relatedRecordId===record.id);if(financialRows.some((item)=>!['paid','rejected'].includes(item.status)))throw new Error('تا تعیین تکلیف همه ردیف‌های مالی، بستن پرونده پشتیبانی مجاز نیست.');}
    if(record.moduleId==='service-case'&&targetState==='completed'&&record.payload.confirmationRequired===true&&record.status!=='confirmed')throw new Error('Policy این خدمت تأیید مشتری را الزامی کرده است. ابتدا تأیید را ثبت کنید.');
    if(record.moduleId==='receipt'&&targetState==='posted'&&record.payload.manualReceiving===true&&(!record.payload.evidenceReference||reason.trim().length<3))throw new Error('رسید دستی برای ثبت نهایی به دلیل و مرجع مدرک نیاز دارد.');
    if(record.moduleId==='shipment'&&record.payload.splitShipment===true){if(!can(user,permissionFor('shipment','manage')))throw new Error('ارسال تفکیکی به مجوز مستقل مدیریت Shipment نیاز دارد.');if(reason.trim().length<3)throw new Error('دلیل ارسال تفکیکی الزامی است.');}
  }
  private makeHistory(state: FoundationState, record: OperationalRecord, actor: LocalUser, eventType: OperationalRecordHistory['eventType'], rest: Partial<OperationalRecordHistory>): OperationalRecordHistory {return {id: newId('history'), recordId: record.id, moduleId: record.moduleId, sequence: state.operationalHistory.filter((item) => item.recordId === record.id).length + 1, eventType, actorId: actor.actorId, actorName: actor.name, effectiveUserId: actor.id, snapshot: {}, occurredAt: new Date().toISOString(), ...rest};}
  private async persistOperationalChange(store: FoundationStoreName, record: OperationalRecord, history: OperationalRecordHistory, effectiveUser: LocalUser, action: string, summary: string, reason = '', idempotencyKey?: string) {const now = new Date().toISOString(); const auditActor = await this.resolveAuditActor(effectiveUser); const correlationId = newId('correlation'); await this.storage.transaction([store,'workflow_history','audit_events','domain_events','meta','idempotency_keys'], 'readwrite', async (tx) => {if (idempotencyKey && await tx.get('idempotency_keys', idempotencyKey)) return; const audits = await tx.getAll<AuditEvent>('audit_events'); await tx.put(store, record); await tx.put('workflow_history', history); if (idempotencyKey) await tx.put('idempotency_keys', {id: idempotencyKey, recordId: record.id, createdAt: now}); await tx.put('audit_events', {id: newId('audit'), sequence: nextSequence(audits), companyId: record.companyId, category: 'system', action: `${record.domain}.${record.moduleId}.${action}`, actorId: auditActor.actorId, actorName: auditActor.name, effectiveUserId: effectiveUser.id, occurredAt: now, summary, reason: reason || undefined, outcome: 'success', correlationId, metadata: {recordId: record.id, moduleId: record.moduleId, version: record.version, actingAdminUserId: auditActor.id === effectiveUser.id ? null : auditActor.id}} satisfies AuditEvent); await tx.put('domain_events', {id: newId('event'), aggregateType: record.moduleId, aggregateId: record.id, eventType: action, actorId: auditActor.actorId, occurredAt: now, correlationId, payload: {effectiveUserId: effectiveUser.id, status: record.status, version: record.version}} satisfies DomainEvent); await tx.put('meta', {id: 'lastPersistedAt', value: now});});}
  private async createHandoffRecord(targetModuleId: string, source: OperationalRecord, actor: LocalUser, reason: string) {const target = ERP_MODULES.find((item) => item.id === targetModuleId); if (!target) return; const now = new Date().toISOString(); const record: OperationalRecord = {id: newId(targetModuleId), moduleId: targetModuleId, domain: target.domain, trackingCode: `${target.prefix}-${source.trackingCode}`, title: `${target.singular} برای ${source.title}`, description: `تحویل خودکار از ${source.trackingCode}`, status: target.workflow.initialState, priority: source.priority, companyId: source.companyId, unitId: source.unitId, branchUnitId: source.branchUnitId, ownerPersonnelId: source.ownerPersonnelId, assigneeUserId: source.assigneeUserId, customerId: source.customerId, relatedRecordId: source.id, amountRial: source.amountRial, quantity: source.quantity, createdByActorId: actor.actorId, createdByUserId: actor.id, updatedByActorId: actor.actorId, version: 1, payload: {handoffReason: reason || 'گردش‌کار خودکار', sourceModuleId: source.moduleId}, createdAt: now, updatedAt: now}; const state = await this.loadState(); const history = this.makeHistory(state, record, actor, 'handoff', {reason, snapshot: {sourceRecordId: source.id, sourceModuleId: source.moduleId}}); await this.persistOperationalChange(target.store, record, history, actor, 'handoff', `از ${source.trackingCode} به ${target.title} تحویل شد.`, reason);}

  private async createAdvanceTreasuryHandoff(source: OperationalRecord, actor: LocalUser, targetUserId: string, reason: string) {
    const target = ERP_MODULES.find((item) => item.id === 'treasury-execution');
    if (!target) return;
    const current = await this.loadState();
    if (current.operationalRecords.some((item) => item.moduleId === 'treasury-execution' && item.relatedRecordId === source.id)) return;
    const payload = readEmployeeAdvancePayload(source);
    const now = new Date().toISOString();
    const record: OperationalRecord = {
      id: newId('treasury-execution'), moduleId: target.id, domain: target.domain, trackingCode: `${target.prefix}-${source.trackingCode}-1`,
      title: `پرداخت مساعده ${payload.firstName} ${payload.lastName}`, description: `پرداخت مساعده پرسنلی از درخواست ${source.trackingCode}`,
      status: target.workflow.initialState, priority: source.priority, companyId: source.companyId, unitId: source.unitId, branchUnitId: source.branchUnitId,
      ownerPersonnelId: source.ownerPersonnelId, assigneeUserId: targetUserId, relatedRecordId: source.id, amountRial: source.amountRial, quantity: '1',
      createdByActorId: actor.actorId, createdByUserId: actor.id, updatedByActorId: actor.actorId, version: 1,
      payload: {handoffReason: reason, sourceModuleId: 'employee-advance', initialRequesterUserId: source.createdByUserId, initialRequesterName: payload.signedByName, beneficiaryPersonnelId: payload.beneficiaryPersonnelId, beneficiaryName: `${payload.firstName} ${payload.lastName}`, beneficiaryCardNumber: payload.cardNumber, bankName: payload.bankName, branchName: payload.branchName, unitName: payload.unitName, positionName: payload.positionName},
      createdAt: now, updatedAt: now,
    };
    const history = this.makeHistory(current, record, actor, 'handoff', {reason, snapshot: {sourceRecordId: source.id, sourceModuleId: source.moduleId}});
    await this.persistOperationalChange(target.store, record, history, actor, 'handoff', `مساعده ${source.trackingCode} برای پرداخت به خزانه تحویل شد.`, reason);
  }

  private async createPurchaseTreasuryHandoffs(source: OperationalRecord, actor: LocalUser, reason: string, targetUserId?: string) {
    const target = ERP_MODULES.find((item) => item.id === 'treasury-execution');
    if (!target) return;
    const sourcePayload = readPurchaseRequestPayload(source.payload);
    const current = await this.loadState();
    const initialRequester = current.users.find((user) => user.id === source.createdByUserId);
    const treasuryUser = current.users.find((user) => user.id === targetUserId && user.status === 'active' && can(user, permissionFor('treasury-execution', 'transition')))
      ?? current.users.find((user) => user.status === 'active' && user.roleIds.includes('role-treasury-executor-v1'))
      ?? current.users.find((user) => user.status === 'active' && !user.isAdmin && can(user, permissionFor('treasury-execution', 'transition')));
    for (const [index, allocation] of sourcePayload.allocations.entries()) {
      const now = new Date().toISOString();
      const branch = current.units.find((unit) => unit.id === allocation.branchUnitId);
      const costCenter = current.units.find((unit) => unit.id === allocation.costCenterUnitId);
      const record: OperationalRecord = {
        id: newId('treasury-execution'), moduleId: target.id, domain: target.domain,
        trackingCode: `${target.prefix}-${source.trackingCode}-${index + 1}`,
        title: `پرداخت سهم ${branch?.name ?? 'شعبه'} — ${source.title}`,
        description: `سهم مالی ${branch?.name ?? 'شعبه'} / ${costCenter?.name ?? 'مرکز هزینه'} از درخواست ${source.trackingCode}`,
        status: target.workflow.initialState, priority: source.priority, companyId: source.companyId,
        unitId: allocation.costCenterUnitId, branchUnitId: allocation.branchUnitId,
        ownerPersonnelId: source.ownerPersonnelId, assigneeUserId: treasuryUser?.id,
        relatedRecordId: source.id, amountRial: allocation.amountRial, quantity: '1', dueAt: source.dueAt,
        createdByActorId: actor.actorId, createdByUserId: actor.id, updatedByActorId: actor.actorId,
        version: 1,
        payload: {handoffReason: reason, sourceModuleId: source.moduleId, sourceAllocationId: allocation.id, branchName: branch?.name ?? null, costCenterName: costCenter?.name ?? null, allocationNote: allocation.note || null, initialRequesterUserId: source.createdByUserId, initialRequesterName: initialRequester?.name ?? null},
        createdAt: now, updatedAt: now,
      };
      const refreshed = await this.loadState();
      const history = this.makeHistory(refreshed, record, actor, 'handoff', {reason, snapshot: {sourceRecordId: source.id, sourceAllocationId: allocation.id}});
      await this.persistOperationalChange(target.store, record, history, actor, 'handoff', `سهم ${branch?.name ?? 'شعبه'} از ${source.trackingCode} به خزانه تحویل شد.`, reason);
    }
  }
  private async resolveAuditActor(effectiveUser: LocalUser) {const session = await this.storage.get<FoundationSession>('sessions', 'active-session'); if (!session?.actingAdminUserId) return effectiveUser; return await this.storage.get<LocalUser>('users', session.actingAdminUserId) ?? effectiveUser;}
  private async appendSystemAudit(action: string, summary: string, effectiveUserId: string, metadata?: AuditEvent['metadata']) {const effective = await this.storage.get<LocalUser>('users', effectiveUserId) ?? LOCAL_USERS[0]; await this.appendAudit({actor: effective, effectiveUser: effective, category: 'system', action, summary, outcome: 'success', metadata});}

  private async appendAudit(input: {actor: LocalUser; effectiveUser: LocalUser; category: AuditEvent['category']; action: string; summary: string; reason?: string; outcome: AuditEvent['outcome']; metadata?: AuditEvent['metadata']}): Promise<void> { const now = new Date().toISOString(); const correlationId = newId('correlation'); const actualActor = await this.resolveAuditActor(input.actor); await this.storage.transaction(['audit_events', 'domain_events', 'meta'], 'readwrite', async (tx) => {const audits = await tx.getAll<AuditEvent>('audit_events'); const metadata = {...input.metadata, ...(actualActor.id !== input.effectiveUser.id ? {actingAdminUserId: actualActor.id} : {})}; const audit: AuditEvent = {id: newId('audit'), sequence: nextSequence(audits), companyId: actualActor.companyId, category: input.category, action: input.action, actorId: actualActor.actorId, actorName: actualActor.name, effectiveUserId: input.effectiveUser.id, occurredAt: now, summary: input.summary, reason: input.reason, outcome: input.outcome, correlationId, metadata}; const event: DomainEvent = {id: newId('event'), aggregateType: input.category, aggregateId: input.effectiveUser.id, eventType: input.action, actorId: actualActor.actorId, occurredAt: now, correlationId, payload: {outcome: input.outcome, reason: input.reason ?? null, effectiveUserId: input.effectiveUser.id}}; await Promise.all([tx.put('audit_events', audit), tx.put('domain_events', event), tx.put('meta', {id: 'lastPersistedAt', value: now})]);}); }
}

function requirePermission(user: LocalUser, permission: PermissionCode, message: string) { if (!can(user, permission)) throw new Error(message); }
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export function normalizeDigits(value = '') { return value.replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit))).replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit))); }
export function nextPersonnelCode(personnel: Pick<PersonnelRecord, 'personnelCode'>[]): string {
  const highestCode = personnel.reduce((highest, item) => {
    const numericSuffix = normalizeDigits(item.personnelCode).match(/(\d+)$/)?.[1];
    return numericSuffix ? Math.max(highest, Number(numericSuffix)) : highest;
  }, 1000);
  return `P-${String(highestCode + 1).padStart(4, '0')}`;
}
export function normalizeText(value = '') { return value.trim().replace(/\s+/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLocaleLowerCase('fa'); }
export function normalizePhone(value = '') { const digits = normalizeDigits(value).replace(/\D/g, ''); return digits.startsWith('0098') ? `0${digits.slice(4)}` : digits.startsWith('98') ? `0${digits.slice(2)}` : digits; }
export function normalizeNationalId(value = '') { return normalizeDigits(value).replace(/\D/g, ''); }
export function normalizeIban(value = '') { const compact = normalizeDigits(value).replace(/\s|-/g, '').toUpperCase(); return compact && !compact.startsWith('IR') ? `IR${compact}` : compact; }
export function normalizeDecimal(value?: string) {if (value === undefined || value.trim() === '') return undefined; const normalized = normalizeDigits(value).replace(/,/g, '').trim(); if (!/^-?\d+(\.\d+)?$/.test(normalized)) throw new Error('مقدار عددی معتبر نیست.'); return normalized.replace(/^(-?)0+(?=\d)/, '$1');}
export function isValidIranianNationalId(value = '') { const id = normalizeNationalId(value); if (!id) return true; if (!/^\d{10}$/.test(id) || /^(\d)\1{9}$/.test(id)) return false; const check = Number(id[9]); const sum = id.slice(0, 9).split('').reduce((total, digit, index) => total + Number(digit) * (10 - index), 0) % 11; return (sum < 2 ? sum : 11 - sum) === check; }

function synchronizeSalesPersonnelInput(input: PersonnelInput, state: FoundationState): PersonnelInput {
  if (!input.salesHierarchyLevel) return {...input, salesAssignmentStartDate: undefined, salesBranchUnitId: undefined};
  const structure = input.salesStructureId ? state.salesStructures.find((item) => item.id === input.salesStructureId) : undefined;
  const branchUnitId = structure?.branchUnitId ?? input.branchUnitId;
  const primaryUnitIsSales = state.units.find((item) => item.id === input.unitId)?.name.includes('فروش') ?? false;
  return {...input, ...(primaryUnitIsSales ? {positionId: positionIdForSalesHierarchy(input.salesHierarchyLevel)!} : {}), salesAssignmentStartDate: input.salesAssignmentStartDate || input.startDate, branchUnitId, salesBranchUnitId: branchUnitId};
}

function normalizePersonnelInput(input: PersonnelInput): PersonnelInput {
  return {...input, personnelCode: normalizeDigits(input.personnelCode).trim(), firstName: input.firstName.trim(), lastName: input.lastName.trim(), fatherName: input.fatherName?.trim(), nationalId: normalizeNationalId(input.nationalId), identityNumber: normalizeDigits(input.identityNumber).trim(), primaryMobile: normalizePhone(input.primaryMobile), secondaryMobile: normalizePhone(input.secondaryMobile), phone: normalizePhone(input.phone), personalEmail: input.personalEmail?.trim().toLowerCase(), province: input.province?.trim(), city: input.city?.trim(), address: input.address?.trim(), postalCode: normalizeDigits(input.postalCode).replace(/\D/g, ''), employmentType: input.employmentType.trim(), workLocation: input.workLocation?.trim(), bankName: input.bankName?.trim(), accountNumber: normalizeDigits(input.accountNumber).replace(/\s|-/g, ''), cardNumber: normalizeDigits(input.cardNumber).replace(/\s|-/g, ''), iban: normalizeIban(input.iban), emergencyName: input.emergencyName?.trim(), emergencyRelation: input.emergencyRelation?.trim(), emergencyPhone: normalizePhone(input.emergencyPhone)};
}
function validatePersonnelInput(input: PersonnelInput, state: FoundationState, excludeId?: string) {
  if (input.firstName.trim().length < 2 || input.lastName.trim().length < 2) throw new Error('نام و نام خانوادگی پرسنل را کامل وارد کنید.');
  if (!input.personnelCode.trim()) throw new Error('کد پرسنلی الزامی است.');
  if (state.personnel.some((item) => item.id !== excludeId && normalizeDigits(item.personnelCode) === normalizeDigits(input.personnelCode))) throw new Error('این کد پرسنلی قبلاً ثبت شده است.');
  if (!normalizeNationalId(input.nationalId) || !isValidIranianNationalId(input.nationalId)) throw new Error('کد ملی الزامی است و باید معتبر باشد.');
  if (state.personnel.some((item) => item.id !== excludeId && normalizeNationalId(item.nationalId) === normalizeNationalId(input.nationalId))) throw new Error('این کد ملی قبلاً برای پرونده دیگری ثبت شده است.');
  if (state.registrationRequests.some((request) => request.linkedPersonnelId !== excludeId && normalizeNationalId(request.nationalId) === normalizeNationalId(input.nationalId))) throw new Error('این کد ملی قبلاً در درخواست ثبت‌نام دیگری استفاده شده است.');
  if (!isValidIranianMobile(normalizePhone(input.primaryMobile))) throw new Error('شماره همراه اصلی باید ۱۱ رقم و با 09 شروع شود.');
  const profileErrors = validateRequiredProfile({nationalId: input.nationalId, gender: input.gender, secondaryMobile: input.secondaryMobile, province: input.province, city: input.city, address: input.address, postalCode: input.postalCode, bankName: input.bankName, cardNumber: input.cardNumber});
  if (profileErrors.length) throw new Error(profileErrors[0]);
  if (input.phone && !isValidIranianLandline(normalizePhone(input.phone))) throw new Error('تلفن ثابت باید همراه پیش‌شماره و ۱۱ رقم باشد؛ مانند 02156174680.');
  if (input.emergencyPhone && !isValidIranianMobile(normalizePhone(input.emergencyPhone)) && !isValidIranianLandline(normalizePhone(input.emergencyPhone))) throw new Error('شماره تماس اضطراری باید همراه ۱۱ رقمی یا تلفن ثابت همراه پیش‌شماره باشد.');
  if (!state.units.some((item) => item.id === input.unitId && item.type !== 'شعبه')) throw new Error('واحد سازمانی معتبر انتخاب کنید؛ شعبه باید در فیلد جداگانه ثبت شود.');
  if (input.branchUnitId && !state.units.some((item) => item.id === input.branchUnitId && item.type === 'شعبه' && item.status === 'active')) throw new Error('شعبه محل استقرار معتبر انتخاب کنید.');
  if (!state.positions.some((item) => item.id === input.positionId)) throw new Error('سمت سازمانی معتبر انتخاب کنید.');
  const selectedPosition = state.positions.find((item) => item.id === input.positionId);
  if (!selectedPosition || !positionSupportsUnit(selectedPosition, input.unitId)) throw new Error('سمت انتخاب‌شده برای واحد سازمانی مجاز نیست.');
  if (!input.startDate) throw new Error('تاریخ شروع همکاری الزامی است.');
  if (input.employmentStatus === 'ended' && !input.endDate) throw new Error('برای همکاری خاتمه‌یافته، تاریخ پایان را وارد کنید.');
  if (input.managerPersonnelId === excludeId) throw new Error('پرسنل نمی‌تواند مدیر مستقیم خودش باشد.');
  const primaryUnitIsSales = state.units.find((item) => item.id === input.unitId)?.name.includes('فروش') ?? false;
  if (primaryUnitIsSales && !input.salesHierarchyLevel) throw new Error('رده این پرسنل در سلسله‌مراتب فروش را مشخص کنید.');
  if (primaryUnitIsSales && input.salesHierarchyLevel && input.positionId !== positionIdForSalesHierarchy(input.salesHierarchyLevel)) throw new Error('برای پرسنل واحد فروش، سمت سازمانی باید با رده او در سلسله‌مراتب فروش یکسان باشد.');
  if (input.salesHierarchyLevel && !input.salesAssignmentStartDate) throw new Error('تاریخ شروع نقش فروش الزامی است.');
  if (input.salesHierarchyLevel && input.salesAssignmentStartDate && input.salesAssignmentStartDate < input.startDate) throw new Error('تاریخ شروع نقش فروش نمی‌تواند قبل از تاریخ شروع همکاری باشد.');
  if (primaryUnitIsSales && input.salesHierarchyLevel && input.salesAssignmentStartDate !== input.startDate) throw new Error('برای پرسنلی که همکاری اولیه او در واحد فروش است، تاریخ شروع نقش فروش باید با تاریخ شروع همکاری یکسان باشد.');
  if (input.salesHierarchyLevel && !input.branchUnitId) throw new Error('شعبه محل استقرار عضو شبکه فروش الزامی است.');
  if (input.salesHierarchyLevel && input.salesBranchUnitId !== input.branchUnitId) throw new Error('شعبه فروش و شعبه محل استقرار باید یکسان باشند.');
  if (input.salesHierarchyLevel === 'seller' && !input.salesChannel) throw new Error('کانال فروش فروشنده را مشخص کنید؛ مانند کال‌سنتر، شعبه یا فروش میدانی.');
  if (input.salesHierarchyLevel === 'seller' && !input.salesStructureId) throw new Error('کال‌سنتر فعال فروشنده را انتخاب کنید.');
  if (input.salesHierarchyLevel === 'seller' && input.salesStructureId) {
    const current = excludeId ? state.personnel.find((item) => item.id === excludeId) : undefined;
    const structure = state.salesStructures.find((item) => item.id === input.salesStructureId);
    if (!structure || (structure.status !== 'active' && current?.salesStructureId !== structure.id)) throw new Error('ساختار فروش انتخاب‌شده فعال نیست.');
    if (structure.branchUnitId !== input.branchUnitId) throw new Error('شعبه محل استقرار فروشنده باید با شعبه مسیر سرپرست کال‌سنتر یکسان باشد.');
    if (structure.callCenterSupervisorPersonnelId !== input.salesSupervisorPersonnelId) throw new Error('سرپرست مستقیم فروش باید از ساختار کال‌سنتر محاسبه شود.');
  }
  if (input.salesSupervisorPersonnelId === excludeId) throw new Error('پرسنل نمی‌تواند سرپرست فروش خودش باشد.');
  if (input.salesSupervisorPersonnelId) {
    const supervisor = state.personnel.find((item) => item.id === input.salesSupervisorPersonnelId && item.employmentStatus === 'active');
    if (!supervisor?.salesHierarchyLevel) throw new Error('سرپرست انتخاب‌شده باید عضو فعال سلسله‌مراتب فروش باشد.');
    if (salesHierarchyRank(supervisor.salesHierarchyLevel) >= salesHierarchyRank(input.salesHierarchyLevel)) throw new Error('رده سرپرست فروش باید بالاتر از رده این پرسنل باشد.');
  }
  const iban = normalizeIban(input.iban); if (iban && !/^IR\d{24}$/.test(iban)) throw new Error('شماره شبا باید با IR و ۲۴ رقم وارد شود.');
  const card = normalizeDigits(input.cardNumber).replace(/\D/g, ''); if (card && !isValidBankCard(card)) throw new Error('شماره کارت باید ۱۶ رقم باشد.');
}
function personnelChangeAreas(before: PersonnelRecord, after: PersonnelRecord) { const areas: string[] = []; if (before.unitId !== after.unitId) areas.push('unit'); if (before.positionId !== after.positionId) areas.push('position'); if (before.managerPersonnelId !== after.managerPersonnelId) areas.push('manager'); if (before.salesHierarchyLevel !== after.salesHierarchyLevel || before.salesAssignmentStartDate !== after.salesAssignmentStartDate || before.salesChannel !== after.salesChannel || before.salesSupervisorPersonnelId !== after.salesSupervisorPersonnelId || before.salesBranchUnitId !== after.salesBranchUnitId || before.salesStructureId !== after.salesStructureId) areas.push('sales_hierarchy'); if (before.employmentStatus !== after.employmentStatus || before.employmentType !== after.employmentType || before.endDate !== after.endDate) areas.push('employment'); if (before.primaryMobile !== after.primaryMobile || before.personalEmail !== after.personalEmail || before.address !== after.address) areas.push('contact'); if (!areas.length) areas.push('profile'); return areas; }
function personnelAreaLabel(area: string) { return ({unit: 'واحد سازمانی', position: 'سمت سازمانی', manager: 'مدیر مستقیم', sales_hierarchy: 'جایگاه در شبکه فروش', employment: 'وضعیت همکاری'} as Record<string, string>)[area] ?? 'اطلاعات پرونده'; }
function salesHierarchyRank(level?: PersonnelRecord['salesHierarchyLevel']) { return ({sales_vice: 1, sales_manager: 2, senior_supervisor: 3, sales_supervisor: 4, seller: 5} as Record<string, number>)[level ?? ''] ?? 99; }
function assignmentName(state: FoundationState, kind: PersonnelMovementKind, id?: string) { if (!id) return 'تعیین نشده'; if (kind === 'sales_transfer') {const structure = state.salesStructures.find((item) => item.id === id); const branch = state.units.find((item) => item.id === structure?.branchUnitId)?.name; return structure ? `${salesStructureSupervisorName(structure, state.personnel)}${branch ? ` ـ ${branch}` : ''}` : 'ساختار فروش نامشخص';} return kind === 'position_change' ? state.positions.find((item) => item.id === id)?.title ?? 'سمت نامشخص' : state.units.find((item) => item.id === id)?.name ?? (kind === 'branch_transfer' ? 'شعبه نامشخص' : 'واحد نامشخص'); }

function validateSalesStructureInput(input: SalesStructureInput, state: FoundationState, excludeId?: string) {
  if (!state.units.some((item) => item.id === input.branchUnitId && item.type === 'شعبه' && item.status === 'active')) throw new Error('یک شعبه فعال انتخاب کنید.');
  if (state.salesStructures.some((item) => item.id !== excludeId && item.callCenterSupervisorPersonnelId === input.callCenterSupervisorPersonnelId && item.status === 'active')) throw new Error('این سرپرست کال‌سنتر هم‌اکنون یک مسیر فروش فعال دارد.');
  const requireLevel = (personnelId: string | undefined, level: PersonnelRecord['salesHierarchyLevel'], label: string) => {
    const person = state.personnel.find((item) => item.id === personnelId && item.employmentStatus === 'active');
    if (!person || person.salesHierarchyLevel !== level) throw new Error(`${label} باید از پرسنل فعال دارای همین رده فروش انتخاب شود.`);
  };
  requireLevel(input.salesVicePersonnelId, 'sales_vice', 'معاونت فروش');
  requireLevel(input.salesManagerPersonnelId, 'sales_manager', 'مدیر فروش');
  requireLevel(input.seniorSupervisorPersonnelId, 'senior_supervisor', 'سرپرست ارشد');
  requireLevel(input.callCenterSupervisorPersonnelId, 'sales_supervisor', 'سرپرست کال‌سنتر');
}

function customerDisplayName(input: CustomerInput) { return input.type === 'legal' ? input.legalName?.trim() ?? '' : `${input.firstName?.trim() ?? ''} ${input.lastName?.trim() ?? ''}`.trim(); }
function normalizeCustomerInput(input: CustomerInput): CustomerInput { return {...input, firstName: input.firstName?.trim(), lastName: input.lastName?.trim(), legalName: input.legalName?.trim(), nationalId: normalizeNationalId(input.nationalId), businessId: normalizeNationalId(input.businessId), economicCode: normalizeDigits(input.economicCode).replace(/\D/g, ''), email: input.email?.trim().toLowerCase(), phones: input.phones.filter((item) => normalizePhone(item.number)).map((item) => ({...item, label: item.label.trim() || 'تماس', number: normalizePhone(item.number)})), addresses: input.addresses.filter((item) => item.address.trim()).map((item) => ({...item, label: item.label.trim() || 'نشانی', province: item.province?.trim(), city: item.city?.trim(), address: item.address.trim(), postalCode: normalizeDigits(item.postalCode).replace(/\D/g, '')})), source: input.source.trim(), provenance: input.provenance.trim(), notes: input.notes.trim(), relationships: input.relationships.map((item) => ({...item, title: item.title.trim(), personName: item.personName?.trim(), description: item.description?.trim()}))}; }
function validateCustomerInput(input: CustomerInput) { const name = customerDisplayName(input); if (name.length < 2) throw new Error(input.type === 'legal' ? 'نام حقوقی مشتری را وارد کنید.' : 'نام و نام خانوادگی مشتری را وارد کنید.'); if (!input.source.trim()) throw new Error('منبع آشنایی مشتری را مشخص کنید.'); if (input.nationalId && !isValidIranianNationalId(input.nationalId)) throw new Error('کد ملی مشتری معتبر نیست.'); for (const phone of input.phones) {const number = normalizePhone(phone.number); if (!isValidIranianMobile(number) && !isValidIranianLandline(number)) throw new Error('شماره تماس باید همراه ۱۱ رقمی یا تلفن ثابت همراه پیش‌شماره باشد.');} for (const address of input.addresses) {if (address.postalCode && !isValidPostalCode(address.postalCode)) throw new Error('کد پستی مشتری باید دقیقاً ۱۰ رقم باشد.');} if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new Error('ایمیل مشتری معتبر نیست.'); }
export function findDuplicateCustomers(customers: CustomerRecord[], target: CustomerInput | CustomerRecord, excludeId?: string) { const phones = new Set(target.phones.map((item) => normalizePhone(item.number)).filter(Boolean)); const nationalId = normalizeNationalId(target.nationalId); const businessId = normalizeNationalId(target.businessId); return customers.filter((item) => item.id !== excludeId && !item.mergedIntoCustomerId && ((nationalId && normalizeNationalId(item.nationalId) === nationalId) || (businessId && normalizeNationalId(item.businessId) === businessId) || item.phones.some((phone) => phones.has(normalizePhone(phone.number))))); }
function customerStatusLabel(status: CustomerRecord['status']) { return status === 'active' ? 'فعال' : status === 'inactive' ? 'غیرفعال' : 'بالقوه'; }
function validateUnitInput(input: UnitInput, units: OrganizationalUnit[], excludeId?: string) { if (input.name.trim().length < 2) throw new Error('نام واحد باید حداقل ۲ نویسه باشد.'); if (input.type.trim().length < 2) throw new Error('نوع واحد را مشخص کنید.'); if (units.some((unit) => unit.id !== excludeId && unit.name.trim().toLocaleLowerCase('fa') === input.name.trim().toLocaleLowerCase('fa'))) throw new Error('واحدی با این نام وجود دارد.'); if (input.parentId === excludeId) throw new Error('یک واحد نمی‌تواند والد خودش باشد.'); }
function validatePositionInput(input: PositionInput, state: FoundationState, excludeId?: string) { if (input.title.trim().length < 2) throw new Error('عنوان سمت باید حداقل ۲ نویسه باشد.'); if (state.positions.some((position) => position.id !== excludeId && position.title.trim().toLocaleLowerCase('fa') === input.title.trim().toLocaleLowerCase('fa'))) throw new Error('سمتی با این عنوان وجود دارد؛ همان سمت را ویرایش و واحد مجاز را به آن اضافه کنید.'); const unitIds = normalizePositionUnitIds(input.unitIds ?? []); if (!unitIds.length) throw new Error('حداقل یک واحد سازمانی مجاز برای سمت انتخاب کنید.'); if (unitIds.some((id) => !state.units.some((unit) => unit.id === id && unit.status === 'active' && unit.type !== 'شعبه'))) throw new Error('یکی از واحدهای مجاز سمت، غیرفعال یا نامعتبر است.'); }
function validateUserInput(input: UserInput, state: FoundationState, excludeId?: string) { if (input.name.trim().length < 3) throw new Error('نام کاربر باید حداقل ۳ نویسه باشد.'); if (!/^[a-zA-Z0-9._-]{3,32}$/.test(input.username.trim())) throw new Error('نام کاربری باید ۳ تا ۳۲ نویسه لاتین، عدد، نقطه، خط تیره یا زیرخط باشد.'); if (state.users.some((user) => user.id !== excludeId && user.username.toLowerCase() === input.username.trim().toLowerCase()) || state.registrationRequests.some((request) => request.linkedUserId !== excludeId && request.requestedUsername.toLowerCase() === input.username.trim().toLowerCase())) throw new Error('این نام کاربری قبلاً استفاده شده یا برای یک درخواست ثبت‌نام رزرو شده است.'); if (!state.units.some((unit) => unit.id === input.unitId && unit.status === 'active' && unit.type !== 'شعبه')) throw new Error('واحد سازمانی فعال انتخاب کنید؛ شعبه در فیلد مستقلی نگهداری می‌شود.'); if (input.branchUnitId && !state.units.some((unit) => unit.id === input.branchUnitId && unit.status === 'active' && unit.type === 'شعبه')) throw new Error('شعبه محل استقرار معتبر انتخاب کنید.'); const selectedPosition = state.positions.find((position) => position.id === input.positionId && position.status === 'active'); if (!selectedPosition) throw new Error('سمت سازمانی فعال انتخاب کنید.'); if (!positionSupportsUnit(selectedPosition, input.unitId)) throw new Error('سمت انتخاب‌شده برای این واحد سازمانی مجاز نیست.'); if (!input.roleIds.length || input.roleIds.some((id) => !state.roles.some((role) => role.id === id && role.status === 'active'))) throw new Error('حداقل یک نقش دسترسی فعال انتخاب کنید.'); if (input.managerUserId && input.managerUserId === excludeId) throw new Error('کاربر نمی‌تواند مدیر مستقیم خودش باشد.'); const validPermissions = new Set([...PERMISSION_CATALOG.filter((item) => item.available).map((item) => item.code), ...state.roles.flatMap((role) => role.permissions)]); const grants = input.permissionGrants ?? []; const denials = input.permissionDenials ?? []; if ([...grants, ...denials].some((code) => !validPermissions.has(code))) throw new Error('یکی از مجوزهای انتخاب‌شده در کاتالوگ فعال دسترسی وجود ندارد.'); if (grants.some((code) => denials.includes(code))) throw new Error('یک مجوز نمی‌تواند هم‌زمان برای کاربر افزوده و مستثنا شود.'); }
function normalizeUserPermissionOverrides(input: Pick<UserInput, 'roleIds'|'permissionGrants'|'permissionDenials'>, state: FoundationState) { const available = new Set([...PERMISSION_CATALOG.filter((item) => item.available).map((item) => item.code), ...state.roles.flatMap((role) => role.permissions)]); const base = new Set(state.roles.filter((role) => input.roleIds.includes(role.id) && role.status === 'active').flatMap((role) => role.permissions)); const grants = [...new Set(input.permissionGrants ?? [])].filter((permission) => available.has(permission) && !base.has(permission)); const denials = [...new Set(input.permissionDenials ?? [])].filter((permission) => available.has(permission) && base.has(permission)); return {grants, denials}; }
function validateRoleInput(input: RoleInput, roles: SecurityRole[], excludeId?: string) { if (input.name.trim().length < 2) throw new Error('نام نقش باید حداقل ۲ نویسه باشد.'); if (roles.some((role) => role.id !== excludeId && role.name.trim().toLocaleLowerCase('fa') === input.name.trim().toLocaleLowerCase('fa'))) throw new Error('نقشی با این نام وجود دارد.'); }
function wouldCreateCycle(unitId: string, parentId: string, units: OrganizationalUnit[]) { let cursor: string | undefined = parentId; const seen = new Set<string>(); while (cursor) {if (cursor === unitId || seen.has(cursor)) return true; seen.add(cursor); cursor = units.find((unit) => unit.id === cursor)?.parentId;} return false; }
function sameStrings(a: string[], b: string[]) { return a.length === b.length && [...a].sort().every((value, index) => value === [...b].sort()[index]); }
export function userConcurrencyToken(user: LocalUser) {
  return JSON.stringify({name:user.name,username:user.username,status:user.status,passwordHash:user.passwordHash,passwordUpdatedAt:user.passwordUpdatedAt,unitId:user.unitId,positionId:user.positionId,branchUnitId:user.branchUnitId,managerUserId:user.managerUserId,personnelId:user.personnelId,roleId:user.roleId,roleIds:[...user.roleIds].sort(),permissionGrants:[...(user.permissionGrants??[])].sort(),permissionDenials:[...(user.permissionDenials??[])].sort()});
}
const userMutationFingerprint = userConcurrencyToken;
async function hashPassword(password: string) {
  const iterations = 120_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePassword(password, salt, iterations);
  return `pbkdf2$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(derived)}`;
}
async function verifyPassword(password: string, stored: string) {
  if (!stored.startsWith('pbkdf2$')) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('') === stored;
  }
  const [, iterationText, saltText, hashText] = stored.split('$');
  const iterations = Number(iterationText);
  if (!Number.isInteger(iterations) || iterations < 100_000 || !saltText || !hashText) return false;
  const actual = await derivePassword(password, base64ToBytes(saltText), iterations);
  return bytesToBase64(actual) === hashText;
}
async function recoveryCodeFor(user: LocalUser, mobile: string) {
  const source = `${user.id}|${user.passwordUpdatedAt ?? ''}|${mobile}|tapra2-local-recovery-v1`;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)));
  const numeric = ((digest[0] << 24) >>> 0) + (digest[1] << 16) + (digest[2] << 8) + digest[3];
  return String(numeric % 1_000_000).padStart(6, '0');
}
function maskMobile(mobile: string) { return `${mobile.slice(0, 4)}***${mobile.slice(-4)}`; }
async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations}, key, 256);
  return new Uint8Array(bits);
}
function bytesToBase64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
function base64ToBytes(value: string) { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }
function makeInitials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('.'); }
function usernameFromName(name: string) { return `user.${name.length}`; }
function avatarColor(index: number) { return ['#6957d9', '#0d9488', '#0284c7', '#7c3aed', '#d97706', '#e11d48'][index % 6]; }
function nextSequence(audits: AuditEvent[]) { return audits.reduce((maximum, event) => Math.max(maximum, event.sequence), 0) + 1; }

function removeSensitiveFileData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeSensitiveFileData);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== 'fileDataUrl' && key !== 'dataUrl')
    .map(([key, item]) => [key, removeSensitiveFileData(item)]));
}

function legacyDataUrlMime(value: string): string {
  return /^data:([^;,]+)[;,]/.exec(value)?.[1] ?? 'application/octet-stream';
}

function legacyDataUrlSize(value: string): number {
  const encoded = value.split(',')[1];
  if (!encoded) return 0;
  try { return atob(encoded).length; } catch { return 0; }
}

async function sha256DataUrlContent(value: string): Promise<string> {
  const encoded = value.split(',')[1];
  if (!encoded) throw new Error('محتوای فایل قدیمی معتبر نیست.');
  let binary: string;
  try { binary = atob(encoded); } catch { throw new Error('محتوای فایل قدیمی قابل خواندن نیست.'); }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function isEncryptedSnapshot(value: unknown): value is EncryptedSnapshot { return Boolean(value && typeof value === 'object' && (value as EncryptedSnapshot).format === 'tapra2-local-snapshot-encrypted'); }
