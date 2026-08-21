import type { FoundationSalesInvoice } from '../api/contracts';

export type WarehouseSection =
  | 'warehouses'
  | 'inventory'
  | 'receipts'
  | 'reservations'
  | 'transfers'
  | 'adjustments'
  | 'counts'
  | 'returns';

const sectionPermissions: Record<WarehouseSection, string[]> = {
  warehouses: ['warehouse.read'],
  inventory: ['warehouse.read'],
  receipts: ['warehouse.receiving.create', 'warehouse.receiving.post'],
  reservations: ['warehouse.reservation.manage'],
  transfers: ['warehouse.transfer.manage'],
  adjustments: ['warehouse.adjustment.create', 'warehouse.adjustment.approve'],
  counts: ['warehouse.count.create', 'warehouse.count.approve'],
  returns: ['warehouse.return.manage'],
};

export function canUseWarehousePermission(permissions: string[], permission: string): boolean {
  return permissions.includes(permission);
}

export function visibleWarehouseSections(permissions: string[]): WarehouseSection[] {
  return (Object.keys(sectionPermissions) as WarehouseSection[]).filter((section) =>
    sectionPermissions[section].some((permission) => permissions.includes(permission)),
  );
}

export interface ReservationCandidate {
  invoiceId: string;
  invoiceLineId: string;
  invoiceCode: string;
  customerName: string;
  itemName: string;
  quantity: number;
}

export function buildReservationCandidates(
  invoices: FoundationSalesInvoice[],
  reservedLineIds: string[],
): ReservationCandidate[] {
  const reserved = new Set(reservedLineIds);
  return invoices.flatMap((invoice) => {
    if (invoice.status !== 'financially_approved') return [];
    return invoice.lines
      .filter((line) => line.itemType === 'goods' && line.fulfillmentStatus === 'eligible' && !reserved.has(line.id))
      .map((line) => ({
        invoiceId: invoice.id,
        invoiceLineId: line.id,
        invoiceCode: invoice.code,
        customerName: invoice.sale.customer.name,
        itemName: line.itemName,
        quantity: line.quantity,
      }));
  });
}
