import {describe, expect, it} from 'vitest';
import type {FoundationSession, FoundationStoreName, OperationalRecord, SnapshotManifest} from './model';
import {FOUNDATION_STORES} from './model';
import {createSeedData} from './seed';
import {LocalFoundationService} from './service';
import type {StorageAdapter, StorageTransaction} from './storage';
import {chatMemberUserIds, validateChatAttachment} from './communications';

class MemoryStorage implements StorageAdapter {
  private stores = new Map<FoundationStoreName, Map<IDBValidKey, unknown>>(FOUNDATION_STORES.map((store)=>[store,new Map()]));
  async transaction<T>(stores:FoundationStoreName[],_mode:IDBTransactionMode,work:(transaction:StorageTransaction)=>Promise<T>):Promise<T>{const snapshots=new Map(stores.map((store)=>[store,new Map(this.stores.get(store)!)]));const tx:StorageTransaction={get:async<V>(store,id)=>this.stores.get(store)?.get(id) as V|undefined,getAll:async<V>(store)=>[...(this.stores.get(store)?.values()??[])] as V[],put:async(store,value)=>{this.stores.get(store)!.set((value as {id:IDBValidKey}).id,structuredClone(value));},delete:async(store,id)=>{this.stores.get(store)!.delete(id);},clear:async(store)=>{this.stores.get(store)!.clear();}};try{return await work(tx);}catch(error){for(const [store,snapshot] of snapshots)this.stores.set(store,snapshot);throw error;}}
  get<T>(store:FoundationStoreName,id:IDBValidKey){return this.transaction([store],'readonly',(tx)=>tx.get<T>(store,id));}
  getAll<T>(store:FoundationStoreName){return this.transaction([store],'readonly',(tx)=>tx.getAll<T>(store));}
  put<T>(store:FoundationStoreName,value:T){return this.transaction([store],'readwrite',(tx)=>tx.put(store,value));}
  delete(store:FoundationStoreName,id:IDBValidKey){return this.transaction([store],'readwrite',(tx)=>tx.delete(store,id));}
  async replaceAll(stores:Record<FoundationStoreName,unknown[]>){for(const store of FOUNDATION_STORES){this.stores.get(store)!.clear();for(const value of stores[store])this.stores.get(store)!.set((value as {id:IDBValidKey}).id,structuredClone(value));}}
  async exportSnapshot():Promise<SnapshotManifest>{throw new Error('not used');} async importSnapshot():Promise<void>{throw new Error('not used');}
}

async function sessionAs(storage:MemoryStorage,userId:string,actingAdminUserId?:string){const session=await storage.get<FoundationSession>('sessions','active-session');await storage.put('sessions',{...session!,activeUserId:userId,actingAdminUserId,signedOutAt:undefined});}

describe('specialized organizational conversations',()=>{
  it('keeps a direct conversation and its messages visible only to its two members',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    await sessionAs(storage,'persona-seller');
    let state=await service.createChatConversation({kind:'direct',memberUserIds:['persona-user-manager']});
    const conversation=state.operationalRecords.find((record)=>record.moduleId==='chat')!;
    expect(chatMemberUserIds(conversation)).toEqual(['persona-seller','persona-user-manager']);
    state=await service.sendChatMessage({conversationId:conversation.id,body:'سلام، فایل قرارداد را بررسی می‌کنید؟'});
    expect(state.operationalRecords.filter((record)=>record.moduleId==='message')).toHaveLength(1);
    expect(state.notifications).toHaveLength(0);

    await sessionAs(storage,'persona-user-manager');state=await service.loadState();
    expect(state.operationalRecords.some((record)=>record.id===conversation.id)).toBe(true);
    expect(state.operationalRecords.some((record)=>record.moduleId==='message')).toBe(true);
    expect(state.notifications.some((notification)=>notification.kind==='chat_message')).toBe(true);

    await sessionAs(storage,'persona-purchase-requester');state=await service.loadState();
    expect(state.operationalRecords.some((record)=>['chat','message'].includes(record.moduleId))).toBe(false);
    expect(state.operationalHistory.some((item)=>['chat','message'].includes(item.moduleId))).toBe(false);
  });

  it('creates one dynamic unit conversation and rejects cross-unit creation',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    await sessionAs(storage,'persona-seller');
    await service.createChatConversation({kind:'unit',unitId:'unit-sales'});
    await service.createChatConversation({kind:'unit',unitId:'unit-sales'});
    const chats=(await storage.getAll<OperationalRecord>('chats')).filter((record)=>record.payload.conversationKind==='unit');expect(chats).toHaveLength(1);expect(chats[0].title).toContain('فروش');
    await expect(service.createChatConversation({kind:'unit',unitId:'unit-finance'})).rejects.toThrow('فقط گفت‌وگوی واحد سازمانی خودش');
  });

  it('fails closed for QA viewing and malformed attachments',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    await sessionAs(storage,'persona-seller');const state=await service.createChatConversation({kind:'direct',memberUserIds:['persona-user-manager']});const chat=state.operationalRecords.find((record)=>record.moduleId==='chat')!;
    await sessionAs(storage,'persona-seller','persona-product-owner');
    expect((await service.loadState()).operationalRecords.some((record)=>record.moduleId==='chat')).toBe(false);
    await expect(service.sendChatMessage({conversationId:chat.id,body:'پیام آزمایشی'})).rejects.toThrow('مشاهده آزمایشی');
    expect(()=>validateChatAttachment({kind:'voice',fileName:'voice.svg',mimeType:'image/svg+xml',size:20,dataUrl:'data:image/svg+xml;base64,AAAA'})).toThrow('فرمت ویس');
  });

  it('requires encryption when a conversation contains a file or voice',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    await sessionAs(storage,'persona-product-owner');
    const state=await service.createChatConversation({kind:'direct',memberUserIds:['persona-user-manager']});const chat=state.operationalRecords.find((record)=>record.moduleId==='chat')!;
    await service.sendChatMessage({conversationId:chat.id,attachment:{kind:'voice',fileName:'voice.ogg',mimeType:'audio/ogg',size:3,dataUrl:'data:audio/ogg;base64,QUJD'}});
    await expect(service.exportSnapshot()).rejects.toThrow('فقط پشتیبان رمزگذاری‌شده');
  });
});
