import {describe, expect, it} from 'vitest';
import {FOUNDATION_STORES} from './model';
import {ADMINISTRATIVE_ADVANCE_REQUESTER_USER_IDS, createSeedData, LOCAL_USERS, ORGANIZATIONAL_POSITIONS, ORGANIZATIONAL_UNITS, PERSONNEL_RECORDS, QA_PERSONAS, resolveUserAccess, SALES_STRUCTURES, SECURITY_ROLES, SEED_TIME} from './seed';
import {salesStructureHasAssignmentHistory, salesStructureSupervisorName} from './salesStructureIdentity';
import {positionIdForSalesHierarchy} from './salesPersonnelIdentity';
import {isValidQaNationalId} from './qaPersonnelCompletion';
import {isProfileComplete, validateRequiredProfile} from './profileCompletion';

describe('deterministic local seed', () => {
  it('produces the same ids, actors and timestamps every time', () => {
    expect(createSeedData()).toEqual(createSeedData());
    expect(createSeedData().audit_events[0].occurredAt).toBe(SEED_TIME);
  });

  it('covers every declared foundation store', () => {
    expect(Object.keys(createSeedData()).sort()).toEqual([...FOUNDATION_STORES].sort());
  });

  it('keeps maker and approver actors separate', () => {
    const maker = QA_PERSONAS.find((item) => item.id === 'persona-inventory-maker');
    const approver = QA_PERSONAS.find((item) => item.id === 'persona-inventory-approver');
    expect(maker?.actorId).not.toBe(approver?.actorId);
    expect(maker?.permissions).toContain('business.inventory.adjust');
    expect(maker?.permissions).not.toContain('business.inventory.approve');
    expect(approver?.permissions).toContain('business.inventory.approve');
  });

  it('models QA identities as users with product status and admin-only QA login', () => {
    const admin = LOCAL_USERS.find((item) => item.roleId === 'role-admin')!;
    const seller = LOCAL_USERS.find((item) => item.id === 'persona-laleh')!;
    expect(admin.roleTitle).toBe('ادمین');
    expect(admin.permissions).toContain('foundation.users.qa_login');
    expect(seller.permissions).not.toContain('foundation.users.qa_login');
    expect(LOCAL_USERS.filter((item) => item.personnelId).every((item) => item.status === 'active')).toBe(true);
  });

  it('applies denials but quarantines legacy direct grants without mutating the role bundle', () => {
    const seller = LOCAL_USERS.find((item) => item.id === 'persona-laleh')!;
    const sellerRole = SECURITY_ROLES.find((item) => item.id === seller.roleId)!;
    const denied = sellerRole.permissions[0];
    const granted = 'foundation.audit.view';
    const roleSnapshot = [...sellerRole.permissions];
    const resolved = resolveUserAccess({...seller, permissionGrants: [granted], permissionDenials: [denied]}, SECURITY_ROLES);
    expect(resolved.permissions).not.toContain(denied);
    expect(resolved.permissions).not.toContain(granted);
    expect(resolved.permissionEntitlements?.some((item) => item.source === 'user-grant')).toBe(false);
    expect(sellerRole.permissions).toEqual(roleSnapshot);
  });

  it('uses one official seller role with both base and sales permissions', () => {
    const sellerRole = SECURITY_ROLES.find((item) => item.id === 'role-sales-seller')!;
    expect(SECURITY_ROLES.some((item) => item.id === 'role-seller')).toBe(false);
    expect(sellerRole.name).toBe('فروشنده');
    expect(sellerRole.permissions).toContain('foundation.dashboard.view');
    expect(sellerRole.permissions).toContain('foundation.preferences.manage');
    expect(sellerRole.permissions).toContain('crm.lead.view');
    expect(sellerRole.permissions).toContain('sales.sale.create');
  });

  it('ships every active sales-network personnel with an active linked login', () => {
    const salesPersonnel = PERSONNEL_RECORDS.filter((item) => item.employmentStatus === 'active' && item.salesHierarchyLevel);
    expect(salesPersonnel.length).toBeGreaterThan(0);
    for (const person of salesPersonnel) {
      const linkedUser = LOCAL_USERS.find((user) => user.id === person.linkedUserId);
      expect(linkedUser, `${person.personnelCode} باید حساب متصل داشته باشد`).toBeDefined();
      expect(linkedUser?.status).toBe('active');
      expect(linkedUser?.personnelId).toBe(person.id);
      const roleByLevel = {sales_vice: 'role-sales-vice', sales_manager: 'role-sales-manager', senior_supervisor: 'role-senior-sales-supervisor', sales_supervisor: 'role-sales-supervisor', seller: 'role-sales-seller'} as const;
      expect(linkedUser?.roleIds).toContain(roleByLevel[person.salesHierarchyLevel!]);
      expect(linkedUser?.salesHierarchyLevel).toBe(person.salesHierarchyLevel);
    }
  });

  it('keeps positions separate from security roles and the unit tree acyclic', () => {
    expect(ORGANIZATIONAL_POSITIONS.map((item) => item.id)).not.toEqual(SECURITY_ROLES.map((item) => item.id));
    for (const unit of ORGANIZATIONAL_UNITS) {
      const visited = new Set<string>([unit.id]);
      let parentId = unit.parentId;
      while (parentId) {
        expect(visited.has(parentId)).toBe(false);
        visited.add(parentId);
        parentId = ORGANIZATIONAL_UNITS.find((item) => item.id === parentId)?.parentId;
      }
    }
  });

  it('contains the approved organization units once after terminology normalization', () => {
    const unitNames = ORGANIZATIONAL_UNITS.filter((unit) => unit.type !== 'شعبه').map((unit) => unit.name);
    expect(unitNames).toHaveLength(29);
    expect(new Set(unitNames)).toHaveLength(unitNames.length);
    expect(unitNames).toEqual(expect.arrayContaining(['منابع انسانی', 'حسابداری', 'خزانه', 'فروش', 'عملیات', 'پذیرندگان', 'تیم افزایشی', 'پشتیبانی', 'اعتبارسنجی', 'فروش تقویتی']));
    expect(unitNames).not.toEqual(expect.arrayContaining(['واحد عملیات', 'افزایشی', 'پذیرنگان']));
  });

  it('assigns organization, position and at least one role to every seed user', () => {
    for (const user of LOCAL_USERS) {
      expect(ORGANIZATIONAL_UNITS.some((unit) => unit.id === user.unitId)).toBe(true);
      expect(ORGANIZATIONAL_POSITIONS.some((position) => position.id === user.positionId)).toBe(true);
      expect(user.roleIds.length).toBeGreaterThan(0);
      expect(user.passwordHash).toMatch(/^pbkdf2\$120000\$/);
    }
  });

  it('gives every approved administrative employee own-only advance access', () => {
    const requesterRole = SECURITY_ROLES.find((role) => role.id === 'role-employee-advance-requester')!;
    expect(requesterRole.scope).toBe('SELF');
    for (const userId of ADMINISTRATIVE_ADVANCE_REQUESTER_USER_IDS) {
      const user = LOCAL_USERS.find((item) => item.id === userId);
      expect(user, `${userId} باید در داده نمونه وجود داشته باشد`).toBeDefined();
      expect(user?.status).toBe('active');
      expect(user?.roleIds).toContain('role-employee-advance-requester');
      expect(user?.permissionEntitlements?.some((item) => item.sourceRoleId === 'role-employee-advance-requester' && item.scope === 'SELF')).toBe(true);
    }
    expect(LOCAL_USERS.find((item) => item.id === 'persona-auditor')?.roleIds).not.toContain('role-employee-advance-requester');
  });

  it('has a valid active responsible user for every staffed unit and every branch', () => {
    const staffedUnitIds = new Set(PERSONNEL_RECORDS.filter((person) => person.employmentStatus === 'active').map((person) => person.unitId));
    for (const unit of ORGANIZATIONAL_UNITS.filter((item) => item.type === 'شعبه' || staffedUnitIds.has(item.id))) {
      const manager = LOCAL_USERS.find((user) => user.id === unit.managerUserId);
      expect(manager, `${unit.name} باید مسئول مشخص داشته باشد`).toBeDefined();
      expect(manager?.status).toBe('active');
      if (unit.type === 'شعبه') expect(manager?.roleIds).toContain('role-advance-branch-manager');
      else expect(PERSONNEL_RECORDS.find((person) => person.id === manager?.personnelId)?.unitId).toBe(unit.id);
    }
  });

  it('keeps people with the same name as distinct linked identities', () => {
    const users = LOCAL_USERS.filter((user) => user.name === 'سودابه مرادی');
    expect(users).toHaveLength(2);
    expect(new Set(users.map((user) => user.id)).size).toBe(2);
    expect(new Set(users.map((user) => user.actorId)).size).toBe(2);
    expect(new Set(users.map((user) => user.username)).size).toBe(2);
    expect(new Set(users.map((user) => user.personnelId)).size).toBe(2);
    for (const user of users) expect(PERSONNEL_RECORDS.find((person) => person.id === user.personnelId)?.linkedUserId).toBe(user.id);
  });

  it('assigns deterministic sales access roles from the approved sales hierarchy', () => {
    const expected = {sales_vice: 'role-sales-vice', sales_manager: 'role-sales-manager', senior_supervisor: 'role-senior-sales-supervisor', sales_supervisor: 'role-sales-supervisor', seller: 'role-sales-seller'} as const;
    for (const user of LOCAL_USERS.filter((item) => item.salesHierarchyLevel)) expect(user.roleIds).toContain(expected[user.salesHierarchyLevel!]);
  });

  it('identifies every sales structure by its call-center supervisor, not a separate name', () => {
    for (const structure of SALES_STRUCTURES) {
      expect('name' in structure).toBe(false);
      const supervisor = PERSONNEL_RECORDS.find((person) => person.id === structure.callCenterSupervisorPersonnelId)!;
      expect(salesStructureSupervisorName(structure, PERSONNEL_RECORDS)).toBe(`${supervisor.firstName} ${supervisor.lastName}`);
    }
  });

  it('locks editing after the first current or historical personnel assignment', () => {
    expect(salesStructureHasAssignmentHistory('sales-structure-saadat-a', PERSONNEL_RECORDS)).toBe(true);
    expect(salesStructureHasAssignmentHistory('sales-structure-saadat-b', PERSONNEL_RECORDS)).toBe(false);
    const historical = PERSONNEL_RECORDS.map((person, index) => index ? person : {...person, movements: [{id: 'movement-test', kind: 'sales_transfer' as const, fromId: 'sales-structure-saadat-c', toId: 'sales-structure-saadat-a', effectiveDate: '2026-01-01', reason: 'آزمون', actorId: 'actor-test', actorName: 'آزمون', recordedAt: '2026-01-01T00:00:00.000Z'}]});
    expect(salesStructureHasAssignmentHistory('sales-structure-saadat-c', historical)).toBe(true);
  });

  it('uses the sales hierarchy as position and keeps one branch identity', () => {
    for (const person of PERSONNEL_RECORDS.filter((item) => item.salesHierarchyLevel)) {
      expect(person.positionId).toBe(positionIdForSalesHierarchy(person.salesHierarchyLevel));
      expect(person.salesBranchUnitId).toBe(person.branchUnitId);
      expect(person.salesAssignmentStartDate).toBe(person.startDate);
      if (person.salesCompensationHistory?.length) expect(person.salesCompensationHistory[0].effectiveFrom).toBe(person.salesAssignmentStartDate);
    }
  });

  it('ships every demo personnel record with complete, unique required QA data', () => {
    const nationalIds = new Set<string>();
    const mobiles = new Set<string>();
    for (const person of PERSONNEL_RECORDS) {
      expect(isProfileComplete(person)).toBe(true);
      expect(validateRequiredProfile(person)).toEqual([]);
      expect(isValidQaNationalId(person.nationalId)).toBe(true);
      expect(nationalIds.has(person.nationalId!)).toBe(false);
      expect(mobiles.has(person.primaryMobile)).toBe(false);
      expect(mobiles.has(person.secondaryMobile!)).toBe(false);
      nationalIds.add(person.nationalId!);
      mobiles.add(person.primaryMobile);
      mobiles.add(person.secondaryMobile!);
    }
  });
});
