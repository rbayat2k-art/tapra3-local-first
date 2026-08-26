import {PROTECTED_PERMISSION_CODES, PROTECTED_ROLE_IDS} from './accessPolicy';
import type {FoundationState, LocalUser} from './model';
import {positionSupportsUnit} from './unitPosition';

export type UserOrganizationIssueCode =
  | 'missing-personnel-link'
  | 'broken-personnel-link'
  | 'assignment-mismatch'
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
  const personnel = state.personnel.find((person) => person.id === user.personnelId || person.linkedUserId === user.id);
  const unit = state.units.find((item) => item.id === user.unitId);
  const position = state.positions.find((item) => item.id === user.positionId);

  if (!personnel) issues.push(user.personnelId ? 'broken-personnel-link' : 'missing-personnel-link');
  else {
    if (personnel.linkedUserId !== user.id || user.personnelId !== personnel.id) issues.push('broken-personnel-link');
    if (personnel.unitId !== user.unitId || personnel.positionId !== user.positionId) issues.push('assignment-mismatch');
    if (personnel.employmentStatus === 'ended' && user.status === 'active') issues.push('ended-personnel-active-account');
  }

  if (!unit || unit.status !== 'active' || unit.type === 'شعبه' || !position || position.status !== 'active') issues.push('inactive-structure');
  else if (!positionSupportsUnit(position, unit.id)) issues.push('position-outside-unit');

  if (!user.roleIds.length || user.roleIds.some((roleId) => !state.roles.some((role) => role.id === roleId && role.status === 'active'))) issues.push('invalid-role');
  if (user.managerUserId) {
    const manager = state.users.find((item) => item.id === user.managerUserId);
    if (!manager || manager.status !== 'active' || manager.id === user.id) issues.push('invalid-manager');
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
    'assignment-mismatch': 'واحد یا سمت حساب با پرونده پرسنلی یکسان نیست',
    'inactive-structure': 'واحد یا سمت حساب نامعتبر یا غیرفعال است',
    'position-outside-unit': 'سمت برای واحد انتخاب‌شده مجاز نیست',
    'invalid-role': 'نقش دسترسی حساب نامعتبر یا غیرفعال است',
    'ended-personnel-active-account': 'همکاری پایان یافته اما حساب هنوز فعال است',
    'invalid-manager': 'مدیر مستقیم معتبر و فعال نیست',
    'legacy-direct-grant': 'مجوز مستقیم قدیمی باید از نقش مصوب جایگزین شود',
  };
  return labels[code];
}
