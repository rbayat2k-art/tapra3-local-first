import { User, RoleAssignmentScope } from '../types';
import { DEFAULT_ROLE_ID_MAP } from './storage';

// General organizational supervisor chain (User.reportsToUserId) — completely independent of
// User.salesSupervisorId (sales-only, src/utils/salesHierarchy.ts) and the treasury
// approvalChain/allowedApproverIds (approval routing only). Used exclusively for computing
// territory-based data visibility (e.g. Archive), never mixed with those other two chains.

// Full subtree (self + every descendant, at any depth) under userId in the reportsToUserId chain.
export function getOrgSubordinateIds(userId: string, allUsers: User[]): Set<string> {
  const ids = new Set<string>([userId]);
  let added = true;
  while (added) {
    added = false;
    for (const u of allUsers) {
      if (u.reportsToUserId && ids.has(u.reportsToUserId) && !ids.has(u.id)) {
        ids.add(u.id);
        added = true;
      }
    }
  }
  return ids;
}

// Self + only direct reports (one level down) — narrower than the full subtree.
export function getDirectOrgReportIds(userId: string, allUsers: User[]): Set<string> {
  const ids = new Set<string>([userId]);
  for (const u of allUsers) {
    if (u.reportsToUserId === userId) ids.add(u.id);
  }
  return ids;
}

// Resolves the scope for a given roleId on a user: an explicit User.roleScopes entry, or
// 'own' by default. There is NEVER an implicit broader fallback (e.g. "same branch") —
// company/branch scope only ever applies when an admin has explicitly assigned it.
function resolveScopeForRole(user: User, roleId: string): RoleAssignmentScope {
  const entry = user.roleScopes?.find((rs) => rs.roleId === roleId);
  return entry?.scope || { scopeType: 'own' };
}

function applyScope(currentUser: User, scope: RoleAssignmentScope, allUsers: User[]): Set<string> {
  switch (scope.scopeType) {
    case 'own':
      return new Set([currentUser.id]);
    case 'direct_reports':
      return getDirectOrgReportIds(currentUser.id, allUsers);
    case 'subtree':
      return getOrgSubordinateIds(currentUser.id, allUsers);
    case 'company':
      return new Set(allUsers.filter((u) => scope.companyId && u.companyId === scope.companyId).map((u) => u.id));
    case 'branch':
      return new Set(
        allUsers
          .filter((u) => scope.costCenterId && (u.costCenterId === scope.costCenterId || u.allowedCostCenterIds?.includes(scope.costCenterId)))
          .map((u) => u.id)
      );
    default:
      return new Set([currentUser.id]);
  }
}

// Returns the set of user ids whose records currentUser is allowed to see, computed by
// taking EACH of currentUser's active roles (base role/roleId + additionalRoleIds)
// independently, resolving that role's own scope (own/direct_reports/subtree/company/branch),
// and returning the UNION. This is deliberately per-role, not a single blended scope — a
// second active role can only widen visibility by exactly what that role's own scope grants,
// never more. Admin (role === 'admin') bypasses entirely and sees everyone.
export function computeVisibleUserIds(currentUser: User, allUsers: User[]): string[] {
  if (currentUser.role === 'admin') return allUsers.map((u) => u.id);

  const baseRoleId = currentUser.roleId || DEFAULT_ROLE_ID_MAP[currentUser.role];
  const activeRoleIds = Array.from(new Set([baseRoleId, ...(currentUser.additionalRoleIds || [])].filter(Boolean))) as string[];

  const visible = new Set<string>();
  for (const roleId of activeRoleIds) {
    const scope = resolveScopeForRole(currentUser, roleId);
    for (const id of applyScope(currentUser, scope, allUsers)) visible.add(id);
  }
  if (activeRoleIds.length === 0) visible.add(currentUser.id);
  return Array.from(visible);
}
