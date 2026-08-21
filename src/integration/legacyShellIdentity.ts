import type { FoundationSession } from '../foundation/api/contracts';
import type { User } from '../types';

/**
 * Supplies the mature prototype shell with presentation-only identity data.
 * API authorization continues to use FoundationSession; this adapter never grants server access.
 */
export function resolveLegacyShellUser(session: FoundationSession, legacyUsers: User[]): User {
  const email = session.user.email.trim().toLowerCase();
  const exactLegacyUser = legacyUsers.find((user) => user.email.trim().toLowerCase() === email);

  return {
    id: `foundation:${session.user.id}`,
    username: email.split('@')[0] || session.user.id,
    fullName: session.user.fullName,
    phone: exactLegacyUser?.phone ?? '',
    email: session.user.email,
    role: 'member',
    roleTitle: 'کاربر سامانه',
    companyId: session.activeContext?.company?.id,
    customPermissions: [],
    isActive: true,
  };
}
