import type {PersonnelRecord, SalesStructure} from './model';

/**
 * A sales structure has no independent call-center name. Its product-facing
 * identity is always the assigned call-center supervisor.
 */
export function salesStructureSupervisorName(structure: SalesStructure, personnel: PersonnelRecord[]): string {
  const supervisor = personnel.find((item) => item.id === structure.callCenterSupervisorPersonnelId);
  return supervisor ? `${supervisor.firstName} ${supervisor.lastName}`.trim() : 'سرپرست تعیین نشده';
}

/** An assignment remains relevant after a seller leaves the route. */
export function salesStructureHasAssignmentHistory(structureId: string, personnel: PersonnelRecord[]): boolean {
  return personnel.some((person) => person.salesStructureId === structureId || person.movements?.some((movement) =>
    movement.kind === 'sales_transfer' && (movement.fromId === structureId || movement.toId === structureId),
  ));
}
