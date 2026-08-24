import {describe, expect, it} from 'vitest';
import {ORGANIZATIONAL_POSITIONS} from './seed';
import {positionSupportsUnit, positionsForUnit} from './unitPosition';

describe('unit-position catalog', () => {
  it('limits sales hierarchy positions to the sales unit', () => {
    const salesManager = ORGANIZATIONAL_POSITIONS.find((position) => position.id === 'position-sales-manager')!;

    expect(positionSupportsUnit(salesManager, 'unit-sales')).toBe(true);
    expect(positionSupportsUnit(salesManager, 'unit-warehouse')).toBe(false);
  });

  it('keeps general organizational positions available to eligible units', () => {
    const manager = ORGANIZATIONAL_POSITIONS.find((position) => position.id === 'position-manager')!;

    expect(positionSupportsUnit(manager, 'unit-sales')).toBe(true);
    expect(positionSupportsUnit(manager, 'unit-warehouse')).toBe(true);
  });

  it('returns only positions assigned to the selected unit', () => {
    const warehousePositions = positionsForUnit(ORGANIZATIONAL_POSITIONS, 'unit-warehouse');

    expect(warehousePositions.length).toBeGreaterThan(0);
    expect(warehousePositions.every((position) => position.unitIds.includes('unit-warehouse'))).toBe(true);
    expect(warehousePositions.some((position) => position.id === 'position-sales-manager')).toBe(false);
  });
});
