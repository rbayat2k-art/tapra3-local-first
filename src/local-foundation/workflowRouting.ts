import type {FoundationState, LocalUser, OrganizationalUnit, PersonnelRecord} from './model';
import {todayIsoDate} from './PersianDate';

export type UnitManagerSource = 'acting' | 'permanent' | 'none';
type UnitManagerRoutingState = Pick<FoundationState, 'units' | 'users' | 'personnel'>;

export interface EffectiveUnitManagerResolution {
  unit: OrganizationalUnit;
  permanentManager?: LocalUser;
  actingManager?: LocalUser;
  effectiveManager?: LocalUser;
  source: UnitManagerSource;
  effectiveOn: string;
  reason: string;
}

function personnelForUser(state: UnitManagerRoutingState, user: LocalUser): PersonnelRecord | undefined {
  return state.personnel.find((person) => person.id === user.personnelId || person.linkedUserId === user.id);
}

function resolvedUnitCompanyId(state: UnitManagerRoutingState, unit: OrganizationalUnit): string | undefined {
  if (unit.companyId) return unit.companyId;
  const companyIds = new Set<string>();
  for (const user of state.users) {
    if (user.id === unit.managerUserId || user.id === unit.actingManager?.userId || user.unitId === unit.id || user.branchUnitId === unit.id) companyIds.add(user.companyId);
  }
  for (const person of state.personnel) {
    if (person.unitId === unit.id || person.branchUnitId === unit.id || person.salesBranchUnitId === unit.id) {
      if (person.companyId) companyIds.add(person.companyId);
    }
  }
  return companyIds.size === 1 ? [...companyIds][0] : undefined;
}

function activeSameCompanyPerson(state: UnitManagerRoutingState, unit: OrganizationalUnit, userId: string | undefined) {
  if (!userId || unit.status !== 'active') return undefined;
  const user = state.users.find((candidate) => candidate.id === userId && candidate.status === 'active');
  if (!user) return undefined;
  const personnel = personnelForUser(state, user);
  if (!personnel || personnel.employmentStatus !== 'active') return undefined;
  const companyId = resolvedUnitCompanyId(state, unit);
  if (!companyId || user.companyId !== companyId || (personnel.companyId && personnel.companyId !== companyId)) return undefined;
  return {user, personnel};
}

function hasBranchCoverage(user: LocalUser, personnel: PersonnelRecord, branchId: string): boolean {
  return user.branchUnitId === branchId
    || personnel.branchUnitId === branchId
    || personnel.salesBranchUnitId === branchId
    || user.advanceBranchIds?.includes(branchId) === true
    || user.advanceBranchIds?.includes('*') === true;
}

function permanentManager(state: UnitManagerRoutingState, unit: OrganizationalUnit): LocalUser | undefined {
  const candidate = activeSameCompanyPerson(state, unit, unit.managerUserId);
  if (!candidate) return undefined;
  if (unit.type === 'شعبه') return hasBranchCoverage(candidate.user, candidate.personnel, unit.id) ? candidate.user : undefined;
  return candidate.personnel.unitId === unit.id ? candidate.user : undefined;
}

function actingManager(state: UnitManagerRoutingState, unit: OrganizationalUnit): LocalUser | undefined {
  const candidate = activeSameCompanyPerson(state, unit, unit.actingManager?.userId);
  if (!candidate || !unit.parentId) return undefined;
  const parent = state.units.find((item) => item.id === unit.parentId);
  const unitCompanyId = resolvedUnitCompanyId(state, unit);
  const parentCompanyId = parent ? resolvedUnitCompanyId(state, parent) : undefined;
  if (!parent || parent.status !== 'active' || parent.type === 'شعبه' || !unitCompanyId || parentCompanyId !== unitCompanyId) return undefined;
  if (unit.type === 'شعبه') return candidate.personnel.unitId === unit.parentId ? candidate.user : undefined;
  return candidate.personnel.unitId === unit.parentId ? candidate.user : undefined;
}

export function actingAssignmentIsCurrent(unit: OrganizationalUnit, onDate = todayIsoDate()): boolean {
  return Boolean(unit.actingManager && unit.actingManager.startsOn <= onDate && unit.actingManager.endsOn >= onDate);
}

/** Canonical routing source for manager-bound workflow stages. */
export function resolveEffectiveUnitManager(state: UnitManagerRoutingState, unitOrId: OrganizationalUnit | string, onDate = todayIsoDate()): EffectiveUnitManagerResolution | undefined {
  const unit = typeof unitOrId === 'string' ? state.units.find((candidate) => candidate.id === unitOrId) : unitOrId;
  if (!unit) return undefined;
  const permanent = permanentManager(state, unit);
  const assignment = actingAssignmentIsCurrent(unit, onDate) ? unit.actingManager : undefined;
  const acting = assignment ? actingManager(state, unit) : undefined;
  if (acting) return {unit, permanentManager: permanent, actingManager: acting, effectiveManager: acting, source: 'acting', effectiveOn: onDate, reason: 'جانشین موقت فعال در بازه مصوب'};
  // An active but invalid delegation is a broken authorization state. Falling
  // back silently would let the permanent manager bypass the exclusive acting
  // period and hide the configuration error from workflow queues.
  if (assignment) return {unit, permanentManager: permanent, source: 'none', effectiveOn: onDate, reason: 'جانشین موقتِ داخل بازه دیگر فعال یا واجد شرایط نیست؛ گردش تا اصلاح جانشینی متوقف است'};
  if (permanent) return {unit, permanentManager: permanent, effectiveManager: permanent, source: 'permanent', effectiveOn: onDate, reason: 'مدیر دائم معتبر'};
  return {unit, source: 'none', effectiveOn: onDate, reason: 'مدیر مؤثر فعال و معتبر برای این واحد پیدا نشد'};
}

export function effectiveUnitManagerUserIdFromState(state: UnitManagerRoutingState, unitOrId: OrganizationalUnit | string, onDate = todayIsoDate()): string | undefined {
  return resolveEffectiveUnitManager(state, unitOrId, onDate)?.effectiveManager?.id;
}

export function userIsEffectiveUnitManager(state: UnitManagerRoutingState, unitOrId: OrganizationalUnit | string, userId: string, onDate = todayIsoDate()): boolean {
  return effectiveUnitManagerUserIdFromState(state, unitOrId, onDate) === userId;
}
