import {authorize, operationalRecordResource} from './authorization';
import {permissionFor} from './erpCatalog';
import type {OperationalRecord, QaPersona} from './model';

const PERSONNEL_ASSET_MODULES = ['fixed-asset', 'asset-transfer', 'asset-maintenance'] as const;
export type PersonnelAssetViewMode = 'self' | 'personnel-profile';

export function canViewPersonnelAssetRecord(persona: QaPersona, record: OperationalRecord): boolean {
  if (!PERSONNEL_ASSET_MODULES.includes(record.moduleId as (typeof PERSONNEL_ASSET_MODULES)[number])) return false;
  return authorize({
    persona,
    permission: permissionFor(record.moduleId, 'view'),
    action: 'view',
    resource: operationalRecordResource(persona, record),
  }).allowed;
}

export function canReadAssetRecordInView(viewMode: PersonnelAssetViewMode, persona: QaPersona, record: OperationalRecord): boolean {
  if (!PERSONNEL_ASSET_MODULES.includes(record.moduleId as (typeof PERSONNEL_ASSET_MODULES)[number])) return false;
  return viewMode === 'self' || canViewPersonnelAssetRecord(persona, record);
}

export function selectPersonnelAssetRecords(records: OperationalRecord[], persona: QaPersona, personnelId: string, viewMode: PersonnelAssetViewMode) {
  if (viewMode === 'self' && persona.personnelId !== personnelId) return {assets: [], currentAssets: [], transfers: [], reports: []};
  const visible = records.filter((record) => canReadAssetRecordInView(viewMode, persona, record));
  const transfers = visible.filter((record) => record.moduleId === 'asset-transfer' && record.ownerPersonnelId === personnelId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const reports = visible.filter((record) => record.moduleId === 'asset-maintenance' && record.ownerPersonnelId === personnelId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const relatedAssetIds = new Set([...transfers, ...reports].map((record) => record.relatedRecordId).filter((id): id is string => Boolean(id)));
  const assets = visible.filter((record) => record.moduleId === 'fixed-asset' && (record.payload.custodianPersonnelId === personnelId || relatedAssetIds.has(record.id)));
  const currentAssets = assets.filter((record) => record.status !== 'disposed' && record.payload.custodianPersonnelId === personnelId).sort((a, b) => a.title.localeCompare(b.title, 'fa'));
  return {assets, currentAssets, transfers, reports};
}
