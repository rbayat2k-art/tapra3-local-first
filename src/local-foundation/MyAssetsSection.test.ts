import {describe, expect, it} from 'vitest';
import type {OperationalRecord} from './model';
import {canReadAssetRecordInView, canViewPersonnelAssetRecord, selectPersonnelAssetRecords} from './personnelAssetVisibility';
import {QA_PERSONAS} from './seed';

const record = (moduleId: string, unitId: string): OperationalRecord => ({
  id: `${moduleId}-${unitId}`,
  moduleId,
  domain: 'asset',
  trackingCode: 'ASSET-SCOPE-TEST',
  title: 'دارایی آزمون محدوده',
  description: 'شرح محرمانه آزمون',
  status: 'active',
  priority: 'normal',
  companyId: 'company-tapra-main',
  unitId,
  createdByActorId: 'actor-asset-manager',
  createdByUserId: 'persona-asset-manager',
  updatedByActorId: 'actor-asset-manager',
  version: 1,
  payload: {serialNumber: 'SERIAL-SCOPE-TEST'},
  createdAt: '2026-08-25T08:00:00.000Z',
  updatedAt: '2026-08-25T08:00:00.000Z',
});

describe('personnel asset record visibility', () => {
  it('shows only asset records inside the viewers authorized scope', () => {
    const admin = QA_PERSONAS.find((item) => item.id === 'persona-product-owner')!;
    const unitViewer = {...admin, isAdmin: false, scope: 'UNIT' as const, unitId: 'unit-sales', permissionEntitlements: admin.permissions.map((permission) => ({permission, scope: 'UNIT' as const, source: 'role' as const, sourceRoleId: 'test-unit-viewer'}))};

    for (const moduleId of ['fixed-asset', 'asset-transfer', 'asset-maintenance']) {
      expect(canViewPersonnelAssetRecord(unitViewer, record(moduleId, 'unit-sales'))).toBe(true);
      expect(canViewPersonnelAssetRecord(unitViewer, record(moduleId, 'unit-warehouse'))).toBe(false);
    }
  });

  it('fails closed for records outside the personnel asset modules', () => {
    const admin = QA_PERSONAS.find((item) => item.id === 'persona-product-owner')!;
    expect(canViewPersonnelAssetRecord(admin, record('leave', 'unit-sales'))).toBe(false);
    expect(canReadAssetRecordInView('self', admin, record('leave', 'unit-sales'))).toBe(false);
  });

  it('preserves the existing self-service ownership view without management permissions', () => {
    const seller = QA_PERSONAS.find((item) => item.id === 'persona-seller')!;
    const ownAsset = {...record('fixed-asset', seller.unitId), id: 'own-asset', payload: {custodianPersonnelId: seller.personnelId, serialNumber: 'OWN-SERIAL'}};
    const otherAsset = {...record('fixed-asset', seller.unitId), id: 'other-asset', payload: {custodianPersonnelId: 'personnel-other', serialNumber: 'OTHER-SERIAL'}};
    const ownTransfer = {...record('asset-transfer', seller.unitId), id: 'own-transfer', ownerPersonnelId: seller.personnelId, relatedRecordId: ownAsset.id};
    const otherTransfer = {...record('asset-transfer', seller.unitId), id: 'other-transfer', ownerPersonnelId: 'personnel-other', relatedRecordId: otherAsset.id};

    expect(canReadAssetRecordInView('self', seller, ownAsset)).toBe(true);
    expect(canReadAssetRecordInView('personnel-profile', seller, ownAsset)).toBe(false);
    const selected = selectPersonnelAssetRecords([ownAsset, otherAsset, ownTransfer, otherTransfer], seller, seller.personnelId!, 'self');
    expect(selected.currentAssets.map((item) => item.id)).toEqual(['own-asset']);
    expect(selected.transfers.map((item) => item.id)).toEqual(['own-transfer']);
    expect(selected.assets.map((item) => item.id)).not.toContain('other-asset');
  });
});
