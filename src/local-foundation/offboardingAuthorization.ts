import {authorizeWithActiveRole, operationalRecordResource} from './authorization';
import {permissionFor} from './erpCatalog';
import type {AuthorizationDecision, AuthorizationRequest, DemoResource, FoundationState, LocalUser, OperationalRecord, PermissionCode, SecurityRole} from './model';

export type OffboardingClearanceArea = 'financial' | 'organizational';

export const OFFBOARDING_FINANCIAL_ROLE_IDS = ['role-accountant', 'role-senior-accountant', 'role-chief-accountant'] as const;
export const OFFBOARDING_ORGANIZATIONAL_ROLE_IDS = ['role-hr-operator', 'role-hr-manager', 'role-personnel-reviewer'] as const;
export const OFFBOARDING_COMPLETION_ROLE_IDS = ['role-hr-manager', 'role-personnel-reviewer'] as const;
export const ASSET_MANAGER_ROLE_IDS = ['role-asset-manager'] as const;

export function authorizeOffboardingClearance(
  user: LocalUser,
  roles: SecurityRole[],
  record: OperationalRecord,
  area: OffboardingClearanceArea,
): AuthorizationDecision {
  return authorizeWithActiveRole({
    persona: user,
    roles,
    allowedRoleIds: area === 'financial' ? OFFBOARDING_FINANCIAL_ROLE_IDS : OFFBOARDING_ORGANIZATIONAL_ROLE_IDS,
    permission: permissionFor('offboarding', 'transition'),
    action: 'transition',
    resource: operationalRecordResource(user, record),
    allowAdminWithoutRole: false,
  });
}

export function authorizeOffboardingCompletion(
  user: LocalUser,
  roles: SecurityRole[],
  record: OperationalRecord,
): AuthorizationDecision {
  return authorizeWithActiveRole({
    persona: user,
    roles,
    allowedRoleIds: OFFBOARDING_COMPLETION_ROLE_IDS,
    permission: permissionFor('offboarding', 'approve'),
    action: 'approve',
    resource: operationalRecordResource(user, record),
    allowAdminWithoutRole: false,
  });
}

export function canReceiveContinuityNeedsAction(
  user: LocalUser,
  roles: SecurityRole[],
  targetResource: DemoResource,
): boolean {
  return authorizeWithActiveRole({
    persona: user,
    roles,
    allowedRoleIds: OFFBOARDING_COMPLETION_ROLE_IDS,
    permission: permissionFor('offboarding', 'approve'),
    action: 'view',
    resource: targetResource,
    allowAdminWithoutRole: false,
  }).allowed;
}

export function offboardingActionVisibility(state:FoundationState,record:OperationalRecord){
  return{
    canFinance:authorizeOffboardingClearance(state.activeUser,state.roles,record,'financial').allowed,
    canOrganization:authorizeOffboardingClearance(state.activeUser,state.roles,record,'organizational').allowed,
    canClose:authorizeOffboardingCompletion(state.activeUser,state.roles,record).allowed,
  };
}

export function authorizedAssetManagers(options:{
  users:LocalUser[];
  roles:SecurityRole[];
  resource:DemoResource;
  permission:PermissionCode;
  action:AuthorizationRequest['action'];
  excludeUserId?:string;
}):LocalUser[]{
  return options.users.filter((user)=>user.status==='active'
    &&user.companyId===options.resource.companyId
    &&user.id!==options.excludeUserId
    &&authorizeWithActiveRole({
      persona:user,roles:options.roles,allowedRoleIds:ASSET_MANAGER_ROLE_IDS,
      permission:options.permission,action:options.action,resource:options.resource,
      allowAdminWithoutRole:false,
    }).allowed);
}
