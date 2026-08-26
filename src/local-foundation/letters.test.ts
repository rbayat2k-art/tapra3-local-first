import {describe,expect,it} from 'vitest';
import type {FoundationSession,FoundationStoreName,MetaRecord,OperationalRecord,OperationalRecordHistory,SnapshotManifest} from './model';
import {FOUNDATION_STORES} from './model';
import {createSeedData} from './seed';
import {LocalFoundationService} from './service';
import type {StorageAdapter,StorageTransaction} from './storage';
import {letterDigitalSignature,letterPdfBaseName,letterSignatureCanonicalText} from './letters';

class MemoryStorage implements StorageAdapter{
  private stores=new Map<FoundationStoreName,Map<IDBValidKey,unknown>>(FOUNDATION_STORES.map((store)=>[store,new Map()]));
  async transaction<T>(stores:FoundationStoreName[],_mode:IDBTransactionMode,work:(transaction:StorageTransaction)=>Promise<T>):Promise<T>{const snapshots=new Map(stores.map((store)=>[store,new Map(this.stores.get(store)!)]));const tx:StorageTransaction={get:async<T>(store,id)=>this.stores.get(store)?.get(id) as T|undefined,getAll:async<T>(store)=>[...(this.stores.get(store)?.values()??[])] as T[],put:async(store,value)=>{this.stores.get(store)!.set((value as {id:IDBValidKey}).id,structuredClone(value));},delete:async(store,id)=>{this.stores.get(store)!.delete(id);},clear:async(store)=>{this.stores.get(store)!.clear();}};try{return await work(tx);}catch(error){for(const [store,snapshot] of snapshots)this.stores.set(store,snapshot);throw error;}}
  get<T>(store:FoundationStoreName,id:IDBValidKey){return this.transaction([store],'readonly',(tx)=>tx.get<T>(store,id));}getAll<T>(store:FoundationStoreName){return this.transaction([store],'readonly',(tx)=>tx.getAll<T>(store));}put<T>(store:FoundationStoreName,value:T){return this.transaction([store],'readwrite',(tx)=>tx.put(store,value));}delete(store:FoundationStoreName,id:IDBValidKey){return this.transaction([store],'readwrite',(tx)=>tx.delete(store,id));}
  async replaceAll(stores:Record<FoundationStoreName,unknown[]>){for(const store of FOUNDATION_STORES){this.stores.get(store)!.clear();for(const value of stores[store])this.stores.get(store)!.set((value as {id:IDBValidKey}).id,structuredClone(value));}}
  async exportSnapshot():Promise<SnapshotManifest>{throw new Error('not used');}async importSnapshot():Promise<void>{throw new Error('not used');}
}
async function sessionAs(storage:MemoryStorage,userId:string,actingAdminUserId?:string){const session=await storage.get<FoundationSession>('sessions','active-session');await storage.put('sessions',{...session!,activeUserId:userId,actingAdminUserId,signedOutAt:undefined});}
async function sha256(value:string){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map((item)=>item.toString(16).padStart(2,'0')).join('');}

describe('specialized formal correspondence',()=>{
  it('seeds persistent incoming, outgoing, draft and review examples with realistic history',()=>{
    const seed=createSeedData();const letters=seed.letters as OperationalRecord[];const history=seed.workflow_history as OperationalRecordHistory[];
    expect(letters.map((record)=>record.id)).toEqual([
      'letter-sample-incoming-bank','letter-sample-outgoing-support','letter-sample-internal-performance',
      'letter-sample-draft-archive','letter-sample-review-tax','letter-sample-approved-supplier',
    ]);
    expect(letters.map((record)=>record.status)).toEqual(['sent','sent','sent','draft','in_review','approved_for_send']);
    expect(letters.map((record)=>record.payload.direction)).toEqual(['incoming','outgoing','internal','internal','outgoing','outgoing']);
    expect(letters.find((record)=>record.id==='letter-sample-incoming-bank')?.payload.recipientUnitIds).toEqual(['unit-management','unit-finance']);
    expect(letters.find((record)=>record.id==='letter-sample-internal-performance')?.payload.senderUnitName).toBe('منابع انسانی');
    expect(history.filter((item)=>item.recordId==='letter-sample-outgoing-support').map((item)=>item.toState)).toEqual(['draft','in_review','approved_for_send','sent']);
    expect(history.filter((item)=>item.recordId==='letter-sample-review-tax')).toHaveLength(2);
    expect(history.filter((item)=>item.recordId==='letter-sample-approved-supplier').at(-1)?.actorId).toBe('actor-system-admin');
  });

  it('adds the deterministic examples on upgrade without replacing local letters and stays idempotent',async()=>{
    const storage=new MemoryStorage();const previous=createSeedData() as Record<FoundationStoreName,unknown[]>;
    const custom:OperationalRecord={...(previous.letters as OperationalRecord[])[0],id:'letter-local-user-created',trackingCode:'LTR-LOCAL-001',title:'نامه ثبت‌شده توسط کاربر'};
    previous.letters=[custom];
    previous.workflow_history=(previous.workflow_history as OperationalRecordHistory[]).filter((item)=>item.moduleId!=='letter');
    previous.meta=(previous.meta as MetaRecord[]).map((item)=>item.id==='seedVersion'?{...item,value:'complete-local-erp-v1.30-access-safety'}:item);
    await storage.replaceAll(previous);const service=new LocalFoundationService(storage);await service.initialize();
    let stored=await storage.getAll<OperationalRecord>('letters');
    expect(stored.some((record)=>record.id===custom.id&&record.title===custom.title)).toBe(true);
    expect(stored.filter((record)=>record.id.startsWith('letter-sample-'))).toHaveLength(6);
    expect((await storage.getAll<OperationalRecordHistory>('workflow_history')).filter((item)=>item.moduleId==='letter')).toHaveLength(15);
    await service.initialize();stored=await storage.getAll<OperationalRecord>('letters');
    expect(new Set(stored.map((record)=>record.id)).size).toBe(stored.length);
    expect(stored.filter((record)=>record.id.startsWith('letter-sample-'))).toHaveLength(6);
  });

  it('keeps a draft private, enforces independent review and delivers only after final send',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    await sessionAs(storage,'persona-seller');let state=await service.createLetter({direction:'internal',subject:'برنامه جلسه فروش',body:'زمان‌بندی جلسه فروش برای بررسی ارسال می‌شود.',recipientUserIds:['persona-user-manager']});let letter=state.operationalRecords.find((record)=>record.moduleId==='letter')!;expect(letter.status).toBe('draft');const originalTrackingCode=letter.trackingCode;
    const persianYear=new Intl.DateTimeFormat('fa-IR-u-nu-latn',{year:'numeric'}).format(new Date()).replace(/\D/g,'');expect(letter.trackingCode).toMatch(new RegExp(`^LTR-${persianYear}-\\d{5}$`));
    state=await service.updateLetter(letter.id,letter.version,{direction:'internal',subject:'برنامه نهایی جلسه فروش',body:'نسخه ویرایش‌شده برنامه جلسه فروش.',recipientUserIds:['persona-user-manager'],recipientUnitIds:['unit-sales']});letter=state.operationalRecords.find((record)=>record.id===letter.id)!;expect(letter.title).toBe('برنامه نهایی جلسه فروش');expect(letter.trackingCode).toBe(originalTrackingCode);expect(letter.status).toBe('draft');
    await sessionAs(storage,'persona-user-manager');expect((await service.loadState()).operationalRecords.some((record)=>record.id===letter.id)).toBe(false);
    await sessionAs(storage,'persona-seller');state=await service.transitionLetter(letter.id,letter.version,'submit_review');letter=state.operationalRecords.find((record)=>record.id===letter.id)!;expect(letter.status).toBe('in_review');state=await service.updateLetter(letter.id,letter.version,{direction:'internal',subject:'برنامه قطعی جلسه فروش',body:'ویرایش پیش از اقدام بازبین.',recipientUserIds:['persona-user-manager'],recipientUnitIds:['unit-sales']});letter=state.operationalRecords.find((record)=>record.id===letter.id)!;expect(letter.status).toBe('draft');expect(letter.title).toBe('برنامه قطعی جلسه فروش');state=await service.transitionLetter(letter.id,letter.version,'submit_review');letter=state.operationalRecords.find((record)=>record.id===letter.id)!;await expect(service.transitionLetter(letter.id,letter.version,'approve')).rejects.toThrow();
    await sessionAs(storage,'persona-product-owner');state=await service.loadState();letter=state.operationalRecords.find((record)=>record.id===letter.id)!;state=await service.transitionLetter(letter.id,letter.version,'approve');letter=state.operationalRecords.find((record)=>record.id===letter.id)!;expect(letter.status).toBe('approved_for_send');await sessionAs(storage,'persona-seller');await expect(service.updateLetter(letter.id,letter.version,{direction:'internal',subject:'ویرایش غیرمجاز',body:'این ویرایش نباید ثبت شود.',recipientUnitIds:['unit-sales']})).rejects.toThrow('ویرایش');
    await sessionAs(storage,'persona-seller');state=await service.loadState();letter=state.operationalRecords.find((record)=>record.id===letter.id)!;state=await service.transitionLetter(letter.id,letter.version,'send');letter=state.operationalRecords.find((record)=>record.id===letter.id)!;const signature=letterDigitalSignature(letter);expect(signature?.digestSha256).toMatch(/^[a-f0-9]{64}$/);const {kind:_,digestSha256,...identity}=signature!;expect(await sha256(letterSignatureCanonicalText(letter,identity))).toBe(digestSha256);expect(letterPdfBaseName('  برنامه / جلسه: فروش  ')).toBe('برنامه - جلسه- فروش');
    await sessionAs(storage,'persona-user-manager');state=await service.loadState();expect(state.operationalRecords.find((record)=>record.id===letter.id)?.status).toBe('sent');expect(state.notifications.some((item)=>item.kind==='letter_received'&&item.relatedRecordId===letter.id)).toBe(true);
    await sessionAs(storage,'persona-purchase-requester');expect((await service.loadState()).operationalRecords.some((record)=>record.id===letter.id)).toBe(false);
  });

  it('delivers an internal letter to every active member of the selected organizational unit',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    await sessionAs(storage,'persona-seller');let state=await service.createLetter({direction:'internal',subject:'هماهنگی زیرساخت فناوری اطلاعات',body:'این نامه برای همه اعضای فعال واحد فناوری اطلاعات ارسال می‌شود.',recipientUnitIds:['unit-it']});let letter=state.operationalRecords.find((record)=>record.title==='هماهنگی زیرساخت فناوری اطلاعات')!;
    state=await service.transitionLetter(letter.id,letter.version,'submit_review');letter=state.operationalRecords.find((record)=>record.id===letter.id)!;
    await sessionAs(storage,'persona-product-owner');state=await service.loadState();letter=state.operationalRecords.find((record)=>record.id===letter.id)!;state=await service.transitionLetter(letter.id,letter.version,'approve');letter=state.operationalRecords.find((record)=>record.id===letter.id)!;
    await sessionAs(storage,'persona-seller');state=await service.loadState();letter=state.operationalRecords.find((record)=>record.id===letter.id)!;await service.transitionLetter(letter.id,letter.version,'send');
    await sessionAs(storage,'persona-user-manager');state=await service.loadState();expect(state.operationalRecords.some((record)=>record.id===letter.id)).toBe(true);expect(state.notifications.some((item)=>item.relatedRecordId===letter.id)).toBe(true);
    await sessionAs(storage,'persona-purchase-requester');expect((await service.loadState()).operationalRecords.some((record)=>record.id===letter.id)).toBe(false);
    await sessionAs(storage,'persona-seller');await expect(service.createLetter({direction:'internal',subject:'واحد نامعتبر',body:'نامه‌ای که نباید ثبت شود.',recipientUnitIds:['unit-does-not-exist']})).rejects.toThrow('واحدهای گیرنده');
  });

  it('rejects QA writes and requires encryption for a letter attachment',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);await sessionAs(storage,'persona-product-owner');
    await service.createLetter({direction:'outgoing',subject:'نامه رسمی آزمایشی',body:'متن نامه رسمی برای ارسال بیرونی.',externalParty:'سازمان نمونه',attachment:{fileName:'letter.pdf',mimeType:'application/pdf',size:3,dataUrl:'data:application/pdf;base64,QUJD'}});
    await expect(service.exportSnapshot()).rejects.toThrow('پشتیبان رمزگذاری‌شده');await sessionAs(storage,'persona-seller','persona-product-owner');await expect(service.createLetter({direction:'internal',subject:'نامه آزمایشی',body:'متن آزمایشی نامه.',recipientUserIds:['persona-user-manager']})).rejects.toThrow('مشاهده آزمایشی');
    expect((await storage.getAll<OperationalRecordHistory>('workflow_history')).some((item)=>JSON.stringify(item.snapshot).includes('data:application/pdf'))).toBe(false);
  });
});
