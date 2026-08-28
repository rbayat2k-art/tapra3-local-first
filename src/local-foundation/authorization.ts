import type {AuthorizationDecision, AuthorizationRequest, DemoResource, OperationalRecord, QaPersona, SecurityRole} from './model';

const deny = (code: string, reasonFa: string, progress: Partial<AuthorizationDecision> = {}): AuthorizationDecision => ({
  allowed: false,
  code,
  reasonFa,
  permissionMatched: false,
  scopeMatched: false,
  policyMatched: false,
  workflowMatched: false,
  ...progress,
});

function resolveScope(persona: QaPersona, scope: QaPersona['scope'], resource?: DemoResource): boolean {
  if (!resource) return true;
  if (resource.companyId !== persona.companyId) return false;
  switch (scope) {
    case 'COMPANY': return true;
    case 'UNIT': return Boolean(persona.unitId && persona.unitId === resource.unitId);
    case 'TEAM': return Boolean(persona.teamId && persona.teamId === resource.teamId);
    case 'SELF': return resource.ownerId === persona.actorId || resource.createdBy === persona.actorId;
    case 'RECORD': return resource.allowedRecordActorIds?.includes(persona.actorId) ?? false;
    default: return false;
  }
}

export function authorize(request: AuthorizationRequest): AuthorizationDecision {
  const {persona, permission, resource, action, targetState, allowedTransitions} = request;
  if (persona.status !== 'active') {
    return deny('account.inactive', 'حساب کاربری غیرفعال است و اجازه مشاهده یا انجام عملیات ندارد.');
  }
  const matchingEntitlements = persona.permissionEntitlements?.filter((item) => item.permission === permission) ?? [];
  const permissionMatched = persona.isAdmin || matchingEntitlements.length > 0;
  if (!permissionMatched) {
    return deny('permission.missing', 'این نقش مجوز لازم برای این اقدام را ندارد.');
  }

  const scopeMatched = persona.isAdmin
    ? resolveScope(persona, 'COMPANY', resource)
    : matchingEntitlements.some((entitlement) => resolveScope(persona, entitlement.scope, resource));
  if (!scopeMatched) {
    return deny('scope.denied', 'این رکورد خارج از محدوده کاری کاربر فعال است.', {permissionMatched: true});
  }

  if (resource && action === 'approve' && resource.createdBy === persona.actorId) {
    return deny('resource.self_approval_denied', 'تفکیک سازنده و تأییدکننده اجازه تأیید رکورد خود را نمی‌دهد.', {
      permissionMatched: true, scopeMatched: true,
    });
  }

  if (resource && targetState && allowedTransitions) {
    const nextStates = allowedTransitions[resource.state] ?? [];
    if (!nextStates.includes(targetState)) {
      return deny('workflow.transition_denied', 'این انتقال از وضعیت فعلی در گردش‌کار تعریف نشده است.', {
        permissionMatched: true, scopeMatched: true, policyMatched: true,
      });
    }
  }

  return {
    allowed: true,
    code: 'authorization.allowed',
    reasonFa: 'مجوز، محدوده، سیاست رکورد و گارد گردش‌کار همگی معتبر هستند.',
    permissionMatched: true,
    scopeMatched: true,
    policyMatched: true,
    workflowMatched: true,
  };
}

/**
 * A persisted role id is only an assignment reference. Authority exists only
 * while the referenced role definition is active and its current effective
 * entitlement authorizes the exact resource/action.
 */
export function authorizeWithActiveRole(
  request: AuthorizationRequest & {roles: SecurityRole[]; allowedRoleIds: readonly string[]; allowAdminWithoutRole?: boolean},
): AuthorizationDecision {
  const {roles, allowedRoleIds, allowAdminWithoutRole = true, ...authorizationRequest} = request;
  if (!request.persona.isAdmin || !allowAdminWithoutRole) {
    const allowed = new Set(allowedRoleIds);
    const hasActiveRole = roles.some((role) => role.status === 'active'
      && allowed.has(role.id)
      && request.persona.roleIds.includes(role.id));
    if (!hasActiveRole) {
      return deny('role.inactive_or_missing', 'نقش تخصصی فعال برای این اقدام به کاربر تخصیص داده نشده است.');
    }
  }
  return authorize(authorizationRequest);
}

/**
 * Builds the exact same authorization resource for list visibility and service
 * actions. An explicitly assigned SELF-scoped user owns the work item for
 * authorization purposes while the immutable creator remains available for
 * maker/checker enforcement.
 */
export function operationalRecordResource(persona: QaPersona, record: OperationalRecord): DemoResource {
  const payloadTeamId = typeof record.payload.teamId === 'string'
    ? record.payload.teamId
    : typeof record.payload.salesStructureId === 'string'
      ? record.payload.salesStructureId
      : undefined;
  return {
    id: record.id,
    companyId: record.companyId,
    unitId: record.unitId,
    teamId: payloadTeamId,
    ownerId: record.assigneeUserId === persona.id ? persona.actorId : record.createdByActorId,
    createdBy: record.createdByActorId,
    state: record.status,
  };
}

export function can(persona: QaPersona, permission: AuthorizationRequest['permission']): boolean {
  return authorize({persona, permission}).allowed;
}
