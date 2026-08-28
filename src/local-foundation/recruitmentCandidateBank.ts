import type {OperationalRecord, OperationalRecordHistory} from './model';

export type RecruitmentBankFilter =
  | 'all'
  | 'interviewed'
  | 'reusable'
  | 'rejected'
  | 'withdrawn'
  | 'training'
  | 'contracted';

const INTERVIEW_AND_AFTER = new Set([
  'interview_scheduled',
  'evaluated',
  'offer_sent',
  'offer_accepted',
  'ready_to_start',
  'training',
  'contracted',
]);

export const REUSABLE_RECRUITMENT_STATES = new Set(['rejected', 'withdrawn', 'closed']);

const payloadText = (record: OperationalRecord, key: string) => {
  const value = record.payload[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
};

export function hasRecruitmentCandidate(record: OperationalRecord): boolean {
  const candidateName = payloadText(record, 'candidateName').trim();
  return Boolean(candidateName && candidateName !== 'هنوز انتخاب نشده');
}

export function recruitmentReachedInterview(record: OperationalRecord, history: OperationalRecordHistory[]): boolean {
  if (INTERVIEW_AND_AFTER.has(record.status)) return true;
  return history.some((item) => item.recordId === record.id && Boolean(item.toState && INTERVIEW_AND_AFTER.has(item.toState)));
}

export function isReusableRecruitmentCandidate(record: OperationalRecord): boolean {
  return hasRecruitmentCandidate(record) && REUSABLE_RECRUITMENT_STATES.has(record.status);
}

export function matchesRecruitmentCandidateQuery(record: OperationalRecord, query: string, unitName = ''): boolean {
  const normalized = query.trim().toLocaleLowerCase('fa');
  if (!normalized) return true;
  const searchable = [
    record.title,
    record.trackingCode,
    unitName,
    payloadText(record, 'candidateName'),
    payloadText(record, 'candidateMobile'),
    payloadText(record, 'candidateNationalId'),
    payloadText(record, 'positionTitle'),
    payloadText(record, 'contactChannel'),
    payloadText(record, 'personnelCode'),
  ].join(' ').toLocaleLowerCase('fa');
  return searchable.includes(normalized);
}

export function matchesRecruitmentBankFilter(
  record: OperationalRecord,
  history: OperationalRecordHistory[],
  filter: RecruitmentBankFilter,
): boolean {
  if (filter === 'all') return true;
  if (!hasRecruitmentCandidate(record)) return false;
  if (filter === 'interviewed') return recruitmentReachedInterview(record, history);
  if (filter === 'reusable') return isReusableRecruitmentCandidate(record);
  return record.status === filter;
}

export function recruitmentReuseCount(recordId: string, records: OperationalRecord[]): number {
  return records.filter((record) => record.payload.sourceCandidateRecordId === recordId).length;
}

export function recruitmentSourceRecordId(record: OperationalRecord): string | undefined {
  return typeof record.payload.sourceCandidateRecordId === 'string' ? record.payload.sourceCandidateRecordId : undefined;
}
