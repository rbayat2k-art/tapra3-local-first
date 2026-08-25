import {describe, expect, it} from 'vitest';
import type {FoundationSession, FoundationStoreName, LocalUser, OperationalRecord, OperationalRecordHistory, PersonnelDocumentFile, SnapshotManifest} from './model';
import {FOUNDATION_STORES} from './model';
import {createSeedData} from './seed';
import {LocalFoundationService} from './service';
import type {StorageAdapter, StorageTransaction} from './storage';
import {
  PERSONNEL_DOCUMENT_CATALOG, PERSONNEL_DOCUMENT_MAX_SIZE, activePersonnelDocuments, missingPersonnelDocuments, personnelCompletionSummary,
  mayViewPersonnelCompletion, personnelVerificationSummary, validatePersonnelDocumentFile, type PersonnelDocumentKind,
} from './personnelDocuments';

class MemoryStorage implements StorageAdapter {
  private stores = new Map<FoundationStoreName, Map<IDBValidKey, unknown>>(FOUNDATION_STORES.map((store) => [store, new Map()]));
  failOnPutStore?: FoundationStoreName;
  async transaction<T>(_stores: FoundationStoreName[], _mode: IDBTransactionMode, work: (transaction: StorageTransaction) => Promise<T>): Promise<T> {const snapshot=structuredClone(this.stores);const tx:StorageTransaction={get:async<V>(store,id)=>this.stores.get(store)?.get(id) as V|undefined,getAll:async<V>(store)=>[...(this.stores.get(store)?.values()??[])] as V[],put:async<V>(store,value)=>{if(store===this.failOnPutStore)throw new Error('injected transaction failure');this.stores.get(store)!.set((value as {id:IDBValidKey}).id,structuredClone(value));},delete:async(store,id)=>{this.stores.get(store)!.delete(id);},clear:async(store)=>{this.stores.get(store)!.clear();}};try{return await work(tx);}catch(error){this.stores=snapshot;throw error;}}
  get<T>(store: FoundationStoreName,id:IDBValidKey){return this.transaction([store],'readonly',(tx)=>tx.get<T>(store,id));}
  getAll<T>(store:FoundationStoreName){return this.transaction([store],'readonly',(tx)=>tx.getAll<T>(store));}
  put<T>(store:FoundationStoreName,value:T){return this.transaction([store],'readwrite',(tx)=>tx.put(store,value));}
  delete(store:FoundationStoreName,id:IDBValidKey){return this.transaction([store],'readwrite',(tx)=>tx.delete(store,id));}
  async replaceAll(stores:Record<FoundationStoreName,unknown[]>){for(const store of FOUNDATION_STORES){this.stores.get(store)!.clear();for(const value of stores[store])this.stores.get(store)!.set((value as {id:IDBValidKey}).id,structuredClone(value));}}
  async exportSnapshot():Promise<SnapshotManifest>{throw new Error('not used');} async importSnapshot():Promise<void>{throw new Error('not used');}
}

const bytesDataUrl = (mimeType:string,bytes:number[]) => `data:${mimeType};base64,${btoa(String.fromCharCode(...bytes))}`;
const byteArrayDataUrl = (mimeType:string,bytes:Uint8Array) => {let binary='';for(let offset=0;offset<bytes.length;offset+=32_768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32_768));return `data:${mimeType};base64,${btoa(binary)}`;};
const png = {fileName:'identity.png',mimeType:'image/png',size:8,dataUrl:bytesDataUrl('image/png',[137,80,78,71,13,10,26,10])};
const pdfBytes = [37,80,68,70,45,49,46,52];
const pdf = {fileName:'identity.pdf',mimeType:'application/pdf',size:pdfBytes.length,dataUrl:bytesDataUrl('application/pdf',pdfBytes)};
const input = (kind:PersonnelDocumentKind,file=png) => ({kind,...file});
async function setup(){const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const session=(await storage.get<FoundationSession>('sessions','active-session'))!;return{storage,session,service:new LocalFoundationService(storage)};}
const login=(storage:MemoryStorage,session:FoundationSession,activeUserId:string,actingAdminUserId?:string)=>storage.put('sessions',{...session,activeUserId,actingAdminUserId});

describe('personnel document catalog and file validation',()=>{
  it('requires only the first birth-certificate page and national-id back',()=>{
    expect(PERSONNEL_DOCUMENT_CATALOG.filter((item)=>item.required).map((item)=>item.kind)).toEqual(['birth_certificate_first','national_id_back']);
    const person={id:'p'} as never;
    expect(personnelCompletionSummary(person,[]).documents.map((item)=>item.kind)).toEqual(['birth_certificate_first','national_id_back']);
  });

  it('accepts signed files and rejects spoofed, empty, SVG and oversized metadata',async()=>{
    await expect(validatePersonnelDocumentFile('birth_certificate_first',png)).resolves.toMatchObject({mimeType:'image/png',size:8});
    await expect(validatePersonnelDocumentFile('birth_certificate_first',pdf)).resolves.toMatchObject({mimeType:'application/pdf'});
    await expect(validatePersonnelDocumentFile('birth_certificate_first',{...png,fileName:'identity.jpg'})).rejects.toThrow('پسوند');
    await expect(validatePersonnelDocumentFile('birth_certificate_first',{...png,dataUrl:bytesDataUrl('image/png',[1,2,3,4,5,6,7,8])})).rejects.toThrow('امضای فایل');
    await expect(validatePersonnelDocumentFile('personnel_photo',pdf)).rejects.toThrow('تصویری');
    await expect(validatePersonnelDocumentFile('birth_certificate_first',{...png,fileName:'empty.png',size:0,dataUrl:'data:image/png;base64,'})).rejects.toThrow('ساختار');
    await expect(validatePersonnelDocumentFile('birth_certificate_first',{...png,fileName:'identity.svg',mimeType:'image/svg+xml'})).rejects.toThrow('PDF، JPG، PNG یا WebP');
    const oversizedBytes=new Uint8Array(PERSONNEL_DOCUMENT_MAX_SIZE+1);oversizedBytes.set([137,80,78,71,13,10,26,10]);
    await expect(validatePersonnelDocumentFile('birth_certificate_first',{...png,size:oversizedBytes.length,dataUrl:byteArrayDataUrl('image/png',oversizedBytes)})).rejects.toThrow('۵ مگابایت');
    await expect(validatePersonnelDocumentFile('birth_certificate_first',{...png,dataUrl:'not-a-data-url'})).rejects.toThrow('ساختار');
  });

  it('does not count optional, replaced, legacy or unclassified records as required completion',()=>{
    const base={id:'doc',moduleId:'personnel-document',ownerPersonnelId:'p',status:'linked',payload:{documentKind:'residence_proof',fileRef:'f'}} as unknown as OperationalRecord;
    expect(missingPersonnelDocuments([base],'p')).toHaveLength(2);
    expect(activePersonnelDocuments([{...base,id:'legacy',payload:{fileRef:'legacy'}},{...base,id:'replaced',status:'replaced',payload:{documentKind:'birth_certificate_first',fileRef:'x'}}],'p')).toHaveLength(0);
  });

  it('derives levels one through four only from real required fields and active document slots',()=>{
    const completePerson={id:'p',nationalId:'0013546783',gender:'male',secondaryMobile:'09121234568',province:'تهران',city:'تهران',address:'نشانی',bankName:'ملت',cardNumber:'6104337812345678'} as never;
    expect(personnelVerificationSummary({id:'p'} as never,[]).level).toBe(1);
    expect(personnelVerificationSummary(completePerson,[])).toMatchObject({level:2,label:'اطلاعات کامل'});
    const document=(id:string,kind:PersonnelDocumentKind):OperationalRecord=>({id,moduleId:'personnel-document',ownerPersonnelId:'p',status:'linked',payload:{documentKind:kind,fileRef:`file-${id}`}} as unknown as OperationalRecord);
    const required=[document('birth','birth_certificate_first'),document('national','national_id_back')];
    expect(personnelVerificationSummary(completePerson,required)).toMatchObject({level:3,label:'هویت تکمیل'});
    expect(personnelVerificationSummary(completePerson,[...required,document('extra','birth_certificate_additional')]).level).toBe(3);
    expect(personnelVerificationSummary(completePerson,[...required,document('photo','personnel_photo'),document('residence','residence_proof')])).toMatchObject({level:4,label:'پرونده تکمیلی',score:100});
  });

  it('fails closed when an unlinked personnel company cannot be derived or belongs to another company',()=>{
    const queueUser={id:'hr',actorId:'actor-hr',companyId:'company-a',unitId:'unit-hr',permissions:['organization.personnel.documents.queue.view'],permissionScopes:{'organization.personnel.documents.queue.view':'COMPANY'}} as unknown as LocalUser;
    const otherCompanyPersonnel={id:'p-other',companyId:'company-b',unitId:'unit-hr',employmentStatus:'active'} as never;
    expect(mayViewPersonnelCompletion(queueUser,otherCompanyPersonnel,[queueUser])).toBe(false);
    const unresolvedPersonnel={id:'p-unresolved',unitId:'shared-unit',employmentStatus:'active'} as never;
    const ambiguousUsers=[queueUser,{...queueUser,id:'company-a-user',unitId:'shared-unit',companyId:'company-a'},{...queueUser,id:'company-b-user',unitId:'shared-unit',companyId:'company-b'}] as never;
    expect(mayViewPersonnelCompletion(queueUser,unresolvedPersonnel,ambiguousUsers)).toBe(false);
  });
});

describe('personnel document service',()=>{
  it('lets a directly signed-in employee upload own documents without leaking bytes into public state or history',async()=>{
    const {storage,session,service}=await setup();
    await login(storage,session,'persona-seller');
    const before=await service.loadState(); const personnelId=before.activeUser.personnelId!;
    let state=await service.savePersonnelDocument(personnelId,input('birth_certificate_first'));
    state=await service.savePersonnelDocument(personnelId,input('national_id_back',pdf));
    expect(missingPersonnelDocuments(state.operationalRecords,personnelId)).toEqual([]);
    expect(JSON.stringify(state)).not.toContain(png.dataUrl);
    expect(JSON.stringify(state.operationalHistory)).not.toContain('fileDataUrl');
    expect(JSON.stringify(state.audits)).not.toContain(png.dataUrl);
    expect(await storage.getAll<PersonnelDocumentFile>('personnel_document_files')).toHaveLength(2);
    await login(storage,session,'persona-product-owner');
    await expect(service.exportSnapshot()).rejects.toThrow('فقط پشتیبان رمزگذاری‌شده');
    await login(storage,session,'persona-auditor');
    await expect(service.exportSnapshot('strong-test-password')).rejects.toThrow('مجوز صریح مشاهده محتوای مدارک');
  },20_000);

  it('keeps immutable replacement history and only counts the latest linked version',async()=>{
    const {storage,session,service}=await setup();await login(storage,session,'persona-seller');
    const personnelId=(await service.loadState()).activeUser.personnelId!;
    let state=await service.savePersonnelDocument(personnelId,input('birth_certificate_first'));
    const first=activePersonnelDocuments(state.operationalRecords,personnelId)[0];
    state=await service.savePersonnelDocument(personnelId,{...input('birth_certificate_first',pdf),replaceDocumentId:first.id});
    expect(state.operationalRecords.find((item)=>item.id===first.id)?.status).toBe('replaced');
    expect(activePersonnelDocuments(state.operationalRecords,personnelId)).toHaveLength(1);
    expect(await storage.getAll<PersonnelDocumentFile>('personnel_document_files')).toHaveLength(2);
    await expect(service.savePersonnelDocument(personnelId,{...input('birth_certificate_first'),replaceDocumentId:first.id})).rejects.toThrow('نسخه فعالی');
  });

  it('prevents arbitrary self targets and QA uploads while HR may manage and reviewer may only read',async()=>{
    const {storage,session,service}=await setup();
    await login(storage,session,'persona-seller');
    await expect(service.savePersonnelDocument('personnel-hr-manager',input('birth_certificate_first'))).rejects.toThrow('مجوز');
    await login(storage,session,'persona-seller','persona-product-owner');
    await expect(service.savePersonnelDocument('personnel-arman',input('birth_certificate_first'))).rejects.toThrow('حالت مشاهده دسترسی');
    await expect(service.completeOwnPersonnelProfile({} as never)).rejects.toThrow('حالت مشاهده دسترسی');
    await login(storage,session,'persona-hr-manager');
    let state=await service.savePersonnelDocument('personnel-arman',input('birth_certificate_first'));
    const record=activePersonnelDocuments(state.operationalRecords,'personnel-arman')[0];
    await login(storage,session,'persona-personnel-reviewer');
    await expect(service.savePersonnelDocument('personnel-arman',input('national_id_back'))).rejects.toThrow('مجوز');
    await expect(service.getPersonnelDocumentFile(record.id)).resolves.toMatchObject({recordId:record.id,personnelId:'personnel-arman'});
    await login(storage,session,'persona-advance-branch-manager');
    expect((await service.loadState()).operationalRecords.some((item)=>item.id===record.id)).toBe(false);
  },20_000);

  it('records a seven-day reminder deferral without changing the user permissions',async()=>{
    const {storage,session,service}=await setup();await login(storage,session,'persona-seller');
    const before=await service.loadState();
    const state=await service.deferOwnPersonnelProfileCompletion();
    expect(new Date(state.session.profileCompletionDeferredUntil!).getTime()).toBeGreaterThan(Date.now()+6*24*60*60*1000);
    expect(state.activeUser.permissions).toEqual(before.activeUser.permissions);
    expect(state.audits.some((item)=>item.action==='organization.personnel.profile_completion_deferred')).toBe(true);
  });

  it('rolls back metadata, content, history and audit when the atomic upload transaction fails',async()=>{
    const {storage,session,service}=await setup();await login(storage,session,'persona-seller');
    const personnelId=(await service.loadState()).activeUser.personnelId!;
    const documentsBefore=await storage.getAll<OperationalRecord>('personnel_documents');
    const filesBefore=await storage.getAll<PersonnelDocumentFile>('personnel_document_files');
    const historyBefore=await storage.getAll<OperationalRecordHistory>('workflow_history');
    storage.failOnPutStore='domain_events';
    await expect(service.savePersonnelDocument(personnelId,input('birth_certificate_first'))).rejects.toThrow('injected transaction failure');
    expect(await storage.getAll<OperationalRecord>('personnel_documents')).toEqual(documentsBefore);
    expect(await storage.getAll<PersonnelDocumentFile>('personnel_document_files')).toEqual(filesBefore);
    expect(await storage.getAll<OperationalRecordHistory>('workflow_history')).toEqual(historyBefore);
  },20_000);
});
