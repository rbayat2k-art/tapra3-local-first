export type WarehouseAction =
  | 'manage_warehouses'
  | 'manage_items'
  | 'create_receipt'
  | 'create_manual_receipt'
  | 'post_receipt'
  | 'manage_reservations'
  | 'manage_transfers'
  | 'reverse_transfer'
  | 'create_adjustment'
  | 'approve_adjustment'
  | 'create_count'
  | 'approve_count'
  | 'manage_returns'
  | 'reverse_movement';

export const WAREHOUSE_ACTION_PERMISSIONS: Record<WarehouseAction, readonly string[]> = {
  manage_warehouses: ['warehouse.manage'],
  manage_items: ['warehouse.item.manage'],
  create_receipt: ['warehouse.receiving.create'],
  create_manual_receipt: ['warehouse.receiving.create', 'warehouse.receiving.manual'],
  post_receipt: ['warehouse.receiving.post'],
  manage_reservations: ['warehouse.reservation.manage'],
  manage_transfers: ['warehouse.transfer.manage'],
  reverse_transfer: ['warehouse.transfer.manage', 'warehouse.movement.reverse'],
  create_adjustment: ['warehouse.adjustment.create'],
  approve_adjustment: ['warehouse.adjustment.approve'],
  create_count: ['warehouse.count.create'],
  approve_count: ['warehouse.count.approve'],
  manage_returns: ['warehouse.return.manage'],
  reverse_movement: ['warehouse.movement.reverse'],
};

export function canUseWarehouseAction(permissions: readonly string[], action: WarehouseAction): boolean {
  const granted = new Set(permissions);
  return WAREHOUSE_ACTION_PERMISSIONS[action].every((permission) => granted.has(permission));
}
