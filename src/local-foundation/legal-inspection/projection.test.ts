import {describe, expect, it} from 'vitest';
import {createSeedData} from '../seed';
import type {LocalUser, SecurityRole} from '../model';
import {projectLegalInspection, type LegalProjectionSource} from './projection';

function actorWith(...permissions: string[]): LocalUser {
  const seed=createSeedData();
  const base=(seed.users as LocalUser[])[0];
  return {
    ...base,
    isAdmin:false,
    roleId:'role-legal-test',
    roleIds:['role-legal-test'],
    permissions,
    permissionEntitlements:permissions.map((permission)=>({permission,scope:'COMPANY' as const,source:'user-grant' as const})),
  };
}

function source(activeUser:LocalUser):LegalProjectionSource {
  const now='2026-08-28T00:00:00.000Z';
  return {
    activeUser,
    users:[activeUser],
    roles:[{id:'role-legal-test',name:'نقش آزمایشی حقوقی',description:'صرفاً fixture مصنوعی',status:'active',protected:false,scope:'COMPANY',permissions:activeUser.permissions,createdAt:'2026-08-28T00:00:00.000Z',updatedAt:'2026-08-28T00:00:00.000Z',version:1} satisfies SecurityRole],
    legalEntities:[{id:'entity-1',tenantId:activeUser.companyId,companyId:activeUser.companyId,displayName:'شرکت آزمایشی الف',status:'active',version:1,createdAt:now,updatedAt:now}],
    bankInstitutions:[{id:'bank-1',tenantId:activeUser.companyId,companyId:activeUser.companyId,code:'demo',displayName:'بانک آزمایشی',status:'active',version:1,createdAt:now,updatedAt:now}],
    bankAccounts:[{id:'account-1',tenantId:activeUser.companyId,companyId:activeUser.companyId,legalEntityId:'entity-1',bankInstitutionId:'bank-1',accountNumber:'123456789',iban:'IR000000000000000000000001',cardNumber:'0000000000000001',maskedAccountNumber:'*****6789',maskedIban:'IR********************0001',maskedCardNumber:'****-****-****-0001',last4:'0001',status:'active',version:1,createdAt:now,updatedAt:now}],
    cases:[{id:'case-1',tenantId:activeUser.companyId,companyId:activeUser.companyId,owningLegalEntityId:'entity-1',trackingCode:'LEGAL-1405-0001',title:'پرونده کاملاً آزمایشی',caseType:'complaint',status:'open',primaryOwnerUserId:activeUser.id,bankAccountId:'account-1',bankSnapshotMasked:'IR********************0001',qaGenerated:true,realDataProhibited:true,version:1,createdByActorId:activeUser.actorId,createdByUserId:activeUser.id,createdAt:now,updatedAt:now}],
    companyLinks:[],
    parties:[{id:'party-1',tenantId:activeUser.companyId,companyId:activeUser.companyId,kind:'person',displayName:'شخص آزمایشی',contactMasked:'***0001',nationalId:'0000000001',mobile:'09000000001',address:'نشانی آزمایشی',status:'active',version:1,createdAt:now,updatedAt:now}],
    caseParties:[{id:'case-party-1',caseId:'case-1',partyId:'party-1',role:'complainant',displaySnapshot:'شخص آزمایشی',identitySnapshotMasked:'******0001',status:'active',createdAt:now}],
    history:[],
  };
}

describe('legal inspection field projection',()=>{
  it('keeps bank and identity raw values out of the basic projection',()=>{
    const actor=actorWith('legal.case.basic.view','legal.bank.masked.view');
    const projection=projectLegalInspection(source(actor));
    expect(projection.cases).toHaveLength(1);
    expect(projection.bankAccounts[0]).toMatchObject({maskedCardNumber:'****-****-****-0001',last4:'0001'});
    expect(projection.bankAccounts[0]).not.toHaveProperty('cardNumber');
    expect(projection.parties[0]).not.toHaveProperty('nationalId');
    expect(projection.parties[0]).not.toHaveProperty('mobile');
  });

  it('keeps full bank values out of shared state even when the actor has the legacy full-view permission',()=>{
    const actor=actorWith('legal.case.basic.view','legal.bank.masked.view','legal.bank.full.view','legal.party.identity.view');
    const projection=projectLegalInspection(source(actor));
    expect(projection.bankAccounts[0]).not.toHaveProperty('cardNumber');
    expect(projection.bankAccounts[0]).not.toHaveProperty('iban');
    expect(projection.bankAccounts[0]).not.toHaveProperty('accountNumber');
    expect(projection.parties[0].nationalId).toBe('0000000001');
  });

  it('redacts even masked case banking fields without the independent bank permission',()=>{
    const projection=projectLegalInspection(source(actorWith('legal.case.basic.view')));
    expect(projection.cases[0]).not.toHaveProperty('bankAccountId');
    expect(projection.cases[0]).not.toHaveProperty('bankSnapshotMasked');
    expect(projection.bankAccounts).toEqual([]);
  });

  it('does not project records from another company',()=>{
    const actor=actorWith('legal.case.basic.view','legal.bank.masked.view','legal.bank.full.view','legal.party.identity.view');
    const data=source(actor);
    data.cases[0]={...data.cases[0],companyId:'company-other'};
    expect(projectLegalInspection(data).cases).toEqual([]);
    expect(projectLegalInspection(data).parties).toEqual([]);
  });

  it('does not project same-company rows or relation ids from a foreign tenant',()=>{
    const actor=actorWith('legal.case.basic.view','legal.master_data.view','legal.party.identity.view');
    const data=source(actor);
    data.cases[0]={...data.cases[0],tenantId:'tenant-other'};
    expect(projectLegalInspection(data).cases).toEqual([]);
    data.cases[0]={...data.cases[0],tenantId:actor.companyId};
    data.legalEntities[0]={...data.legalEntities[0],tenantId:'tenant-other'};
    data.parties[0]={...data.parties[0],tenantId:'tenant-other'};
    data.companyLinks=[{id:'link-foreign',caseId:'case-1',legalEntityId:'entity-1',role:'affected',status:'active',createdAt:'2026-08-28T00:00:00.000Z'}];
    const projection=projectLegalInspection(data);
    expect(projection.legalEntities).toEqual([]);
    expect(projection.companyLinks).toEqual([]);
    expect(projection.parties).toEqual([]);
    expect(projection.caseParties).toEqual([]);
  });

  it('does not treat system admin as implicit legal business authority',()=>{
    const seed=createSeedData();
    const admin=(seed.users as LocalUser[]).find((user)=>user.isAdmin)!;
    const data=source(admin);
    data.roles=[];
    expect(projectLegalInspection(data).cases).toEqual([]);
    expect(projectLegalInspection(data).bankAccounts).toEqual([]);
  });

  it('requires exact child tenant relations and hides child timeline rows with the child permission',()=>{
    const actor=actorWith('legal.case.basic.view','legal.proceeding.summary.view');
    const data=source(actor);
    const now='2026-08-28T00:00:00.000Z';
    data.proceedings=[
      {id:'proceeding-local',tenantId:actor.companyId,companyId:actor.companyId,caseId:'case-1',authorityType:'court',authorityName:'مرجع آزمایشی',stage:'initial_review',primaryOwnerUserId:actor.id,status:'active',version:1,createdAt:now,updatedAt:now},
      {id:'proceeding-foreign',tenantId:'company-other',companyId:'company-other',caseId:'case-1',authorityType:'court',authorityName:'مرجع خارجی',stage:'initial_review',primaryOwnerUserId:actor.id,status:'active',version:1,createdAt:now,updatedAt:now},
    ];
    data.history=[
      {id:'history-local',caseId:'case-1',sequence:2,action:'proceeding_created',actorId:actor.actorId,effectiveUserId:actor.id,occurredAt:now,resourceKind:'proceeding',resourceId:'proceeding-local',resourceVersion:1,toState:'active',correlationId:'correlation-local'},
      {id:'history-foreign',caseId:'case-1',sequence:3,action:'proceeding_created',actorId:actor.actorId,effectiveUserId:actor.id,occurredAt:now,resourceKind:'proceeding',resourceId:'proceeding-foreign',resourceVersion:1,toState:'active',correlationId:'correlation-foreign'},
    ];
    const visible=projectLegalInspection(data);
    expect(visible.proceedings.map((item)=>item.id)).toEqual(['proceeding-local']);
    expect(visible.history.map((item)=>item.id)).toEqual(['history-local']);
    data.roles[0]={...data.roles[0],permissions:['legal.case.basic.view']};
    data.activeUser={...data.activeUser,permissions:['legal.case.basic.view'],permissionEntitlements:[{permission:'legal.case.basic.view',scope:'COMPANY',source:'user-grant'}]};
    const redacted=projectLegalInspection(data);
    expect(redacted.proceedings).toEqual([]);
    expect(redacted.history).toEqual([]);
  });

  it('rejects same-tenant child relations that point at a source in a sibling case',()=>{
    const permissions=['legal.case.basic.view','legal.proceeding.summary.view','legal.notice.metadata.view','legal.deadline.view','legal.document.metadata.view'];
    const actor=actorWith(...permissions);
    const data=source(actor);
    const now='2026-08-28T00:00:00.000Z';
    data.cases.push({...data.cases[0],id:'case-2',trackingCode:'LEGAL-1405-0002',title:'پرونده دوم آزمایشی'});
    data.proceedings=[{id:'proceeding-2',tenantId:actor.companyId,companyId:actor.companyId,caseId:'case-2',authorityType:'court',authorityName:'مرجع دوم آزمایشی',stage:'hearing',primaryOwnerUserId:actor.id,status:'active',version:1,createdAt:now,updatedAt:now}];
    data.notices=[{id:'notice-cross-case',tenantId:actor.companyId,companyId:actor.companyId,caseId:'case-1',proceedingId:'proceeding-2',noticeType:'other',receivedAt:now,status:'received',version:1,createdAt:now,updatedAt:now}];
    data.deadlines=[{id:'deadline-cross-case',tenantId:actor.companyId,companyId:actor.companyId,caseId:'case-1',sourceKind:'notice',sourceId:'notice-cross-case',dueAt:'2026-08-29T20:29:59.999Z',timezone:'Asia/Tehran',priority:'normal',assigneeUserId:actor.id,status:'open',version:1,createdAt:now,updatedAt:now}];
    data.documents=[{id:'document-cross-case',tenantId:actor.companyId,companyId:actor.companyId,caseId:'case-1',ownerKind:'proceeding',ownerId:'proceeding-2',documentType:'notice',classification:'internal',displayName:'سند آزمایشی ناسازگار',contentState:'metadata_only',status:'active',version:1,createdAt:now,updatedAt:now}];
    const projection=projectLegalInspection(data);
    expect(projection.proceedings.map((item)=>item.id)).toEqual(['proceeding-2']);
    expect(projection.notices).toEqual([]);
    expect(projection.deadlines).toEqual([]);
    expect(projection.documents).toEqual([]);
  });
});
