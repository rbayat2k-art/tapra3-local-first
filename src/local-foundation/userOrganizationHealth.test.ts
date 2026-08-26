import {describe, expect, it} from 'vitest';
import {createSeedData} from './seed';
import {userOrganizationHealth} from './userOrganizationHealth';
import type {FoundationState, LocalUser, OrganizationalPosition, OrganizationalUnit, PersonnelRecord, SecurityRole} from './model';

function healthState(): Pick<FoundationState, 'users' | 'personnel' | 'roles' | 'units' | 'positions'> {
  const stores = createSeedData();
  return {
    users: stores.users as LocalUser[],
    personnel: stores.personnel as PersonnelRecord[],
    roles: stores.security_roles as SecurityRole[],
    units: stores.organizational_units as OrganizationalUnit[],
    positions: stores.organizational_positions as OrganizationalPosition[],
  };
}

describe('userOrganizationHealth', () => {
  it('accepts a linked account whose personnel, unit, position, and roles agree', () => {
    const state = healthState();
    const user = state.users.find((item) => item.id === 'persona-seller')!;
    expect(userOrganizationHealth(user, state).issues).toEqual([]);
    expect(userOrganizationHealth(user, state).linked).toBe(true);
  });

  it('finds broken identity links and organizational assignment mismatches', () => {
    const state = healthState();
    const original = state.users.find((item) => item.id === 'persona-seller')!;
    const user = {...original, personnelId: undefined, unitId: 'unit-warehouse'};
    const health = userOrganizationHealth(user, {...state, users: state.users.map((item) => item.id === user.id ? user : item)});
    expect(health.issues).toContain('broken-personnel-link');
    expect(health.issues).toContain('assignment-mismatch');
  });

  it('finds inactive roles, invalid managers, and legacy direct grants', () => {
    const state = healthState();
    const original = state.users.find((item) => item.id === 'persona-seller')!;
    const user = {...original, roleIds: ['missing-role'], managerUserId: original.id, permissionGrants: ['foundation.audit.view']};
    const health = userOrganizationHealth(user, {...state, users: state.users.map((item) => item.id === user.id ? user : item)});
    expect(health.issues).toEqual(expect.arrayContaining(['invalid-role', 'invalid-manager', 'legacy-direct-grant']));
  });
});
