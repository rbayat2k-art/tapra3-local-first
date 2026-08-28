import type {FoundationState, LocalUser, PersonnelRecord} from './model';

export function normalizePersonName(value: string): string {
  return value.normalize('NFKC').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200c\u200f]/g, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase('fa-IR');
}

export function personnelDisplayLabel(person: PersonnelRecord, state: Pick<FoundationState, 'units'|'positions'>): string {
  const unit = state.units.find((item) => item.id === person.unitId)?.name ?? 'واحد نامشخص';
  const position = state.positions.find((item) => item.id === person.positionId)?.title ?? 'سمت نامشخص';
  return `${person.firstName} ${person.lastName} — ${person.personnelCode} — ${unit} — ${position}`;
}

export function userDisplayLabel(user: LocalUser, state: Pick<FoundationState, 'units'|'positions'|'personnel'>): string {
  const unit = state.units.find((item) => item.id === user.unitId)?.name ?? 'واحد نامشخص';
  const position = state.positions.find((item) => item.id === user.positionId)?.title ?? 'سمت نامشخص';
  const personnelCode = state.personnel.find((item) => item.id === user.personnelId)?.personnelCode;
  return `${user.name} — @${user.username}${personnelCode ? ` — ${personnelCode}` : ''} — ${unit} — ${position}`;
}

export function sameNamePersonnel(person: PersonnelRecord, all: PersonnelRecord[]): PersonnelRecord[] {
  const normalized = normalizePersonName(`${person.firstName} ${person.lastName}`);
  return all.filter((candidate) => candidate.id !== person.id && normalizePersonName(`${candidate.firstName} ${candidate.lastName}`) === normalized);
}

export function sameNameUsers(user: LocalUser, all: LocalUser[]): LocalUser[] {
  const normalized = normalizePersonName(user.name);
  return all.filter((candidate) => candidate.id !== user.id && normalizePersonName(candidate.name) === normalized);
}
