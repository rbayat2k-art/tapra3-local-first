import type {FoundationState, LocalUser, PersonnelRecord, SalesHierarchyLevel, SalesStructure} from './model';

export interface SalesManagementScope {
  source: 'active_sales_structure' | 'assigned_branch' | 'company';
  branchUnitIds: string[];
  structureIds: string[];
  seniorSupervisorPersonnelIds: string[];
  callCenterSupervisorPersonnelIds: string[];
}

const unique = (values: Array<string | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))];

const STRUCTURE_FIELD_BY_LEVEL: Partial<Record<SalesHierarchyLevel, keyof Pick<SalesStructure,
  'salesVicePersonnelId' | 'salesManagerPersonnelId' | 'seniorSupervisorPersonnelId' | 'callCenterSupervisorPersonnelId'>>> = {
  sales_vice: 'salesVicePersonnelId',
  sales_manager: 'salesManagerPersonnelId',
  senior_supervisor: 'seniorSupervisorPersonnelId',
  sales_supervisor: 'callCenterSupervisorPersonnelId',
};

export function activeSalesStructuresForPersonnel(
  state: FoundationState,
  personnelId: string,
  hierarchyLevel?: SalesHierarchyLevel,
): SalesStructure[] {
  const activeBranchIds = new Set(state.units.filter((unit) => unit.type === 'شعبه' && unit.status === 'active').map((unit) => unit.id));
  const assignedField = hierarchyLevel ? STRUCTURE_FIELD_BY_LEVEL[hierarchyLevel] : undefined;
  return state.salesStructures.filter((structure) => {
    if (structure.status !== 'active' || !activeBranchIds.has(structure.branchUnitId)) return false;
    if (assignedField) return structure[assignedField] === personnelId;
    return [
      structure.salesVicePersonnelId,
      structure.salesManagerPersonnelId,
      structure.seniorSupervisorPersonnelId,
      structure.callCenterSupervisorPersonnelId,
    ].includes(personnelId);
  });
}

export function managedSalesBranchIdsForPersonnel(state: FoundationState, personnel: PersonnelRecord): string[] {
  if (!['sales_vice', 'sales_manager', 'senior_supervisor'].includes(personnel.salesHierarchyLevel ?? '')) return [];
  return unique(activeSalesStructuresForPersonnel(state, personnel.id, personnel.salesHierarchyLevel).map((item) => item.branchUnitId));
}

/**
 * Resolves the real, current sales coverage from active structures. A role is
 * only the permission bundle; branch authority comes from these assignments.
 */
export function activeSalesStructuresForUser(state: FoundationState, user: LocalUser = state.activeUser): SalesStructure[] {
  if (!user.personnelId || user.status !== 'active') return [];
  return activeSalesStructuresForPersonnel(state, user.personnelId);
}

export function resolveWorkforceRequestScope(state: FoundationState, user: LocalUser = state.activeUser): SalesManagementScope {
  const activeBranches = state.units.filter((unit) => unit.type === 'شعبه' && unit.status === 'active');
  if (user.isAdmin || user.roleIds.includes('role-recruitment-manager')) {
    return {
      source: 'company',
      branchUnitIds: activeBranches.map((branch) => branch.id),
      structureIds: state.salesStructures.filter((item) => item.status === 'active').map((item) => item.id),
      seniorSupervisorPersonnelIds: unique(state.salesStructures.filter((item) => item.status === 'active').map((item) => item.seniorSupervisorPersonnelId)),
      callCenterSupervisorPersonnelIds: unique(state.salesStructures.filter((item) => item.status === 'active').map((item) => item.callCenterSupervisorPersonnelId)),
    };
  }

  if (!user.roleIds.includes('role-workforce-requester')) {
    return {source: 'assigned_branch', branchUnitIds: [], structureIds: [], seniorSupervisorPersonnelIds: [], callCenterSupervisorPersonnelIds: []};
  }

  const structures = activeSalesStructuresForUser(state, user);
  if (structures.length) {
    return {
      source: 'active_sales_structure',
      branchUnitIds: unique(structures.map((item) => item.branchUnitId)),
      structureIds: structures.map((item) => item.id),
      seniorSupervisorPersonnelIds: unique(structures.map((item) => item.seniorSupervisorPersonnelId)),
      callCenterSupervisorPersonnelIds: unique(structures.map((item) => item.callCenterSupervisorPersonnelId)),
    };
  }

  const assignedBranch = activeBranches.find((branch) => branch.id === user.branchUnitId);
  return {
    source: 'assigned_branch',
    branchUnitIds: assignedBranch ? [assignedBranch.id] : [],
    structureIds: [],
    seniorSupervisorPersonnelIds: [],
    callCenterSupervisorPersonnelIds: [],
  };
}

export function canRequestWorkforceForBranch(state: FoundationState, branchUnitId: string, user: LocalUser = state.activeUser): boolean {
  return resolveWorkforceRequestScope(state, user).branchUnitIds.includes(branchUnitId);
}
