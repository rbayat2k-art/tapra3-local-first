import {describe, expect, it} from 'vitest';
import {createSeedData} from './seed';
import {positionUsage} from './positionUsage';

describe('organization position usage', () => {
  const testState = () => {
    const seed = createSeedData();
    return {users: seed.users, personnel: seed.personnel, units: seed.organizational_units, positions: seed.organizational_positions};
  };

  it('counts a personnel record and its linked account only once', () => {
    const state = testState();
    const position = state.positions.find((item) => item.id === 'position-sales-supervisor')!;
    const usage = positionUsage(state, position);
    const linkedPersonnel = state.personnel.filter((person) => person.positionId === position.id && person.linkedUserId);

    expect(usage.people).toHaveLength(linkedPersonnel.length);
    expect(usage.activePeople).toHaveLength(linkedPersonnel.length);
    expect(usage.canDeactivate).toBe(false);
    expect(usage.canDelete).toBe(false);
  });

  it('separates current assignments from historical records', () => {
    const state = testState();
    const position = state.positions.find((item) => item.id === 'position-specialist')!;
    const usage = positionUsage(state, position);

    expect(usage.activePeople.length).toBeGreaterThan(0);
    expect(usage.historicalPeople.some((person) => person.personnel?.id === 'personnel-ended')).toBe(true);
    expect(usage.canDeactivate).toBe(false);
    expect(usage.canDelete).toBe(false);
  });

  it('reports an active assignment outside the position unit catalog', () => {
    const state = testState();
    const position = state.positions.find((item) => item.id === 'position-sales-manager')!;
    const person = state.personnel.find((item) => item.id === 'personnel-arman')!;
    person.unitId = 'unit-warehouse';

    const usage = positionUsage(state, position);

    expect(usage.invalidActivePeople.map((item) => item.personnel?.id)).toContain(person.id);
    expect(usage.activePeopleInUnit('unit-warehouse')).toHaveLength(1);
  });

  it('allows deletion only when the position has never been assigned', () => {
    const state = testState();
    const position = {...state.positions[0], id: 'position-unused', unitIds: ['unit-management']};
    state.positions.push(position);

    const usage = positionUsage(state, position);

    expect(usage.people).toHaveLength(0);
    expect(usage.canDeactivate).toBe(true);
    expect(usage.canDelete).toBe(true);
  });
});
