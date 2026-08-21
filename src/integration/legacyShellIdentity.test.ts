import { describe, expect, it } from 'vitest';
import type { FoundationSession } from '../foundation/api/contracts';
import type { User } from '../types';
import { resolveLegacyShellUser } from './legacyShellIdentity';

const users: User[] = [{
  id: 'legacy-admin', username: 'admin', fullName: 'مدیر قدیمی', phone: '09120000000', email: 'legacy@example.test',
  role: 'admin', roleTitle: 'مدیر', customPermissions: ['manage_users'], isActive: true,
}];

function session(email: string, permissions: string[]): FoundationSession {
  return {
    user: { id: 'server-user', personId: 'person', fullName: 'کاربر سرور', email, requiresPasswordChange: false },
    actor: { id: 'server-user', personId: 'person', fullName: 'کاربر سرور', email },
    impersonation: null,
    memberships: [], csrfToken: 'csrf',
    activeContext: {
      membershipId: 'membership', workspace: { id: 'workspace', name: 'مجموعه', slug: 'workspace' },
      company: { id: 'company', name: 'شرکت', code: 'COMPANY' }, permissions,
      organizationUnit: null,
      scope: { type: 'COMPANY', id: 'company' },
      contextKey: 'membership:COMPANY:company',
      roles: [],
    },
  };
}

describe('legacy shell identity adapter', () => {
  it('never promotes the deterministic demo account to a legacy administrator', () => {
    const user = resolveLegacyShellUser(session('demo@tapra.local', ['organization.read']), users);
    expect(user.role).toBe('member');
    expect(user.customPermissions).toEqual([]);
  });

  it('does not inherit a matching legacy role or operational permissions', () => {
    const user = resolveLegacyShellUser(session('legacy@example.test', ['customer.read']), users);
    expect(user.id).toBe('foundation:server-user');
    expect(user.role).toBe('member');
    expect(user.customPermissions).toEqual([]);
    expect(user.phone).toBe('09120000000');
  });

  it('keeps server identity fields as the presentation identity', () => {
    const user = resolveLegacyShellUser(session('reader@tapra.local', ['sales.queue.read']), users);
    expect(user.fullName).toBe('کاربر سرور');
    expect(user.roleTitle).toBe('کاربر سامانه');
    expect(user.companyId).toBe('company');
  });
});
