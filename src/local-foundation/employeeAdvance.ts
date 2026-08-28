import type {AdvanceEligibilityStatus, FoundationState, LocalUser, OperationalPayloadValue, OperationalRecord, PersonnelRecord, WorkflowApprovalStageDefinition} from './model';
import {approvalStagesForRoute, assignmentModeForStage, roleIdsForWorkflowState, routeVariantForBranch} from './workflowPolicy';
import {resolveEffectiveUnitManager, userIsEffectiveUnitManager} from './workflowRouting';

export type AdvanceStage = 'draft' | 'branch_review' | 'accounting_review' | 'final_review' | 'needs_correction' | 'sent_to_treasury' | 'rejected' | 'paid';
export type AdvanceDecision = 'approve' | 'needs_correction' | 'reject' | 'accounting_recheck' | 'approve_to_treasury';

export interface EmployeeAdvanceInput {
  beneficiaryPersonnelId: string;
  amountRial: string;
  note: string;
  signatureAccepted: boolean;
  approveAtCreation?: boolean;
}

export interface AdvanceTrailItem extends Record<string, OperationalPayloadValue> {
  id: string;
  stage: string;
  action: string;
  actorId: string;
  actorName: string;
  occurredAt: string;
  reason: string | null;
  previousAmountRial: string | null;
  amountRial: string;
}

export interface EmployeeAdvancePayload {
  kind: 'employee_advance';
  beneficiaryPersonnelId: string;
  beneficiaryUserId: string;
  personnelCode: string;
  firstName: string;
  lastName: string;
  nationalId: string;
  primaryMobile: string;
  branchUnitId: string;
  branchName: string;
  unitId: string;
  unitName: string;
  positionId: string;
  positionName: string;
  bankName: string;
  cardNumber: string;
  requestDate: string;
  originalAmountRial: string;
  approvedAmountRial: string;
  internalCreditEligible: boolean;
  submittedOnBehalf: boolean;
  proxyByUserId?: string;
  proxyByName?: string;
  selfApprovedAt?: string;
  branchReviewSkipped?: boolean;
  branchReviewSkippedReason?: string;
  resumeStage?: AdvanceStage;
  signedByUserId: string;
  signedByName: string;
  signedAt: string;
  trail: AdvanceTrailItem[];
}

export interface AdvanceEligibilityDecision {
  allowed: boolean;
  status: AdvanceEligibilityStatus;
  reason?: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
}

/**
 * Eligibility is independent from RBAC. Legacy records are eligible. A dated suspension
 * blocks only inside its effective window; an ineligible record stays blocked until HR changes it.
 */
export function personnelAdvanceEligibility(personnel: Pick<PersonnelRecord, 'advanceEligibilityStatus' | 'advanceEligibilityReason' | 'advanceEligibilityEffectiveFrom' | 'advanceEligibilityEffectiveUntil'>, onDate = new Date().toISOString().slice(0, 10)): AdvanceEligibilityDecision {
  const status = personnel.advanceEligibilityStatus ?? 'eligible';
  const effectiveFrom = personnel.advanceEligibilityEffectiveFrom;
  const effectiveUntil = personnel.advanceEligibilityEffectiveUntil;
  const reason = personnel.advanceEligibilityReason?.trim() || undefined;
  if (status === 'eligible') return {allowed: true, status};
  if (effectiveFrom && onDate < effectiveFrom) return {allowed: true, status, reason, effectiveFrom, effectiveUntil};
  if (status === 'suspended' && effectiveUntil && onDate > effectiveUntil) return {allowed: true, status, reason, effectiveFrom, effectiveUntil};
  return {allowed: false, status, reason, effectiveFrom, effectiveUntil};
}

export function advanceEligibilityStatusLabel(status?: AdvanceEligibilityStatus): string {
  return status === 'suspended' ? 'تعلیق موقت' : status === 'ineligible' ? 'غیرمجاز' : 'مجاز';
}

const text = (value: unknown) => typeof value === 'string' ? value : '';
const bool = (value: unknown) => value === true;

export function readEmployeeAdvancePayload(recordOrPayload: OperationalRecord | OperationalRecord['payload']): EmployeeAdvancePayload {
  const source = recordOrPayload as OperationalRecord;
  const payload = source && typeof source === 'object' && 'moduleId' in source ? source.payload : recordOrPayload as OperationalRecord['payload'];
  return {
    kind: 'employee_advance', beneficiaryPersonnelId: text(payload.beneficiaryPersonnelId), beneficiaryUserId: text(payload.beneficiaryUserId),
    personnelCode: text(payload.personnelCode), firstName: text(payload.firstName), lastName: text(payload.lastName),
    nationalId: text(payload.nationalId), primaryMobile: text(payload.primaryMobile),
    branchUnitId: text(payload.branchUnitId), branchName: text(payload.branchName), unitId: text(payload.unitId), unitName: text(payload.unitName),
    positionId: text(payload.positionId), positionName: text(payload.positionName), bankName: text(payload.bankName), cardNumber: text(payload.cardNumber),
    requestDate: text(payload.requestDate), originalAmountRial: text(payload.originalAmountRial), approvedAmountRial: text(payload.approvedAmountRial),
    internalCreditEligible: bool(payload.internalCreditEligible), submittedOnBehalf: bool(payload.submittedOnBehalf),
    proxyByUserId: text(payload.proxyByUserId) || undefined, proxyByName: text(payload.proxyByName) || undefined,
    selfApprovedAt: text(payload.selfApprovedAt) || undefined, resumeStage: text(payload.resumeStage) as AdvanceStage || undefined,
    branchReviewSkipped: bool(payload.branchReviewSkipped), branchReviewSkippedReason: text(payload.branchReviewSkippedReason) || undefined,
    signedByUserId: text(payload.signedByUserId), signedByName: text(payload.signedByName), signedAt: text(payload.signedAt),
    trail: Array.isArray(payload.trail) ? payload.trail as unknown as AdvanceTrailItem[] : [],
  };
}

export function advanceBranchIds(user: LocalUser, state: Pick<FoundationState, 'units' | 'users' | 'personnel'>): string[] {
  if (user.isAdmin || user.advanceBranchIds?.includes('*')) return state.units.filter((unit) => unit.type === 'شعبه' && unit.status === 'active').map((unit) => unit.id);
  const explicit = user.advanceBranchIds?.length ? user.advanceBranchIds : user.branchUnitId ? [user.branchUnitId] : [];
  const managed = state.units.filter((unit) => unit.type === 'شعبه' && unit.status === 'active' && userIsEffectiveUnitManager(state, unit, user.id)).map((unit) => unit.id);
  return [...new Set([...explicit, ...managed])];
}

export function canSelfSubmitAdvance(branchUnitId: string, state?: Pick<FoundationState, 'workflows' | 'roles'>): boolean {
  const workflow = state?.workflows.find((item) => item.moduleId === 'employee-advance');
  if (!workflow || !state) return true;
  const variant = routeVariantForBranch(workflow, branchUnitId);
  return variant?.allowSelfSubmission ?? workflow.allowSelfSubmission ?? true;
}

interface AdvanceStageAssignmentContext {
  branchUnitId: string;
  unitId?: string;
  beneficiaryUserId?: string;
}

export function canUserTakeAdvanceStage(
  user: LocalUser,
  stage: WorkflowApprovalStageDefinition,
  state: Pick<FoundationState, 'units' | 'users' | 'personnel' | 'roles'>,
  context: AdvanceStageAssignmentContext,
): boolean {
  if (user.status !== 'active') return false;
  const mode = assignmentModeForStage(stage);
  if (mode === 'specific_user' && user.id !== stage.assigneeUserId) return false;
  if (mode === 'branch_manager') {
    const manager = resolveEffectiveUnitManager(state, context.branchUnitId)?.effectiveManager;
    if (!manager || manager.id !== user.id) return false;
  }
  // Acting management narrows *where* the user may act; it never clones the
  // permanent manager's workflow role or permission bundle.
  if (stage.roleIds.length && !state.roles.some((role) => role.status === 'active' && user.roleIds.includes(role.id) && stage.roleIds.includes(role.id))) return false;
  if (stage.scope === 'SELF' && user.id !== context.beneficiaryUserId) return false;
  if (stage.scope === 'UNIT' && user.unitId !== context.unitId) return false;
  if (stage.scope === 'BRANCH') {
    if (!context.branchUnitId) {
      if (!user.isAdmin && !user.advanceBranchIds?.includes('*')) return false;
    } else if (!advanceBranchIds(user, state).includes(context.branchUnitId)) return false;
  }
  return true;
}

export function resolveAdvanceStageAssignee(
  state: Pick<FoundationState, 'users' | 'units' | 'personnel' | 'roles'>,
  workflow: Parameters<typeof approvalStagesForRoute>[0],
  routeId: string | undefined,
  stateId: string,
  context: AdvanceStageAssignmentContext,
): LocalUser | undefined {
  const stage = approvalStagesForRoute(workflow, state.roles, routeId).find((item) => item.stateId === stateId);
  if (!stage) return undefined;
  const candidates = state.users.filter((user) => canUserTakeAdvanceStage(user, stage, state, context));
  if (assignmentModeForStage(stage) === 'specific_user') return candidates.find((user) => user.id === stage.assigneeUserId);
  if (assignmentModeForStage(stage) === 'branch_manager') return candidates[0];
  return [...candidates].sort((a, b) => a.name.localeCompare(b.name, 'fa') || a.id.localeCompare(b.id))[0];
}

export function canProxyAdvance(user: LocalUser, beneficiary: PersonnelRecord, state: FoundationState): boolean {
  const branchId = beneficiary.salesBranchUnitId ?? beneficiary.branchUnitId ?? '';
  const workflow = state.workflows.find((item) => item.moduleId === 'employee-advance');
  const routeId = workflow ? routeVariantForBranch(workflow, branchId)?.id : undefined;
  const stage = workflow && approvalStagesForRoute(workflow, state.roles, routeId).find((item) => item.stateId === 'final_review');
  return Boolean(stage && canUserTakeAdvanceStage(user, stage, state, {
    branchUnitId: branchId,
    unitId: beneficiary.unitId,
    beneficiaryUserId: beneficiary.linkedUserId,
  }));
}

export function isEmployeeAdvanceVisible(record: OperationalRecord, state: FoundationState): boolean {
  if (state.activeUser.isAdmin) return true;
  const payload = readEmployeeAdvancePayload(record);
  const user = state.activeUser;
  if (payload.beneficiaryUserId === user.id || record.createdByUserId === user.id || record.assigneeUserId === user.id) return true;
  const accountingRoles = roleIdsForWorkflowState(state, 'employee-advance', 'accounting_review', ['role-advance-accounting-reviewer'], record.workflowVersion, record.workflowRouteId);
  const branchRoles = roleIdsForWorkflowState(state, 'employee-advance', 'branch_review', ['role-advance-branch-manager'], record.workflowVersion, record.workflowRouteId);
  const finalRoles = roleIdsForWorkflowState(state, 'employee-advance', 'final_review', ['role-sales-advance-approver'], record.workflowVersion, record.workflowRouteId);
  if (user.roleIds.some((roleId) => accountingRoles.includes(roleId))) return true;
  if (user.roleIds.some((roleId) => branchRoles.includes(roleId) || finalRoles.includes(roleId))) {
    return payload.branchUnitId ? advanceBranchIds(user, state).includes(payload.branchUnitId) : Boolean(user.advanceBranchIds?.includes('*'));
  }
  return false;
}

export function canBranchManagerDecideAdvance(record: OperationalRecord, state: FoundationState): boolean {
  if (record.status !== 'branch_review') return false;
  const user = state.activeUser;
  if (user.isAdmin) return true;
  const payload = readEmployeeAdvancePayload(record);
  const workflow = state.workflows.find((item) => item.moduleId === 'employee-advance' && (!record.workflowVersion || item.version === record.workflowVersion))
    ?? state.workflowVersions.find((item) => item.moduleId === 'employee-advance' && item.version === record.workflowVersion);
  const configured = workflow && approvalStagesForRoute(workflow, state.roles, record.workflowRouteId).find((item) => item.stateId === 'branch_review');
  const stage=configured&&record.payload.continuitySpecificAssigneeState==='branch_review'&&typeof record.payload.continuitySpecificAssigneeUserId==='string'?{...configured,assigneeUserId:record.payload.continuitySpecificAssigneeUserId}:configured;
  return Boolean(stage && canUserTakeAdvanceStage(user, stage, state, {branchUnitId: payload.branchUnitId, unitId: payload.unitId, beneficiaryUserId: payload.beneficiaryUserId}));
}

export function canEmployeeAdvanceReviewerDecide(record: OperationalRecord, state: FoundationState): boolean {
  const user = state.activeUser;
  if (record.payload.needsReassignment === true || user.status !== 'active' || !user.permissions.includes('hr.employee_advance.approve')) return false;
  if (!['branch_review', 'accounting_review', 'final_review'].includes(record.status)) return false;
  const payload = readEmployeeAdvancePayload(record);
  const workflow = state.workflows.find((item) => item.moduleId === 'employee-advance' && (!record.workflowVersion || item.version === record.workflowVersion))
    ?? state.workflowVersions.find((item) => item.moduleId === 'employee-advance' && item.version === record.workflowVersion);
  const configured = workflow && approvalStagesForRoute(workflow, state.roles, record.workflowRouteId).find((item) => item.stateId === record.status);
  const stage=configured&&record.payload.continuitySpecificAssigneeState===record.status&&typeof record.payload.continuitySpecificAssigneeUserId==='string'?{...configured,assigneeUserId:record.payload.continuitySpecificAssigneeUserId}:configured;
  return Boolean(stage && canUserTakeAdvanceStage(user, stage, state, {branchUnitId: payload.branchUnitId, unitId: payload.unitId, beneficiaryUserId: payload.beneficiaryUserId}));
}

export interface EmployeeAdvanceUiAccess {
  reviewerCanDecide: boolean;
  beneficiaryCanEdit: boolean;
  beneficiaryCanReveal: boolean;
  treasuryCanReveal: boolean;
  canRevealCard: boolean;
  disabledReason: string;
}

/** UI projection of the same current-stage entitlement enforced by the service. */
export function employeeAdvanceUiAccess(record:OperationalRecord,state:FoundationState):EmployeeAdvanceUiAccess{
  const user=state.activeUser;
  const payload=readEmployeeAdvancePayload(record);
  const correctionRecipient=typeof record.payload.continuityCorrectionRecipientUserId==='string'?record.payload.continuityCorrectionRecipientUserId:undefined;
  const beneficiaryIdentity=payload.beneficiaryUserId===user.id||record.createdByUserId===user.id
    ||(record.status==='needs_correction'&&correctionRecipient===user.id);
  const beneficiaryCanEdit=record.payload.needsReassignment!==true&&user.status==='active'&&beneficiaryIdentity
    &&user.permissions.includes('hr.employee_advance.edit')
    &&(['branch_review','needs_correction'].includes(record.status)||(record.status==='accounting_review'&&payload.branchReviewSkipped));
  const reviewerCanDecide=canEmployeeAdvanceReviewerDecide(record,state);
  const treasuryCanReveal=user.status==='active'&&user.companyId===record.companyId
    &&user.permissions.includes('treasury.treasury_execution.view')&&['sent_to_treasury','paid'].includes(record.status);
  const beneficiaryCanReveal=user.status==='active'&&user.companyId===record.companyId&&beneficiaryIdentity
    &&user.permissions.includes('hr.employee_advance.view');
  let disabledReason='این مرحله در کارتابل نقش یا محدوده فعلی شما نیست.';
  if(record.payload.needsReassignment===true)disabledReason='این پرونده تا تعیین مسئول معتبر متوقف است.';
  else if(record.status==='branch_review'){
    const routing=resolveEffectiveUnitManager(state,payload.branchUnitId);
    disabledReason=routing?.source==='none'?routing.reason:routing?.effectiveManager
      ?`این مرحله در انتظار اقدام مدیر مؤثر شعبه، ${routing.effectiveManager.name}، است.`
      :'مدیر مؤثر معتبر برای این شعبه تعیین نشده است.';
  }
  return {reviewerCanDecide,beneficiaryCanEdit,beneficiaryCanReveal,treasuryCanReveal,canRevealCard:reviewerCanDecide||beneficiaryCanReveal||treasuryCanReveal,disabledReason};
}

export function advanceBeneficiaryName(record: OperationalRecord): string {
  const payload = readEmployeeAdvancePayload(record);
  return `${payload.firstName} ${payload.lastName}`.trim() || 'پرسنل نامشخص';
}

export function maskCard(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length !== 16) return 'ثبت نشده';
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)} ${digits.slice(12)}`;
}
