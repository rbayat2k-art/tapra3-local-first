import {describe, expect, it} from 'vitest';
import type {FoundationSession, FoundationStoreName, OperationalRecord, SnapshotManifest} from './model';
import {FOUNDATION_STORES} from './model';
import {createSeedData} from './seed';
import {LocalFoundationService} from './service';
import type {StorageAdapter, StorageTransaction} from './storage';
import {
  chatAdminUserIds, chatHiddenForUserIds, chatMemberUserIds, chatMessageIsDeleted, chatReplyToMessageId,
  chatUnreadCount, normalizeChatSearch, validateChatAttachment,
} from './communications';

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

  it('keeps muted chat messages unread without creating a notification for that member',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    await sessionAs(storage,'persona-seller');let state=await service.createChatConversation({kind:'direct',memberUserIds:['persona-user-manager']});const chat=state.operationalRecords.find((record)=>record.moduleId==='chat')!;
    await sessionAs(storage,'persona-user-manager');await service.updateChatPreference(chat.id,{pinned:false,muted:true},0);
    await sessionAs(storage,'persona-seller');await service.sendChatMessage({conversationId:chat.id,body:'پیامی که باید بی‌صدا بماند'});
    await sessionAs(storage,'persona-user-manager');state=await service.loadState();
    expect(chatUnreadCount(state,chat.id,'persona-user-manager')).toBe(1);
    expect(state.notifications.some((notification)=>notification.kind==='chat_message'&&notification.relatedRecordId===chat.id)).toBe(false);
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

  it('hides a direct chat only for the current user and resurfaces it on a new message',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    await sessionAs(storage,'persona-seller');
    let state=await service.createChatConversation({kind:'direct',memberUserIds:['persona-user-manager']});
    let chat=state.operationalRecords.find((record)=>record.moduleId==='chat')!;
    state=await service.sendChatMessage({conversationId:chat.id,body:'این سابقه باید برای طرف مقابل باقی بماند.'});
    chat=state.operationalRecords.find((record)=>record.id===chat.id)!;
    state=await service.hideChatForMe(chat.id,chat.version);
    expect(state.operationalRecords.some((record)=>record.id===chat.id||record.relatedRecordId===chat.id)).toBe(false);
    const stored=await storage.get<OperationalRecord>('chats',chat.id);
    expect(chatHiddenForUserIds(stored!)).toEqual(['persona-seller']);

    await sessionAs(storage,'persona-user-manager');state=await service.loadState();
    expect(state.operationalRecords.some((record)=>record.id===chat.id)).toBe(true);
    await service.sendChatMessage({conversationId:chat.id,body:'پیام تازه برای بازگرداندن گفتگو'});

    await sessionAs(storage,'persona-seller');state=await service.loadState();
    expect(state.operationalRecords.some((record)=>record.id===chat.id)).toBe(true);
    expect(state.operationalRecords.filter((record)=>record.relatedRecordId===chat.id)).toHaveLength(2);
  });

  it('does not let a user hide the organizational-unit conversation',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    await sessionAs(storage,'persona-seller');const state=await service.createChatConversation({kind:'unit',unitId:'unit-sales'});
    const chat=state.operationalRecords.find((record)=>record.moduleId==='chat')!;
    await expect(service.hideChatForMe(chat.id,chat.version)).rejects.toThrow('گفتگوی واحد سازمانی');
  });

  it('records an idempotent read receipt and derives unread count per member',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    await sessionAs(storage,'persona-seller');let state=await service.createChatConversation({kind:'direct',memberUserIds:['persona-user-manager']});const chat=state.operationalRecords.find((record)=>record.moduleId==='chat')!;
    await service.sendChatMessage({conversationId:chat.id,body:'این پیام باید خوانده‌نشده باشد.'});
    await sessionAs(storage,'persona-user-manager');state=await service.loadState();
    expect(chatUnreadCount(state,chat.id,'persona-user-manager')).toBe(1);
    state=await service.markChatRead(chat.id);expect(chatUnreadCount(state,chat.id,'persona-user-manager')).toBe(0);
    await service.markChatRead(chat.id);
    const history=await storage.getAll<{recordId:string;eventType:string;snapshot:Record<string,unknown>}>('workflow_history');
    expect(history.filter((item)=>item.recordId===chat.id&&item.eventType==='viewed'&&item.snapshot.userId==='persona-user-manager')).toHaveLength(1);
  });

  it('supports reply, edit and time-limited tombstone deletion without exposing deleted content',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    await sessionAs(storage,'persona-seller');let state=await service.createChatConversation({kind:'direct',memberUserIds:['persona-user-manager']});const chat=state.operationalRecords.find((record)=>record.moduleId==='chat')!;
    state=await service.sendChatMessage({conversationId:chat.id,body:'متن اولیه برای ویرایش'});let original=state.operationalRecords.find((record)=>record.moduleId==='message')!;
    state=await service.editChatMessage(original.id,'متن ویرایش‌شده',original.version);original=state.operationalRecords.find((record)=>record.id===original.id)!;expect(original.description).toBe('متن ویرایش‌شده');
    await sessionAs(storage,'persona-user-manager');await expect(service.editChatMessage(original.id,'دست‌کاری دیگران',original.version)).rejects.toThrow('فقط فرستنده');
    state=await service.sendChatMessage({conversationId:chat.id,body:'پاسخ به متن',replyToMessageId:original.id});const reply=state.operationalRecords.find((record)=>record.moduleId==='message'&&record.id!==original.id)!;expect(chatReplyToMessageId(reply)).toBe(original.id);
    await sessionAs(storage,'persona-seller');state=await service.deleteChatMessage(original.id,original.version);const deleted=state.operationalRecords.find((record)=>record.id===original.id)!;
    expect(chatMessageIsDeleted(deleted)).toBe(true);expect(deleted.description).toBe('');expect(deleted.payload.attachment).toBeNull();
    const deletionHistory=(await storage.getAll<{recordId:string;snapshot:Record<string,unknown>}>('workflow_history')).find((item)=>item.recordId===original.id&&item.snapshot.action==='message_deleted');
    expect(deletionHistory?.snapshot.contentSha256).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(deletionHistory)).not.toContain('متن ویرایش‌شده');
    await expect(service.sendChatMessage({conversationId:chat.id,body:'پاسخ دیرهنگام',replyToMessageId:original.id})).rejects.toThrow('دیگر در دسترس نیست');
  });

  it('lets the group owner manage admins and lets admins manage ordinary members only',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    await sessionAs(storage,'persona-seller');let state=await service.createChatConversation({kind:'group',title:'تیم اجرای فروش',memberUserIds:['persona-user-manager','persona-purchase-requester']});let group=state.operationalRecords.find((record)=>record.moduleId==='chat')!;
    state=await service.updateChatGroup(group.id,{title:'تیم اجرای فروش و خرید',memberUserIds:['persona-seller','persona-user-manager'],adminUserIds:['persona-seller','persona-user-manager']},group.version);group=state.operationalRecords.find((record)=>record.id===group.id)!;
    expect(chatMemberUserIds(group)).toEqual(['persona-seller','persona-user-manager']);expect(chatAdminUserIds(group)).toEqual(['persona-seller','persona-user-manager']);
    await sessionAs(storage,'persona-purchase-requester');expect((await service.loadState()).operationalRecords.some((record)=>record.id===group.id)).toBe(false);
    await sessionAs(storage,'persona-user-manager');state=await service.updateChatGroup(group.id,{title:group.title,memberUserIds:['persona-seller','persona-user-manager','persona-inventory-maker'],adminUserIds:['persona-seller','persona-user-manager']},group.version);group=state.operationalRecords.find((record)=>record.id===group.id)!;
    expect(chatMemberUserIds(group)).toContain('persona-inventory-maker');
    await expect(service.updateChatGroup(group.id,{title:group.title,memberUserIds:chatMemberUserIds(group),adminUserIds:['persona-seller']},group.version)).rejects.toThrow('فقط مالک گروه');
  });

  it('normalizes Persian variants and zero-width spaces for member search',()=>{
    expect(normalizeChatSearch('  كارشناس‌ فروش  ')).toBe(normalizeChatSearch('کارشناس فروش'));
  });
});
