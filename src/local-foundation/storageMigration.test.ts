import 'fake-indexeddb/auto';
import {describe, expect, it} from 'vitest';
import {
  FOUNDATION_SCHEMA_VERSION,
  FOUNDATION_SEED_VERSION,
  FOUNDATION_STORES,
  type FoundationStoreName,
  type LocalUser,
  type MetaRecord,
  type OperationalRecord,
  type OperationalRecordHistory,
  type PersonnelDocumentFile,
  type SecurityRole,
  type WorkflowDefinition,
} from './model';
import {createSeedData} from './seed';
import {ERP_MODULES} from './erpCatalog';
import {LocalFoundationService} from './service';
import {IndexedDBAdapter} from './storage';
import {validateWorkflowPolicy} from './workflowPolicy';

const PREVIOUS_SCHEMA_VERSION = 9;
const LEGACY_DOCUMENT_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';
const UNRELATED_ATTACHMENT_DATA_URL = 'data:application/pdf;base64,JVBERi0=';
const V140_SEED_VERSION = 'complete-local-erp-v1.40-multi-approval';

function v140GeneratedInvalidLetterPolicy(seed: ReturnType<typeof createSeedData>): WorkflowDefinition {
  const current=(seed.workflow_definitions as WorkflowDefinition[]).find((workflow)=>workflow.moduleId==='letter')!;
  return {
    ...current,
    version:1,
    changeSummary:undefined,
    approvalPolicyId:undefined,
    routeVariants:undefined,
    approvalStages:[{
      id:'letter-stage-1',title:current.stateLabels.approved_for_send,stateId:'approved_for_send',roleIds:[],scope:'COMPANY',
      decisions:['approve','reject','needs_correction'],required:true,allowSelfApproval:false,assignmentMode:'role_queue',
    }],
  };
}

function createVersionNineDatabase(databaseName: string): Promise<void> {
  const seed = createSeedData() as Record<FoundationStoreName, unknown[]>;
  const previousStores = FOUNDATION_STORES.filter((store) => !['recruitment_cases','personnel_document_files','projects','chat_preferences','recruitment_candidate_files'].includes(store));
  const preservedUser = {...(seed.users as LocalUser[])[0], name: 'نام ویرایش‌شده و حفظ‌شده کاربر'};
  seed.users = [preservedUser, ...(seed.users as LocalUser[]).slice(1)];
  seed.meta = [
    {id: 'schemaVersion', value: PREVIOUS_SCHEMA_VERSION},
    {id: 'seedVersion', value: 'schema-9-before-recruitment'},
    {id: 'custom-user-preference', value: 'keep-me'},
  ] satisfies MetaRecord[];
  seed.workflow_history = [];
  seed.workflow_definitions = (seed.workflow_definitions as Array<{moduleId: string}>).filter((workflow) => workflow.moduleId !== 'recruitment-case');
  seed.workflow_versions = (seed.workflow_versions as Array<{moduleId: string}>).filter((workflow) => workflow.moduleId !== 'recruitment-case');

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, PREVIOUS_SCHEMA_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const storeName of previousStores) {
        const store = database.createObjectStore(storeName, {keyPath: 'id'});
        for (const value of seed[storeName]) store.put(structuredClone(value));
      }
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
}

function createVersionTenDatabaseWithLegacyDocument(databaseName: string): Promise<void> {
  const seed = createSeedData() as Record<FoundationStoreName, unknown[]>;
  const previousStores = FOUNDATION_STORES.filter((store) => !['personnel_document_files','projects','chat_preferences','recruitment_candidate_files'].includes(store));
  const person = (seed.personnel as Array<{id:string;unitId:string;branchUnitId?:string}>)[0];
  const owner = (seed.users as LocalUser[]).find((user) => user.personnelId === person.id) ?? (seed.users as LocalUser[])[0];
  const record: OperationalRecord = {id:'legacy-personnel-document',moduleId:'personnel-document',domain:'hr',trackingCode:'PDC-LEGACY',title:'مدرک قدیمی',description:'',status:'uploaded',priority:'normal',companyId:owner.companyId,unitId:person.unitId,branchUnitId:person.branchUnitId,ownerPersonnelId:person.id,assigneeUserId:owner.id,createdByActorId:owner.actorId,createdByUserId:owner.id,updatedByActorId:owner.actorId,version:1,payload:{documentType:'مدرک قدیمی',fileName:'legacy.png',fileType:'image/png',fileSize:8,fileDataUrl:LEGACY_DOCUMENT_DATA_URL},createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'};
  const ownerlessRecord: OperationalRecord = {...record,id:'legacy-ownerless-document',trackingCode:'PDC-OWNERLESS',ownerPersonnelId:undefined,payload:{...record.payload,fileName:'ownerless.png'}};
  seed.personnel_documents=[record,ownerlessRecord];
  seed.workflow_history=[{id:'history-legacy-document',recordId:record.id,moduleId:record.moduleId,sequence:1,eventType:'created',actorId:owner.actorId,actorName:owner.name,effectiveUserId:owner.id,snapshot:{after:record},occurredAt:record.createdAt} satisfies OperationalRecordHistory,{id:'history-unrelated-attachment',recordId:'purchase-with-attachment',moduleId:'purchase-request',sequence:1,eventType:'created',actorId:owner.actorId,actorName:owner.name,effectiveUserId:owner.id,snapshot:{attachment:{dataUrl:UNRELATED_ATTACHMENT_DATA_URL}},occurredAt:record.createdAt} satisfies OperationalRecordHistory];
  seed.meta=[{id:'schemaVersion',value:10},{id:'seedVersion',value:'complete-local-erp-v1.28-unit-position-catalog'}] satisfies MetaRecord[];
  return new Promise((resolve,reject)=>{const request=indexedDB.open(databaseName,10);request.onupgradeneeded=()=>{const database=request.result;for(const storeName of previousStores){const store=database.createObjectStore(storeName,{keyPath:'id'});for(const value of seed[storeName])store.put(structuredClone(value));}};request.onsuccess=()=>{request.result.close();resolve();};request.onerror=()=>reject(request.error);});
}

function createVersionElevenDatabase(databaseName:string):Promise<void>{
  const seed=createSeedData() as Record<FoundationStoreName,unknown[]>;
  const previousStores=FOUNDATION_STORES.filter((store)=>!['projects','chat_preferences','recruitment_candidate_files'].includes(store));
  seed.meta=[{id:'schemaVersion',value:11},{id:'seedVersion',value:'complete-local-erp-v1.34-organization-workflow-rebuild'},{id:'custom-v11-marker',value:'preserve'}] satisfies MetaRecord[];
  seed.security_roles=(seed.security_roles as Array<{id:string}>).filter((role)=>!['role-project-member','role-project-manager'].includes(role.id));
  seed.workflow_definitions=(seed.workflow_definitions as Array<{moduleId:string}>).filter((workflow)=>workflow.moduleId!=='project');
  seed.workflow_versions=(seed.workflow_versions as Array<{moduleId:string}>).filter((workflow)=>workflow.moduleId!=='project');
  const first=(seed.users as LocalUser[])[0];seed.users=[{...first,name:'کاربر حفظ‌شده نسخه یازده'},...(seed.users as LocalUser[]).slice(1)];
  return new Promise((resolve,reject)=>{const request=indexedDB.open(databaseName,11);request.onupgradeneeded=()=>{const database=request.result;for(const storeName of previousStores){const store=database.createObjectStore(storeName,{keyPath:'id'});for(const value of seed[storeName])store.put(structuredClone(value));}};request.onsuccess=()=>{request.result.close();resolve();};request.onerror=()=>reject(request.error);});
}

function createFrozenVersionElevenDatabase(databaseName:string):Promise<void>{
  const stores=Object.fromEntries(FOUNDATION_STORES.map((store)=>[store,[]])) as Record<FoundationStoreName,unknown[]>;
  const previousStores=FOUNDATION_STORES.filter((store)=>!['projects','chat_preferences','recruitment_candidate_files'].includes(store));
  stores.meta=[{id:'schemaVersion',value:11},{id:'seedVersion',value:'frozen-schema-11-fixture'},{id:'frozen-v11-marker',value:'preserve-exactly'}] satisfies MetaRecord[];
  stores.users=[{id:'legacy-v11-user',actorId:'actor-legacy-v11',name:'کاربر سفارشی نسخه یازده',roleTitle:'نقش سفارشی قدیمی',roles:['نقش سفارشی قدیمی'],roleId:'legacy-v11-role',roleIds:['legacy-v11-role'],status:'active',username:'legacy.v11',passwordHash:'legacy-hash',passwordUpdatedAt:'2025-01-01T00:00:00.000Z',isAdmin:false,description:'رکورد ثابت مستقل از seed فعلی',companyId:'company-shavaz',unitId:'unit-management',scope:'SELF',permissions:[],permissionEntitlements:[],permissionGrants:[],permissionDenials:[],accent:'#123456',initials:'ق.ی'}] satisfies LocalUser[];
  stores.security_roles=[{id:'legacy-v11-role',name:'نقش سفارشی قدیمی',description:'نقش ثابت نسخه یازده',status:'active',protected:false,scope:'SELF',permissions:[],createdAt:'2025-01-01T00:00:00.000Z',updatedAt:'2025-01-01T00:00:00.000Z',version:1}] satisfies SecurityRole[];
  const legacyRecord=(id:string,moduleId:string,domain:OperationalRecord['domain'],payload:OperationalRecord['payload']):OperationalRecord=>({id,moduleId,domain,trackingCode:`V11-${id}`,title:`رکورد ثابت ${moduleId}`,description:'این رکورد باید بدون بازنویسی حفظ شود.',status:moduleId==='task'?'todo':'active',priority:'normal',companyId:'company-shavaz',unitId:'unit-management',createdByActorId:'actor-legacy-v11',createdByUserId:'legacy-v11-user',updatedByActorId:'actor-legacy-v11',version:3,payload,createdAt:'2025-01-02T00:00:00.000Z',updatedAt:'2025-01-03T00:00:00.000Z'});
  stores.tasks=[legacyRecord('legacy-v11-task','task','task',{legacyMarker:'task-v11'})];
  stores.chats=[legacyRecord('legacy-v11-chat','chat','communications',{legacyMarker:'chat-v11',memberUserIds:['legacy-v11-user']})];
  stores.messages=[legacyRecord('legacy-v11-message','message','communications',{legacyMarker:'message-v11',chatId:'legacy-v11-chat',text:'پیام ثابت نسخه قدیم'})];
  stores.letters=[legacyRecord('legacy-v11-letter','letter','letter',{legacyMarker:'letter-v11'})];
  stores.documents=[legacyRecord('legacy-v11-document','document','document',{legacyMarker:'document-v11'})];
  return new Promise((resolve,reject)=>{const request=indexedDB.open(databaseName,11);request.onupgradeneeded=()=>{const database=request.result;for(const storeName of previousStores){const store=database.createObjectStore(storeName,{keyPath:'id'});for(const value of stores[storeName])store.put(structuredClone(value));}};request.onsuccess=()=>{request.result.close();resolve();};request.onerror=()=>reject(request.error);});
}

function frozenVersionElevenSnapshotStores():Record<string,unknown[]>{
  const stores:Record<string,unknown[]>=Object.fromEntries(FOUNDATION_STORES.filter((store)=>!['projects','chat_preferences','recruitment_candidate_files'].includes(store)).map((store)=>[store,[]]));
  stores.meta=[{id:'schemaVersion',value:11},{id:'seedVersion',value:'frozen-schema-11-snapshot'},{id:'frozen-snapshot-marker',value:'preserve'}] satisfies MetaRecord[];
  stores.users=[{id:'legacy-snapshot-user',actorId:'actor-legacy-snapshot',name:'کاربر ثابت پشتیبان قدیمی',roleTitle:'نقش نسخه قدیم',roles:['نقش نسخه قدیم'],roleId:'legacy-snapshot-role',roleIds:['legacy-snapshot-role'],status:'active',username:'legacy.snapshot',passwordHash:'legacy-hash',passwordUpdatedAt:'2025-01-01T00:00:00.000Z',isAdmin:false,description:'fixture مستقل نسخه یازده',companyId:'company-shavaz',unitId:'unit-management',scope:'SELF',permissions:[],permissionEntitlements:[],permissionGrants:[],permissionDenials:[],accent:'#123456',initials:'پ.ق'}] satisfies LocalUser[];
  stores.security_roles=[{id:'legacy-snapshot-role',name:'نقش نسخه قدیم',description:'نقش ثابت پشتیبان یازده',status:'active',protected:false,scope:'SELF',permissions:[],createdAt:'2025-01-01T00:00:00.000Z',updatedAt:'2025-01-01T00:00:00.000Z',version:1}] satisfies SecurityRole[];
  stores.tasks=[{id:'legacy-snapshot-task',moduleId:'task',domain:'task',trackingCode:'V11-SNAPSHOT-TASK',title:'کار حفظ‌شده در پشتیبان',description:'بدون وابستگی به seed فعلی',status:'todo',priority:'normal',companyId:'company-shavaz',unitId:'unit-management',createdByActorId:'actor-legacy-snapshot',createdByUserId:'legacy-snapshot-user',updatedByActorId:'actor-legacy-snapshot',version:2,payload:{legacyMarker:'snapshot-v11'},createdAt:'2025-01-02T00:00:00.000Z',updatedAt:'2025-01-03T00:00:00.000Z'} satisfies OperationalRecord];
  return stores;
}

describe('IndexedDB schema 9 to current schema migration', () => {
  it('adds recruitment and protected personnel-document storage while preserving user data', async () => {
    const databaseName = `tapra2-schema-upgrade-${crypto.randomUUID()}`;
    await createVersionNineDatabase(databaseName);

    const storage = new IndexedDBAdapter(databaseName);
    const service = new LocalFoundationService(storage);
    const state = await service.initialize();

    expect(FOUNDATION_SCHEMA_VERSION).toBe(14);
    expect(state.users.find((user) => user.id === 'persona-product-owner')?.name).toBe('نام ویرایش‌شده و حفظ‌شده کاربر');
    expect(await storage.get<MetaRecord>('meta', 'custom-user-preference')).toEqual({id: 'custom-user-preference', value: 'keep-me'});

    const recruitmentCases = await storage.getAll<OperationalRecord>('recruitment_cases');
    expect(recruitmentCases).toHaveLength(6);
    expect(new Set(recruitmentCases.map((record) => record.id)).size).toBe(6);

    const recruitmentIds = new Set(recruitmentCases.map((record) => record.id));
    const recruitmentHistory = (await storage.getAll<OperationalRecordHistory>('workflow_history'))
      .filter((history) => history.moduleId === 'recruitment-case');
    expect(recruitmentHistory.length).toBeGreaterThanOrEqual(6);
    expect(recruitmentHistory.every((history) => recruitmentIds.has(history.recordId))).toBe(true);
    expect(state.workflows.some((workflow) => workflow.moduleId === 'recruitment-case')).toBe(true);
    expect(state.workflowVersions.some((workflow) => workflow.moduleId === 'recruitment-case')).toBe(true);
    expect(new Set(state.workflows.map((workflow) => workflow.moduleId))).toEqual(new Set(ERP_MODULES.map((module) => module.id)));
    expect(await storage.getAll('personnel_document_files')).toEqual([]);

    const versionRequest = indexedDB.open(databaseName);
    const actualVersion = await new Promise<number>((resolve, reject) => {
      versionRequest.onsuccess = () => { const version = versionRequest.result.version; versionRequest.result.close(); resolve(version); };
      versionRequest.onerror = () => reject(versionRequest.error);
    });
    expect(actualVersion).toBe(14);
  });
});

describe('tenant ownership migration for legacy organization units',()=>{
  it('backfills each legacy unit from authoritative tenant relations and remains idempotent',async()=>{
    const databaseName=`tapra2-legacy-unit-tenant-${crypto.randomUUID()}`;
    const storage=new IndexedDBAdapter(databaseName);
    const seed=createSeedData();
    const management=(seed.organizational_units as Array<{id:string;companyId?:string}>).find((unit)=>unit.id==='unit-management')!;
    delete management.companyId;
    const template=(seed.users as LocalUser[])[0];
    (seed.organizational_units as unknown[]).push({id:'unit-legacy-other',name:'واحد قدیمی شرکت دیگر',type:'اداره',status:'active',order:990,description:'',createdAt:'',updatedAt:''});
    (seed.users as LocalUser[]).push({...template,id:'legacy-other-user',actorId:'legacy-other-actor',username:'legacy.other',companyId:'company-other',unitId:'unit-legacy-other',personnelId:undefined});
    (seed.meta as MetaRecord[]).find((item)=>item.id==='seedVersion')!.value='complete-local-erp-v1.38-training-personnel';
    await storage.replaceAll(seed);
    const service=new LocalFoundationService(storage);
    await service.initialize();
    expect((await storage.get<{companyId?:string}>('organizational_units','unit-management'))?.companyId).toBe(template.companyId);
    expect((await storage.get<{companyId?:string}>('organizational_units','unit-legacy-other'))?.companyId).toBe('company-other');
    const afterFirst=await storage.getAll('organizational_units');
    await service.initialize();
    expect(await storage.getAll('organizational_units')).toEqual(afterFirst);
  });
});

describe('v1.40 generated letter workflow repair',()=>{
  it('publishes a valid v+1 policy while preserving the pinned invalid historical version exactly once',async()=>{
    const databaseName=`tapra2-v140-letter-policy-${crypto.randomUUID()}`;
    const storage=new IndexedDBAdapter(databaseName);
    const seed=createSeedData();
    const stores=seed as unknown as Record<FoundationStoreName,unknown[]>;
    const legacy=v140GeneratedInvalidLetterPolicy(seed);
    const historical:WorkflowDefinition={
      ...structuredClone(legacy),id:`${legacy.id}-v${legacy.version}`,
    };
    stores.workflow_definitions=(seed.workflow_definitions as WorkflowDefinition[]).map((workflow)=>workflow.moduleId==='letter'?legacy:workflow);
    stores.workflow_versions=(seed.workflow_versions as WorkflowDefinition[]).map((workflow)=>workflow.moduleId==='letter'&&workflow.version===1?historical:workflow);
    (seed.meta as MetaRecord[]).find((item)=>item.id==='seedVersion')!.value=V140_SEED_VERSION;
    const pinned=(seed.letters as OperationalRecord[])[0];
    pinned.workflowVersion=1;
    const pinnedBefore=structuredClone(pinned);
    const historicalBefore=structuredClone(historical);
    await storage.replaceAll(seed);

    const service=new LocalFoundationService(storage);
    const state=await service.initialize();
    const active=state.workflows.find((workflow)=>workflow.moduleId==='letter')!;
    expect(active.version).toBe(2);
    expect(active.approvalStages).toMatchObject([{stateId:'in_review',roleIds:['role-letter-reviewer'],assignmentMode:'role_queue'}]);
    expect(validateWorkflowPolicy(active,active.approvalStages??[],state.roles,active.routeVariants??[],state.users)).toEqual([]);
    expect(await storage.get<WorkflowDefinition>('workflow_versions',historical.id)).toEqual(historicalBefore);
    expect(await storage.get<OperationalRecord>('letters',pinned.id)).toEqual(pinnedBefore);
    expect((await storage.get<MetaRecord>('meta','seedVersion'))?.value).toBe(FOUNDATION_SEED_VERSION);

    const definitionsAfterFirst=await storage.getAll<WorkflowDefinition>('workflow_definitions');
    const versionsAfterFirst=await storage.getAll<WorkflowDefinition>('workflow_versions');
    const auditsAfterFirst=await storage.getAll('audit_events');
    await service.initialize();
    expect(await storage.getAll<WorkflowDefinition>('workflow_definitions')).toEqual(definitionsAfterFirst);
    expect(await storage.getAll<WorkflowDefinition>('workflow_versions')).toEqual(versionsAfterFirst);
    expect(await storage.getAll('audit_events')).toEqual(auditsAfterFirst);
    expect(versionsAfterFirst.filter((workflow)=>workflow.moduleId==='letter'&&workflow.version===1)).toHaveLength(1);
  });

  it('keeps a historical next-version collision fail-closed after migration and rejects manual publication without writes',async()=>{
    const storage=new IndexedDBAdapter(`tapra2-v140-letter-collision-${crypto.randomUUID()}`);
    const seed=createSeedData();
    const stores=seed as unknown as Record<FoundationStoreName,unknown[]>;
    const valid=(seed.workflow_definitions as WorkflowDefinition[]).find((workflow)=>workflow.moduleId==='letter')!;
    const legacy=v140GeneratedInvalidLetterPolicy(seed);
    const collision:WorkflowDefinition={...structuredClone(valid),id:'workflow-letter-v2-collision',version:2,changeSummary:'نسخه تاریخی موجود پیش از ترمیم'};
    stores.workflow_definitions=(seed.workflow_definitions as WorkflowDefinition[]).map((workflow)=>workflow.moduleId==='letter'?legacy:workflow);
    stores.workflow_versions=[...(seed.workflow_versions as WorkflowDefinition[]),collision];
    (seed.meta as MetaRecord[]).find((item)=>item.id==='seedVersion')!.value=V140_SEED_VERSION;
    await storage.replaceAll(seed);
    const service=new LocalFoundationService(storage);
    const migrated=await service.initialize();
    expect(migrated.workflows.find((workflow)=>workflow.moduleId==='letter')).toMatchObject({version:1,approvalStages:[{stateId:'approved_for_send',roleIds:[]}]});
    expect((await storage.get<MetaRecord>('meta','seedVersion'))?.value).toBe(FOUNDATION_SEED_VERSION);

    const before={
      definitions:await storage.getAll<WorkflowDefinition>('workflow_definitions'),
      versions:await storage.getAll<WorkflowDefinition>('workflow_versions'),
      audits:await storage.getAll('audit_events'),events:await storage.getAll('domain_events'),receipts:await storage.getAll('idempotency_keys'),
    };
    await expect(service.updateWorkflowPolicy('letter',1,{
      queueStrategy:legacy.queueStrategy,
      assignmentPolicy:'سیاست معتبر انتشار نامه پس از تشخیص برخورد نسخه تاریخی',
      approvalPolicyId:legacy.approvalPolicyId,
      approvalStages:structuredClone(valid.approvalStages!),
      routeVariants:structuredClone(valid.routeVariants??[]),
      changeSummary:'تلاش کنترل‌شده برای انتشار پس از مهاجرت دارای برخورد نسخه',
    },'letter-policy-collision-command')).rejects.toThrow(/نسخه تاریخی 2/);
    expect(await storage.getAll<WorkflowDefinition>('workflow_definitions')).toEqual(before.definitions);
    expect(await storage.getAll<WorkflowDefinition>('workflow_versions')).toEqual(before.versions);
    expect(await storage.getAll('audit_events')).toEqual(before.audits);
    expect(await storage.getAll('domain_events')).toEqual(before.events);
    expect(await storage.getAll('idempotency_keys')).toEqual(before.receipts);
    expect(await storage.get('idempotency_keys','letter-policy-collision-command')).toBeUndefined();
  });

  it.each([
    {label:'invalid',version:1,stageState:'approved_for_send',roleIds:[] as string[],expectedValid:false},
    {label:'valid',version:3,stageState:'in_review',roleIds:['role-letter-reviewer'],expectedValid:true},
  ])('preserves a custom $label letter policy instead of treating it as generated seed data',async({version,stageState,roleIds,expectedValid})=>{
    const storage=new IndexedDBAdapter(`tapra2-custom-letter-policy-${version}-${crypto.randomUUID()}`);
    const seed=createSeedData();
    const stores=seed as unknown as Record<FoundationStoreName,unknown[]>;
    const base=(seed.workflow_definitions as WorkflowDefinition[]).find((workflow)=>workflow.moduleId==='letter')!;
    const custom:WorkflowDefinition={
      ...base,version,changeSummary:`custom-policy-${version}`,
      approvalStages:[{
        id:'custom-letter-stage',title:`custom-${stageState}`,stateId:stageState,roleIds,scope:'COMPANY',
        decisions:['approve','reject','needs_correction'],required:true,allowSelfApproval:false,assignmentMode:'role_queue',
      }],
    };
    stores.workflow_definitions=(seed.workflow_definitions as WorkflowDefinition[]).map((workflow)=>workflow.moduleId==='letter'?custom:workflow);
    (seed.meta as MetaRecord[]).find((item)=>item.id==='seedVersion')!.value=V140_SEED_VERSION;
    await storage.replaceAll(seed);
    const service=new LocalFoundationService(storage);
    const state=await service.initialize();
    const migrated=state.workflows.find((workflow)=>workflow.moduleId==='letter')!;
    expect(migrated.version).toBe(version);
    expect(migrated.changeSummary).toBe(custom.changeSummary);
    expect(migrated.approvalStages).toEqual(custom.approvalStages);
    expect(validateWorkflowPolicy(migrated,migrated.approvalStages??[],state.roles,migrated.routeVariants??[],state.users).length===0).toBe(expectedValid);
  });
});

describe('schema 11 backup compatibility',()=>{
  it('restores a schema 13 backup and adds an empty approval-round store without rewriting prior data',async()=>{
    const databaseName=`tapra2-schema-13-backup-${crypto.randomUUID()}`;
    const storage=new IndexedDBAdapter(databaseName);await storage.replaceAll(createSeedData());
    const current=await storage.exportSnapshot();
    const legacyStores=Object.fromEntries(Object.entries(current.stores).filter(([store])=>store!=='workflow_approval_rounds'));
    const payload={format:current.format,schemaVersion:13,seedVersion:'complete-local-erp-v1.39-tenant-units',exportedAt:current.exportedAt,stores:legacyStores};
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));let binary='';for(const byte of new Uint8Array(digest))binary+=String.fromCharCode(byte);
    const preservedUsers=structuredClone(legacyStores.users);
    await storage.importSnapshot({...payload,checksum:btoa(binary)} as unknown as import('./model').SnapshotManifest);
    expect(await storage.getAll('workflow_approval_rounds')).toEqual([]);
    expect(await storage.getAll('users')).toEqual(preservedUsers);
    expect((await storage.get<MetaRecord>('meta','schemaVersion'))?.value).toBe(14);
  });

  it('restores a schema 12 backup and adds the candidate file store without changing prior records',async()=>{
    const databaseName=`tapra2-schema-12-backup-${crypto.randomUUID()}`;
    const storage=new IndexedDBAdapter(databaseName);await storage.replaceAll(createSeedData());
    const current=await storage.exportSnapshot();
    const legacyStores=Object.fromEntries(Object.entries(current.stores).filter(([store])=>store!=='recruitment_candidate_files'));
    const payload={format:current.format,schemaVersion:12,seedVersion:'complete-local-erp-v1.36-recruitment-talent-bank',exportedAt:current.exportedAt,stores:legacyStores};
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));let binary='';for(const byte of new Uint8Array(digest))binary+=String.fromCharCode(byte);
    const userCount=(legacyStores.users as unknown[]).length;
    await storage.importSnapshot({...payload,checksum:btoa(binary)} as unknown as import('./model').SnapshotManifest);
    expect(await storage.getAll('recruitment_candidate_files')).toEqual([]);
    expect((await storage.getAll('users')).length).toBe(userCount);
    expect((await storage.get<MetaRecord>('meta','schemaVersion'))?.value).toBe(14);
  });

  it('verifies the old checksum before adding the schema 12 stores',async()=>{
    const databaseName=`tapra2-schema-11-backup-${crypto.randomUUID()}`;
    const storage=new IndexedDBAdapter(databaseName);await storage.replaceAll(createSeedData());
    const current=await storage.exportSnapshot();
    const legacyStores=Object.fromEntries(Object.entries(current.stores).filter(([store])=>!['projects','chat_preferences','recruitment_candidate_files'].includes(store)));
    const payload={format:current.format,schemaVersion:11,seedVersion:current.seedVersion,exportedAt:current.exportedAt,stores:legacyStores};
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
    let binary='';for(const byte of new Uint8Array(digest))binary+=String.fromCharCode(byte);
    const legacy={...payload,checksum:btoa(binary)} as unknown as import('./model').SnapshotManifest;
    await storage.importSnapshot(legacy);
    expect(await storage.getAll('projects')).toEqual([]);
    expect(await storage.getAll('chat_preferences')).toEqual([]);
    expect((await storage.getAll<MetaRecord>('meta')).find((item)=>item.id==='schemaVersion')?.value).toBe(14);
    expect(await storage.getAll('recruitment_candidate_files')).toEqual([]);
    expect((await storage.getAll<LocalUser>('users')).length).toBeGreaterThan(0);
  });

  it('restores a frozen schema 11 snapshot and immediately completes the schema 12 domain migration',async()=>{
    const databaseName=`tapra2-frozen-schema-11-restore-${crypto.randomUUID()}`;
    const storage=new IndexedDBAdapter(databaseName);const service=new LocalFoundationService(storage);await service.initialize();
    const stores=frozenVersionElevenSnapshotStores();
    const payload={format:'tapra2-local-snapshot' as const,schemaVersion:11,seedVersion:'frozen-schema-11-snapshot',exportedAt:'2025-02-01T00:00:00.000Z',stores};
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));let binary='';for(const byte of new Uint8Array(digest))binary+=String.fromCharCode(byte);
    const state=await service.importSnapshot({...payload,checksum:btoa(binary)});
    expect(state.roles.some((role)=>role.id==='role-project-manager')).toBe(true);
    expect(state.workflows.some((workflow)=>workflow.moduleId==='project')).toBe(true);
    expect(await storage.get<MetaRecord>('meta','frozen-snapshot-marker')).toEqual({id:'frozen-snapshot-marker',value:'preserve'});
    expect((await storage.get<OperationalRecord>('tasks','legacy-snapshot-task'))?.payload.legacyMarker).toBe('snapshot-v11');
    expect((await storage.get<MetaRecord>('meta','schemaVersion'))?.value).toBe(14);
    expect(await storage.getAll('chat_preferences')).toEqual([]);
  });
});

describe('IndexedDB schema 11 to schema 12 migration',()=>{
  it('adds collaboration stores, roles and workflow without replacing prior users and is idempotent',async()=>{
    const databaseName=`tapra2-schema-11-collaboration-${crypto.randomUUID()}`;await createVersionElevenDatabase(databaseName);
    const storage=new IndexedDBAdapter(databaseName);const service=new LocalFoundationService(storage);let state=await service.initialize();
    expect(state.users.find((user)=>user.id==='persona-product-owner')?.name).toBe('کاربر حفظ‌شده نسخه یازده');
    expect(await storage.get<MetaRecord>('meta','custom-v11-marker')).toEqual({id:'custom-v11-marker',value:'preserve'});
    expect(state.roles.some((role)=>role.id==='role-project-manager')).toBe(true);
    expect(state.workflows.some((workflow)=>workflow.moduleId==='project')).toBe(true);
    expect((await storage.getAll<OperationalRecord>('projects')).length).toBeGreaterThan(0);
    expect(await storage.getAll('chat_preferences')).toEqual([]);
    state=await service.initialize();
    expect(state.workflows.filter((workflow)=>workflow.moduleId==='project')).toHaveLength(1);
    expect((await storage.getAll<OperationalRecord>('projects')).filter((record)=>record.id==='demo-project-1')).toHaveLength(1);
  });

  it('preserves a frozen schema 11 fixture without deriving it from the current seed',async()=>{
    const databaseName=`tapra2-frozen-schema-11-${crypto.randomUUID()}`;await createFrozenVersionElevenDatabase(databaseName);
    const storage=new IndexedDBAdapter(databaseName);const service=new LocalFoundationService(storage);await service.initialize();
    expect((await storage.get<LocalUser>('users','legacy-v11-user'))?.name).toBe('کاربر سفارشی نسخه یازده');
    expect(await storage.get<MetaRecord>('meta','frozen-v11-marker')).toEqual({id:'frozen-v11-marker',value:'preserve-exactly'});
    for(const [store,id,marker] of [['tasks','legacy-v11-task','task-v11'],['chats','legacy-v11-chat','chat-v11'],['messages','legacy-v11-message','message-v11'],['letters','legacy-v11-letter','letter-v11'],['documents','legacy-v11-document','document-v11']] as const){
      expect((await storage.get<OperationalRecord>(store,id))?.payload.legacyMarker).toBe(marker);
    }
    const countsBefore=Object.fromEntries(await Promise.all(previousStoresForAssertion().map(async(store)=>[store,(await storage.getAll(store)).length])));
    await service.initialize();
    const countsAfter=Object.fromEntries(await Promise.all(previousStoresForAssertion().map(async(store)=>[store,(await storage.getAll(store)).length])));
    expect(countsAfter).toEqual(countsBefore);
    expect((await storage.get<LocalUser>('users','legacy-v11-user'))?.name).toBe('کاربر سفارشی نسخه یازده');
  });
});

function previousStoresForAssertion():FoundationStoreName[]{
  return ['users','tasks','chats','messages','letters','documents','projects','chat_preferences','recruitment_candidate_files'];
}

describe('IndexedDB schema 10 personnel-document migration',()=>{
  it('moves legacy bytes to the protected store and redacts metadata and history idempotently',async()=>{
    const databaseName=`tapra2-schema-10-document-${crypto.randomUUID()}`;
    await createVersionTenDatabaseWithLegacyDocument(databaseName);
    const storage=new IndexedDBAdapter(databaseName);const service=new LocalFoundationService(storage);
    await service.initialize();
    const files=await storage.getAll<PersonnelDocumentFile>('personnel_document_files');
    const documents=await storage.getAll<OperationalRecord>('personnel_documents');
    const history=await storage.getAll<OperationalRecordHistory>('workflow_history');
    expect(files).toHaveLength(2);
    const migratedFile=files.find((item)=>item.recordId==='legacy-personnel-document')!;
    const quarantinedFile=files.find((item)=>item.recordId==='legacy-ownerless-document')!;
    expect(migratedFile.dataUrl).toBe(LEGACY_DOCUMENT_DATA_URL);
    expect(quarantinedFile.dataUrl).toBe(LEGACY_DOCUMENT_DATA_URL);
    expect(quarantinedFile.personnelId).toBe('unresolved-owner:legacy-ownerless-document');
    const legacyBytes=Uint8Array.from(atob(LEGACY_DOCUMENT_DATA_URL.split(',')[1]),(character)=>character.charCodeAt(0));
    const expectedChecksum=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',legacyBytes)),(byte)=>byte.toString(16).padStart(2,'0')).join('');
    expect(migratedFile.checksumSha256).toBe(expectedChecksum);
    expect(JSON.stringify(documents)).not.toContain('fileDataUrl');
    expect(JSON.stringify(history.find((item)=>item.moduleId==='personnel-document'))).not.toContain('fileDataUrl');
    expect(JSON.stringify(history.find((item)=>item.moduleId==='purchase-request'))).not.toContain(UNRELATED_ATTACHMENT_DATA_URL);
    const migratedDocument=documents.find((item)=>item.id==='legacy-personnel-document')!;
    const quarantinedDocument=documents.find((item)=>item.id==='legacy-ownerless-document')!;
    expect(migratedDocument.payload.fileRef).toBe(migratedFile.id);
    expect(migratedDocument.payload.legacyUnclassified).toBe(true);
    expect(quarantinedDocument.payload.fileRef).toBe(quarantinedFile.id);
    expect(quarantinedDocument.payload.legacyOwnerUnresolved).toBe(true);
    await service.initialize();
    expect(await storage.getAll<PersonnelDocumentFile>('personnel_document_files')).toHaveLength(2);
  });
});
