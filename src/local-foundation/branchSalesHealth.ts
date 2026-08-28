import type {FoundationState, OrganizationalUnit, PersonnelRecord, SalesHierarchyLevel, SalesStructure} from './model';
import {roleIdsForWorkflowState, routeVariantForBranch} from './workflowPolicy';
import {resolveEffectiveUnitManager} from './workflowRouting';

export type BranchHealthIssueCode =
  | 'missing-manager'
  | 'invalid-manager'
  | 'no-active-personnel'
  | 'inactive-with-active-personnel'
  | 'missing-sales-route';

export type SalesStructureIssueCode =
  | 'inactive-branch'
  | 'missing-chain-member'
  | 'inactive-chain-member'
  | 'wrong-chain-level'
  | 'chain-branch-mismatch'
  | 'seller-branch-mismatch'
  | 'seller-supervisor-mismatch'
  | 'inactive-with-active-sellers';

type OrganizationSlice = Pick<FoundationState, 'units' | 'users' | 'personnel' | 'salesStructures' | 'roles' | 'workflows'>;

export interface BranchHealthInsight {
  branch: OrganizationalUnit;
  activePersonnelCount: number;
  activeSellerCount: number;
  activeSalesRouteCount: number;
  issues: BranchHealthIssueCode[];
}

export interface SalesStructureHealthInsight {
  structure: SalesStructure;
  activeSellerCount: number;
  withoutActiveSellers: boolean;
  issues: SalesStructureIssueCode[];
}

export function branchHealthInsight(branch: OrganizationalUnit, state: OrganizationSlice): BranchHealthInsight {
  const issues: BranchHealthIssueCode[] = [];
  const activePersonnel = state.personnel.filter((person) => person.employmentStatus === 'active' && person.branchUnitId === branch.id);
  const activeStandaloneUsers = state.users.filter((user) => user.status === 'active' && !user.personnelId && user.branchUnitId === branch.id);
  const activePersonnelCount = activePersonnel.length + activeStandaloneUsers.length;
  const activeSellers = activePersonnel.filter((person) => person.salesHierarchyLevel === 'seller');
  const activeSalesRoutes = state.salesStructures.filter((structure) => structure.branchUnitId === branch.id && structure.status === 'active');
  const manager = resolveEffectiveUnitManager(state, branch)?.effectiveManager;
  const advanceWorkflow = state.workflows.find((workflow) => workflow.moduleId === 'employee-advance');
  const routeId = advanceWorkflow ? routeVariantForBranch(advanceWorkflow, branch.id)?.id : undefined;
  const managerRoleIds = roleIdsForWorkflowState(state, 'employee-advance', 'branch_review', ['role-advance-branch-manager'], advanceWorkflow?.version, routeId);

  if (branch.status === 'active' && !manager) issues.push('missing-manager');
  if (manager && !state.roles.some((role) => role.status === 'active' && manager.roleIds.includes(role.id) && managerRoleIds.includes(role.id))) issues.push('invalid-manager');
  if (branch.status === 'active' && activePersonnelCount === 0) issues.push('no-active-personnel');
  if (branch.status === 'inactive' && activePersonnelCount > 0) issues.push('inactive-with-active-personnel');
  if (activeSellers.length > 0 && activeSalesRoutes.length === 0) issues.push('missing-sales-route');

  return {
    branch,
    activePersonnelCount,
    activeSellerCount: activeSellers.length,
    activeSalesRouteCount: activeSalesRoutes.length,
    issues: [...new Set(issues)],
  };
}

export function salesStructureHealthInsight(structure: SalesStructure, state: OrganizationSlice): SalesStructureHealthInsight {
  const issues: SalesStructureIssueCode[] = [];
  const branch = state.units.find((unit) => unit.id === structure.branchUnitId && unit.type === 'شعبه');
  if (!branch || branch.status !== 'active') issues.push('inactive-branch');

  const chain: Array<{id?: string; level: SalesHierarchyLevel; branchBound: boolean}> = [
    {id: structure.salesVicePersonnelId, level: 'sales_vice', branchBound: false},
    {id: structure.salesManagerPersonnelId, level: 'sales_manager', branchBound: false},
    {id: structure.seniorSupervisorPersonnelId, level: 'senior_supervisor', branchBound: true},
    {id: structure.callCenterSupervisorPersonnelId, level: 'sales_supervisor', branchBound: true},
  ];
  for (const item of chain) {
    const person = state.personnel.find((candidate) => candidate.id === item.id);
    if (!person) { issues.push('missing-chain-member'); continue; }
    if (person.employmentStatus !== 'active') issues.push('inactive-chain-member');
    if (person.salesHierarchyLevel !== item.level) issues.push('wrong-chain-level');
    if (item.branchBound && personnelBranch(person) !== structure.branchUnitId) issues.push('chain-branch-mismatch');
  }

  const activeSellers = state.personnel.filter((person) => person.employmentStatus === 'active' && person.salesStructureId === structure.id);
  for (const seller of activeSellers) {
    if (personnelBranch(seller) !== structure.branchUnitId) issues.push('seller-branch-mismatch');
    if (seller.salesSupervisorPersonnelId !== structure.callCenterSupervisorPersonnelId) issues.push('seller-supervisor-mismatch');
  }
  if (structure.status === 'inactive' && activeSellers.length > 0) issues.push('inactive-with-active-sellers');

  return {
    structure,
    activeSellerCount: activeSellers.length,
    withoutActiveSellers: activeSellers.length === 0,
    issues: [...new Set(issues)],
  };
}

export function branchHealthIssueLabel(code: BranchHealthIssueCode) {
  const labels: Record<BranchHealthIssueCode, string> = {
    'missing-manager': 'مسئول شعبه تعیین نشده است',
    'invalid-manager': 'مسئول شعبه فعال یا دارای نقش مصوب این مرحله نیست',
    'no-active-personnel': 'هیچ پرسنل فعالی در شعبه مستقر نیست',
    'inactive-with-active-personnel': 'شعبه غیرفعال هنوز پرسنل فعال دارد',
    'missing-sales-route': 'فروشنده فعال بدون مسیر فروش فعال مانده است',
  };
  return labels[code];
}

export function salesStructureIssueLabel(code: SalesStructureIssueCode) {
  const labels: Record<SalesStructureIssueCode, string> = {
    'inactive-branch': 'شعبه مسیر موجود یا فعال نیست',
    'missing-chain-member': 'یکی از اعضای زنجیره سرپرستی پیدا نشد',
    'inactive-chain-member': 'یکی از اعضای زنجیره سرپرستی غیرفعال است',
    'wrong-chain-level': 'رده فروش یکی از اعضای زنجیره با جایگاه مسیر هماهنگ نیست',
    'chain-branch-mismatch': 'سرپرست شعبه‌ای مسیر در شعبه دیگری مستقر است',
    'seller-branch-mismatch': 'فروشنده متصل به مسیر در شعبه دیگری مستقر است',
    'seller-supervisor-mismatch': 'سرپرست مستقیم فروشنده با سرپرست مسیر یکسان نیست',
    'inactive-with-active-sellers': 'مسیر غیرفعال هنوز فروشنده فعال دارد',
  };
  return labels[code];
}

function personnelBranch(person: PersonnelRecord) {
  return person.salesBranchUnitId || person.branchUnitId;
}
