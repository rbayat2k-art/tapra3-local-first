import { AuditLogEntry, User, SystemRole, SystemPermission } from '../types';
import { storage } from './storage';
import { getPortalNowTimestamp } from './operationalFormat';
import { getGrantingRoleId } from './permissions';

// Scoped audit trail — NOT a full app-wide audit log (see docs/BUSINESS_RULES.md for the
// documented scope boundary). Covers: impersonation lifecycle, normal + emergency payment
// referral/execution. Always records the REAL effective user and, if impersonating, the
// impersonating admin's identity, so an action never appears to have been done "as admin"
// when it was actually performed by/through an impersonated identity.
export function logAudit(params: {
  action: string;
  effectiveUser: User;
  impersonatorAdmin?: User | null;
  roles: SystemRole[];
  permissionUsed?: SystemPermission;
  targetId?: string;
  details?: string;
}): void {
  const { action, effectiveUser, impersonatorAdmin, roles, permissionUsed, targetId, details } = params;
  const entry: AuditLogEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    action,
    effectiveUserId: effectiveUser.id,
    effectiveUserName: effectiveUser.fullName,
    impersonatorAdminId: impersonatorAdmin?.id,
    impersonatorAdminName: impersonatorAdmin?.fullName,
    effectiveRoleId: permissionUsed ? getGrantingRoleId(effectiveUser, roles, permissionUsed) || undefined : undefined,
    targetId,
    details,
    timestamp: getPortalNowTimestamp()
  };
  const log = storage.getAuditLog();
  storage.saveAuditLog([...log, entry]);
}
