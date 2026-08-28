import {PROTECTED_PERMISSION_CODES, PROTECTED_ROLE_IDS} from './accessPolicy';
import type {FoundationState, LocalUser} from './model';
import {positionSupportsUnit} from './unitPosition';

export type UserOrganizationIssueCode =
  | 'missing-personnel-link'
  | 'broken-personnel-link'
  | 'duplicate-personnel-link'
  | 'duplicate-user-link'
  | 'company-mismatch'
  | 'assignment-mismatch'
  | 'branch-assignment-mismatch'
  | 'manager-assignment-mismatch'
  | 'inactive-structure'
  | 'position-outside-unit'
  | 'invalid-role'
  | 'ended-personnel-active-account'
  | 'invalid-manager'
  | 'legacy-direct-grant';

export interface UserOrganizationHealth {
  user: LocalUser;
  personnelId?: string;
  linked: boolean;
  protectedAccess: boolean;
  issues: UserOrganizationIssueCode[];
}

export function userOrganizationHealth(user: LocalUser, state: Pick<FoundationState, 'personnel' | 'units' | 'positions' | 'roles' | 'users'>): UserOrganizationHealth {
  const issues: UserOrganizationIssueCode[] = [];
  const matchingPersonnel = state.personnel.filter((person) => person.id === user.personnelId || person.linkedUserId === user.id);
  const personnel = matchingPersonnel.find((person) => person.id === user.personnelId) ?? matchingPersonnel[0];
  const unit = state.units.find((item) => item.id === user.unitId);
  const position = state.positions.find((item) => item.id === user.positionId);

  if (!personnel) issues.push(user.personnelId ? 'broken-personnel-link' : 'missing-personnel-link');
  else {
    if (matchingPersonnel.length > 1) issues.push('duplicate-personnel-link');
    const usersLinkedToPersonnel = state.users.filter((item) => item.personnelId === personnel.id || personnel.linkedUserId === item.id);
    if (usersLinkedToPersonnel.length > 1) issues.push('duplicate-user-link');
    if (personnel.linkedUserId !== user.id || user.personnelId !== personnel.id) issues.push('broken-personnel-link');
    if (personnel.companyId && personnel.companyId !== user.companyId) issues.push('company-mismatch');
    if (personnel.unitId !== user.unitId || personnel.positionId !== user.positionId) issues.push('assignment-mismatch');
    if ((personnel.branchUnitId ?? '') !== (user.branchUnitId ?? '')) issues.push('branch-assignment-mismatch');
    const personnelManagerUser = personnel.managerPersonnelId
      ? state.users.find((item) => item.personnelId === personnel.managerPersonnelId || state.personnel.some((manager) => manager.id === personnel.managerPersonnelId && manager.linkedUserId === item.id))
      : undefined;
    if ((personnelManagerUser?.id ?? '') !== (user.managerUserId ?? '')) issues.push('manager-assignment-mismatch');
    if (personnel.employmentStatus === 'ended' && user.status === 'active') issues.push('ended-personnel-active-account');
  }

  if (!unit || unit.status !== 'active' || unit.type === 'شعبه' || !position || position.status !== 'active') issues.push('inactive-structure');
  else if (!positionSupportsUnit(position, unit.id)) issues.push('position-outside-unit');

  if (!user.roleIds.length || user.roleIds.some((roleId) => !state.roles.some((role) => role.id === roleId && role.status === 'active'))) issues.push('invalid-role');
  if (user.managerUserId) {
    const manager = state.users.find((item) => item.id === user.managerUserId);
    const managerPersonnel = manager && state.personnel.find((item) => item.id === manager.personnelId || item.linkedUserId === manager.id);
    if (!manager || manager.status !== 'active' || manager.id === user.id || manager.companyId !== user.companyId || (managerPersonnel && managerPersonnel.employmentStatus !== 'active')) issues.push('invalid-manager');
  }
  if (user.permissionGrants?.length) issues.push('legacy-direct-grant');

  return {
    user,
    personnelId: personnel?.id,
    linked: Boolean(personnel && personnel.linkedUserId === user.id && user.personnelId === personnel.id),
    protectedAccess: user.isAdmin || user.roleIds.some((roleId) => {
      const role = state.roles.find((item) => item.id === roleId);
      return PROTECTED_ROLE_IDS.has(roleId) || Boolean(role?.permissions.some((permission) => PROTECTED_PERMISSION_CODES.has(permission)));
    }),
    issues: [...new Set(issues)],
  };
}

export function userOrganizationIssueLabel(code: UserOrganizationIssueCode) {
  const labels: Record<UserOrganizationIssueCode, string> = {
    'missing-personnel-link': 'حساب به پرونده پرسنلی متصل نیست',
    'broken-personnel-link': 'پیوند دوطرفه حساب و پرسنل ناقص است',
    'duplicate-personnel-link': 'بیش از یک پرونده پرسنلی به این حساب اشاره می‌کند',
    'duplicate-user-link': 'این پرونده پرسنلی به بیش از یک حساب اشاره می‌کند',
    'company-mismatch': 'شرکت حساب و پرونده پرسنلی یکسان نیست',
    'assignment-mismatch': 'واحد یا سمت حساب با پرونده پرسنلی یکسان نیست',
    'branch-assignment-mismatch': 'شعبه حساب با شعبه پرونده پرسنلی یکسان نیست',
    'manager-assignment-mismatch': 'مدیر مستقیم حساب با مدیر ثبت‌شده در پرونده یکسان نیست',
    'inactive-structure': 'واحد یا سمت حساب نامعتبر یا غیرفعال است',
    'position-outside-unit': 'سمت برای واحد انتخاب‌شده مجاز نیست',
    'invalid-role': 'نقش دسترسی حساب نامعتبر یا غیرفعال است',
    'ended-personnel-active-account': 'همکاری پایان یافته اما حساب هنوز فعال است',
    'invalid-manager': 'مدیر مستقیم معتبر و فعال نیست',
    'legacy-direct-grant': 'مجوز مستقیم قدیمی باید از نقش مصوب جایگزین شود',
  };
  return labels[code];
}
