import {authorize, authorizeWithActiveRole, operationalRecordResource} from './authorization';
import {permissionFor} from './erpCatalog';
import {canUserTakeAdvanceStage, readEmployeeAdvancePayload} from './employeeAdvance';
import type {
  FoundationState,
  LocalUser,
  OperationalRecord,
  WorkflowApprovalRound,
  WorkflowApprovalRoundStatus,
  WorkflowApprovalStageDefinition,
  WorkflowApprovalVoteDecision,
  WorkflowDefinition,
} from './model';
import {approvalModeForStage, approvalStagesForRoute, requiredApprovalCount, workflowForRecord} from './workflowPolicy';
import {resolveEffectiveUnitManager} from './workflowRouting';
import type {StorageTransaction} from './storage';

export type ApprovalResolutionState = Pick<FoundationState, 'users' | 'roles' | 'units' | 'personnel' | 'workflows' | 'workflowVersions'>;

export interface ApprovalRoundProgress {
  approvedCount: number;
  requiredCount: number;
  electorateSize: number;
  pendingUserIds: string[];
  status: WorkflowApprovalRoundStatus;
}

export function approvalStageForRecord(
  state: ApprovalResolutionState,
  moduleWorkflow: WorkflowDefinition,
  record: OperationalRecord,
): WorkflowApprovalStageDefinition | undefined {
  const pinned = workflowForRecord(state, {id:record.moduleId, workflow:moduleWorkflow} as never, record);
  return approvalStagesForRoute(pinned, state.roles, record.workflowRouteId).find((stage) => stage.stateId === record.status);
}

function userEligibleForStage(
  state: ApprovalResolutionState,
  record: OperationalRecord,
  stage: WorkflowApprovalStageDefinition,
  user: LocalUser,
): boolean {
  if (user.status !== 'active' || user.companyId !== record.companyId) return false;
  if (!stage.allowSelfApproval && user.actorId === record.createdByActorId) return false;
  if (record.moduleId === 'employee-advance') {
    const advance = readEmployeeAdvancePayload(record);
    if (!canUserTakeAdvanceStage(user, stage, state, {
      branchUnitId:advance.branchUnitId,
      unitId:advance.unitId,
      beneficiaryUserId:advance.beneficiaryUserId,
    })) return false;
  } else if (stage.scope === 'SELF') {
    const owner = record.ownerPersonnelId
      ? state.personnel.find((person) => person.id === record.ownerPersonnelId)?.linkedUserId
      : undefined;
    if (record.createdByUserId !== user.id && owner !== user.id) return false;
  } else if (stage.scope === 'UNIT' && (!record.unitId || user.unitId !== record.unitId)) {
    return false;
  } else if (stage.scope === 'BRANCH') {
    const branchId = record.branchUnitId ?? (typeof record.payload.branchUnitId === 'string' ? record.payload.branchUnitId : undefined);
    if (!branchId || (user.branchUnitId !== branchId && !user.advanceBranchIds?.includes(branchId) && !user.advanceBranchIds?.includes('*'))) return false;
  }
  const permission = permissionFor(record.moduleId, 'approve');
  const resource = operationalRecordResource(user, record);
  if (stage.roleIds.length) {
    return authorizeWithActiveRole({
      persona:user,
      roles:state.roles,
      allowedRoleIds:stage.roleIds,
      allowAdminWithoutRole:false,
      permission,
      action:'approve',
      resource,
    }).allowed;
  }
  return authorize({persona:user, permission, action:'approve', resource}).allowed;
}

export function approvalUserEligibleForStage(
  state: ApprovalResolutionState,
  record: OperationalRecord,
  stage: WorkflowApprovalStageDefinition,
  user: LocalUser,
): boolean {
  return userEligibleForStage(state, record, stage, user);
}

export function approvalRoundIdFor(record: OperationalRecord, stage: WorkflowApprovalStageDefinition): string {
  return `approval:${record.moduleId}:${record.id}:v${record.workflowVersion ?? 1}:${record.workflowRouteId ?? 'base'}:${stage.id}:entry-${record.version}`;
}

/** Resolve and freeze a deterministic electorate when the record enters a stage. */
export function resolveApprovalElectorate(
  state: ApprovalResolutionState,
  record: OperationalRecord,
  stage: WorkflowApprovalStageDefinition,
): LocalUser[] {
  // A stage persisted before schema 14 had one concrete assignee. Treating its
  // role queue as a new broad ANY electorate would silently widen authority.
  if (!stage.approvalMode && record.assigneeUserId) {
    return state.users.filter((user) => user.id === record.assigneeUserId && userEligibleForStage(state, record, stage, user));
  }
  const mode = stage.assignmentMode ?? (stage.stateId === 'branch_review' ? 'branch_manager' : 'role_queue');
  let candidates: LocalUser[];
  if (mode === 'specific_user') {
    candidates = state.users.filter((user) => user.id === stage.assigneeUserId);
  } else if (mode === 'branch_manager') {
    const branchId = record.branchUnitId ?? record.unitId;
    const managerId = branchId ? resolveEffectiveUnitManager(state, branchId)?.effectiveManager?.id : undefined;
    candidates = state.users.filter((user) => user.id === managerId);
  } else {
    candidates = state.users;
  }
  return candidates
    .filter((user) => userEligibleForStage(state, record, stage, user))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function createApprovalRound(input: {
  id: string;
  record: OperationalRecord;
  stage: WorkflowApprovalStageDefinition;
  electorate: LocalUser[];
  now: string;
  legacyBootstrap?: boolean;
  completionIntentHash?: string;
}): WorkflowApprovalRound {
  const eligibleUserIds = input.electorate.map((user) => user.id);
  return {
    id:input.id,
    recordId:input.record.id,
    moduleId:input.record.moduleId,
    companyId:input.record.companyId,
    workflowVersion:input.record.workflowVersion ?? 1,
    workflowRouteId:input.record.workflowRouteId ?? 'base',
    stageId:input.stage.id,
    stateId:input.stage.stateId,
    entryRecordVersion:input.record.version,
    mode:approvalModeForStage(input.stage),
    requiredCount:requiredApprovalCount(input.stage, eligibleUserIds.length),
    eligibleUserIds,
    completionIntentHash:input.completionIntentHash,
    blockedUserIds:[],
    votes:[],
    status:'open',
    version:1,
    createdAt:input.now,
    updatedAt:input.now,
    legacyBootstrap:input.legacyBootstrap,
  };
}

/**
 * Store-level approval primitive. Callers keep this inside the same transaction
 * that writes the business transition, history, audit, event and receipt.
 */
export async function castApprovalVoteInTransaction(input: {
  tx: StorageTransaction;
  state: ApprovalResolutionState;
  record: OperationalRecord;
  stage: WorkflowApprovalStageDefinition;
  user: LocalUser;
  decision: WorkflowApprovalVoteDecision;
  reason: string;
  commandId: string;
  voteId: string;
  now: string;
  completionIntentHash?: string;
  /** Module adapter for preserving a legacy single-decision resolver. */
  legacyElectorate?: LocalUser[];
  /** True only after a specialized adapter revalidated its stricter live policy in this transaction. */
  legacyActorEligibilityValidated?: boolean;
}): Promise<{round:WorkflowApprovalRound;completed:boolean;replayed:boolean;created:boolean}> {
  const roundId=approvalRoundIdFor(input.record,input.stage);
  const existing=await input.tx.get<WorkflowApprovalRound>('workflow_approval_rounds',roundId);
  let round=existing;
  if(!round){
    const electorate=!input.stage.approvalMode&&input.legacyElectorate
      ? (input.legacyActorEligibilityValidated?input.legacyElectorate:input.legacyElectorate.filter((user)=>userEligibleForStage(input.state,input.record,input.stage,user)))
      : resolveApprovalElectorate(input.state,input.record,input.stage);
    round=createApprovalRound({
      id:roundId,
      record:input.record,
      stage:input.stage,
      electorate,
      now:input.now,
      legacyBootstrap:!input.stage.approvalMode,
      completionIntentHash:input.decision === 'approve' ? input.completionIntentHash : undefined,
    });
  }else{
    if(round.recordId!==input.record.id||round.entryRecordVersion!==input.record.version||round.stateId!==input.record.status||round.workflowVersion!==(input.record.workflowVersion??1)||round.workflowRouteId!==(input.record.workflowRouteId??'base')){
      throw new Error('دور تأیید با نسخه یا مرحله جاری پرونده هم‌خوان نیست؛ پرونده را تازه‌سازی کنید.');
    }
    if(input.decision === 'approve' && round.completionIntentHash&&input.completionIntentHash&&round.completionIntentHash!==input.completionIntentHash){
      throw new Error('مبلغ، مقصد یا نتیجه نهایی این دور با رأی نخست تفاوت دارد؛ رأی با اطلاعات تازه پذیرفته نشد.');
    }
  }
  if(!(input.legacyActorEligibilityValidated&&!input.stage.approvalMode)&&!approvalUserEligibleForStage(input.state,input.record,input.stage,input.user)){
    throw new Error('نقش، مجوز یا محدوده فعلی شما دیگر برای رأی این مرحله معتبر نیست.');
  }
  const result=appendApprovalVote({round,user:input.user,decision:input.decision,reason:input.reason,commandId:input.commandId,voteId:input.voteId,now:input.now});
  if(!result.replayed)await input.tx.put('workflow_approval_rounds',result.round);
  return {...result,created:!existing};
}

export function approvalRoundProgress(round: WorkflowApprovalRound): ApprovalRoundProgress {
  const approvedUserIds = new Set(round.votes.filter((vote) => vote.decision === 'approve').map((vote) => vote.userId));
  return {
    approvedCount:approvedUserIds.size,
    requiredCount:round.requiredCount,
    electorateSize:round.eligibleUserIds.length,
    pendingUserIds:round.eligibleUserIds.filter((userId) => !round.votes.some((vote) => vote.userId === userId)),
    status:round.status,
  };
}

export function appendApprovalVote(input: {
  round: WorkflowApprovalRound;
  user: LocalUser;
  decision: WorkflowApprovalVoteDecision;
  reason: string;
  commandId: string;
  voteId: string;
  now: string;
}): {round: WorkflowApprovalRound; completed: boolean; replayed: boolean} {
  const existingCommand = input.round.votes.find((vote) => vote.commandId === input.commandId);
  if (existingCommand) {
    const same = existingCommand.userId === input.user.id
      && existingCommand.decision === input.decision
      && existingCommand.reason === input.reason;
    if (!same) throw new Error('شناسه فرمان قبلاً با محتوای دیگری برای این رأی استفاده شده است.');
    return {round:input.round, completed:input.round.status !== 'open', replayed:true};
  }
  if (input.round.status === 'needs_reassignment') throw new Error('این دور تأیید تا تعیین جایگزین معتبر متوقف است.');
  if (input.round.status !== 'open') throw new Error('این دور تأیید بسته شده و رأی تازه پذیرفته نمی‌شود.');
  if (!input.round.eligibleUserIds.includes(input.user.id)) throw new Error('شما عضو فهرست ثابت تأییدکنندگان این دور نیستید.');
  if (input.round.votes.some((vote) => vote.userId === input.user.id)) throw new Error('رأی شما در این دور قبلاً ثبت شده است.');
  const votes = [...input.round.votes, {
    id:input.voteId,
    userId:input.user.id,
    actorId:input.user.actorId,
    decision:input.decision,
    reason:input.reason,
    occurredAt:input.now,
    commandId:input.commandId,
  }];
  const approvalCount = new Set(votes.filter((vote) => vote.decision === 'approve').map((vote) => vote.userId)).size;
  const status: WorkflowApprovalRoundStatus = input.decision === 'reject'
    ? 'rejected'
    : input.decision === 'needs_correction'
      ? 'correction'
      : approvalCount >= input.round.requiredCount
        ? 'approved'
        : 'open';
  const round = {
    ...input.round,
    votes,
    status,
    version:input.round.version + 1,
    updatedAt:input.now,
    ...(status === 'open' ? {} : {closedAt:input.now}),
  };
  return {round, completed:status !== 'open', replayed:false};
}

export function replaceApprovalElectorateMember(input: {
  round: WorkflowApprovalRound;
  departingUserId: string;
  replacementUserId: string;
  now: string;
}): WorkflowApprovalRound {
  if (!input.round.eligibleUserIds.includes(input.departingUserId)) throw new Error('جایگاه موردنظر در فهرست تأییدکنندگان این دور وجود ندارد.');
  if (input.round.eligibleUserIds.includes(input.replacementUserId)) throw new Error('کاربر جایگزین از قبل عضو همین دور تأیید است.');
  if (input.round.votes.some((vote) => vote.userId === input.departingUserId)) throw new Error('رأی ثبت‌شده حذف یا به کاربر دیگری منتقل نمی‌شود.');
  const blockedUserIds=(input.round.blockedUserIds??[]).filter((userId)=>userId!==input.departingUserId);
  return {
    ...input.round,
    eligibleUserIds:input.round.eligibleUserIds.map((userId) => userId === input.departingUserId ? input.replacementUserId : userId),
    blockedUserIds,
    status:blockedUserIds.length ? 'needs_reassignment' : 'open',
    version:input.round.version + 1,
    updatedAt:input.now,
  };
}
