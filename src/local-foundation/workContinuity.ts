import {authorize, operationalRecordResource} from './authorization';
import {chatAdminUserIds, chatKind, chatMemberUserIds, chatOwnerUserId} from './communications';
import {projectMemberUserIds} from './collaborationDomain';
import {userIsEffectiveUnitManager} from './workflowRouting';
import {ERP_MODULES, permissionFor} from './erpCatalog';
import {canUserTakeAdvanceStage, readEmployeeAdvancePayload} from './employeeAdvance';
import type {
  LocalUser, OperationalRecord, OrganizationalPosition, OrganizationalUnit, PersonnelRecord, SecurityRole,
  WorkflowApprovalRound, WorkflowDefinition, WorkContinuityDependencyPreview, WorkContinuityExecutionResult,
  WorkContinuityPlan, WorkContinuityResponsibility, WorkContinuityResponsibilityKind,
  WorkContinuityResolution,
} from './model';
import {approvalStagesForRoute, assignmentModeForStage, routeVariantForBranch} from './workflowPolicy';
import {replaceApprovalElectorateMember} from './workflowApprovals';

export interface WorkContinuitySnapshot {
  users: LocalUser[];
  personnel: PersonnelRecord[];
  positions: OrganizationalPosition[];
  units: OrganizationalUnit[];
  roles: SecurityRole[];
  workflows: WorkflowDefinition[];
  workflowVersions: WorkflowDefinition[];
  approvalRounds?: WorkflowApprovalRound[];
  records: OperationalRecord[];
}

export interface WorkContinuityChanges {
  users: Array<{before: LocalUser; after: LocalUser}>;
  personnel: Array<{before: PersonnelRecord; after: PersonnelRecord}>;
  units: Array<{before: OrganizationalUnit; after: OrganizationalUnit}>;
  records: Array<{before: OperationalRecord; after: OperationalRecord}>;
  approvalRounds: Array<{before: WorkflowApprovalRound; after: WorkflowApprovalRound}>;
  result: WorkContinuityExecutionResult;
}

const TERMINAL_STATES = new Set([
  'done','completed','cancelled','rejected','closed','archived','ended','paid','settled','disposed','contracted',
  'withdrawn','disqualified','expired','delivered','fulfilled','posted','reconciled','reversed','inactive',
]);

export function isTerminalContinuityRecord(record:OperationalRecord):boolean {
  return TERMINAL_STATES.has(record.status) || (record.moduleId==='letter'&&record.status==='sent');
}

export function continuityReassignmentKinds(record:OperationalRecord):WorkContinuityResponsibilityKind[] {
  if(record.payload.needsReassignment!==true)return [];
  const kinds:WorkContinuityResponsibilityKind[]=[];
  if(typeof record.payload.previousCorrectionRecipientUserId==='string')kinds.push(record.moduleId==='recruitment-case'?'recruitment_correction_recipient':'workflow_correction_recipient');
  if(typeof record.payload.previousRecipientUserId==='string')kinds.push('letter_recipient');
  if(typeof record.payload.previousReviewerUserId==='string')kinds.push('letter_reviewer');
  if(typeof record.payload.previousAssigneeUserId==='string')kinds.push(record.moduleId==='letter'?'letter_assignee':record.moduleId==='task'?'project_task_assignee':record.moduleId==='treasury-execution'?'treasury_executor':record.moduleId==='recruitment-case'?'recruitment_assignee':record.moduleId==='offboarding'?'offboarding_assignee':'workflow_assignee');
  if(!kinds.length)kinds.push(record.moduleId==='letter'?'letter_assignee':record.moduleId==='task'?'project_task_assignee':record.moduleId==='treasury-execution'?'treasury_executor':record.moduleId==='recruitment-case'?'recruitment_assignee':record.moduleId==='offboarding'?'offboarding_assignee':'workflow_assignee');
  return kinds;
}

const blockingModes = new Set(['replacement_required','replacement_or_needs_reassignment','return_to_role_queue']);

function payloadStrings(record: OperationalRecord, key: string): string[] {
  const value = record.payload[key];
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string'))] : [];
}

function payloadText(record: OperationalRecord, key: string): string | undefined {
  const value = record.payload[key];
  return typeof value === 'string' && value ? value : undefined;
}

function workflowFor(snapshot: WorkContinuitySnapshot, record: OperationalRecord): WorkflowDefinition | undefined {
  const active = snapshot.workflows.find((item) => item.moduleId === record.moduleId);
  if (!record.workflowVersion || active?.version === record.workflowVersion) return active;
  return snapshot.workflowVersions.find((item) => item.moduleId === record.moduleId && item.version === record.workflowVersion);
}

function currentStage(snapshot: WorkContinuitySnapshot, record: OperationalRecord) {
  const workflow = workflowFor(snapshot, record);
  if (!workflow) return undefined;
  return approvalStagesForRoute(workflow, snapshot.roles, record.workflowRouteId).find((stage) => stage.stateId === record.status);
}

function outgoingTransitions(snapshot: WorkContinuitySnapshot, record: OperationalRecord) {
  return workflowFor(snapshot, record)?.transitions.filter((transition) => transition.from.includes(record.status)) ?? [];
}

function hasCorrectionReturnPath(snapshot: WorkContinuitySnapshot, record: OperationalRecord): boolean {
  const stage = currentStage(snapshot, record);
  return outgoingTransitions(snapshot, record).some((transition) => transition.to === 'needs_correction')
    || Boolean(stage?.decisions.some((decision) => decision === 'needs_correction' || decision === 'reject'));
}

function linkedPersonnel(snapshot: WorkContinuitySnapshot, user: LocalUser): PersonnelRecord | undefined {
  return snapshot.personnel.find((person) => person.id === user.personnelId || person.linkedUserId === user.id);
}

function userForPersonnel(snapshot: WorkContinuitySnapshot, personnelId?: string): LocalUser | undefined {
  if (!personnelId) return undefined;
  const person = snapshot.personnel.find((item) => item.id === personnelId);
  return person ? snapshot.users.find((user) => user.id === person.linkedUserId || user.personnelId === person.id) : undefined;
}

const APPROVED_MANAGERIAL_POSITION_IDS = new Set([
  'position-ceo','position-manager','position-sales-vice','position-sales-manager',
  'position-sales-senior-supervisor','position-sales-supervisor','position-supervisor',
]);

function activeManagerialPosition(snapshot: WorkContinuitySnapshot, user: LocalUser): boolean {
  return snapshot.positions.some((position) => position.id === user.positionId
    && position.status === 'active'
    && APPROVED_MANAGERIAL_POSITION_IDS.has(position.id));
}

function hasRolePermission(snapshot: WorkContinuitySnapshot, user: LocalUser, permission: string): boolean {
  return snapshot.roles.some((role) => role.status === 'active' && user.roleIds.includes(role.id) && role.permissions.includes(permission));
}

function hasActiveRequiredRole(snapshot:WorkContinuitySnapshot,user:LocalUser,roleIds:readonly string[]):boolean{
  return snapshot.roles.some((role)=>role.status==='active'&&roleIds.includes(role.id)&&user.roleIds.includes(role.id));
}

function hasScopedManagementAuthority(snapshot: WorkContinuitySnapshot, user: LocalUser, unitId: string | undefined): boolean {
  if (!activeManagerialPosition(snapshot,user) || (!user.isAdmin && !hasRolePermission(snapshot,user,'organization.personnel.manage'))) return false;
  return authorize({persona:user,permission:'organization.personnel.manage',action:'edit',resource:{id:`management:${unitId??'company'}`,companyId:user.companyId,unitId,ownerId:user.actorId,createdBy:'system',state:'active'}}).allowed;
}

/** One graph for account, personnel-manager and sales-supervisor edges. */
function combinedManagementCycle(snapshot:WorkContinuitySnapshot,report:{userId?:string;personnelId?:string},manager:{userId?:string;personnelId?:string}):boolean{
  const userNode=(id:string)=>`user:${id}`,personNode=(id:string)=>`personnel:${id}`;
  const targets=new Set([report.userId&&userNode(report.userId),report.personnelId&&personNode(report.personnelId)].filter((id):id is string=>Boolean(id)));
  const pending=[manager.userId&&userNode(manager.userId),manager.personnelId&&personNode(manager.personnelId)].filter((id):id is string=>Boolean(id));
  const visited=new Set<string>();
  const next=(node:string):string[]=>{
    const [kind,id]=node.split(':');
    if(kind==='user'){
      const user=snapshot.users.find((item)=>item.id===id);const person=user?linkedPersonnel(snapshot,user):undefined;
      return [user?.managerUserId&&userNode(user.managerUserId),person&&personNode(person.id)].filter((item):item is string=>Boolean(item));
    }
    const person=snapshot.personnel.find((item)=>item.id===id);const user=person?userForPersonnel(snapshot,person.id):undefined;
    return [person?.managerPersonnelId&&personNode(person.managerPersonnelId),person?.salesSupervisorPersonnelId&&personNode(person.salesSupervisorPersonnelId),user&&userNode(user.id)].filter((item):item is string=>Boolean(item));
  };
  while(pending.length){const node=pending.pop()!;if(targets.has(node))return true;if(visited.has(node))continue;visited.add(node);pending.push(...next(node));}
  return false;
}

function candidateCanTakePurchaseStage(snapshot:WorkContinuitySnapshot,candidate:LocalUser,record:OperationalRecord,allowSpecificReplacement=false):boolean{
  const stage=currentStage(snapshot,record);if(!stage)return false;const mode=assignmentModeForStage(stage);
  if(mode==='specific_user'&&!allowSpecificReplacement&&candidate.id!==stage.assigneeUserId)return false;
  if(mode==='branch_manager'){
    if(!record.branchUnitId||!userIsEffectiveUnitManager(snapshot,record.branchUnitId,candidate.id))return false;
  }
  if(stage.roleIds.length&&!hasActiveRequiredRole(snapshot,candidate,stage.roleIds))return false;
  if(stage.scope==='SELF'&&candidate.id!==record.createdByUserId)return false;
  if(stage.scope==='UNIT'&&candidate.unitId!==record.unitId)return false;
  if(stage.scope==='BRANCH'&&candidate.branchUnitId!==record.branchUnitId&&!candidate.isAdmin)return false;
  return true;
}

function candidateCanTakeRecord(
  snapshot: WorkContinuitySnapshot,
  candidate: LocalUser,
  record: OperationalRecord,
  responsibility: WorkContinuityResponsibility,
): boolean {
  if (!responsibility.moduleId) return false;
  const resource = operationalRecordResource(candidate, record);
  if (!authorize({persona:candidate,permission:permissionFor(responsibility.moduleId,'view'),action:'view',resource}).allowed) return false;
  // A letter recipient only consumes the pending letter; it does not need a
  // workflow transition permission.  Reviewers/assignees remain constrained by
  // the pinned outgoing workflow below.
  if (responsibility.kind === 'letter_recipient') return true;
  if (responsibility.kind === 'workflow_correction_recipient' || responsibility.kind === 'recruitment_correction_recipient') {
    return authorize({persona:candidate,permission:permissionFor(responsibility.moduleId,'edit'),action:'edit',resource}).allowed;
  }
  if(record.moduleId==='employee-advance'){
    const stage=currentStage(snapshot,record);if(!stage)return false;const payload=readEmployeeAdvancePayload(record);
    const effectiveStage=assignmentModeForStage(stage)==='specific_user'&&['workflow_assignee','treasury_executor'].includes(responsibility.kind)?{...stage,assigneeUserId:candidate.id}:stage;
    if(!canUserTakeAdvanceStage(candidate,effectiveStage,snapshot,{branchUnitId:payload.branchUnitId,unitId:payload.unitId,beneficiaryUserId:payload.beneficiaryUserId}))return false;
  }
  if(record.moduleId==='purchase-request'&&!candidateCanTakePurchaseStage(snapshot,candidate,record,['workflow_assignee','treasury_executor'].includes(responsibility.kind)))return false;
  const transitions = outgoingTransitions(snapshot, record);
  if (!transitions.length) {
    return authorize({persona:candidate,permission:permissionFor(responsibility.moduleId,'edit'),action:'edit',resource}).allowed;
  }
  return transitions.some((transition) => {
    if (transition.makerChecker && record.createdByActorId === candidate.actorId) return false;
    return authorize({
      persona:candidate,
      permission:transition.permission,
      action:transition.makerChecker ? 'approve' : 'transition',
      resource,
      targetState:transition.to,
    }).allowed;
  });
}

function makeResponsibility(
  target: LocalUser,
  kind: WorkContinuityResponsibilityKind,
  mode: WorkContinuityResponsibility['mode'],
  resourceId: string,
  title: string,
  options: Partial<WorkContinuityResponsibility> = {},
): WorkContinuityResponsibility {
  return {
    id: `${kind}:${resourceId}`,
    kind,
    mode,
    resourceId,
    title,
    companyId: target.companyId,
    ...options,
  };
}

/** Pure, deterministic discovery. It never trusts a previously rendered projection. */
export function discoverWorkContinuity(
  snapshot: WorkContinuitySnapshot,
  targetUserId: string,
  generatedAt = new Date().toISOString(),
): WorkContinuityDependencyPreview {
  const target = snapshot.users.find((user) => user.id === targetUserId);
  if (!target) throw new Error('حساب کاربر برای بررسی تداوم مسئولیت پیدا نشد.');
  const targetPersonnel = snapshot.personnel.find((person) => person.id === target.personnelId || person.linkedUserId === target.id);
  const responsibilities: WorkContinuityResponsibility[] = [];
  const add = (item: WorkContinuityResponsibility) => {
    if (!responsibilities.some((existing) => existing.id === item.id)) responsibilities.push(item);
  };

  snapshot.users.filter((user) => user.companyId === target.companyId && user.status === 'active' && user.managerUserId === target.id)
    .filter((user) => {
      if (!targetPersonnel) return true;
      const person = linkedPersonnel(snapshot, user);
      return !person || person.managerPersonnelId !== targetPersonnel.id;
    })
    .forEach((user) => add(makeResponsibility(target, 'direct_report', 'replacement_required', user.id, `مدیر مستقیم ${user.name}`, {unitId:user.unitId})));
  if (targetPersonnel) {
    snapshot.personnel.filter((person) => person.companyId === target.companyId && person.employmentStatus !== 'ended' && person.managerPersonnelId === targetPersonnel.id)
      .forEach((person) => add(makeResponsibility(target, 'personnel_manager', 'replacement_required', person.id, `مدیر پرونده ${person.firstName} ${person.lastName}`, {unitId:person.unitId})));
    snapshot.personnel.filter((person) => person.companyId === target.companyId && person.employmentStatus !== 'ended' && person.salesSupervisorPersonnelId === targetPersonnel.id)
      .forEach((person) => add(makeResponsibility(target, 'sales_supervisor', 'replacement_required', person.id, `سرپرست فروش ${person.firstName} ${person.lastName}`, {unitId:person.unitId})));
  }
  snapshot.units.filter((unit) => unit.companyId === target.companyId && unit.managerUserId === target.id)
    .forEach((unit) => add(makeResponsibility(target, 'unit_manager', 'replacement_required', unit.id, `مدیر دائم واحد ${unit.name}`, {unitId:unit.id})));
  snapshot.units.filter((unit) => unit.companyId === target.companyId && unit.actingManager?.userId === target.id)
    .forEach((unit) => add(makeResponsibility(target, 'unit_acting_manager', 'replacement_required', unit.id, `جانشین موقت واحد ${unit.name}`, {unitId:unit.id})));

  const open = snapshot.records.filter((record) => record.companyId === target.companyId && !isTerminalContinuityRecord(record));
  for (const record of open) {
    if (record.moduleId === 'project') {
      const owner = record.assigneeUserId ?? record.createdByUserId;
      if (owner === target.id) add(makeResponsibility(target, 'project_owner', 'replacement_required', record.id, `مالک پروژه ${record.title}`, {moduleId:'project',store:'projects',unitId:record.unitId,version:record.version}));
      if (projectMemberUserIds(record).includes(target.id)) add(makeResponsibility(target, 'project_member', 'remove_membership', record.id, `عضویت پروژه ${record.title}`, {moduleId:'project',store:'projects',unitId:record.unitId,version:record.version}));
      continue;
    }
    if (record.moduleId === 'task' && record.assigneeUserId === target.id) {
      add(makeResponsibility(target, 'project_task_assignee', 'replacement_or_needs_reassignment', record.id, `مسئول کار ${record.title}`, {moduleId:'task',store:'tasks',unitId:record.unitId,version:record.version}));
      continue;
    }
    if (record.moduleId === 'chat') {
      if (chatKind(record) === 'group') {
        if (chatOwnerUserId(record) === target.id) add(makeResponsibility(target, 'chat_owner', 'replacement_required', record.id, `مالک گروه ${record.title}`, {moduleId:'chat',store:'chats',unitId:record.unitId,version:record.version}));
        if (chatAdminUserIds(record).includes(target.id)) add(makeResponsibility(target, 'chat_admin', 'remove_membership', record.id, `مدیریت گروه ${record.title}`, {moduleId:'chat',store:'chats',unitId:record.unitId,version:record.version}));
        if (chatMemberUserIds(record).includes(target.id)) add(makeResponsibility(target, 'chat_member', 'remove_membership', record.id, `عضویت گروه ${record.title}`, {moduleId:'chat',store:'chats',unitId:record.unitId,version:record.version}));
      }
      continue;
    }
    if (record.moduleId === 'letter') {
      // A sent letter is a finalized business artifact. Continuity must never
      // rewrite its participants, reviewer, payload or version.
      if (record.status === 'sent') continue;
      if (record.assigneeUserId === target.id) add(makeResponsibility(target, 'letter_assignee', 'replacement_or_needs_reassignment', record.id, `مسئول نامه ${record.trackingCode}`, {moduleId:'letter',store:'letters',unitId:record.unitId,version:record.version}));
      if (payloadStrings(record,'recipientUserIds').includes(target.id)) add(makeResponsibility(target, 'letter_recipient', 'replacement_or_needs_reassignment', record.id, `گیرنده نامه ${record.trackingCode}`, {moduleId:'letter',store:'letters',unitId:record.unitId,version:record.version}));
      if (payloadText(record,'reviewerUserId') === target.id) add(makeResponsibility(target, 'letter_reviewer', 'replacement_or_needs_reassignment', record.id, `بازبین نامه ${record.trackingCode}`, {moduleId:'letter',store:'letters',unitId:record.unitId,version:record.version}));
      continue;
    }
    if (record.moduleId === 'recruitment-case') {
      const correctionRecipient = payloadText(record, 'continuityCorrectionRecipientUserId') ?? record.createdByUserId;
      if (record.status === 'needs_correction' && (record.assigneeUserId === target.id || correctionRecipient === target.id)) {
        add(makeResponsibility(target, 'recruitment_correction_recipient', 'replacement_or_needs_reassignment', record.id, `گیرنده اصلاح پرونده جذب ${record.trackingCode}`, {moduleId:record.moduleId,store:'recruitment_cases',unitId:record.unitId,version:record.version}));
      } else if (record.assigneeUserId === target.id) {
        add(makeResponsibility(target, 'recruitment_assignee', 'replacement_or_needs_reassignment', record.id, `مسئول پرونده جذب ${record.trackingCode}`, {moduleId:record.moduleId,store:'recruitment_cases',unitId:record.unitId,version:record.version,roleIds:currentStage(snapshot,record)?.roleIds}));
      }
      continue;
    }
    if ((record.moduleId === 'employee-advance' || record.moduleId === 'purchase-request') && hasCorrectionReturnPath(snapshot, record)) {
      const correctionRecipient = payloadText(record, 'continuityCorrectionRecipientUserId')
        ?? (record.moduleId === 'employee-advance' ? payloadText(record, 'beneficiaryUserId') : undefined)
        ?? record.createdByUserId;
      if (correctionRecipient === target.id) {
        const module = ERP_MODULES.find((item) => item.id === record.moduleId);
        add(makeResponsibility(target, 'workflow_correction_recipient', 'replacement_or_needs_reassignment', record.id, `گیرنده اصلاح ${record.title}`, {moduleId:record.moduleId,store:module?.store,unitId:record.unitId,version:record.version}));
      }
    }
    if (record.assigneeUserId !== target.id) continue;
    const stage = currentStage(snapshot, record);
    const assignmentMode=stage?assignmentModeForStage(stage):undefined;
    const queue = assignmentMode === 'role_queue';
    const kind: WorkContinuityResponsibilityKind = record.moduleId === 'treasury-execution'
      ? 'treasury_executor'
      : record.moduleId === 'offboarding' ? 'offboarding_assignee' : 'workflow_assignee';
    const mode: WorkContinuityResponsibility['mode'] = queue ? 'return_to_role_queue' : assignmentMode==='specific_user'?'replacement_required':'replacement_or_needs_reassignment';
    const module = ERP_MODULES.find((item) => item.id === record.moduleId);
    add(makeResponsibility(target, kind, mode, record.id, `مسئول ${record.title}`, {moduleId:record.moduleId,store:module?.store,unitId:record.unitId,version:record.version,roleIds:stage?.roleIds}));
  }

  for(const round of (snapshot.approvalRounds??[]).filter((item)=>['open','needs_reassignment'].includes(item.status)&&item.eligibleUserIds.includes(target.id)&&!item.votes.some((vote)=>vote.userId===target.id))){
    const record=open.find((item)=>item.id===round.recordId&&item.moduleId===round.moduleId);if(!record)continue;
    const stage=currentStage(snapshot,record);
    add(makeResponsibility(target,'workflow_approval_voter','replacement_required',record.id,`جایگاه رأی باز ${record.title}`,{moduleId:record.moduleId,store:ERP_MODULES.find((item)=>item.id===record.moduleId)?.store,unitId:record.unitId,version:round.version,roleIds:stage?.roleIds,approvalRoundId:round.id}));
  }

  const allKinds: WorkContinuityResponsibilityKind[] = [
    'direct_report','personnel_manager','sales_supervisor','unit_manager','unit_acting_manager','project_owner','project_member',
    'project_task_assignee','chat_owner','chat_admin','chat_member','letter_assignee','letter_recipient','letter_reviewer',
    'recruitment_assignee','recruitment_correction_recipient','workflow_correction_recipient','workflow_approval_voter','workflow_assignee','treasury_executor','offboarding_assignee',
  ];
  const counts = Object.fromEntries(allKinds.map((kind) => [kind, responsibilities.filter((item) => item.kind === kind).length])) as Record<WorkContinuityResponsibilityKind, number>;
  return {targetUserId:target.id,targetUserName:target.name,generatedAt,responsibilities:responsibilities.sort((a,b)=>a.id.localeCompare(b.id)),counts,blockingCount:responsibilities.filter((item)=>blockingModes.has(item.mode)).length};
}

function resolutionFor(plan: WorkContinuityPlan, responsibility: WorkContinuityResponsibility): WorkContinuityResolution {
  const resolution = plan.resolutions.find((item) => item.responsibilityId === responsibility.id);
  if (!resolution) throw new Error(`برای مسئولیت «${responsibility.title}» تعیین تکلیف ثبت نشده است.`);
  return resolution;
}

function replacementFor(
  snapshot: WorkContinuitySnapshot,
  target: LocalUser,
  responsibility: WorkContinuityResponsibility,
  resolution: WorkContinuityResolution,
): LocalUser {
  if (resolution.action !== 'replace' || !resolution.replacementUserId) throw new Error(`برای «${responsibility.title}» جانشین فعال انتخاب کنید.`);
  const replacement = snapshot.users.find((user) => user.id === resolution.replacementUserId && user.status === 'active');
  if (!replacement || replacement.id === target.id || replacement.companyId !== target.companyId) throw new Error(`جانشین «${responsibility.title}» باید کاربر فعال همان شرکت باشد.`);
  const replacementPersonnel = linkedPersonnel(snapshot, replacement);
  if (['direct_report','personnel_manager','sales_supervisor','unit_manager','unit_acting_manager'].includes(responsibility.kind)) {
    if (!replacementPersonnel || replacementPersonnel.companyId !== target.companyId || replacementPersonnel.employmentStatus !== 'active') {
      throw new Error(`جانشین «${responsibility.title}» باید پرونده پرسنلی فعال همان شرکت داشته باشد.`);
    }
  }
  if (responsibility.kind === 'direct_report') {
    const report = snapshot.users.find((user) => user.id === responsibility.resourceId);
    const reportPersonnel = linkedPersonnel(snapshot, report);
    if (!report || combinedManagementCycle(snapshot,{userId:report.id,personnelId:reportPersonnel?.id},{userId:replacement.id,personnelId:replacementPersonnel?.id})) throw new Error(`جانشین «${responsibility.title}» باعث حلقه در زنجیره مدیریت می‌شود.`);
  }
  if (responsibility.kind === 'personnel_manager' || responsibility.kind === 'sales_supervisor') {
    const report = snapshot.personnel.find((person) => person.id === responsibility.resourceId);
    if (!report || !replacementPersonnel) throw new Error(`جانشین «${responsibility.title}» پرونده پرسنلی معتبر ندارد.`);
    const reportUser = userForPersonnel(snapshot, report.id);
    if (combinedManagementCycle(snapshot,{userId:reportUser?.id,personnelId:report.id},{userId:replacement.id,personnelId:replacementPersonnel.id})) throw new Error(`جانشین «${responsibility.title}» باعث حلقه در زنجیره مدیریت می‌شود.`);
  }
  if (responsibility.unitId
    && !['unit_manager','unit_acting_manager'].includes(responsibility.kind)
    && ['UNIT','TEAM','SELF','RECORD'].includes(replacement.scope)
    && replacement.unitId !== responsibility.unitId) throw new Error(`جانشین «${responsibility.title}» خارج از محدوده واحد مربوط است.`);
  if (['direct_report','personnel_manager','sales_supervisor'].includes(responsibility.kind) && !hasScopedManagementAuthority(snapshot,replacement,responsibility.unitId)) throw new Error(`جانشین «${responsibility.title}» باید سمت مدیریتی فعال و نقش مصوب مدیریت پرسنل در همین محدوده داشته باشد.`);
  if (responsibility.kind === 'personnel_manager' && replacementPersonnel?.unitId !== responsibility.unitId) throw new Error(`مدیر پرونده باید پرسنل فعال همان واحد باشد.`);
  if (responsibility.kind === 'sales_supervisor') {
    const report = snapshot.personnel.find((person) => person.id === responsibility.resourceId);
    const reportBranch=report?.branchUnitId??report?.salesBranchUnitId;
    const replacementBranch=replacementPersonnel?.branchUnitId??replacementPersonnel?.salesBranchUnitId;
    const branchAuthority=replacement.advanceBranchIds?.includes('*')||Boolean(reportBranch&&replacement.advanceBranchIds?.includes(reportBranch));
    if (!report || !replacementPersonnel || !reportBranch || (replacementBranch !== reportBranch&&!branchAuthority)) throw new Error('سرپرست فروش جانشین باید در همان شعبه یا دارای اختیار مصوب همان شعبه باشد.');
  }
  if (responsibility.kind === 'unit_manager' || responsibility.kind === 'unit_acting_manager') {
    const unit = snapshot.units.find((item) => item.id === responsibility.resourceId);
    if (!unit || !replacementPersonnel) throw new Error(`واحد مربوط به «${responsibility.title}» پیدا نشد.`);
    if (responsibility.kind === 'unit_manager') {
      if (unit.type === 'شعبه') {
        const workflow = snapshot.workflows.find((item) => item.moduleId === 'employee-advance');
        const routeId=workflow?routeVariantForBranch(workflow,unit.id)?.id:undefined;
        const stage=workflow?approvalStagesForRoute(workflow,snapshot.roles,routeId).find((item)=>item.stateId==='branch_review'):undefined;
        const postReplacementUnits=snapshot.units.map((item)=>item.id===unit.id?{...item,managerUserId:replacement.id}:item);
        if (!stage || !canUserTakeAdvanceStage(replacement,stage,{...snapshot,units:postReplacementUnits},{branchUnitId:unit.id,unitId:replacementPersonnel.unitId,beneficiaryUserId:undefined})) throw new Error('مدیر شعبه جانشین باید نقش و سیاست مصوب بررسی همان شعبه را داشته باشد.');
        if (replacement.branchUnitId !== unit.id && replacementPersonnel.branchUnitId !== unit.id) throw new Error('مدیر شعبه جانشین باید در همان شعبه فعال باشد.');
      } else {
        if (replacementPersonnel.unitId !== unit.id) throw new Error('مدیر دائم جانشین باید پرسنل فعال همان واحد باشد.');
        if(!activeManagerialPosition(snapshot,replacement)||(!replacement.isAdmin&&!hasRolePermission(snapshot,replacement,'organization.units.manage'))||!authorize({persona:replacement,permission:'organization.units.manage',action:'edit',resource:{id:unit.id,companyId:replacement.companyId,unitId:unit.id,ownerId:replacement.actorId,createdBy:'system',state:unit.status}}).allowed)throw new Error('مدیر دائم جانشین باید سمت مدیریتی فعال و مجوز مصوب مدیریت همان واحد را داشته باشد.');
      }
    } else if (!unit.parentId || replacementPersonnel.unitId !== unit.parentId) throw new Error('جانشین موقت باید پرسنل فعال واحد بالادست مستقیم باشد.');
  }
  if (responsibility.roleIds?.length && !hasActiveRequiredRole(snapshot,replacement,responsibility.roleIds)) throw new Error(`جانشین «${responsibility.title}» نقش فعال مرحله جاری را ندارد.`);
  if (responsibility.kind === 'workflow_approval_voter') {
    const round=responsibility.approvalRoundId
      ? (snapshot.approvalRounds??[]).find((item)=>item.id===responsibility.approvalRoundId)
      : undefined;
    if (!round) throw new Error(`دور تأیید مربوط به «${responsibility.title}» پیدا نشد.`);
    // Canonical helper rejects duplicate seats and voted seats. Running it in
    // validation also keeps the UI candidate list identical to the write path.
    replaceApprovalElectorateMember({round,departingUserId:target.id,replacementUserId:replacement.id,now:round.updatedAt});
  }
  const record = snapshot.records.find((item) => item.id === responsibility.resourceId);
  if (record && responsibility.moduleId) {
    if (!candidateCanTakeRecord(snapshot,replacement,record,responsibility)) throw new Error(`جانشین «${responsibility.title}» مجوز دقیق اقدام بعدی یا محدوده رکورد را ندارد.`);
  }
  return replacement;
}

function hasEligibleQueueCandidate(snapshot: WorkContinuitySnapshot, target: LocalUser, responsibility: WorkContinuityResponsibility): boolean {
  const record = snapshot.records.find((item) => item.id === responsibility.resourceId);
  if (!record || !responsibility.moduleId || !responsibility.roleIds?.length) return false;
  return snapshot.users.some((candidate) => {
    if (candidate.id === target.id || candidate.status !== 'active' || candidate.companyId !== target.companyId) return false;
    // Queue eligibility is a business role assignment, not an administrator
    // override. Admin access alone must never make somebody the next approver.
    if (!hasActiveRequiredRole(snapshot,candidate,responsibility.roleIds!)) return false;
    return candidateCanTakeRecord(snapshot,candidate,record,responsibility);
  });
}

/** Shared with the UI; the transaction re-runs this helper against raw rows. */
export function eligibleWorkContinuityReplacementUsers(
  snapshot: WorkContinuitySnapshot,
  targetUserId: string,
  responsibility: WorkContinuityResponsibility,
): LocalUser[] {
  const target = snapshot.users.find((user) => user.id === targetUserId);
  if (!target) return [];
  return snapshot.users.filter((candidate) => {
    try {
      replacementFor(snapshot,target,responsibility,{responsibilityId:responsibility.id,action:'replace',replacementUserId:candidate.id});
      return true;
    } catch {
      return false;
    }
  });
}

export function canResolveContinuityReassignment(snapshot:WorkContinuitySnapshot,record:OperationalRecord,candidate:LocalUser,kind:WorkContinuityResponsibilityKind):boolean{
  if(isTerminalContinuityRecord(record)||!continuityReassignmentKinds(record).includes(kind)||candidate.status!=='active'||candidate.companyId!==record.companyId)return false;
  const responsibility=makeResponsibility(candidate,kind,'replacement_or_needs_reassignment',record.id,`رفع تخصیص ${record.title}`,{moduleId:record.moduleId,store:ERP_MODULES.find((item)=>item.id===record.moduleId)?.store,unitId:record.unitId,version:record.version,roleIds:currentStage(snapshot,record)?.roleIds});
  if(kind==='project_task_assignee'){
    const projectId=payloadText(record,'projectId');const project=projectId?snapshot.records.find((item)=>item.id===projectId&&item.moduleId==='project'):undefined;
    if(projectId&&(!project||!projectMemberUserIds(project).includes(candidate.id)||!authorize({persona:candidate,permission:permissionFor('project','view'),action:'view',resource:operationalRecordResource(candidate,project)}).allowed))return false;
  }
  return candidateCanTakeRecord(snapshot,candidate,record,responsibility);
}

function snapshotWithPlannedStructure(snapshot:WorkContinuitySnapshot,preview:WorkContinuityDependencyPreview,plan:WorkContinuityPlan):WorkContinuitySnapshot{
  const users=new Map(snapshot.users.map((item)=>[item.id,structuredClone(item)]));
  const personnel=new Map(snapshot.personnel.map((item)=>[item.id,structuredClone(item)]));
  const units=new Map(snapshot.units.map((item)=>[item.id,structuredClone(item)]));
  for(const responsibility of preview.responsibilities){
    if(!['unit_manager','direct_report','personnel_manager','sales_supervisor'].includes(responsibility.kind))continue;
    const resolution=plan.resolutions.find((item)=>item.responsibilityId===responsibility.id);
    if(resolution?.action!=='replace'||!resolution.replacementUserId)continue;
    const replacement=users.get(resolution.replacementUserId);if(!replacement)continue;
    const replacementPersonnel=[...personnel.values()].find((person)=>person.id===replacement.personnelId||person.linkedUserId===replacement.id);
    if(responsibility.kind==='unit_manager'){
      const unit=units.get(responsibility.resourceId);if(unit)unit.managerUserId=replacement.id;
    }else if(responsibility.kind==='direct_report'){
      const report=users.get(responsibility.resourceId);if(report)report.managerUserId=replacement.id;
    }else{
      const report=personnel.get(responsibility.resourceId);if(!report||!replacementPersonnel)continue;
      if(responsibility.kind==='personnel_manager'){
        report.managerPersonnelId=replacementPersonnel.id;
        const reportUser=[...users.values()].find((user)=>user.personnelId===report.id||user.id===report.linkedUserId);if(reportUser)reportUser.managerUserId=replacement.id;
      }else report.salesSupervisorPersonnelId=replacementPersonnel.id;
    }
  }
  return {...snapshot,users:[...users.values()],personnel:[...personnel.values()],units:[...units.values()]};
}

/** Validates a pinned plan against a fresh discovery. No storage writes occur here. */
export function validateWorkContinuityPlan(snapshot: WorkContinuitySnapshot, preview: WorkContinuityDependencyPreview, plan: WorkContinuityPlan): void {
  const target = snapshot.users.find((user) => user.id === preview.targetUserId);
  if (!target || plan.schemaVersion !== 1 || plan.targetUserId !== target.id) throw new Error('برنامه تداوم مسئولیت با حساب انتخاب‌شده سازگار نیست.');
  if (plan.reason.trim().length < 3) throw new Error('دلیل برنامه تداوم مسئولیت الزامی است.');
  const currentIds = preview.responsibilities.map((item) => item.id).sort();
  const plannedIds = [...new Set(plan.responsibilityIds)].sort();
  if (JSON.stringify(currentIds) !== JSON.stringify(plannedIds)) throw new Error('مسئولیت‌های کاربر از زمان تهیه برنامه تغییر کرده است؛ پیش‌نمایش را تازه کنید.');
  if (plan.responsibilityIds.length !== plannedIds.length || plan.resolutions.length !== currentIds.length) throw new Error('برنامه تداوم دارای مسئولیت یا تصمیم تکراری/ناقص است؛ پیش‌نمایش را تازه کنید.');
  const resolutionIds = plan.resolutions.map((item) => item.responsibilityId);
  if (new Set(resolutionIds).size !== resolutionIds.length || JSON.stringify([...resolutionIds].sort()) !== JSON.stringify(currentIds)) throw new Error('برای هر مسئولیت باید دقیقاً یک تصمیم سازگار ثبت شود.');
  const effectiveSnapshot=snapshotWithPlannedStructure(snapshot,preview,plan);
  for (const responsibility of preview.responsibilities) {
    const resolution = resolutionFor(plan, responsibility);
    if (responsibility.mode === 'replacement_required') replacementFor(effectiveSnapshot,target,responsibility,resolution);
    else if (responsibility.mode === 'replacement_or_needs_reassignment') {
      if (resolution.action === 'replace') replacementFor(effectiveSnapshot,target,responsibility,resolution);
      else if (resolution.action !== 'mark_needs_reassignment') throw new Error(`«${responsibility.title}» باید جانشین بگیرد یا صریحاً نیازمند تخصیص مجدد شود.`);
    } else if (responsibility.mode === 'return_to_role_queue') {
      if (resolution.action !== 'return_to_queue') throw new Error(`«${responsibility.title}» باید به صف نقش فعال بازگردد.`);
      if (!hasEligibleQueueCandidate(snapshot,target,responsibility)) throw new Error(`برای صف نقش «${responsibility.title}» هیچ کاربر فعال و مجاز دیگری وجود ندارد.`);
    }
    else if (responsibility.mode === 'remove_membership' && resolution.action !== 'remove_membership') throw new Error(`عضویت «${responsibility.title}» باید صریحاً خاتمه یابد.`);
    else if (responsibility.mode === 'preserve_history' && resolution.action !== 'preserve_history') throw new Error(`سابقه «${responsibility.title}» باید بدون تغییر حفظ شود.`);
  }
}

function replaceStrings(values: string[], targetId: string, replacementId?: string): string[] {
  return [...new Set(values.flatMap((value) => value === targetId ? (replacementId ? [replacementId] : []) : [value]))];
}

/** Applies an already validated plan to cloned rows and returns a write-set. */
export function applyWorkContinuityPlan(
  snapshot: WorkContinuitySnapshot,
  preview: WorkContinuityDependencyPreview,
  plan: WorkContinuityPlan,
  actor: LocalUser,
  now: string,
): WorkContinuityChanges {
  validateWorkContinuityPlan(snapshot, preview, plan);
  const effectiveSnapshot=snapshotWithPlannedStructure(snapshot,preview,plan);
  const target = snapshot.users.find((user) => user.id === preview.targetUserId)!;
  const userRows = new Map(snapshot.users.map((item) => [item.id, structuredClone(item)]));
  const personnelRows = new Map(snapshot.personnel.map((item) => [item.id, structuredClone(item)]));
  const unitRows = new Map(snapshot.units.map((item) => [item.id, structuredClone(item)]));
  const recordRows = new Map(snapshot.records.map((item) => [item.id, structuredClone(item)]));
  const approvalRoundRows=new Map((snapshot.approvalRounds??[]).map((item)=>[item.id,structuredClone(item)]));
  const changedUsers = new Set<string>(), changedPersonnel = new Set<string>(), changedUnits = new Set<string>(), changedRecords = new Set<string>(), changedApprovalRounds=new Set<string>(), needs = new Set<string>();
  for (const responsibility of preview.responsibilities) {
    const resolution = resolutionFor(plan,responsibility);
    const replacement = resolution.action === 'replace' ? replacementFor(effectiveSnapshot,target,responsibility,resolution) : undefined;
    const replacementPersonnel = replacement ? snapshot.personnel.find((person) => person.id === replacement.personnelId || person.linkedUserId === replacement.id) : undefined;
    if (responsibility.kind === 'direct_report') {
      const row=userRows.get(responsibility.resourceId)!;row.managerUserId=replacement!.id;changedUsers.add(row.id);
    } else if (responsibility.kind === 'personnel_manager' || responsibility.kind === 'sales_supervisor') {
      if (!replacementPersonnel) throw new Error(`جانشین «${responsibility.title}» پرونده پرسنلی فعال ندارد.`);
      const row=personnelRows.get(responsibility.resourceId)!;
      if(responsibility.kind==='personnel_manager')row.managerPersonnelId=replacementPersonnel.id;else row.salesSupervisorPersonnelId=replacementPersonnel.id;
      row.updatedAt=now;changedPersonnel.add(row.id);
      const linked=row.linkedUserId?userRows.get(row.linkedUserId):undefined;if(linked&&responsibility.kind==='personnel_manager'){linked.managerUserId=replacement!.id;changedUsers.add(linked.id);}
    } else if (responsibility.kind === 'unit_manager' || responsibility.kind === 'unit_acting_manager') {
      const row=unitRows.get(responsibility.resourceId)!;
      if(responsibility.kind==='unit_manager')row.managerUserId=replacement!.id;
      else row.actingManager={...(row.actingManager!),userId:replacement!.id,assignedAt:now,assignedByActorId:actor.actorId};
      row.updatedAt=now;changedUnits.add(row.id);
    } else if(responsibility.kind==='workflow_approval_voter'){
      const round=responsibility.approvalRoundId?approvalRoundRows.get(responsibility.approvalRoundId):undefined;
      if(!round||round.votes.some((vote)=>vote.userId===target.id))throw new Error(`جایگاه رأی «${responsibility.title}» دیگر قابل انتقال نیست.`);
      approvalRoundRows.set(round.id,replaceApprovalElectorateMember({round,departingUserId:target.id,replacementUserId:replacement!.id,now}));
      changedApprovalRounds.add(round.id);
    } else {
      const row=recordRows.get(responsibility.resourceId);if(!row)continue;
      if(responsibility.kind==='project_owner'){
        row.assigneeUserId=replacement!.id;row.payload.memberUserIds=replaceStrings(projectMemberUserIds(row),target.id,replacement!.id);
      } else if(responsibility.kind==='project_member')row.payload.memberUserIds=replaceStrings(projectMemberUserIds(row),target.id);
      else if(responsibility.kind==='project_task_assignee'){
        row.assigneeUserId=replacement?.id;row.payload.needsReassignment=!replacement;row.payload.previousAssigneeUserId=target.id;if(!replacement)needs.add(row.id);
      } else if(['chat_owner','chat_admin','chat_member'].includes(responsibility.kind)){
        const owner=responsibility.kind==='chat_owner'?replacement!.id:chatOwnerUserId(row);
        row.assigneeUserId=owner;
        row.payload.ownerUserId=owner;
        row.payload.memberUserIds=replaceStrings(chatMemberUserIds(row),target.id,responsibility.kind==='chat_owner'?replacement!.id:undefined);
        row.payload.adminUserIds=replaceStrings(chatAdminUserIds(row),target.id,responsibility.kind==='chat_owner'?replacement!.id:undefined);
      } else if(responsibility.kind==='letter_recipient'){
        row.payload.recipientUserIds=replaceStrings(payloadStrings(row,'recipientUserIds'),target.id,replacement?.id);if(!replacement){row.payload.needsReassignment=true;row.payload.previousRecipientUserId=target.id;needs.add(row.id);}
      } else if(responsibility.kind==='letter_reviewer'){
        row.payload.reviewerUserId=replacement?.id??null;if(!replacement){row.payload.needsReassignment=true;row.payload.previousReviewerUserId=target.id;needs.add(row.id);}
      } else if(responsibility.kind==='recruitment_correction_recipient'){
        row.assigneeUserId=replacement?.id;row.payload.continuityCorrectionRecipientUserId=replacement?.id??null;if(!replacement){row.payload.needsReassignment=true;row.payload.previousCorrectionRecipientUserId=target.id;needs.add(row.id);}
      } else if(responsibility.kind==='workflow_correction_recipient'){
        row.payload.continuityCorrectionRecipientUserId=replacement?.id??null;
        if(!replacement){row.payload.needsReassignment=true;row.payload.previousCorrectionRecipientUserId=target.id;needs.add(row.id);}
      } else {
        row.assigneeUserId=replacement?.id;
        const stage=currentStage(effectiveSnapshot,row);
        if(replacement&&stage&&assignmentModeForStage(stage)==='specific_user'){
          row.payload.continuitySpecificAssigneeUserId=replacement.id;
          row.payload.continuitySpecificAssigneeState=row.status;
        }
        if(resolution.action==='return_to_queue')row.payload.continuityQueueReturnedAt=now;
        if(resolution.action==='mark_needs_reassignment'){row.payload.needsReassignment=true;row.payload.previousAssigneeUserId=target.id;needs.add(row.id);}
      }
      row.updatedByActorId=actor.actorId;row.updatedAt=now;if(!changedRecords.has(row.id))row.version+=1;changedRecords.add(row.id);
    }
  }

  return {
    users:[...changedUsers].map((id)=>({before:snapshot.users.find((item)=>item.id===id)!,after:userRows.get(id)!})),
    personnel:[...changedPersonnel].map((id)=>({before:snapshot.personnel.find((item)=>item.id===id)!,after:personnelRows.get(id)!})),
    units:[...changedUnits].map((id)=>({before:snapshot.units.find((item)=>item.id===id)!,after:unitRows.get(id)!})),
    records:[...changedRecords].map((id)=>({before:snapshot.records.find((item)=>item.id===id)!,after:recordRows.get(id)!})),
    approvalRounds:[...changedApprovalRounds].map((id)=>({before:(snapshot.approvalRounds??[]).find((item)=>item.id===id)!,after:approvalRoundRows.get(id)!})),
    result:{targetUserId:target.id,appliedResponsibilityIds:preview.responsibilities.map((item)=>item.id),changedResourceIds:[...new Set([...changedUsers,...changedPersonnel,...changedUnits,...changedRecords,...changedApprovalRounds])],needsReassignmentResourceIds:[...needs],invalidatedSession:false},
  };
}

export function defaultWorkContinuityPlan(
  preview: WorkContinuityDependencyPreview,
  targetUserVersionToken: string,
  reason: string,
  replacementUserId?: string,
): WorkContinuityPlan {
  return {
    schemaVersion:1,targetUserId:preview.targetUserId,targetUserVersionToken,generatedAt:preview.generatedAt,reason,
    responsibilityIds:preview.responsibilities.map((item)=>item.id),
    resolutions:preview.responsibilities.map((item) => ({
      responsibilityId:item.id,
      action:item.mode==='replacement_required' ? 'replace'
        : item.mode==='replacement_or_needs_reassignment' ? (replacementUserId ? 'replace' : 'mark_needs_reassignment')
        : item.mode==='return_to_role_queue' ? 'return_to_queue'
        : item.mode==='remove_membership' ? 'remove_membership' : 'preserve_history',
      replacementUserId:item.mode==='replacement_required'||(item.mode==='replacement_or_needs_reassignment'&&replacementUserId)?replacementUserId:undefined,
    })),
  };
}
