import {describe, expect, it} from 'vitest';
import {createSeedData} from './seed';
import type {LocalUser, OrganizationalUnit, PersonnelRecord} from './model';
import {todayIsoDate} from './PersianDate';
import {resolveEffectiveUnitManager} from './workflowRouting';

function actingBranch() {
  const seed = createSeedData();
  const users = seed.users as LocalUser[];
  const personnel = seed.personnel as PersonnelRecord[];
  const units = seed.organizational_units as OrganizationalUnit[];
  const baseUser = users.find((user) => user.id === 'persona-advance-branch-manager')!;
  const basePerson = personnel.find((person) => person.id === baseUser.personnelId)!;
  const actingUser: LocalUser = {...baseUser, id:'persona-acting-manager', actorId:'actor-acting-manager', personnelId:'personnel-acting-manager', branchUnitId:undefined, advanceBranchIds:[]};
  const actingPersonnel: PersonnelRecord = {...basePerson, id:'personnel-acting-manager', linkedUserId:actingUser.id, unitId:'unit-management', branchUnitId:undefined, salesBranchUnitId:undefined};
  const branch = units.find((unit) => unit.id === 'unit-branch-central')!;
  const updatedBranch: OrganizationalUnit = {...branch, actingManager:{userId:actingUser.id,reason:'مرخصی مدیر دائم',startsOn:'2026-08-28',endsOn:'2026-08-30',assignedAt:'2026-08-27T12:00:00.000Z',assignedByActorId:'actor-admin'}};
  return {state:{users:[...users,actingUser],personnel:[...personnel,actingPersonnel],units:units.map((unit)=>unit.id===branch.id?updatedBranch:unit)},branch:updatedBranch,actingUser};
}

describe('effective manager workflow routing', () => {
  it('uses the acting assignment on both inclusive date boundaries and permanent outside them', () => {
    const {state,branch,actingUser}=actingBranch();
    expect(resolveEffectiveUnitManager(state,branch,'2026-08-27')?.source).toBe('permanent');
    expect(resolveEffectiveUnitManager(state,branch,'2026-08-28')?.effectiveManager?.id).toBe(actingUser.id);
    expect(resolveEffectiveUnitManager(state,branch,'2026-08-30')?.effectiveManager?.id).toBe(actingUser.id);
    expect(resolveEffectiveUnitManager(state,branch,'2026-08-31')?.source).toBe('permanent');
  });

  it('does not use an inactive, cross-company, or parent-isolated acting manager', () => {
    const {state,branch,actingUser}=actingBranch();
    const inactive={...state,users:state.users.map((user)=>user.id===actingUser.id?{...user,status:'inactive' as const}:user)};
    expect(resolveEffectiveUnitManager(inactive,branch,'2026-08-29')?.source).toBe('none');
    const crossCompany={...state,users:state.users.map((user)=>user.id===actingUser.id?{...user,companyId:'company-other'}:user)};
    expect(resolveEffectiveUnitManager(crossCompany,branch,'2026-08-29')?.source).toBe('none');
    const wrongParent={...state,personnel:state.personnel.map((person)=>person.id==='personnel-acting-manager'?{...person,unitId:'unit-finance'}:person)};
    expect(resolveEffectiveUnitManager(wrongParent,branch,'2026-08-29')?.source).toBe('none');
    const orphanParent={...state,units:state.units.filter((unit)=>unit.id!==branch.parentId)};
    expect(resolveEffectiveUnitManager(orphanParent,branch,'2026-08-29')?.source).toBe('none');
    const inactiveParent={...state,units:state.units.map((unit)=>unit.id===branch.parentId?{...unit,status:'inactive' as const}:unit)};
    expect(resolveEffectiveUnitManager(inactiveParent,branch,'2026-08-29')?.source).toBe('none');
    const crossCompanyParent={...state,units:state.units.map((unit)=>unit.id===branch.parentId?{...unit,companyId:'company-other'}:unit)};
    expect(resolveEffectiveUnitManager(crossCompanyParent,branch,'2026-08-29')?.source).toBe('none');
    const branchParent={...state,units:state.units.map((unit)=>unit.id===branch.parentId?{...unit,type:'شعبه'}:unit)};
    expect(resolveEffectiveUnitManager(branchParent,branch,'2026-08-29')?.source).toBe('none');
  });

  it('derives the operational date explicitly from Tehran at the UTC boundary', () => {
    expect(todayIsoDate(new Date('2026-08-28T20:29:59.000Z'))).toBe('2026-08-28');
    expect(todayIsoDate(new Date('2026-08-28T20:30:00.000Z'))).toBe('2026-08-29');
  });
});
