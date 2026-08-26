import type {FoundationState, OrganizationalPosition} from './model';
import {organizationPeople, type OrganizationPerson} from './organizationStructure';

type PositionUsageState = Pick<FoundationState, 'personnel' | 'positions' | 'units' | 'users'>;

export interface PositionUsage {
  people: OrganizationPerson[];
  activePeople: OrganizationPerson[];
  historicalPeople: OrganizationPerson[];
  activePeopleInUnit: (unitId: string) => OrganizationPerson[];
  invalidActivePeople: OrganizationPerson[];
  activeUnits: number;
  inactiveUnits: number;
  canDeactivate: boolean;
  canDelete: boolean;
}

/**
 * Produces one canonical usage row per real person. A personnel record and its
 * linked user account are intentionally counted once, so operational totals do
 * not double-count employees who have portal access.
 */
export function positionUsage(state: PositionUsageState, position: OrganizationalPosition): PositionUsage {
  const people = organizationPeople(state).filter((person) => person.positionId === position.id);
  const activePeople = people.filter((person) => person.active);
  const historicalPeople = people.filter((person) => !person.active);
  const invalidActivePeople = activePeople.filter((person) => !person.unitId || !position.unitIds.includes(person.unitId));
  const activeUnits = position.unitIds.filter((unitId) => state.units.some((unit) => unit.id === unitId && unit.status === 'active' && unit.type !== 'شعبه')).length;
  const inactiveUnits = position.unitIds.length - activeUnits;

  return {
    people,
    activePeople,
    historicalPeople,
    activePeopleInUnit: (unitId) => activePeople.filter((person) => person.unitId === unitId),
    invalidActivePeople,
    activeUnits,
    inactiveUnits,
    canDeactivate: activePeople.length === 0,
    canDelete: people.length === 0,
  };
}

