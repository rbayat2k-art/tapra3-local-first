import {describe,expect,it} from 'vitest';
import type {FoundationSession,FoundationStoreName,OperationalRecordHistory,SnapshotManifest} from './model';
import {FOUNDATION_STORES} from './model';
import {createSeedData} from './seed';
import {LocalFoundationService} from './service';
import type {StorageAdapter,StorageTransaction} from './storage';

class MemoryStorage implements StorageAdapter{
  private stores=new Map<FoundationStoreName,Map<IDBValidKey,unknown>>(FOUNDATION_STORES.map((store)=>[store,new Map()]));
  async transaction<T>(stores:FoundationStoreName[],_mode:IDBTransactionMode,work:(transaction:StorageTransaction)=>Promise<T>):Promise<T>{const snapshots=new Map(stores.map((store)=>[store,new Map(this.stores.get(store)!)]));const tx:StorageTransaction={get:async<T>(store,id)=>this.stores.get(store)?.get(id) as T|undefined,getAll:async<T>(store)=>[...(this.stores.get(store)?.values()??[])] as T[],put:async(store,value)=>{this.stores.get(store)!.set((value as {id:IDBValidKey}).id,structuredClone(value));},delete:async(store,id)=>{this.stores.get(store)!.delete(id);},clear:async(store)=>{this.stores.get(store)!.clear();}};try{return await work(tx);}catch(error){for(const [store,snapshot] of snapshots)this.stores.set(store,snapshot);throw error;}}
  get<T>(store:FoundationStoreName,id:IDBValidKey){return this.transaction([store],'readonly',(tx)=>tx.get<T>(store,id));}getAll<T>(store:FoundationStoreName){return this.transaction([store],'readonly',(tx)=>tx.getAll<T>(store));}put<T>(store:FoundationStoreName,value:T){return this.transaction([store],'readwrite',(tx)=>tx.put(store,value));}delete(store:FoundationStoreName,id:IDBValidKey){return this.transaction([store],'readwrite',(tx)=>tx.delete(store,id));}
  async replaceAll(stores:Record<FoundationStoreName,unknown[]>){for(const store of FOUNDATION_STORES){this.stores.get(store)!.clear();for(const value of stores[store])this.stores.get(store)!.set((value as {id:IDBValidKey}).id,structuredClone(value));}}
  async exportSnapshot():Promise<SnapshotManifest>{throw new Error('not used');}async importSnapshot():Promise<void>{throw new Error('not used');}
}
async function sessionAs(storage:MemoryStorage,userId:string,actingAdminUserId?:string){const session=await storage.get<FoundationSession>('sessions','active-session');await storage.put('sessions',{...session!,activeUserId:userId,actingAdminUserId,signedOutAt:undefined});}

describe('specialized formal correspondence',()=>{
  it('keeps a draft private, enforces independent review and delivers only after final send',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    await sessionAs(storage,'persona-seller');let state=await service.createLetter({direction:'internal',subject:'برنامه جلسه فروش',body:'زمان‌بندی جلسه فروش برای بررسی ارسال می‌شود.',recipientUserIds:['persona-user-manager']});let letter=state.operationalRecords.find((record)=>record.moduleId==='letter')!;expect(letter.status).toBe('draft');
    await sessionAs(storage,'persona-user-manager');expect((await service.loadState()).operationalRecords.some((record)=>record.id===letter.id)).toBe(false);
    await sessionAs(storage,'persona-seller');state=await service.transitionLetter(letter.id,letter.version,'submit_review');letter=state.operationalRecords.find((record)=>record.id===letter.id)!;expect(letter.status).toBe('in_review');await expect(service.transitionLetter(letter.id,letter.version,'approve')).rejects.toThrow();
    await sessionAs(storage,'persona-product-owner');state=await service.loadState();letter=state.operationalRecords.find((record)=>record.id===letter.id)!;state=await service.transitionLetter(letter.id,letter.version,'approve');letter=state.operationalRecords.find((record)=>record.id===letter.id)!;expect(letter.status).toBe('approved_for_send');
    await sessionAs(storage,'persona-seller');state=await service.loadState();letter=state.operationalRecords.find((record)=>record.id===letter.id)!;await service.transitionLetter(letter.id,letter.version,'send');
    await sessionAs(storage,'persona-user-manager');state=await service.loadState();expect(state.operationalRecords.find((record)=>record.id===letter.id)?.status).toBe('sent');expect(state.notifications.some((item)=>item.kind==='letter_received'&&item.relatedRecordId===letter.id)).toBe(true);
    await sessionAs(storage,'persona-purchase-requester');expect((await service.loadState()).operationalRecords.some((record)=>record.id===letter.id)).toBe(false);
  });

  it('rejects QA writes and requires encryption for a letter attachment',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);await sessionAs(storage,'persona-product-owner');
    await service.createLetter({direction:'outgoing',subject:'نامه رسمی آزمایشی',body:'متن نامه رسمی برای ارسال بیرونی.',externalParty:'سازمان نمونه',attachment:{fileName:'letter.pdf',mimeType:'application/pdf',size:3,dataUrl:'data:application/pdf;base64,QUJD'}});
    await expect(service.exportSnapshot()).rejects.toThrow('پشتیبان رمزگذاری‌شده');await sessionAs(storage,'persona-seller','persona-product-owner');await expect(service.createLetter({direction:'internal',subject:'نامه آزمایشی',body:'متن آزمایشی نامه.',recipientUserIds:['persona-user-manager']})).rejects.toThrow('مشاهده آزمایشی');
    expect((await storage.getAll<OperationalRecordHistory>('workflow_history')).some((item)=>JSON.stringify(item.snapshot).includes('data:application/pdf'))).toBe(false);
  });
});
