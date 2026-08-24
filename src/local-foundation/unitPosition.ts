import type {OrganizationalPosition} from './model';

export function normalizePositionUnitIds(unitIds: string[]): string[] {
  return [...new Set(unitIds.filter(Boolean))].sort();
}

export function positionSupportsUnit(position: OrganizationalPosition, unitId?: string): boolean {
  return Boolean(unitId && position.unitIds.includes(unitId));
}

export function positionsForUnit(
  positions: OrganizationalPosition[],
  unitId?: string,
  includePositionId?: string,
): OrganizationalPosition[] {
  return positions.filter((position) =>
    positionSupportsUnit(position, unitId)
    || Boolean(includePositionId && position.id === includePositionId),
  );
}
