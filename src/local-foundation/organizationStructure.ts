import type {FoundationState, LocalUser, OrganizationalUnit, PersonnelRecord} from './model';
import {todayIsoDate} from './PersianDate';
import {actingAssignmentIsCurrent, resolveEffectiveUnitManager} from './workflowRouting';

export interface OrganizationPerson {
  id: string;
  unitId?: string;
  positionId?: string;
  active: boolean;
  personnel?: PersonnelRecord;
  user?: LocalUser;
}

type OrganizationState = Pick<FoundationState, 'personnel' | 'positions' | 'units' | 'users'>;

export function activeActingManager(unit: OrganizationalUnit, today = todayIsoDate()) {
  const assignment = unit.actingManager;
  return assignment && actingAssignmentIsCurrent(unit, today) ? assignment : undefined;
}

/** @deprecated Date-only display compatibility. Never use for authorization or workflow routing; use resolveEffectiveUnitManager with full state. */
export function effectiveUnitManagerUserId(unit: OrganizationalUnit, today = todayIsoDate()) {
  return activeActingManager(unit, today)?.userId ?? unit.managerUserId;
}

/**
 * One canonical row per real person. A linked account is attached to its personnel
 * record and is never counted as a second member.
 */
export function organizationPeople(state: OrganizationState): OrganizationPerson[] {
  const people: OrganizationPerson[] = state.personnel.map((personnel) => ({
    id: `personnel:${personnel.id}`,
    unitId: personnel.unitId,
    positionId: personnel.positionId,
    active: personnel.employmentStatus === 'active' || personnel.employmentStatus === 'ending_scheduled',
    personnel,
    user: state.users.find((user) => user.id === personnel.linkedUserId || user.personnelId === personnel.id),
  }));
  const linkedUserIds = new Set(people.flatMap((person) => person.user ? [person.user.id] : []));
  for (const user of state.users) {
    if (linkedUserIds.has(user.id) || state.personnel.some((personnel) => personnel.id === user.personnelId || personnel.linkedUserId === user.id)) continue;
    people.push({id: `user:${user.id}`, unitId: user.unitId, positionId: user.positionId, active: user.status === 'active', user});
  }
  return people;
}

export function organizationPeopleForUnit(state: OrganizationState, unitId: string): OrganizationPerson[] {
  return organizationPeople(state).filter((person) => person.unitId === unitId);
}

export function organizationStructureHealth(state: OrganizationState) {
  const people = organizationPeople(state).filter((person) => person.active);
  const units = state.units.filter((unit) => unit.type !== 'شعبه');
  const missingUnit = people.filter((person) => !person.unitId || !units.some((unit) => unit.id === person.unitId && unit.status === 'active')).length;
  const missingPosition = people.filter((person) => {
    if (!person.positionId || !person.unitId) return true;
    return !state.positions.some((position) => position.id === person.positionId && position.status === 'active' && position.unitIds.includes(person.unitId!));
  }).length;
  const unitsWithoutActiveManager = units.filter((unit) => {
    const managerUserId = resolveEffectiveUnitManager(state, unit)?.effectiveManager?.id;
    return unit.status === 'active' && !managerUserId;
  }).length;
  const invalidParents = units.filter((unit) => unit.parentId && !units.some((parent) => parent.id === unit.parentId && parent.status === 'active')).length;
  return {people, missingUnit, missingPosition, unitsWithoutActiveManager, invalidParents};
}

/** Returns every unit once, even when legacy data contains an orphan or a cycle. */
export function flattenOrganizationUnits(units: OrganizationalUnit[]): {unit: OrganizationalUnit; depth: number}[] {
  const result: {unit: OrganizationalUnit; depth: number}[] = [];
  const visited = new Set<string>();
  const visit = (unit: OrganizationalUnit, depth: number) => {
    if (visited.has(unit.id)) return;
    visited.add(unit.id);
    result.push({unit, depth});
    units
      .filter((candidate) => candidate.parentId === unit.id)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'fa'))
      .forEach((child) => visit(child, depth + 1));
  };
  units
    .filter((unit) => !unit.parentId || !units.some((candidate) => candidate.id === unit.parentId))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'fa'))
    .forEach((unit) => visit(unit, 0));
  units.filter((unit) => !visited.has(unit.id)).sort((a, b) => a.name.localeCompare(b.name, 'fa')).forEach((unit) => visit(unit, 0));
  return result;
}
