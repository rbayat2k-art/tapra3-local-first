import { describe, expect, it } from 'vitest';
import { canUseWarehouseAction, WAREHOUSE_ACTION_PERMISSIONS, type WarehouseAction } from './warehouseAccess';

const actions = Object.keys(WAREHOUSE_ACTION_PERMISSIONS) as WarehouseAction[];

describe('Warehouse UI action visibility', () => {
  it('does not expose any mutation to a read-only user', () => {
    for (const action of actions) expect(canUseWarehouseAction(['warehouse.read'], action), action).toBe(false);
  });

  it('keeps maker and approver actions separate', () => {
    const maker = ['warehouse.read', 'warehouse.adjustment.create', 'warehouse.count.create'];
    expect(canUseWarehouseAction(maker, 'create_adjustment')).toBe(true);
    expect(canUseWarehouseAction(maker, 'create_count')).toBe(true);
    expect(canUseWarehouseAction(maker, 'approve_adjustment')).toBe(false);
    expect(canUseWarehouseAction(maker, 'approve_count')).toBe(false);

    const approver = ['warehouse.read', 'warehouse.adjustment.approve', 'warehouse.count.approve'];
    expect(canUseWarehouseAction(approver, 'approve_adjustment')).toBe(true);
    expect(canUseWarehouseAction(approver, 'approve_count')).toBe(true);
    expect(canUseWarehouseAction(approver, 'create_adjustment')).toBe(false);
    expect(canUseWarehouseAction(approver, 'create_count')).toBe(false);
  });

  it('requires every elevated permission for manual receipt and transfer reversal', () => {
    expect(canUseWarehouseAction(['warehouse.receiving.create'], 'create_manual_receipt')).toBe(false);
    expect(canUseWarehouseAction([
      'warehouse.receiving.create', 'warehouse.receiving.manual',
    ], 'create_manual_receipt')).toBe(true);
    expect(canUseWarehouseAction(['warehouse.transfer.manage'], 'reverse_transfer')).toBe(false);
    expect(canUseWarehouseAction([
      'warehouse.transfer.manage', 'warehouse.movement.reverse',
    ], 'reverse_transfer')).toBe(true);
  });
});
