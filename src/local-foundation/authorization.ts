import type {AuthorizationDecision, AuthorizationRequest, DemoResource, QaPersona} from './model';

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

function resolveScope(persona: QaPersona, resource?: DemoResource): boolean {
  if (!resource) return true;
  if (resource.companyId !== persona.companyId) return false;
  switch (persona.scope) {
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
  if (!persona.isAdmin && !persona.permissions.includes(permission)) {
    return deny('permission.missing', 'این نقش مجوز لازم برای این اقدام را ندارد.');
  }

  if (!resolveScope(persona, resource)) {
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

export function can(persona: QaPersona, permission: AuthorizationRequest['permission']): boolean {
  return authorize({persona, permission}).allowed;
}
