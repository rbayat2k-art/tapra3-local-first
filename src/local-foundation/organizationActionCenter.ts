import {branchHealthInsight, salesStructureHealthInsight} from './branchSalesHealth';
import type {FoundationState, PermissionCode} from './model';
import {organizationStructureHealth} from './organizationStructure';
import {normalizePersonName} from './personIdentity';
import {positionUsage} from './positionUsage';
import {registrationQueueInsight} from './registrationQueue';
import {roleInsight} from './roleInsights';
import {PERMISSION_CATALOG} from './seed';
import {userOrganizationHealth} from './userOrganizationHealth';

export interface OrganizationActionItem {
  id: 'units' | 'branches' | 'positions' | 'personnel' | 'sales' | 'users' | 'roles' | 'registrations';
  page: 'units' | 'branches' | 'positions' | 'personnel' | 'sales-structures' | 'users' | 'roles' | 'registrations';
  title: string;
  detail: string;
  count: number;
  permission: PermissionCode;
}

export function organizationActionItems(state: FoundationState): OrganizationActionItem[] {
  const structure = organizationStructureHealth(state);
  const branchIssues = state.units.filter((unit) => unit.type === 'شعبه' && branchHealthInsight(unit, state).issues.length > 0).length;
  const positionIssues = state.positions.filter((position) => {
    const usage = positionUsage(state, position);
    return usage.invalidActivePeople.length > 0 || (position.status === 'inactive' && usage.activePeople.length > 0) || usage.inactiveUnits > 0;
  }).length;
  const duplicateNames = duplicatePersonnelNameGroupCount(state);
  const salesIssues = state.salesStructures.filter((item) => salesStructureHealthInsight(item, state).issues.length > 0).length;
  const userIssues = state.users.filter((user) => userOrganizationHealth(user, state).issues.length > 0).length;
  const roleIssues = state.roles.filter((role) => roleInsight(role, state.users, PERMISSION_CATALOG).attention.length > 0).length;
  const registrationActions = state.registrationRequests.filter((request) => registrationQueueInsight(request).lane !== 'closed').length;

  return [
    {id:'units', page:'units', title:'واحدهای سازمانی', detail:'واحد بدون مدیر فعال یا رابطه بالادست نامعتبر', count:structure.unitsWithoutActiveManager + structure.invalidParents, permission:'organization.units.view'},
    {id:'branches', page:'branches', title:'شعبه‌ها', detail:'مسئول، استقرار پرسنل یا مسیر فروش ناقص', count:branchIssues, permission:'organization.units.view'},
    {id:'positions', page:'positions', title:'سمت‌ها', detail:'انتساب خارج از واحد یا وابستگی غیرفعال', count:positionIssues, permission:'organization.positions.view'},
    {id:'personnel', page:'personnel', title:'پرسنل هم‌نام', detail:'گروه‌های نام مشابه که باید با کد پرسنلی تفکیک شوند', count:duplicateNames, permission:'organization.personnel.view'},
    {id:'sales', page:'sales-structures', title:'ساختار فروش', detail:'زنجیره، شعبه یا سرپرست فروش ناسازگار', count:salesIssues, permission:'organization.personnel.view'},
    {id:'users', page:'users', title:'حساب‌های کاربری', detail:'پیوند پرسنلی، جایگاه یا نقش حساب ناسازگار', count:userIssues, permission:'foundation.users.view'},
    {id:'roles', page:'roles', title:'نقش‌ها و دسترسی‌ها', detail:'نقش بدون استفاده، بدون مجوز یا دارای مرجع ناشناخته', count:roleIssues, permission:'organization.roles.view'},
    {id:'registrations', page:'registrations', title:'صف ثبت‌نام', detail:'درخواست باز در انتظار متقاضی، منابع انسانی یا مدیر سامانه', count:registrationActions, permission:'organization.registrations.view'},
  ];
}

function duplicatePersonnelNameGroupCount(state: Pick<FoundationState, 'personnel'>) {
  const counts = new Map<string, number>();
  state.personnel.filter((person) => person.employmentStatus === 'active').forEach((person) => {
    const key = normalizePersonName(`${person.firstName} ${person.lastName}`);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return [...counts.values()].filter((count) => count > 1).length;
}
