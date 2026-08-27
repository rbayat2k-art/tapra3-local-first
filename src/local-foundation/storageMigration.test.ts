import 'fake-indexeddb/auto';
import {describe, expect, it} from 'vitest';
import {
  FOUNDATION_SCHEMA_VERSION,
  FOUNDATION_STORES,
  type FoundationStoreName,
  type LocalUser,
  type MetaRecord,
  type OperationalRecord,
  type OperationalRecordHistory,
  type PersonnelDocumentFile,
  type SecurityRole,
} from './model';
import {createSeedData} from './seed';
import {ERP_MODULES} from './erpCatalog';
import {LocalFoundationService} from './service';
import {IndexedDBAdapter} from './storage';

const PREVIOUS_SCHEMA_VERSION = 9;
const LEGACY_DOCUMENT_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';
const UNRELATED_ATTACHMENT_DATA_URL = 'data:application/pdf;base64,JVBERi0=';

function createVersionNineDatabase(databaseName: string): Promise<void> {
  const seed = createSeedData() as Record<FoundationStoreName, unknown[]>;
  const previousStores = FOUNDATION_STORES.filter((store) => !['recruitment_cases','personnel_document_files','projects','chat_preferences'].includes(store));
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
  const previousStores = FOUNDATION_STORES.filter((store) => !['personnel_document_files','projects','chat_preferences'].includes(store));
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
  const previousStores=FOUNDATION_STORES.filter((store)=>!['projects','chat_preferences'].includes(store));
  seed.meta=[{id:'schemaVersion',value:11},{id:'seedVersion',value:'complete-local-erp-v1.34-organization-workflow-rebuild'},{id:'custom-v11-marker',value:'preserve'}] satisfies MetaRecord[];
  seed.security_roles=(seed.security_roles as Array<{id:string}>).filter((role)=>!['role-project-member','role-project-manager'].includes(role.id));
  seed.workflow_definitions=(seed.workflow_definitions as Array<{moduleId:string}>).filter((workflow)=>workflow.moduleId!=='project');
  seed.workflow_versions=(seed.workflow_versions as Array<{moduleId:string}>).filter((workflow)=>workflow.moduleId!=='project');
  const first=(seed.users as LocalUser[])[0];seed.users=[{...first,name:'کاربر حفظ‌شده نسخه یازده'},...(seed.users as LocalUser[]).slice(1)];
  return new Promise((resolve,reject)=>{const request=indexedDB.open(databaseName,11);request.onupgradeneeded=()=>{const database=request.result;for(const storeName of previousStores){const store=database.createObjectStore(storeName,{keyPath:'id'});for(const value of seed[storeName])store.put(structuredClone(value));}};request.onsuccess=()=>{request.result.close();resolve();};request.onerror=()=>reject(request.error);});
}

function createFrozenVersionElevenDatabase(databaseName:string):Promise<void>{
  const stores=Object.fromEntries(FOUNDATION_STORES.map((store)=>[store,[]])) as Record<FoundationStoreName,unknown[]>;
  const previousStores=FOUNDATION_STORES.filter((store)=>!['projects','chat_preferences'].includes(store));
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
  const stores:Record<string,unknown[]>=Object.fromEntries(FOUNDATION_STORES.filter((store)=>!['projects','chat_preferences'].includes(store)).map((store)=>[store,[]]));
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

    expect(FOUNDATION_SCHEMA_VERSION).toBe(12);
    expect(state.users.find((user) => user.id === 'persona-product-owner')?.name).toBe('نام ویرایش‌شده و حفظ‌شده کاربر');
    expect(await storage.get<MetaRecord>('meta', 'custom-user-preference')).toEqual({id: 'custom-user-preference', value: 'keep-me'});

    const recruitmentCases = await storage.getAll<OperationalRecord>('recruitment_cases');
    expect(recruitmentCases).toHaveLength(5);
    expect(new Set(recruitmentCases.map((record) => record.id)).size).toBe(5);

    const recruitmentIds = new Set(recruitmentCases.map((record) => record.id));
    const recruitmentHistory = (await storage.getAll<OperationalRecordHistory>('workflow_history'))
      .filter((history) => history.moduleId === 'recruitment-case');
    expect(recruitmentHistory.length).toBeGreaterThanOrEqual(5);
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
    expect(actualVersion).toBe(12);
  });
});

describe('schema 11 backup compatibility',()=>{
  it('verifies the old checksum before adding the schema 12 stores',async()=>{
    const databaseName=`tapra2-schema-11-backup-${crypto.randomUUID()}`;
    const storage=new IndexedDBAdapter(databaseName);await storage.replaceAll(createSeedData());
    const current=await storage.exportSnapshot();
    const legacyStores=Object.fromEntries(Object.entries(current.stores).filter(([store])=>!['projects','chat_preferences'].includes(store)));
    const payload={format:current.format,schemaVersion:11,seedVersion:current.seedVersion,exportedAt:current.exportedAt,stores:legacyStores};
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
    let binary='';for(const byte of new Uint8Array(digest))binary+=String.fromCharCode(byte);
    const legacy={...payload,checksum:btoa(binary)} as unknown as import('./model').SnapshotManifest;
    await storage.importSnapshot(legacy);
    expect(await storage.getAll('projects')).toEqual([]);
    expect(await storage.getAll('chat_preferences')).toEqual([]);
    expect((await storage.getAll<MetaRecord>('meta')).find((item)=>item.id==='schemaVersion')?.value).toBe(12);
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
    expect((await storage.get<MetaRecord>('meta','schemaVersion'))?.value).toBe(12);
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
  return ['users','tasks','chats','messages','letters','documents','projects','chat_preferences'];
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
    expect(JSON.stringify(history.find((item)=>item.moduleId==='purchase-request'))).toContain(UNRELATED_ATTACHMENT_DATA_URL);
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
