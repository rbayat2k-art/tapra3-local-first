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
  const previousStores = FOUNDATION_STORES.filter((store) => store !== 'recruitment_cases' && store !== 'personnel_document_files');
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
  const previousStores = FOUNDATION_STORES.filter((store) => store !== 'personnel_document_files');
  const person = (seed.personnel as Array<{id:string;unitId:string;branchUnitId?:string}>)[0];
  const owner = (seed.users as LocalUser[]).find((user) => user.personnelId === person.id) ?? (seed.users as LocalUser[])[0];
  const record: OperationalRecord = {id:'legacy-personnel-document',moduleId:'personnel-document',domain:'hr',trackingCode:'PDC-LEGACY',title:'مدرک قدیمی',description:'',status:'uploaded',priority:'normal',companyId:owner.companyId,unitId:person.unitId,branchUnitId:person.branchUnitId,ownerPersonnelId:person.id,assigneeUserId:owner.id,createdByActorId:owner.actorId,createdByUserId:owner.id,updatedByActorId:owner.actorId,version:1,payload:{documentType:'مدرک قدیمی',fileName:'legacy.png',fileType:'image/png',fileSize:8,fileDataUrl:LEGACY_DOCUMENT_DATA_URL},createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'};
  const ownerlessRecord: OperationalRecord = {...record,id:'legacy-ownerless-document',trackingCode:'PDC-OWNERLESS',ownerPersonnelId:undefined,payload:{...record.payload,fileName:'ownerless.png'}};
  seed.personnel_documents=[record,ownerlessRecord];
  seed.workflow_history=[{id:'history-legacy-document',recordId:record.id,moduleId:record.moduleId,sequence:1,eventType:'created',actorId:owner.actorId,actorName:owner.name,effectiveUserId:owner.id,snapshot:{after:record},occurredAt:record.createdAt} satisfies OperationalRecordHistory,{id:'history-unrelated-attachment',recordId:'purchase-with-attachment',moduleId:'purchase-request',sequence:1,eventType:'created',actorId:owner.actorId,actorName:owner.name,effectiveUserId:owner.id,snapshot:{attachment:{dataUrl:UNRELATED_ATTACHMENT_DATA_URL}},occurredAt:record.createdAt} satisfies OperationalRecordHistory];
  seed.meta=[{id:'schemaVersion',value:10},{id:'seedVersion',value:'complete-local-erp-v1.28-unit-position-catalog'}] satisfies MetaRecord[];
  return new Promise((resolve,reject)=>{const request=indexedDB.open(databaseName,10);request.onupgradeneeded=()=>{const database=request.result;for(const storeName of previousStores){const store=database.createObjectStore(storeName,{keyPath:'id'});for(const value of seed[storeName])store.put(structuredClone(value));}};request.onsuccess=()=>{request.result.close();resolve();};request.onerror=()=>reject(request.error);});
}

describe('IndexedDB schema 9 to current schema migration', () => {
  it('adds recruitment and protected personnel-document storage while preserving user data', async () => {
    const databaseName = `tapra2-schema-upgrade-${crypto.randomUUID()}`;
    await createVersionNineDatabase(databaseName);

    const storage = new IndexedDBAdapter(databaseName);
    const service = new LocalFoundationService(storage);
    const state = await service.initialize();

    expect(FOUNDATION_SCHEMA_VERSION).toBe(11);
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
    expect(actualVersion).toBe(11);
  });
});

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
