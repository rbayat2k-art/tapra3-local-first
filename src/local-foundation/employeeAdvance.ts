import type {FoundationState, LocalUser, OperationalPayloadValue, OperationalRecord, PersonnelRecord} from './model';

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
  resumeStage?: AdvanceStage;
  signedByUserId: string;
  signedByName: string;
  signedAt: string;
  trail: AdvanceTrailItem[];
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
    signedByUserId: text(payload.signedByUserId), signedByName: text(payload.signedByName), signedAt: text(payload.signedAt),
    trail: Array.isArray(payload.trail) ? payload.trail as unknown as AdvanceTrailItem[] : [],
  };
}

export function advanceBranchIds(user: LocalUser, state: Pick<FoundationState, 'units'>): string[] {
  if (user.isAdmin || user.advanceBranchIds?.includes('*')) return state.units.filter((unit) => unit.type === 'شعبه' && unit.status === 'active').map((unit) => unit.id);
  return user.advanceBranchIds?.length ? user.advanceBranchIds : user.branchUnitId ? [user.branchUnitId] : [];
}

export function canSelfSubmitAdvance(branchUnitId: string): boolean {
  // V1 policy seed: all active branches allow employee self-service. This boundary is ready for a branch policy editor.
  return Boolean(branchUnitId);
}

export function canProxyAdvance(user: LocalUser, beneficiary: PersonnelRecord, state: Pick<FoundationState, 'units'>): boolean {
  return user.roleIds.includes('role-sales-advance-approver') && advanceBranchIds(user, state).includes(beneficiary.branchUnitId ?? beneficiary.salesBranchUnitId ?? '');
}

export function isEmployeeAdvanceVisible(record: OperationalRecord, state: FoundationState): boolean {
  if (state.activeUser.isAdmin) return true;
  const payload = readEmployeeAdvancePayload(record);
  const user = state.activeUser;
  if (payload.beneficiaryUserId === user.id || record.createdByUserId === user.id || record.assigneeUserId === user.id) return true;
  if (user.roleIds.includes('role-advance-accounting-reviewer')) return true;
  if (user.roleIds.includes('role-advance-branch-manager') || user.roleIds.includes('role-sales-advance-approver')) return advanceBranchIds(user, state).includes(payload.branchUnitId);
  return false;
}

export function canBranchManagerDecideAdvance(record: OperationalRecord, state: FoundationState): boolean {
  if (record.status !== 'branch_review') return false;
  const user = state.activeUser;
  if (user.isAdmin) return true;
  const payload = readEmployeeAdvancePayload(record);
  return user.status === 'active'
    && user.roleIds.includes('role-advance-branch-manager')
    && advanceBranchIds(user, state).includes(payload.branchUnitId);
}

export function canEmployeeAdvanceReviewerDecide(record: OperationalRecord, state: FoundationState): boolean {
  const user = state.activeUser;
  if (user.isAdmin) return ['branch_review', 'accounting_review', 'final_review'].includes(record.status);
  if (canBranchManagerDecideAdvance(record, state)) return true;
  if (record.status === 'accounting_review') return user.status === 'active' && user.roleIds.includes('role-advance-accounting-reviewer');
  if (record.status === 'final_review') {
    const payload = readEmployeeAdvancePayload(record);
    return user.status === 'active'
      && user.roleIds.includes('role-sales-advance-approver')
      && advanceBranchIds(user, state).includes(payload.branchUnitId);
  }
  return false;
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
