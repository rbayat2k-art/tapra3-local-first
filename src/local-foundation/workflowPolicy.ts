import type {
  FoundationState,
  LocalUser,
  OperationalRecord,
  SecurityRole,
  WorkflowApprovalStageDefinition,
  WorkflowDefinition,
  WorkflowRouteVariantDefinition,
  WorkflowStageDecision,
} from './model';
import type {ErpModuleDefinition} from './erpCatalog';

export const BASE_WORKFLOW_ROUTE_ID = 'base';

const DECISIONS: WorkflowStageDecision[] = ['approve','reject','needs_correction','return_previous','handoff'];

const ROLE_HINTS: Record<string, string[]> = {
  'purchase-request': ['role-purchase-approver','role-purchase-approver','role-treasury-executor-v1'],
  'employee-advance': ['role-advance-branch-manager','role-advance-accounting-reviewer','role-sales-advance-approver','role-treasury-executor-v1'],
  'treasury-execution': ['role-treasury-executor-v1','role-treasury-manager-v1'],
};

const MANAGED_SEQUENCE_EDGES: Record<string, Array<[string,string]>> = {
  'purchase-request': [['draft','submitted'],['submitted','purchase_review'],['purchase_review','sent_to_treasury']],
  'employee-advance': [['draft','branch_review'],['branch_review','accounting_review'],['accounting_review','final_review'],['final_review','sent_to_treasury']],
  'treasury-execution': [['queued','payment_recorded'],['payment_recorded','verified']],
};

const EMPLOYEE_ADVANCE_ORDER = ['branch_review','accounting_review','final_review','sent_to_treasury'];
const titleForState = (workflow: WorkflowDefinition, stateId: string) => workflow.stateLabels[stateId] ?? stateId;
const cloneStages = (stages: WorkflowApprovalStageDefinition[]) => stages.map((stage) => ({...stage, roleIds:[...stage.roleIds], decisions:[...stage.decisions]}));

export function assignmentModeForStage(stage: WorkflowApprovalStageDefinition) {
  return stage.assignmentMode ?? (stage.stateId === 'branch_review' ? 'branch_manager' : 'role_queue');
}

export function defaultApprovalStages(workflow: WorkflowDefinition, roles: SecurityRole[]): WorkflowApprovalStageDefinition[] {
  const hinted = (ROLE_HINTS[workflow.moduleId] ?? []).filter((roleId) => roles.some((role) => role.id === roleId));
  const states = workflow.moduleId === 'employee-advance'
    ? EMPLOYEE_ADVANCE_ORDER
    : workflow.moduleId === 'purchase-request'
      ? ['submitted','purchase_review','sent_to_treasury']
      : workflow.moduleId === 'treasury-execution'
        ? ['queued','payment_recorded','verified']
        : [...new Set(workflow.transitions.filter((transition) => transition.makerChecker || transition.handoffModuleId).map((transition) => transition.to))];
  return states.map((stateId, index) => ({
    id: `${workflow.moduleId}-stage-${index + 1}`,
    title: titleForState(workflow, stateId),
    stateId,
    roleIds: hinted[index] ? [hinted[index]] : [],
    scope: stateId.includes('branch') || (workflow.moduleId === 'employee-advance' && stateId === 'final_review') ? 'BRANCH' : 'COMPANY',
    decisions: stateId === 'sent_to_treasury' || stateId === 'payment_recorded'
      ? ['approve','handoff']
      : stateId === 'final_review'
        ? ['approve','reject','needs_correction','return_previous']
        : ['approve','reject','needs_correction'],
    required: true,
    allowSelfApproval: workflow.moduleId === 'employee-advance' && stateId === 'final_review',
    assignmentMode: stateId === 'branch_review' ? 'branch_manager' : 'role_queue',
  }));
}

export function approvalStagesFor(workflow: WorkflowDefinition, roles: SecurityRole[]): WorkflowApprovalStageDefinition[] {
  return cloneStages(workflow.approvalStages?.length ? workflow.approvalStages : defaultApprovalStages(workflow, roles));
}

export function routeVariantForBranch(workflow: WorkflowDefinition, branchUnitId?: string): WorkflowRouteVariantDefinition | undefined {
  if (!branchUnitId) return undefined;
  return [...(workflow.routeVariants ?? [])]
    .filter((variant) => variant.status === 'active' && variant.branchUnitIds.includes(branchUnitId))
    .sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title, 'fa') || a.id.localeCompare(b.id))[0];
}

export function approvalStagesForRoute(
  workflow: WorkflowDefinition,
  roles: SecurityRole[],
  routeId?: string,
): WorkflowApprovalStageDefinition[] {
  if (routeId && routeId !== BASE_WORKFLOW_ROUTE_ID) {
    const variant = workflow.routeVariants?.find((item) => item.id === routeId);
    if (variant) return cloneStages(variant.approvalStages);
    throw new Error(`مسیر تاریخی گردش‌کار «${routeId}» برای نسخه ${workflow.version} پیدا نشد؛ پرونده تا ترمیم سیاست قابل ادامه نیست.`);
  }
  return approvalStagesFor(workflow, roles);
}

export function selectWorkflowRoute(workflow: WorkflowDefinition, roles: SecurityRole[], branchUnitId?: string) {
  const variant = routeVariantForBranch(workflow, branchUnitId);
  return variant
    ? {id: variant.id, title: variant.title, allowSelfSubmission: variant.allowSelfSubmission ?? true, approvalStages: cloneStages(variant.approvalStages)}
    : {id: BASE_WORKFLOW_ROUTE_ID, title: 'مسیر پایه شرکت', allowSelfSubmission: workflow.allowSelfSubmission ?? true, approvalStages: approvalStagesFor(workflow, roles)};
}

export function activeWorkflowFor(state: Pick<FoundationState,'workflows'>, module: ErpModuleDefinition): WorkflowDefinition {
  return state.workflows.find((workflow) => workflow.moduleId === module.id) ?? module.workflow;
}

/** پرونده در جریان با همان نسخه‌ای ادامه می‌یابد که هنگام ایجاد انتخاب شده است. */
export function workflowForRecord(
  state: Pick<FoundationState,'workflows'> & Partial<Pick<FoundationState,'workflowVersions'>>,
  module: ErpModuleDefinition,
  record: Pick<OperationalRecord,'workflowVersion'>,
): WorkflowDefinition {
  const active = activeWorkflowFor(state, module);
  if (!record.workflowVersion || record.workflowVersion === active.version) return active;
  const historical = state.workflowVersions?.find((workflow) => workflow.moduleId === module.id && workflow.version === record.workflowVersion);
  if (historical) return historical;
  throw new Error(`نسخه تاریخی ${record.workflowVersion} گردش‌کار «${module.id}» پیدا نشد؛ پرونده تا ترمیم سیاست قابل ادامه نیست.`);
}

export function workflowWithActivePolicy(state: Pick<FoundationState,'workflows'>, module: ErpModuleDefinition): ErpModuleDefinition {
  return {...module, workflow: activeWorkflowFor(state, module)};
}

function validateStages(
  workflow: WorkflowDefinition,
  stages: WorkflowApprovalStageDefinition[],
  roles: SecurityRole[],
  label: string,
  users: LocalUser[] = [],
): string[] {
  const errors: string[] = [];
  const roleIds = new Set(roles.filter((role) => role.status === 'active').map((role) => role.id));
  const stageIds = new Set<string>();
  stages.forEach((stage, index) => {
    const row = `${label}، مرحله ${index + 1}`;
    if (!stage.id.trim() || stageIds.has(stage.id)) errors.push(`${row}: شناسه مرحله باید یکتا باشد.`);
    stageIds.add(stage.id);
    if (!stage.title.trim()) errors.push(`${row}: عنوان مرحله الزامی است.`);
    if (!(stage.stateId in workflow.stateLabels)) errors.push(`${row}: وضعیت انتخاب‌شده جزو ماشین وضعیت مصوب نیست.`);
    if (stage.required && !stage.roleIds.length) errors.push(`${row}: برای مرحله الزامی حداقل یک نقش انتخاب کنید.`);
    if (stage.roleIds.some((id) => !roleIds.has(id))) errors.push(`${row}: یکی از نقش‌ها غیرفعال یا حذف شده است.`);
    if (!stage.decisions.length) errors.push(`${row}: حداقل یک تصمیم مجاز انتخاب کنید.`);
    if (stage.decisions.some((decision) => !DECISIONS.includes(decision))) errors.push(`${row}: تصمیم ناشناخته ثبت شده است.`);
    const assignmentMode = assignmentModeForStage(stage);
    if (assignmentMode === 'specific_user' && !stage.assigneeUserId) errors.push(`${row}: کاربر مسئول این مرحله را انتخاب کنید.`);
    if (assignmentMode === 'specific_user' && stage.assigneeUserId && users.length && !users.some((user) => user.id === stage.assigneeUserId && user.status === 'active')) errors.push(`${row}: کاربر مسئول انتخاب‌شده فعال نیست.`);
    if (assignmentMode === 'branch_manager' && stage.scope !== 'BRANCH') errors.push(`${row}: روش «مدیر همان شعبه» فقط با محدوده شعبه قابل استفاده است.`);
  });

  if (workflow.moduleId === 'employee-advance') {
    const indexes = stages.map((stage) => EMPLOYEE_ADVANCE_ORDER.indexOf(stage.stateId));
    if (indexes.some((index) => index < 0) || indexes.some((index, row) => row > 0 && index <= indexes[row - 1])) {
      errors.push(`${label}: ترتیب مراحل مساعده باید «مدیر شعبه ← حسابداری ← تأییدکننده اصلی ← خزانه» باشد؛ حذف مرحله اختیاری مجاز است اما جابه‌جایی خیر.`);
    }
    if (!stages.some((stage) => stage.stateId === 'accounting_review')) errors.push(`${label}: کنترل حسابداری باید در مسیر وجود داشته باشد.`);
    if (!stages.some((stage) => stage.stateId === 'sent_to_treasury')) errors.push(`${label}: مرحله ارسال به خزانه باید در مسیر وجود داشته باشد.`);
    return errors;
  }

  const sequence = [workflow.initialState, ...stages.map((stage) => stage.stateId)];
  sequence.slice(1).forEach((toState, index) => {
    const fromState = sequence[index];
    if (fromState === toState) return;
    const managed = MANAGED_SEQUENCE_EDGES[workflow.moduleId]?.some(([from,to]) => from === fromState && to === toState);
    const declared = workflow.transitions.some((transition) => transition.from.includes(fromState) && transition.to === toState);
    if (!managed && !declared) errors.push(`${label}: ترتیب مرحله ${index + 1} به ${index + 2} با ماشین وضعیت محافظت‌شده سازگار نیست.`);
  });
  return errors;
}

export function validateWorkflowPolicy(
  workflow: WorkflowDefinition,
  stages: WorkflowApprovalStageDefinition[],
  roles: SecurityRole[],
  routeVariants: WorkflowRouteVariantDefinition[] = [],
  users: LocalUser[] = [],
): string[] {
  const errors = validateStages(workflow, stages, roles, 'مسیر پایه شرکت', users);
  const ids = new Set<string>();
  const activeBranches = new Map<string,string>();
  routeVariants.forEach((variant, index) => {
    const label = `مسیر شعبه‌ای ${index + 1}`;
    if (!variant.id.trim() || ids.has(variant.id) || variant.id === BASE_WORKFLOW_ROUTE_ID) errors.push(`${label}: شناسه مسیر باید یکتا باشد.`);
    ids.add(variant.id);
    if (!variant.title.trim()) errors.push(`${label}: عنوان مسیر الزامی است.`);
    if (!variant.branchUnitIds.length) errors.push(`${label}: حداقل یک شعبه انتخاب کنید.`);
    if (!Number.isFinite(variant.priority) || variant.priority < 0) errors.push(`${label}: اولویت مسیر معتبر نیست.`);
    if (variant.status === 'active') {
      variant.branchUnitIds.forEach((branchId) => {
        const previous = activeBranches.get(branchId);
        if (previous) errors.push(`${label}: این شعبه قبلاً در مسیر فعال «${previous}» انتخاب شده است.`);
        else activeBranches.set(branchId, variant.title);
      });
    }
    errors.push(...validateStages(workflow, variant.approvalStages, roles, `مسیر «${variant.title || index + 1}»`, users));
  });
  return errors;
}

function workflowForVersion(state: Pick<FoundationState,'workflows'> & Partial<Pick<FoundationState,'workflowVersions'>>, moduleId: string, workflowVersion?: number): WorkflowDefinition | undefined {
  const active = state.workflows.find((item) => item.moduleId === moduleId);
  if (!workflowVersion || active?.version === workflowVersion) return active;
  const historical = state.workflowVersions?.find((item) => item.moduleId === moduleId && item.version === workflowVersion);
  if (historical) return historical;
  throw new Error(`نسخه تاریخی ${workflowVersion} گردش‌کار «${moduleId}» پیدا نشد؛ پرونده تا ترمیم سیاست قابل ادامه نیست.`);
}

export function roleIdsForWorkflowState(
  state: Pick<FoundationState,'workflows'|'roles'> & Partial<Pick<FoundationState,'workflowVersions'>>,
  moduleId: string,
  stateId: string,
  fallback: string[],
  workflowVersion?: number,
  workflowRouteId?: string,
): string[] {
  const workflow = workflowForVersion(state, moduleId, workflowVersion);
  if (!workflow) return fallback;
  const stage = approvalStagesForRoute(workflow, state.roles, workflowRouteId).find((item) => item.stateId === stateId);
  return stage?.roleIds.length ? stage.roleIds : fallback;
}

export function decisionsForWorkflowState(
  state: Pick<FoundationState,'workflows'|'roles'> & Partial<Pick<FoundationState,'workflowVersions'>>,
  moduleId: string,
  stateId: string,
  fallback: WorkflowStageDecision[],
  workflowVersion?: number,
  workflowRouteId?: string,
): WorkflowStageDecision[] {
  const workflow = workflowForVersion(state, moduleId, workflowVersion);
  if (!workflow) return fallback;
  const stage = approvalStagesForRoute(workflow, state.roles, workflowRouteId).find((item) => item.stateId === stateId);
  return stage?.decisions.length ? stage.decisions : fallback;
}

export function workflowStageAllows(
  state: Pick<FoundationState,'workflows'|'roles'> & Partial<Pick<FoundationState,'workflowVersions'>>,
  moduleId: string,
  stateId: string,
  decision: WorkflowStageDecision,
  fallback: WorkflowStageDecision[],
  workflowVersion?: number,
  workflowRouteId?: string,
): boolean {
  return decisionsForWorkflowState(state, moduleId, stateId, fallback, workflowVersion, workflowRouteId).includes(decision);
}
