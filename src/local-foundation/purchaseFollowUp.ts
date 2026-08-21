import type {FoundationState, OperationalRecord} from './model';

export const TREASURY_QUEUE_STATUSES = new Set(['queued', 'claimed']);

function localDayKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function treasuryQueueStartedAt(state: FoundationState, record: OperationalRecord): string {
  return state.operationalHistory
    .filter((item) => item.recordId === record.id && item.toState === 'sent_to_treasury')
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]?.occurredAt ?? record.updatedAt ?? record.createdAt;
}

export function linkedTreasuryQueueRecords(state: FoundationState, record: OperationalRecord): OperationalRecord[] {
  return state.operationalRecords.filter((item) => item.moduleId === 'treasury-execution' && item.relatedRecordId === record.id && TREASURY_QUEUE_STATUSES.has(item.status));
}

export function canRequestTreasuryFollowUp(state: FoundationState, record: OperationalRecord, now = new Date()): boolean {
  if (record.moduleId !== 'purchase-request' || record.status !== 'sent_to_treasury') return false;
  if (record.createdByUserId !== state.activeUser.id || !state.activeUser.roleIds.includes('role-purchase-requester')) return false;
  if (!linkedTreasuryQueueRecords(state, record).length) return false;
  return localDayKey(now) > localDayKey(treasuryQueueStartedAt(state, record));
}

export function treasuryFollowUpDedupeKey(recordId: string, now = new Date()): string {
  return `treasury-follow-up:${recordId}:${localDayKey(now)}`;
}
