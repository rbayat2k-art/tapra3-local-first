import {describe, expect, it} from 'vitest';
import {dashboardCapabilitiesFor, ORGANIZATION_ROLE_GRANTS} from './organizationAccess';
import {LOCAL_USERS, SECURITY_ROLES} from './seed';

const role = (id: string) => SECURITY_ROLES.find((item) => item.id === id)!;
const user = (id: string) => LOCAL_USERS.find((item) => item.id === id)!;
const dashboardIds = (id: string) => dashboardCapabilitiesFor(user(id)).map((item) => item.id);

describe('organization role and dashboard matrix', () => {
  it('ships every approved organization role active and protected', () => {
    for (const id of Object.keys(ORGANIZATION_ROLE_GRANTS)) {
      expect(role(id), id).toBeDefined();
      expect(role(id).status, id).toBe('active');
      expect(role(id).protected, id).toBe(true);
    }
  });

  it('separates personnel maker and checker responsibilities', () => {
    expect(role('role-hr-operator').permissions).toContain('organization.personnel.manage');
    expect(role('role-hr-operator').permissions).not.toContain('organization.personnel.changes.review');
    expect(role('role-personnel-reviewer').permissions).toContain('organization.personnel.changes.review');
    expect(role('role-personnel-reviewer').permissions).not.toContain('organization.personnel.manage');
  });

  it('lets the account manager create accounts and assign roles without editing role definitions', () => {
    const permissions = role('role-user-manager').permissions;
    expect(permissions).toEqual(expect.arrayContaining([
      'organization.users.create', 'organization.users.password.manage',
      'organization.roles.assign', 'organization.personnel.account.manage',
    ]));
    expect(permissions).not.toContain('organization.roles.manage');
    expect(permissions).not.toContain('foundation.users.qa_login');
  });

  it('keeps registration review independent from personnel and role editing', () => {
    const permissions = role('role-registration-reviewer').permissions;
    expect(permissions).toContain('organization.registrations.review');
    expect(permissions).not.toContain('organization.personnel.manage');
    expect(permissions).not.toContain('organization.roles.manage');
  });

  it('builds a different dashboard for each organization responsibility', () => {
    expect(dashboardIds('persona-organization-manager')).toEqual(expect.arrayContaining(['organization', 'structure']));
    expect(dashboardIds('persona-organization-manager')).not.toContain('users');

    expect(dashboardIds('persona-hr-operator')).toEqual(expect.arrayContaining(['organization', 'personnel']));
    expect(dashboardIds('persona-hr-operator')).not.toContain('personnel-review');

    expect(dashboardIds('persona-personnel-reviewer')).toEqual(expect.arrayContaining(['organization', 'personnel-review']));
    expect(dashboardIds('persona-personnel-reviewer')).not.toContain('personnel');

    expect(dashboardIds('persona-user-manager')).toEqual(expect.arrayContaining(['organization', 'users', 'roles']));
    expect(dashboardIds('persona-user-manager')).not.toContain('structure');

    expect(dashboardIds('persona-registration-reviewer')).toEqual(expect.arrayContaining(['organization', 'registrations']));
    expect(dashboardIds('persona-registration-reviewer')).not.toContain('users');
  });

  it('links every organization QA user to its actual role without admin bypass', () => {
    for (const id of Object.keys(ORGANIZATION_ROLE_GRANTS)) {
      const persona = LOCAL_USERS.find((item) => item.roleId === id);
      expect(persona, id).toBeDefined();
      expect(persona?.status, id).toBe('active');
      expect(persona?.isAdmin, id).toBe(false);
      expect(persona?.permissions, id).toEqual(role(id).permissions);
    }
  });
});
