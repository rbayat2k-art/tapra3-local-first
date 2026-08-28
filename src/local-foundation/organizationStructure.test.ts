import {describe, expect, it} from 'vitest';
import {createSeedData} from './seed';
import {activeActingManager, effectiveUnitManagerUserId, flattenOrganizationUnits, organizationPeople, organizationPeopleForUnit, organizationStructureHealth} from './organizationStructure';

function organizationState() {
  const seed = createSeedData();
  return {users: seed.users, personnel: seed.personnel, units: seed.organizational_units, positions: seed.organizational_positions};
}

describe('organization structure projection', () => {
  it('counts linked personnel and user accounts only once and keeps personnel without accounts visible', () => {
    const state = organizationState();
    const people = organizationPeople(state);
    const linkedPersonnel = state.personnel.filter((personnel) => personnel.linkedUserId || state.users.some((user) => user.personnelId === personnel.id));
    const standaloneUsers = state.users.filter((user) => !state.personnel.some((personnel) => personnel.id === user.personnelId || personnel.linkedUserId === user.id));

    expect(people).toHaveLength(state.personnel.length + standaloneUsers.length);
    expect(people.filter((person) => person.personnel && person.user)).toHaveLength(linkedPersonnel.length);
    const personnel = state.personnel[0];
    expect(organizationPeopleForUnit(state, personnel.unitId).some((person) => person.personnel?.id === personnel.id)).toBe(true);
  });

  it('reports invalid assignments without hiding the rest of the organization', () => {
    const state = organizationState();
    const personnel = state.personnel[0];
    const broken = {...state, personnel: state.personnel.map((item) => item.id === personnel.id ? {...item, positionId: 'missing-position'} : item)};
    expect(organizationStructureHealth(broken).missingPosition).toBeGreaterThan(0);
  });

  it('flattens hierarchy safely when legacy data contains an orphan or cycle', () => {
    const state = organizationState();
    const source = state.units.filter((unit) => unit.type !== 'شعبه').slice(0, 3);
    const units = [
      {...source[0], parentId: source[1].id},
      {...source[1], parentId: source[0].id},
      {...source[2], parentId: 'missing-parent'},
    ];
    const flattened = flattenOrganizationUnits(units);
    expect(flattened.map((item) => item.unit.id).sort()).toEqual(units.map((unit) => unit.id).sort());
    expect(new Set(flattened.map((item) => item.unit.id)).size).toBe(units.length);
  });

  it('uses an in-range temporary manager without overwriting the permanent manager', () => {
    const state = organizationState();
    const unit = state.units.find((item) => item.id === 'unit-sales')!;
    const withActing = {...unit, actingManager: {userId: 'persona-product-owner', reason: 'مأموریت', startsOn: '2026-08-01', endsOn: '2026-08-31', assignedAt: '2026-08-01T08:00:00.000Z', assignedByActorId: 'actor-product-owner'}};
    expect(activeActingManager(withActing, '2026-08-26')?.userId).toBe('persona-product-owner');
    expect(effectiveUnitManagerUserId(withActing, '2026-08-26')).toBe('persona-product-owner');
    expect(effectiveUnitManagerUserId(withActing, '2026-09-01')).toBe(unit.managerUserId);
  });
});
