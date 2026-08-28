import 'fake-indexeddb/auto';
import {describe,expect,it} from 'vitest';
import type {AuditEvent,FoundationSession,FoundationStoreName,IdempotencyRecord,LocalUser,SecurityRole,SnapshotManifest} from '../model';
import {createSeedData} from '../seed';
import {LocalFoundationService} from '../service';
import {IndexedDBAdapter,type StorageAdapter,type StorageTransaction} from '../storage';
import type {BankInstitution,CompanyBankAccountDetail,LegalCase,LegalCaseHistory,LegalEntity,LegalEntityOfficer,LegalEntityProfileHistory} from './model';
import {TREASURY_MASTER_PERMISSIONS} from '../treasury-master/policy';

class HookStorage implements StorageAdapter {
  beforeNextReadwrite?:()=>Promise<void>;
  failNextStore?:FoundationStoreName;
  constructor(private readonly base:StorageAdapter){}
  async transaction<T>(stores:FoundationStoreName[],mode:IDBTransactionMode,work:(transaction:StorageTransaction)=>Promise<T>):Promise<T>{
    if(mode==='readwrite'&&this.beforeNextReadwrite){const hook=this.beforeNextReadwrite;this.beforeNextReadwrite=undefined;await hook();}
    return this.base.transaction(stores,mode,(tx)=>work({...tx,put:async(store,value)=>{if(this.failNextStore===store){this.failNextStore=undefined;throw new Error('injected legal failure');}await tx.put(store,value);}}));
  }
  get<T>(store:FoundationStoreName,id:IDBValidKey){return this.base.get<T>(store,id)} getAll<T>(store:FoundationStoreName){return this.base.getAll<T>(store)} put<T>(store:FoundationStoreName,value:T){return this.base.put(store,value)} delete(store:FoundationStoreName,id:IDBValidKey){return this.base.delete(store,id)} replaceAll(stores:Record<FoundationStoreName,unknown[]>){return this.base.replaceAll(stores)} exportSnapshot():Promise<SnapshotManifest>{return this.base.exportSnapshot()} importSnapshot(snapshot:SnapshotManifest){return this.base.importSnapshot(snapshot)}
}

async function setup(){const storage=new IndexedDBAdapter(`tapra-legal-${crypto.randomUUID()}`);await storage.replaceAll(createSeedData());return {storage,service:new LocalFoundationService(storage)};}
const twoParties=[{kind:'person' as const,displayName:'شاکی کاملاً مصنوعی',role:'complainant' as const},{kind:'person' as const,displayName:'پرداخت‌کننده کاملاً مصنوعی',role:'payer' as const}];

async function seedMaster(service:LocalFoundationService){
  await service.createLegalEntity({displayName:'شرکت کاملاً آزمایشی MASTER',registrationNumber:'111111'},'legal-entity-seed');
  let state=await service.createLegalBankInstitution({code:'TEST-01',displayName:'بانک آزمایشی'},'legal-bank-seed');
  const entity=state.legalInspection!.legalEntities[0];
  const bank=(await service.loadState()).legalInspection!.bankInstitutions[0];
  state=await service.createLegalBankAccount({legalEntityId:entity.id,bankInstitutionId:bank.id,iban:'IR000000000000000000000000',cardNumber:'1111222233334444'},'legal-account-seed');
  return {state,entity,bank,account:state.legalInspection!.bankAccounts[0]};
}

describe('legal inspection phase one',()=>{
  it('creates and edits a versioned synthetic company profile without persisting raw identity in projections or audit',async()=>{
    const {storage,service}=await setup();const createInput={displayName:'شرکت کاملاً آزمایشی QA-01',legalForm:'private_joint_stock' as const,nationalIdentifier:'00000000000',registrationNumber:'111111',registeredAt:'2026-08-28',registeredAddress:'تهران، نشانی کاملاً ساختگی شماره ۱',postalCode:'0000000000',officers:[{displayName:'مدیرعامل کاملاً ساختگی QA-01',nationalId:'0000000000',role:'chief_executive' as const,appointmentStartDate:'2026-01-01',appointmentEndDate:'2027-01-01'},{displayName:'رئیس کاملاً ساختگی QA-01',nationalId:'1111111111',role:'board_chair' as const}]};
    let state=await service.createLegalEntity(createInput,'entity-profile-create');const entity=state.treasuryMaster!.legalEntities[0];const [ceo,chair]=state.treasuryMaster!.legalEntityOfficers;expect(entity).toMatchObject({legalForm:'private_joint_stock',version:1});expect(entity.nationalIdentifierMasked).not.toBe('00000000000');expect(ceo.nationalIdMasked).not.toBe('0000000000');
    const updateInput={displayName:'شرکت کاملاً آزمایشی QA-02',legalForm:'private_joint_stock' as const,registeredAt:'2026-08-28',registeredAddress:'تهران، نشانی کاملاً ساختگی شماره ۲',officers:[{id:ceo.id,displayName:ceo.displayName,role:ceo.role,appointmentStartDate:ceo.appointmentStartDate,appointmentEndDate:ceo.appointmentEndDate},{displayName:'شریک کاملاً ساختگی QA-01',nationalId:'2222222222',role:'partner' as const,shareAmountRial:'50000000'}]};
    state=await service.updateLegalEntity(entity.id,entity.version,updateInput,'entity-profile-update');await service.updateLegalEntity(entity.id,entity.version,updateInput,'entity-profile-update');expect(state.treasuryMaster!.legalEntities[0]).toMatchObject({displayName:updateInput.displayName,version:2});
    const rawOfficers=await storage.getAll<LegalEntityOfficer>('organization_legal_entity_officers');expect(rawOfficers.find((item)=>item.id===chair.id)?.status).toBe('inactive');expect(rawOfficers.filter((item)=>item.status==='active')).toHaveLength(2);const history=(await storage.getAll<LegalEntityProfileHistory>('organization_legal_entity_history')).sort((a,b)=>a.sequence-b.sequence);expect(history.map((item)=>item.action)).toEqual(['created','profile_updated']);
    const serialized=JSON.stringify({entity:await storage.getAll<LegalEntity>('organization_legal_entities'),officers:rawOfficers,history,audit:await storage.getAll<AuditEvent>('audit_events'),events:await storage.getAll('domain_events'),projection:state.treasuryMaster});expect(serialized).not.toContain('00000000000');expect(serialized).not.toContain('1111111111');expect(serialized).not.toContain('2222222222');
    await expect(service.updateLegalEntity(entity.id,1,{...updateInput,displayName:'شرکت کاملاً آزمایشی CONFLICT'},'entity-profile-stale')).rejects.toThrow('هم‌زمان تغییر');
  });

  it('rolls back the complete company profile update when audit persistence fails',async()=>{
    const base=new IndexedDBAdapter(`tapra-legal-${crypto.randomUUID()}`);await base.replaceAll(createSeedData());const setupService=new LocalFoundationService(base);const state=await setupService.createLegalEntity({displayName:'شرکت کاملاً آزمایشی ROLLBACK',officers:[{displayName:'مدیرعامل کاملاً ساختگی ROLLBACK',role:'chief_executive'}]},'entity-rollback-create');const entity=state.treasuryMaster!.legalEntities[0];const hooked=new HookStorage(base);hooked.failNextStore='audit_events';
    await expect(new LocalFoundationService(hooked).updateLegalEntity(entity.id,entity.version,{displayName:'شرکت کاملاً آزمایشی ROLLBACK-EDIT',officers:[]},'entity-rollback-update')).rejects.toThrow('injected');expect(await base.get<LegalEntity>('organization_legal_entities',entity.id)).toMatchObject({displayName:entity.displayName,version:1});expect((await base.getAll<LegalEntityOfficer>('organization_legal_entity_officers'))[0]).toMatchObject({status:'active',version:1});expect((await base.getAll<IdempotencyRecord>('idempotency_keys')).some((item)=>item.id==='entity-rollback-update')).toBe(false);
  });

  it('requires live officer view before editing and never ends hidden officers',async()=>{
    const {storage,service}=await setup();const state=await service.createLegalEntity({displayName:'شرکت کاملاً آزمایشی VIEW-GATE',officers:[{displayName:'مدیرعامل کاملاً ساختگی VIEW-GATE',role:'chief_executive'}]},'entity-view-gate-create');const entity=state.treasuryMaster!.legalEntities[0];const actor=state.activeUser;const now=new Date().toISOString();const restricted:SecurityRole={id:'role-entity-blind-editor',name:'ویرایشگر کور پروفایل',description:'test',status:'active',protected:false,scope:'COMPANY',permissions:[TREASURY_MASTER_PERMISSIONS.view,TREASURY_MASTER_PERMISSIONS.manage,TREASURY_MASTER_PERMISSIONS.officerManage],createdAt:now,updatedAt:now,version:1};await storage.put('security_roles',restricted);await storage.put('users',{...actor,isAdmin:false,roleId:restricted.id,roleIds:[restricted.id]});
    const limited=new LocalFoundationService(storage);await expect(limited.updateLegalEntity(entity.id,entity.version,{displayName:entity.displayName,officers:[]},'entity-blind-update')).rejects.toThrow('مشاهده و ویرایش');expect((await storage.getAll<LegalEntityOfficer>('organization_legal_entity_officers'))[0]).toMatchObject({status:'active',version:1});expect((await storage.getAll<IdempotencyRecord>('idempotency_keys')).some((item)=>item.id==='entity-blind-update')).toBe(false);
  });

  it('rejects direct status changes for same-company records with a foreign tenant and writes nothing',async()=>{
    const {storage,service}=await setup();const {entity,account}=await seedMaster(service);const created=await service.createLegalCase({title:'پرونده مصنوعی tenant status',caseType:'آزمایشی',owningLegalEntityId:entity.id,parties:twoParties},'tenant-status-case');const legalCase=created.legalInspection!.cases[0];const forgedEntity={...entity,id:'foreign-tenant-entity',tenantId:'tenant-other'};const forgedAccount={...await storage.get<CompanyBankAccountDetail>('company_bank_account_details',account.id),id:'foreign-tenant-account-status',tenantId:'tenant-other'} as CompanyBankAccountDetail;const forgedCase={...await storage.get<LegalCase>('legal_cases',legalCase.id),id:'foreign-tenant-case-status',tenantId:'tenant-other'} as LegalCase;await storage.put('organization_legal_entities',forgedEntity);await storage.put('company_bank_account_details',forgedAccount);await storage.put('legal_cases',forgedCase);const before={entityHistory:(await storage.getAll('organization_legal_entity_history')).length,caseHistory:(await storage.getAll('legal_case_history')).length,audits:(await storage.getAll('audit_events')).length,events:(await storage.getAll('domain_events')).length,receipts:(await storage.getAll('idempotency_keys')).length};
    await expect(service.setLegalRecordStatus(forgedEntity.id,forgedEntity.version,'inactive','qa_lifecycle','foreign-entity-status')).rejects.toThrow('محدوده امنیتی');await expect(service.setLegalRecordStatus(forgedAccount.id,forgedAccount.version,'inactive','qa_lifecycle','foreign-account-status')).rejects.toThrow('محدوده امنیتی');await expect(service.setLegalRecordStatus(forgedCase.id,forgedCase.version,'void','qa_lifecycle','foreign-case-status')).rejects.toThrow('محدوده امنیتی');expect(await storage.get<LegalEntity>('organization_legal_entities',forgedEntity.id)).toMatchObject({status:'active',version:forgedEntity.version});expect({entityHistory:(await storage.getAll('organization_legal_entity_history')).length,caseHistory:(await storage.getAll('legal_case_history')).length,audits:(await storage.getAll('audit_events')).length,events:(await storage.getAll('domain_events')).length,receipts:(await storage.getAll('idempotency_keys')).length}).toEqual(before);
  });
  it('creates and reloads a synthetic case atomically with masked banking and protected identity projection',async()=>{
    const {storage,service}=await setup();const {entity,account}=await seedMaster(service);
    const state=await service.createLegalCase({title:'پرونده آزمایشی تعهدات',caseType:'شکایت آزمایشی',owningLegalEntityId:entity.id,bankAccountId:account.id,parties:[{kind:'person',displayName:'شاکی ساختگی',role:'complainant',nationalId:'0012345678',mobile:'09120000000',address:'نشانی کاملاً ساختگی'},twoParties[1]]},'legal-case-one');
    const record=state.legalInspection!.cases[0];expect(record.realDataProhibited).toBe(true);expect(record.trackingCode).toMatch(/^LEGAL-\d{4}-00001$/);expect(record.bankSnapshotMasked).not.toContain('1111222233334444');
    const rawAccount=(await storage.getAll<CompanyBankAccountDetail>('company_bank_account_details'))[0];expect(rawAccount.cardNumber).toBe('1111222233334444');
    const loaded=await service.loadState();expect(loaded.legalInspection!.cases).toHaveLength(1);expect(loaded.legalInspection!.history).toHaveLength(1);expect(JSON.stringify(await storage.getAll<AuditEvent>('audit_events'))).not.toContain('0012345678');
  });

  it('links several existing invoices as read-only summaries and rejects forged invoice ids',async()=>{
    const {storage,service}=await setup();const {entity}=await seedMaster(service);const invoices=await storage.getAll<import('../model').OperationalRecord>('invoices');expect(invoices.length).toBeGreaterThan(0);
    const selected=invoices.slice(0,2);const state=await service.createLegalCase({title:'پرونده آزمایشی فاکتورها',caseType:'پیگیری فاکتور آزمایشی',owningLegalEntityId:entity.id,invoiceIds:selected.map((item)=>item.id),parties:twoParties},'legal-invoice-links');
    const record=state.legalInspection!.cases[0];expect(record.invoiceIds).toEqual(selected.map((item)=>item.id));expect(state.legalInspection!.invoiceSummaries.filter((item)=>record.invoiceIds!.includes(item.id))).toHaveLength(selected.length);
    await expect(service.updateLegalCase(record.id,record.version,{title:record.title,caseType:record.caseType,invoiceIds:['forged-invoice']},'legal-invoice-forged')).rejects.toThrow('فاکتورهای مرتبط');
  });

  it('retires generic bank-account mutations while preserving the historical store',async()=>{const {storage,service}=await setup();const before=await storage.getAll('bank_accounts');await expect(service.createOperationalRecord('bank-account',{title:'حساب عمومی ناامن'},'legacy-bank-create')).rejects.toThrow('بازنشسته');expect(await storage.getAll('bank_accounts')).toEqual(before);});

  it('replays the same command and rejects a conflicting payload without duplicates',async()=>{
    const {storage,service}=await setup();const {entity}=await seedMaster(service);const command='legal-replay';
    const input={title:'پرونده تکرارپذیر',caseType:'آزمایشی',owningLegalEntityId:entity.id,parties:twoParties};await service.createLegalCase(input,command);await service.createLegalCase(input,command);
    expect(await storage.getAll<LegalCase>('legal_cases')).toHaveLength(1);expect(await storage.getAll<IdempotencyRecord>('idempotency_keys')).toHaveLength(4);
    await expect(service.createLegalCase({...input,title:'عنوان دیگر'},command)).rejects.toThrow('اطلاعات دیگری');expect(await storage.getAll<LegalCase>('legal_cases')).toHaveLength(1);
  });

  it('allocates unique tracking codes for concurrent creates',async()=>{
    const {storage,service}=await setup();const {entity}=await seedMaster(service);
    await Promise.all(Array.from({length:8},(_,index)=>new LocalFoundationService(storage).createLegalCase({title:`پرونده هم‌زمان ${index}`,caseType:'آزمایشی',owningLegalEntityId:entity.id,parties:twoParties},`legal-race-${index}`)));
    const records=await storage.getAll<LegalCase>('legal_cases');expect(records).toHaveLength(8);expect(new Set(records.map((item)=>item.trackingCode)).size).toBe(8);
  });

  it('rolls back case, parties, history and receipt when audit persistence fails',async()=>{
    const base=new IndexedDBAdapter(`tapra-legal-${crypto.randomUUID()}`);await base.replaceAll(createSeedData());const setupService=new LocalFoundationService(base);const {entity}=await seedMaster(setupService);const hooked=new HookStorage(base);hooked.failNextStore='audit_events';
    await expect(new LocalFoundationService(hooked).createLegalCase({title:'پرونده شکست اتمیک',caseType:'آزمایشی',owningLegalEntityId:entity.id,parties:twoParties},'legal-rollback')).rejects.toThrow('injected');
    expect(await base.getAll<LegalCase>('legal_cases')).toHaveLength(0);expect(await base.getAll<LegalCaseHistory>('legal_case_history')).toHaveLength(0);expect((await base.getAll<IdempotencyRecord>('idempotency_keys')).some((item)=>item.id==='legal-rollback')).toBe(false);
  });

  it('rejects a stale session and active-role revocation with zero writes',async()=>{
    const base=new IndexedDBAdapter(`tapra-legal-${crypto.randomUUID()}`);await base.replaceAll(createSeedData());const master=new LocalFoundationService(base);const {entity}=await seedMaster(master);
    const stale=new HookStorage(base);stale.beforeNextReadwrite=async()=>{const session=await base.get<FoundationSession>('sessions','active-session');await base.put('sessions',{...session!,version:session!.version+1,switchedAt:new Date().toISOString()});};
    await expect(new LocalFoundationService(stale).createLegalCase({title:'پرونده نشست قدیمی',caseType:'آزمایشی',owningLegalEntityId:entity.id,parties:twoParties},'legal-stale')).rejects.toThrow();
    expect(await base.getAll<LegalCase>('legal_cases')).toHaveLength(0);
    const session=await base.get<FoundationSession>('sessions','active-session');const roles=await base.getAll<SecurityRole>('security_roles');const legalRole=roles.find((role)=>role.id==='role-legal-manager')!;await base.put('security_roles',{...legalRole,status:'inactive'});
    await expect(new LocalFoundationService(base).createLegalCase({title:'پرونده نقش منقضی',caseType:'آزمایشی',owningLegalEntityId:entity.id,parties:twoParties},'legal-revoked')).rejects.toThrow('مجوز فعال');
    expect(await base.getAll<LegalCase>('legal_cases')).toHaveLength(0);expect(session).toBeTruthy();
  });

  it('rejects QA access-view mutation',async()=>{
    const {storage,service}=await setup();const {entity}=await seedMaster(service);const session=await storage.get<FoundationSession>('sessions','active-session');await storage.put('sessions',{...session!,actingAdminUserId:'persona-product-owner'});
    await expect(service.createLegalCase({title:'پرونده QA',caseType:'آزمایشی',owningLegalEntityId:entity.id,parties:twoParties},'legal-qa')).rejects.toThrow();expect(await storage.getAll<LegalCase>('legal_cases')).toHaveLength(0);
  });

  it('rejects a cross-company entity or account reference',async()=>{
    const {storage,service}=await setup();const outsider:LegalEntity={id:'legal-other',tenantId:'company-other',companyId:'company-other',displayName:'شرکت دیگر',status:'active',version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await storage.put('organization_legal_entities',outsider);
    await expect(service.createLegalCase({title:'پرونده خارج شرکت',caseType:'آزمایشی',owningLegalEntityId:outsider.id,parties:twoParties},'legal-other')).rejects.toThrow('معتبر نیست');expect(await storage.getAll<LegalCase>('legal_cases')).toHaveLength(0);
  });

  it('does not give a system administrator legal business access without an active legal role',async()=>{
    const {storage}=await setup();const session=await storage.get<FoundationSession>('sessions','active-session');await storage.put('sessions',{...session!,activeUserId:'persona-system-admin',version:session!.version+1});const service=new LocalFoundationService(storage);
    await expect(service.createLegalEntity({displayName:'شرکت کاملاً آزمایشی UNAUTHORIZED'},'legal-system-admin')).rejects.toThrow('مجوز فعال');expect(await storage.getAll<LegalEntity>('organization_legal_entities')).toHaveLength(0);
    const system=await storage.get<LocalUser>('users','persona-system-admin');expect(system).toBeTruthy();
  });

  it('does not let a SELF treasury role create company-wide master records',async()=>{
    const {storage}=await setup();const productOwner=(await storage.get<LocalUser>('users','persona-product-owner'))!;const session=(await storage.get<FoundationSession>('sessions','active-session'))!;
    const permissions=[TREASURY_MASTER_PERMISSIONS.manage,TREASURY_MASTER_PERMISSIONS.bankAccountManage];
    const selfRole:SecurityRole={id:'role-treasury-self-test',name:'مرجع خزانه محدود خود',description:'test',status:'active',protected:false,scope:'SELF',permissions,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),version:1};
    await storage.put('security_roles',selfRole);await storage.put('users',{...productOwner,isAdmin:false,roleId:selfRole.id,roleIds:[selfRole.id]});await storage.put('sessions',{...session,activeUserId:productOwner.id,version:session.version+1,switchedAt:new Date().toISOString()});
    const service=new LocalFoundationService(storage);const auditCount=(await storage.getAll<AuditEvent>('audit_events')).length;
    await expect(service.createLegalEntity({displayName:'شخصیت حقوقی کاملاً آزمایشی SELF'},'self-entity')).rejects.toThrow('مجوز فعال');
    await expect(service.createLegalBankInstitution({code:'SELF-QA',displayName:'بانک کاملاً آزمایشی محدود'},'self-bank')).rejects.toThrow('مجوز فعال');
    expect(await storage.getAll<LegalEntity>('organization_legal_entities')).toHaveLength(0);expect(await storage.getAll<BankInstitution>('bank_institutions')).toHaveLength(0);expect(await storage.getAll<AuditEvent>('audit_events')).toHaveLength(auditCount);
  });

  it('requires shared reference visibility before linking a known legal entity to a case',async()=>{
    const {storage,service}=await setup();const first=await service.createLegalEntity({displayName:'شخصیت حقوقی کاملاً آزمایشی FIRST'},'reference-entity-one');const firstEntity=first.legalInspection!.legalEntities[0];
    const second=await service.createLegalEntity({displayName:'شخصیت حقوقی کاملاً آزمایشی SECOND'},'reference-entity-two');const secondEntity=second.legalInspection!.legalEntities.find((item)=>item.id!==firstEntity.id)!;
    const created=await service.createLegalCase({title:'پرونده کاملاً آزمایشی مرجع',caseType:'آزمایشی',owningLegalEntityId:firstEntity.id,parties:twoParties},'reference-existing-case');const record=created.legalInspection!.cases[0];
    const manager=(await storage.getAll<SecurityRole>('security_roles')).find((role)=>role.id==='role-legal-manager')!;const restricted:SecurityRole={...manager,id:'role-legal-without-reference-view',name:'حقوقی بدون مشاهده مرجع',permissions:manager.permissions.filter((permission)=>permission!==TREASURY_MASTER_PERMISSIONS.view),protected:false,version:1};
    const owner=(await storage.get<LocalUser>('users','persona-product-owner'))!;await storage.put('security_roles',restricted);await storage.put('users',{...owner,isAdmin:false,roleId:restricted.id,roleIds:[restricted.id]});
    const limited=new LocalFoundationService(storage);const caseCount=(await storage.getAll<LegalCase>('legal_cases')).length;const auditCount=(await storage.getAll<AuditEvent>('audit_events')).length;
    await expect(limited.createLegalCase({title:'پرونده کاملاً آزمایشی بدون مرجع',caseType:'آزمایشی',owningLegalEntityId:firstEntity.id,parties:twoParties},'reference-forged-create')).rejects.toThrow('مشاهده و اتصال');
    await expect(limited.updateLegalCase(record.id,record.version,{title:record.title,caseType:record.caseType,companyLinks:[{legalEntityId:secondEntity.id,role:'affected'}]},'reference-forged-update')).rejects.toThrow('مشاهده و اتصال');
    expect(await storage.getAll<LegalCase>('legal_cases')).toHaveLength(caseCount);expect(await storage.getAll<AuditEvent>('audit_events')).toHaveLength(auditCount);
  });

  it('keeps tenant-owned banks isolated during status changes and QA reset',async()=>{
    const {storage,service}=await setup();await service.generateLegalQaDataset('tenant-bank-dataset');const now=new Date().toISOString();const foreign:BankInstitution={id:'foreign-qa-bank',tenantId:'company-other',companyId:'company-other',code:'FOREIGN-QA',displayName:'بانک کاملاً مصنوعی شرکت دیگر',status:'active',qaGenerated:true,qaDatasetId:'legal-qa-v1',version:1,createdAt:now,updatedAt:now};await storage.put('bank_institutions',foreign);
    await expect(service.setLegalRecordStatus(foreign.id,foreign.version,'inactive','qa_lifecycle','foreign-bank-status')).rejects.toThrow('شرکت جاری');
    await service.resetLegalQaDataset();expect(await storage.get<BankInstitution>('bank_institutions',foreign.id)).toEqual(foreign);
  });

  it('rejects a same-company account whose tenant identity was forged during case update',async()=>{
    const {storage,service}=await setup();const {entity,bank}=await seedMaster(service);const created=await service.createLegalCase({title:'پرونده مصنوعی کنترل tenant حساب',caseType:'آزمایشی',owningLegalEntityId:entity.id,parties:twoParties},'tenant-account-case');const record=created.legalInspection!.cases[0];const now=new Date().toISOString();const forged:CompanyBankAccountDetail={id:'forged-tenant-account',tenantId:'tenant-other',companyId:entity.companyId,legalEntityId:entity.id,bankInstitutionId:bank.id,maskedCardNumber:'************9090',last4:'9090',status:'active',version:1,createdAt:now,updatedAt:now};await storage.put('company_bank_account_details',forged);const before={history:(await storage.getAll('legal_case_history')).length,audits:(await storage.getAll('audit_events')).length,events:(await storage.getAll('domain_events')).length,receipts:(await storage.getAll('idempotency_keys')).length};
    await expect(service.updateLegalCase(record.id,record.version,{title:record.title,caseType:record.caseType,bankAccountId:forged.id},'forged-tenant-update')).rejects.toThrow('حساب انتخاب‌شده');const raw=await storage.get<LegalCase>('legal_cases',record.id);expect(raw).toMatchObject({version:record.version,bankAccountId:undefined});expect({history:(await storage.getAll('legal_case_history')).length,audits:(await storage.getAll('audit_events')).length,events:(await storage.getAll('domain_events')).length,receipts:(await storage.getAll('idempotency_keys')).length}).toEqual(before);
  });

  it('never widens a legal SELF role to COMPANY merely because the user is an administrator',async()=>{
    const {storage,service}=await setup();await service.generateLegalQaDataset('legal-self-admin-dataset');
    const managerRole=(await storage.getAll<SecurityRole>('security_roles')).find((item)=>item.id==='role-legal-manager')!;
    const selfRole:SecurityRole={...managerRole,id:'role-legal-self-admin-test',name:'حقوقی محدود خود',scope:'SELF',protected:false,version:1};
    const admin=(await storage.get<LocalUser>('users','persona-system-admin'))!;
    const session=(await storage.get<FoundationSession>('sessions','active-session'))!;
    await storage.put('security_roles',selfRole);await storage.put('users',{...admin,roleId:selfRole.id,roleIds:[selfRole.id]});await storage.put('sessions',{...session,activeUserId:admin.id,version:session.version+1,switchedAt:new Date().toISOString()});
    const limited=new LocalFoundationService(storage);
    await expect(limited.generateLegalQaDataset('legal-self-admin-generate')).rejects.toThrow('ساخت کامل');
    await expect(limited.resetLegalQaDataset()).rejects.toThrow('بازنشانی کامل');
    const projected=await limited.loadState();expect(projected.legalInspection!.cases).toHaveLength(0);expect(projected.audits.some((event)=>event.action.startsWith('legal.qa.'))).toBe(false);
    expect(await storage.getAll<LegalCase>('legal_cases')).toHaveLength(50);
  });

  it('fails closed for legal audit summaries when the viewer lacks the legal resource role',async()=>{
    const {storage,service}=await setup();const {entity}=await seedMaster(service);await service.createLegalCase({title:'پرونده پنهان از ممیزی نامرتبط',caseType:'آزمایشی',owningLegalEntityId:entity.id,parties:twoParties},'legal-audit-scope');
    const session=await storage.get<FoundationSession>('sessions','active-session');await storage.put('sessions',{...session!,activeUserId:'persona-system-admin',version:session!.version+1,switchedAt:new Date().toISOString()});
    const projected=await new LocalFoundationService(storage).loadState();expect(projected.legalInspection!.cases).toHaveLength(0);expect(projected.audits.some((event)=>event.action.startsWith('legal.'))).toBe(false);
  });

  it('uses versioned inactive and void status changes instead of physically deleting legal records',async()=>{
    const {storage,service}=await setup();const {entity,account}=await seedMaster(service);
    let state=await service.createLegalCase({title:'پرونده مصنوعی بدون حذف فیزیکی',caseType:'آزمایشی',owningLegalEntityId:entity.id,bankAccountId:account.id,parties:[{kind:'person',displayName:'شاکی مصنوعی اول',role:'complainant'},{kind:'person',displayName:'پرداخت‌کننده مصنوعی دوم',role:'payer'}]},'legal-status-case');
    const record=state.legalInspection!.cases[0];
    await service.setLegalRecordStatus(account.id,account.version,'inactive','qa_lifecycle','legal-account-inactive');
    await service.setLegalRecordStatus(account.id,account.version,'inactive','qa_lifecycle','legal-account-inactive');
    expect((await storage.getAll<CompanyBankAccountDetail>('company_bank_account_details'))[0].status).toBe('inactive');
    await expect(service.createLegalCase({title:'پرونده با حساب غیرفعال',caseType:'آزمایشی',owningLegalEntityId:entity.id,bankAccountId:account.id,parties:twoParties},'legal-inactive-account-case')).rejects.toThrow('حساب انتخاب‌شده فعال');
    state=await service.setLegalRecordStatus(record.id,record.version,'void','duplicate_synthetic','legal-case-void');
    expect(state.legalInspection!.cases[0].status).toBe('void');
    expect(await storage.getAll<LegalCase>('legal_cases')).toHaveLength(1);
    expect(await storage.getAll<CompanyBankAccountDetail>('company_bank_account_details')).toHaveLength(1);
    const legalHistory=(await storage.getAll<LegalCaseHistory>('legal_case_history')).sort((a,b)=>a.sequence-b.sequence);expect(legalHistory.map((item)=>item.action)).toEqual(['created','status_changed']);expect(legalHistory[1]).toMatchObject({fromStatus:'draft',toStatus:'void',reasonCategory:'duplicate_synthetic'});expect(legalHistory[1].actorDisplayName).toBeTruthy();
    await expect(service.setLegalRecordStatus(record.id,record.version,'open','qa_lifecycle','legal-case-stale')).rejects.toThrow('هم‌زمان تغییر');
  });

  it('materializes and independently resets exactly fifty deterministic legal QA scenarios',async()=>{
    const {storage,service}=await setup();const {entity}=await seedMaster(service);
    await service.createLegalCase({title:'پرونده مصنوعی دستی محفوظ',caseType:'آزمایشی',owningLegalEntityId:entity.id,parties:twoParties},'legal-manual-preserved');
    let state=await service.generateLegalQaDataset('legal-qa-50');
    expect(state.legalInspection!.cases).toHaveLength(51);expect(state.legalInspection!.parties).toHaveLength(102);
    expect(new Set(state.legalInspection!.cases.map((item)=>item.trackingCode)).size).toBe(51);
    await service.generateLegalQaDataset('legal-qa-50');expect(await storage.getAll<LegalCase>('legal_cases')).toHaveLength(51);
    state=await service.resetLegalQaDataset();expect(state.legalInspection!.cases).toHaveLength(1);expect(state.legalInspection!.cases[0].title).toContain('دستی محفوظ');expect(state.legalInspection!.legalEntities.some((item)=>item.id===entity.id)).toBe(true);
    expect((await storage.getAll<AuditEvent>('audit_events')).some((event)=>event.action==='legal.qa.reset')).toBe(true);
  });

  it('never mixes dataset-owned masters or parties into a surviving manual case',async()=>{
    const {service}=await setup();let state=await service.generateLegalQaDataset('legal-qa-isolation');const datasetEntity=state.legalInspection!.legalEntities.find((item)=>item.qaDatasetId)!;
    await expect(service.createLegalCase({title:'پرونده مصنوعی با مالک دیتاست',caseType:'آزمایشی',owningLegalEntityId:datasetEntity.id,parties:twoParties},'legal-mixed-owner')).rejects.toThrow('دیتاست ۵۰');
    state=await service.createLegalEntity({displayName:'شرکت کاملاً مصنوعی MANUAL'},'legal-manual-entity');const manualEntity=state.legalInspection!.legalEntities.find((item)=>!item.qaDatasetId)!;const datasetParties=state.legalInspection!.parties.filter((item)=>item.qaDatasetId).slice(0,2);
    const datasetCase=state.legalInspection!.cases.find((item)=>item.qaDatasetId)!;await expect(service.updateLegalCase(datasetCase.id,datasetCase.version,{title:datasetCase.title,caseType:datasetCase.caseType,companyLinks:[{legalEntityId:manualEntity.id,role:'affected'}]},'legal-mixed-reverse')).rejects.toThrow('فقط از مسیر تولید و بازنشانی');
    await expect(service.createLegalCase({title:'پرونده مصنوعی با شخص دیتاست',caseType:'آزمایشی',owningLegalEntityId:manualEntity.id,parties:[{kind:'person',displayName:datasetParties[0].displayName,role:'complainant',existingPartyId:datasetParties[0].id},{kind:'person',displayName:datasetParties[1].displayName,role:'payer',existingPartyId:datasetParties[1].id}]},'legal-mixed-party')).rejects.toThrow('دیتاست ۵۰');
    state=await service.resetLegalQaDataset();expect(state.legalInspection!.legalEntities.map((item)=>item.id)).toContain(manualEntity.id);expect(state.legalInspection!.cases).toHaveLength(0);
  });

  it('fails closed for QA projection, hidden counts, generic backup and legal restore',async()=>{
    const {storage,service}=await setup();const cleanSnapshot=await storage.exportSnapshot();const {entity,account}=await seedMaster(service);
    await service.createLegalCase({title:'پرونده مصنوعی محرمانه',caseType:'آزمایشی',owningLegalEntityId:entity.id,bankAccountId:account.id,parties:[{...twoParties[0],nationalId:'0012345678',mobile:'09120000000'},twoParties[1]]},'legal-security-case');
    const visible=await service.loadState();const countBefore=visible.recordCount;
    await expect(service.exportSnapshot('known-local-password')).rejects.toThrow('داده حقوقی');
    const snapshot=await storage.exportSnapshot();await expect(service.importSnapshot(snapshot)).rejects.toThrow('داده حقوقی');await expect(service.importSnapshot(cleanSnapshot)).rejects.toThrow('داده حقوقی وجود دارد');
    const session=await storage.get<FoundationSession>('sessions','active-session');await storage.put('sessions',{...session!,actingAdminUserId:'persona-system-admin',version:session!.version+1});
    const qa=await service.loadState();expect(qa.legalInspection).toMatchObject({cases:[],bankAccounts:[],parties:[],history:[]});expect(qa.recordCount).toBeLessThan(countBefore);
    expect(JSON.stringify(qa)).not.toContain('0012345678');expect(JSON.stringify(qa)).not.toContain('1111222233334444');
  });

  it('requires every aggregate permission for the QA generator and hides QA audit counts from non-legal viewers',async()=>{
    const {storage,service}=await setup();const role=(await storage.getAll<SecurityRole>('security_roles')).find((item)=>item.id==='role-legal-manager')!;
    await storage.put('security_roles',{...role,permissions:role.permissions.filter((permission)=>permission!=='legal.bank_account.manage'),version:role.version+1});
    await expect(service.generateLegalQaDataset('legal-qa-no-bank')).rejects.toThrow('ساخت کامل');expect(await storage.getAll<LegalCase>('legal_cases')).toHaveLength(0);
    await storage.put('security_roles',role);await service.generateLegalQaDataset('legal-qa-audit-hidden');
    const session=await storage.get<FoundationSession>('sessions','active-session');await storage.put('sessions',{...session!,activeUserId:'persona-system-admin',version:session!.version+1,switchedAt:new Date().toISOString()});
    const hidden=await new LocalFoundationService(storage).loadState();expect(hidden.audits.some((event)=>event.action.startsWith('legal.qa.'))).toBe(false);expect(hidden.legalInspection!.cases).toHaveLength(0);
  });

  it('reuses a selected stable party and rejects implicit identity merging',async()=>{
    const {storage,service}=await setup();const {entity}=await seedMaster(service);
    await service.createLegalCase({title:'پرونده مصنوعی هویت اول',caseType:'آزمایشی',owningLegalEntityId:entity.id,parties:[{...twoParties[0],nationalId:'0012345678'},twoParties[1]]},'legal-party-one');
    const existing=(await storage.getAll<import('./model').LegalPartyProfile>('legal_party_profiles')).find((item)=>item.nationalId==='0012345678')!;
    await expect(service.createLegalCase({title:'پرونده مصنوعی هویت دوم',caseType:'آزمایشی',owningLegalEntityId:entity.id,parties:[{...twoParties[0],nationalId:'0012345678'},{...twoParties[1],displayName:'پرداخت‌کننده مصنوعی تازه'}]},'legal-party-match')).rejects.toThrow('پروفایل مشابه');
    await service.createLegalCase({title:'پرونده مصنوعی هویت لینک‌شده',caseType:'آزمایشی',owningLegalEntityId:entity.id,parties:[{...twoParties[0],existingPartyId:existing.id},{...twoParties[1],displayName:'پرداخت‌کننده مصنوعی مستقل'}]},'legal-party-link');
    expect((await storage.getAll<import('./model').LegalCaseParty>('legal_case_parties')).filter((link)=>link.partyId===existing.id)).toHaveLength(2);
    await expect(service.createLegalCase({title:'پرونده مصنوعی شخص تکراری',caseType:'آزمایشی',owningLegalEntityId:entity.id,parties:[{...twoParties[0],existingPartyId:existing.id},{...twoParties[1],existingPartyId:existing.id}]},'legal-same-party-twice')).rejects.toThrow('دو شخص متمایز');
  });

  it('updates basic case fields and company links with CAS while preserving history',async()=>{
    const {service}=await setup();await service.createLegalEntity({displayName:'شرکت کاملاً آزمایشی OWNER'},'legal-owner');let state=await service.createLegalEntity({displayName:'شرکت کاملاً مصنوعی RELATED'},'legal-related');const [owner,related]=state.legalInspection!.legalEntities;
    state=await service.createLegalCase({title:'پرونده مصنوعی قابل ویرایش',caseType:'آزمایشی',owningLegalEntityId:owner.id,parties:twoParties},'legal-edit-create');const record=state.legalInspection!.cases[0];
    state=await service.updateLegalCase(record.id,record.version,{title:'پرونده مصنوعی ویرایش‌شده',caseType:'رسیدگی آزمایشی',companyLinks:[{legalEntityId:related.id,role:'affected'}]},'legal-edit');
    await service.updateLegalCase(record.id,record.version,{title:'پرونده مصنوعی ویرایش‌شده',caseType:'رسیدگی آزمایشی',companyLinks:[{legalEntityId:related.id,role:'affected'}]},'legal-edit');
    expect(state.legalInspection!.cases[0]).toMatchObject({title:'پرونده مصنوعی ویرایش‌شده',version:2});expect(state.legalInspection!.companyLinks.some((link)=>link.legalEntityId===related.id&&link.status==='active')).toBe(true);expect(state.legalInspection!.history.sort((a,b)=>a.sequence-b.sequence).map((item)=>item.action)).toEqual(['created','basic_updated']);
    state=await service.setLegalRecordStatus(record.id,2,'void','scenario_completed','legal-edit-finalized');await service.updateLegalCase(record.id,record.version,{title:'پرونده مصنوعی ویرایش‌شده',caseType:'رسیدگی آزمایشی',companyLinks:[{legalEntityId:related.id,role:'affected'}]},'legal-edit');expect(state.legalInspection!.cases[0]).toMatchObject({status:'void',version:3});
  });

  it('blocks the generic reset when legal evidence exists',async()=>{
    const {service}=await setup();const {entity}=await seedMaster(service);
    await service.createLegalCase({title:'پرونده مصنوعی قابل بازنشانی',caseType:'آزمایشی',owningLegalEntityId:entity.id,parties:twoParties},'legal-reset-case');
    await expect(service.reset()).rejects.toThrow('بازنشانی عمومی');
    expect((await service.loadState()).legalInspection!.cases).toHaveLength(1);
  });
});
