import {describe,expect,it} from 'vitest';
import type {FoundationSession,FoundationStoreName,LocalUser,MetaRecord,OperationalRecord,OperationalRecordHistory,SecurityRole,SnapshotManifest} from './model';
import {FOUNDATION_STORES} from './model';
import {createSeedData} from './seed';
import {LocalFoundationService,userConcurrencyToken} from './service';
import type {StorageAdapter,StorageTransaction} from './storage';
import {letterDigitalSignature,letterIsArchivedForUser,letterPdfBaseName,letterReadAt,letterSignatureCanonicalText} from './letters';

class MemoryStorage implements StorageAdapter{
  private stores=new Map<FoundationStoreName,Map<IDBValidKey,unknown>>(FOUNDATION_STORES.map((store)=>[store,new Map()]));
  private beforeNextReadwrite?:()=>void;
  mutateUserBeforeNextReadwrite(userId:string,mutate:(user:LocalUser)=>LocalUser){this.beforeNextReadwrite=()=>{const user=this.stores.get('users')?.get(userId) as LocalUser;this.stores.get('users')!.set(userId,structuredClone(mutate(user)));};}
  async transaction<T>(stores:FoundationStoreName[],mode:IDBTransactionMode,work:(transaction:StorageTransaction)=>Promise<T>):Promise<T>{if(mode==='readwrite'&&this.beforeNextReadwrite){const mutate=this.beforeNextReadwrite;this.beforeNextReadwrite=undefined;mutate();}const snapshots=new Map(stores.map((store)=>[store,new Map(this.stores.get(store)!)]));const tx:StorageTransaction={get:async<T>(store,id)=>this.stores.get(store)?.get(id) as T|undefined,getAll:async<T>(store)=>[...(this.stores.get(store)?.values()??[])] as T[],put:async(store,value)=>{this.stores.get(store)!.set((value as {id:IDBValidKey}).id,structuredClone(value));},delete:async(store,id)=>{this.stores.get(store)!.delete(id);},clear:async(store)=>{this.stores.get(store)!.clear();}};try{return await work(tx);}catch(error){for(const [store,snapshot] of snapshots)this.stores.set(store,snapshot);throw error;}}
  get<T>(store:FoundationStoreName,id:IDBValidKey){return this.transaction([store],'readonly',(tx)=>tx.get<T>(store,id));}getAll<T>(store:FoundationStoreName){return this.transaction([store],'readonly',(tx)=>tx.getAll<T>(store));}put<T>(store:FoundationStoreName,value:T){return this.transaction([store],'readwrite',(tx)=>tx.put(store,value));}delete(store:FoundationStoreName,id:IDBValidKey){return this.transaction([store],'readwrite',(tx)=>tx.delete(store,id));}
  async replaceAll(stores:Record<FoundationStoreName,unknown[]>){for(const store of FOUNDATION_STORES){this.stores.get(store)!.clear();for(const value of stores[store])this.stores.get(store)!.set((value as {id:IDBValidKey}).id,structuredClone(value));}}
  async exportSnapshot():Promise<SnapshotManifest>{throw new Error('not used');}async importSnapshot():Promise<void>{throw new Error('not used');}
}
async function sessionAs(storage:MemoryStorage,userId:string,actingAdminUserId?:string){const session=await storage.get<FoundationSession>('sessions','active-session');await storage.put('sessions',{...session!,activeUserId:userId,actingAdminUserId,signedOutAt:undefined});}
async function enrollSecondaryPassword(storage:MemoryStorage,service:LocalFoundationService,userId:string,pin:string){await sessionAs(storage,userId);const state=await service.loadState();const preview=await service.requestOwnSecondaryPasswordOtp();await service.setOwnSecondaryPassword(userConcurrencyToken(state.activeUser),{verificationCode:preview.verificationCode!,secondaryPassword:pin});}
async function sha256(value:string){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map((item)=>item.toString(16).padStart(2,'0')).join('');}

describe('specialized formal correspondence',()=>{
  it.each([
    ['company',(user:LocalUser)=>({...user,companyId:'company-other'} as LocalUser)],
    ['unit',(user:LocalUser)=>({...user,unitId:'unit-finance'} as LocalUser)],
    ['entitlement',(user:LocalUser)=>({...user,roleId:'role-user-manager',roleIds:['role-user-manager']} as LocalUser)],
  ])('revalidates current %s authorization inside the letter transaction without partial mutation',async(_caseName,mutate)=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    const reviewerRole=(await storage.get<SecurityRole>('security_roles','role-letter-reviewer'))!;
    await storage.put('security_roles',{...reviewerRole,scope:'UNIT'});
    const reviewer=(await storage.get<LocalUser>('users','persona-system-admin'))!;
    await storage.put('users',{...reviewer,isAdmin:false,unitId:'unit-sales',roleId:'role-letter-reviewer',roleIds:['role-letter-reviewer']});
    await enrollSecondaryPassword(storage,service,'persona-system-admin','7412');
    await sessionAs(storage,'persona-seller');
    let state=await service.createLetter({direction:'internal',classification:'normal',subject:`بازبینی تراکنشی ${_caseName}`,body:'این نامه برای آزمون بازبینی هم‌زمان ساخته شده است.',recipientUserIds:['persona-user-manager'],recipientUnitIds:['unit-it']});
    let letter=state.operationalRecords.find((record)=>record.title===`بازبینی تراکنشی ${_caseName}`)!;
    state=await service.transitionLetter(letter.id,letter.version,'submit_review');letter=state.operationalRecords.find((record)=>record.id===letter.id)!;
    await sessionAs(storage,'persona-system-admin');
    const before=await storage.get<OperationalRecord>('letters',letter.id);const beforeHistory=(await storage.getAll<OperationalRecordHistory>('workflow_history')).filter((item)=>item.recordId===letter.id);
    storage.mutateUserBeforeNextReadwrite('persona-system-admin',mutate);
    await expect(service.transitionLetter(letter.id,letter.version,'approve','7412')).rejects.toThrow();
    expect(await storage.get<OperationalRecord>('letters',letter.id)).toEqual(before);
    expect((await storage.getAll<OperationalRecordHistory>('workflow_history')).filter((item)=>item.recordId===letter.id)).toEqual(beforeHistory);
  });

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
    await enrollSecondaryPassword(storage,service,'persona-seller','4827');await enrollSecondaryPassword(storage,service,'persona-product-owner','5938');await sessionAs(storage,'persona-seller');let state=await service.createLetter({direction:'internal',classification:'normal',subject:'برنامه جلسه فروش',body:'زمان‌بندی جلسه فروش برای بررسی ارسال می‌شود.',recipientUserIds:['persona-user-manager']});let letter=state.operationalRecords.find((record)=>record.moduleId==='letter')!;expect(letter.status).toBe('draft');const originalTrackingCode=letter.trackingCode;
    const persianYear=new Intl.DateTimeFormat('fa-IR-u-nu-latn',{year:'numeric'}).format(new Date()).replace(/\D/g,'');expect(letter.trackingCode).toMatch(new RegExp(`^LTR-${persianYear}-\\d{5}$`));
    state=await service.updateLetter(letter.id,letter.version,{direction:'internal',classification:'normal',subject:'برنامه نهایی جلسه فروش',body:'نسخه ویرایش‌شده برنامه جلسه فروش.',recipientUserIds:['persona-user-manager'],recipientUnitIds:['unit-it']});letter=state.operationalRecords.find((record)=>record.id===letter.id)!;expect(letter.title).toBe('برنامه نهایی جلسه فروش');expect(letter.trackingCode).toBe(originalTrackingCode);expect(letter.status).toBe('draft');
    await sessionAs(storage,'persona-user-manager');expect((await service.loadState()).operationalRecords.some((record)=>record.id===letter.id)).toBe(false);
    await sessionAs(storage,'persona-seller');state=await service.transitionLetter(letter.id,letter.version,'submit_review');letter=state.operationalRecords.find((record)=>record.id===letter.id)!;expect(letter.status).toBe('in_review');state=await service.updateLetter(letter.id,letter.version,{direction:'internal',classification:'normal',subject:'برنامه قطعی جلسه فروش',body:'ویرایش پیش از اقدام بازبین.',recipientUserIds:['persona-user-manager'],recipientUnitIds:['unit-it']});letter=state.operationalRecords.find((record)=>record.id===letter.id)!;expect(letter.status).toBe('draft');expect(letter.title).toBe('برنامه قطعی جلسه فروش');state=await service.transitionLetter(letter.id,letter.version,'submit_review');letter=state.operationalRecords.find((record)=>record.id===letter.id)!;await expect(service.transitionLetter(letter.id,letter.version,'approve','4827')).rejects.toThrow();
    await sessionAs(storage,'persona-product-owner');state=await service.loadState();letter=state.operationalRecords.find((record)=>record.id===letter.id)!;state=await service.transitionLetter(letter.id,letter.version,'approve','5938');letter=state.operationalRecords.find((record)=>record.id===letter.id)!;expect(letter.status).toBe('approved_for_send');await sessionAs(storage,'persona-seller');await expect(service.updateLetter(letter.id,letter.version,{direction:'internal',classification:'normal',subject:'ویرایش غیرمجاز',body:'این ویرایش نباید ثبت شود.',recipientUnitIds:['unit-sales']})).rejects.toThrow('ویرایش');
    await sessionAs(storage,'persona-seller');state=await service.loadState();letter=state.operationalRecords.find((record)=>record.id===letter.id)!;state=await service.transitionLetter(letter.id,letter.version,'send','4827');letter=state.operationalRecords.find((record)=>record.id===letter.id)!;const signature=letterDigitalSignature(letter);expect(signature?.digestSha256).toMatch(/^[a-f0-9]{64}$/);const {kind:_,digestSha256,...identity}=signature!;expect(await sha256(letterSignatureCanonicalText(letter,identity))).toBe(digestSha256);expect(letterPdfBaseName('  برنامه / جلسه: فروش  ')).toBe('برنامه - جلسه- فروش');
    await sessionAs(storage,'persona-user-manager');state=await service.loadState();expect(state.operationalRecords.find((record)=>record.id===letter.id)?.status).toBe('sent');expect(state.notifications.some((item)=>item.kind==='letter_received'&&item.relatedRecordId===letter.id)).toBe(true);
    await sessionAs(storage,'persona-purchase-requester');expect((await service.loadState()).operationalRecords.some((record)=>record.id===letter.id)).toBe(false);
  });

  it('delivers an internal letter to every active member of the selected organizational unit',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    await enrollSecondaryPassword(storage,service,'persona-seller','4827');await enrollSecondaryPassword(storage,service,'persona-product-owner','5938');await sessionAs(storage,'persona-seller');let state=await service.createLetter({direction:'internal',classification:'normal',subject:'هماهنگی زیرساخت فناوری اطلاعات',body:'این نامه برای همه اعضای فعال واحد فناوری اطلاعات ارسال می‌شود.',recipientUnitIds:['unit-it']});let letter=state.operationalRecords.find((record)=>record.title==='هماهنگی زیرساخت فناوری اطلاعات')!;
    state=await service.transitionLetter(letter.id,letter.version,'submit_review');letter=state.operationalRecords.find((record)=>record.id===letter.id)!;
    await sessionAs(storage,'persona-product-owner');state=await service.loadState();letter=state.operationalRecords.find((record)=>record.id===letter.id)!;state=await service.transitionLetter(letter.id,letter.version,'approve','5938');letter=state.operationalRecords.find((record)=>record.id===letter.id)!;
    await sessionAs(storage,'persona-seller');state=await service.loadState();letter=state.operationalRecords.find((record)=>record.id===letter.id)!;await service.transitionLetter(letter.id,letter.version,'send','4827');
    await sessionAs(storage,'persona-user-manager');state=await service.loadState();expect(state.operationalRecords.some((record)=>record.id===letter.id)).toBe(true);expect(state.notifications.some((item)=>item.relatedRecordId===letter.id)).toBe(true);
    await sessionAs(storage,'persona-purchase-requester');expect((await service.loadState()).operationalRecords.some((record)=>record.id===letter.id)).toBe(false);
    await sessionAs(storage,'persona-seller');await expect(service.createLetter({direction:'internal',classification:'normal',subject:'واحد نامعتبر',body:'نامه‌ای که نباید ثبت شود.',recipientUnitIds:['unit-does-not-exist']})).rejects.toThrow('واحدهای گیرنده');
    await expect(service.createLetter({direction:'internal',classification:'normal',subject:'گیرنده خارج از واحد',body:'نامه‌ای که نباید برای فرد خارج از واحد ثبت شود.',recipientUnitIds:['unit-it'],recipientUserIds:['persona-purchase-requester']})).rejects.toThrow('پرسنل واحدهای مقصد');
  });

  it('records one durable read receipt and archives only the current user copy without deleting the letter',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    await enrollSecondaryPassword(storage,service,'persona-seller','4827');await enrollSecondaryPassword(storage,service,'persona-product-owner','5938');
    await sessionAs(storage,'persona-seller');let state=await service.createLetter({direction:'internal',classification:'normal',subject:'ابلاغ قابل رهگیری',body:'این نامه باید رسید مشاهده و بایگانی شخصی داشته باشد.',recipientUserIds:['persona-user-manager'],recipientUnitIds:['unit-it']});let letter=state.operationalRecords.find((record)=>record.title==='ابلاغ قابل رهگیری')!;
    state=await service.transitionLetter(letter.id,letter.version,'submit_review');letter=state.operationalRecords.find((record)=>record.id===letter.id)!;
    await sessionAs(storage,'persona-product-owner');state=await service.loadState();letter=state.operationalRecords.find((record)=>record.id===letter.id)!;state=await service.transitionLetter(letter.id,letter.version,'approve','5938');letter=state.operationalRecords.find((record)=>record.id===letter.id)!;
    await sessionAs(storage,'persona-seller');state=await service.loadState();letter=state.operationalRecords.find((record)=>record.id===letter.id)!;await service.transitionLetter(letter.id,letter.version,'send','4827');
    await sessionAs(storage,'persona-user-manager');await service.markLetterRead(letter.id);await service.markLetterRead(letter.id);let history=await storage.getAll<OperationalRecordHistory>('workflow_history');expect(history.filter((item)=>item.recordId===letter.id&&item.eventType==='viewed'&&item.effectiveUserId==='persona-user-manager')).toHaveLength(1);expect(letterReadAt(history,letter.id,'persona-user-manager')).toBeTruthy();
    await service.setLetterArchived(letter.id,true);history=await storage.getAll<OperationalRecordHistory>('workflow_history');expect(letterIsArchivedForUser(history,letter.id,'persona-user-manager')).toBe(true);expect(await storage.get<OperationalRecord>('letters',letter.id)).toBeTruthy();
    await sessionAs(storage,'persona-seller');state=await service.loadState();expect(state.operationalRecords.some((record)=>record.id===letter.id)).toBe(true);expect(letterIsArchivedForUser(state.operationalHistory,letter.id,'persona-seller')).toBe(false);
    await sessionAs(storage,'persona-user-manager');await service.setLetterArchived(letter.id,false);history=await storage.getAll<OperationalRecordHistory>('workflow_history');expect(letterIsArchivedForUser(history,letter.id,'persona-user-manager')).toBe(false);
  });

  it('delivers an explicit copy and preserves the reply deadline in the signed letter payload',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);await enrollSecondaryPassword(storage,service,'persona-product-owner','5938');await sessionAs(storage,'persona-product-owner');
    let state=await service.createLetter({direction:'incoming',classification:'normal',subject:'استعلام نیازمند پاسخ',body:'این نامه برای گیرنده اصلی و رونوشت داخلی ثبت می‌شود.',externalParty:'سازمان بازرسی نمونه',recipientUnitIds:['unit-it'],recipientUserIds:['persona-user-manager'],copyRecipientUserIds:['persona-purchase-requester'],requiresReply:true,responseDueDate:'2026-09-30'},'5938');
    const letter=state.operationalRecords.find((record)=>record.title==='استعلام نیازمند پاسخ')!;expect(letter.status).toBe('sent');expect(letter.payload.copyRecipientUserIds).toEqual(['persona-purchase-requester']);expect(letter.payload.requiresReply).toBe(true);expect(letter.payload.responseDueDate).toBe('2026-09-30');expect(letter.payload.deliveredRecipientUserIds).toContain('persona-purchase-requester');expect(letterDigitalSignature(letter)?.digestSha256).toMatch(/^[a-f0-9]{64}$/);
    await sessionAs(storage,'persona-purchase-requester');state=await service.loadState();expect(state.operationalRecords.some((record)=>record.id===letter.id)).toBe(true);
    await sessionAs(storage,'persona-treasury-executor');state=await service.loadState();expect(state.operationalRecords.some((record)=>record.id===letter.id)).toBe(false);
    await sessionAs(storage,'persona-product-owner');await expect(service.createLetter({direction:'incoming',classification:'normal',subject:'مهلت ناقص',body:'نامه نیازمند پاسخ بدون تاریخ معتبر.',externalParty:'سازمان نمونه',recipientUserIds:['persona-user-manager'],requiresReply:true},'5938')).rejects.toThrow('مهلت پاسخ');
  });

  it('creates an append-only correction draft with the same audience instead of editing the sent letter',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);await sessionAs(storage,'persona-product-owner');const before=await storage.get<OperationalRecord>('letters','letter-sample-outgoing-support');
    const state=await service.createLetter({direction:'outgoing',classification:'normal',subject:'اصلاحیه: درخواست تمدید قرارداد خدمات پشتیبانی',body:'در اصلاح نامه مرجع، تاریخ پاسخ تا پایان هفته آینده تمدید می‌شود.',externalParty:'شرکت راهکاران شبکه آریا',correctsLetterId:before!.id});const correction=state.operationalRecords.find((record)=>record.payload.correctsLetterId===before!.id)!;
    expect(correction.status).toBe('draft');expect(correction.id).not.toBe(before!.id);expect(correction.trackingCode).not.toBe(before!.trackingCode);expect((await storage.get<OperationalRecord>('letters',before!.id))?.title).toBe(before!.title);
    await expect(service.createLetter({direction:'outgoing',classification:'normal',subject:'اصلاحیه نامعتبر',body:'مخاطب اصلاحیه نباید بدون چرخه رسمی تغییر کند.',externalParty:'مخاطب دیگر',correctsLetterId:before!.id})).rejects.toThrow('همان نوع، سطح و مخاطبان');
  });

  it('rejects QA writes and requires encryption for a letter attachment',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);await sessionAs(storage,'persona-product-owner');
    await service.createLetter({direction:'outgoing',classification:'normal',subject:'نامه رسمی آزمایشی',body:'متن نامه رسمی برای ارسال بیرونی.',externalParty:'سازمان نمونه',attachment:{fileName:'letter.pdf',mimeType:'application/pdf',size:3,dataUrl:'data:application/pdf;base64,QUJD'}});
    await expect(service.exportSnapshot()).rejects.toThrow('پشتیبان رمزگذاری‌شده');await sessionAs(storage,'persona-seller','persona-product-owner');await expect(service.createLetter({direction:'internal',classification:'normal',subject:'نامه آزمایشی',body:'متن آزمایشی نامه.',recipientUserIds:['persona-user-manager']})).rejects.toThrow('مشاهده آزمایشی');
    expect((await storage.getAll<OperationalRecordHistory>('workflow_history')).some((item)=>JSON.stringify(item.snapshot).includes('data:application/pdf'))).toBe(false);
  });

  it('sets and recovers a four-digit secondary password only with the registered-mobile OTP and never projects secrets',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);await sessionAs(storage,'persona-seller');
    const before=await service.loadState();expect(before.activeUser.hasSecondaryPassword).toBe(false);
    const preview=await service.requestOwnSecondaryPasswordOtp();expect(preview.maskedMobile).toMatch(/^09\d{2}\*\*\*\d{4}$/);expect(preview.verificationCode).toMatch(/^\d{6}$/);
    await expect(service.setOwnSecondaryPassword(userConcurrencyToken(before.activeUser),{verificationCode:'000000',secondaryPassword:'4827'})).rejects.toThrow('کد تأیید');
    const after=await service.setOwnSecondaryPassword(userConcurrencyToken(before.activeUser),{verificationCode:preview.verificationCode!,secondaryPassword:'4827'});
    expect(after.activeUser.hasSecondaryPassword).toBe(true);expect(after.activeUser.secondaryPasswordHash).toBeUndefined();expect(after.activeUser.secondaryPasswordOtpHash).toBeUndefined();
    const raw=await storage.get<LocalUser>('users','persona-seller');expect(raw?.secondaryPasswordHash).toMatch(/^pbkdf2\$/);expect(raw?.secondaryPasswordHash).not.toContain('4827');expect(raw?.secondaryPasswordOtpHash).toBeUndefined();
    const persistedText=JSON.stringify({audits:await storage.getAll('audit_events'),history:await storage.getAll('workflow_history'),letters:await storage.getAll('letters')});
    expect(persistedText).not.toContain('4827');expect(persistedText).not.toContain(preview.verificationCode!);
  });

  it('redacts a protected letter until each authorized user enters their own secondary password',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    await enrollSecondaryPassword(storage,service,'persona-seller','4827');await enrollSecondaryPassword(storage,service,'persona-product-owner','5938');await enrollSecondaryPassword(storage,service,'persona-user-manager','6719');
    await sessionAs(storage,'persona-seller');let state=await service.createLetter({direction:'internal',classification:'confidential',subject:'برنامه محرمانه منابع انسانی',body:'این متن فقط برای گیرنده مشخص و پس از ورود رمز دوم نمایش داده می‌شود.',recipientUnitIds:['unit-it'],recipientUserIds:['persona-user-manager']});
    let letter=state.operationalRecords.find((record)=>record.moduleId==='letter'&&record.payload.classification==='confidential')!;expect(letter.title).toBe('نامه محرمانه');expect(letter.payload.locked).toBe(true);
    await expect(service.unlockLetter(letter.id,letter.version,'9999')).rejects.toThrow('رمز دوم صحیح نیست');
    const authorCopy=await service.unlockLetter(letter.id,letter.version,'4827');expect(authorCopy.title).toBe('برنامه محرمانه منابع انسانی');expect(authorCopy.payload.body).toContain('فقط برای گیرنده');
    await service.transitionLetter(authorCopy.id,authorCopy.version,'submit_review');
    await sessionAs(storage,'persona-product-owner');state=await service.loadState();letter=state.operationalRecords.find((record)=>record.id===authorCopy.id)!;expect(letter.title).toBe('نامه محرمانه');const reviewerCopy=await service.unlockLetter(letter.id,letter.version,'5938');
    await service.transitionLetter(reviewerCopy.id,reviewerCopy.version,'approve','5938');
    await sessionAs(storage,'persona-seller');state=await service.loadState();letter=state.operationalRecords.find((record)=>record.id===authorCopy.id)!;const senderCopy=await service.unlockLetter(letter.id,letter.version,'4827');await service.transitionLetter(senderCopy.id,senderCopy.version,'send','4827');
    await sessionAs(storage,'persona-user-manager');state=await service.loadState();letter=state.operationalRecords.find((record)=>record.id===authorCopy.id)!;expect(letter.title).toBe('نامه محرمانه');expect(letter.payload.body).toBeUndefined();expect((await service.unlockLetter(letter.id,letter.version,'6719')).title).toBe('برنامه محرمانه منابع انسانی');
    await sessionAs(storage,'persona-purchase-requester');expect((await service.loadState()).operationalRecords.some((record)=>record.id===authorCopy.id)).toBe(false);
  });

  it('requires the fixed secondary password for approval and final sending and temporarily locks repeated failures',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    await enrollSecondaryPassword(storage,service,'persona-seller','4827');await enrollSecondaryPassword(storage,service,'persona-product-owner','5938');
    await sessionAs(storage,'persona-seller');let state=await service.createLetter({direction:'internal',classification:'normal',subject:'نامه نیازمند تأیید دوم',body:'این نامه برای آزمون رمز دوم ارسال و تأیید می‌شود.',recipientUserIds:['persona-user-manager']});let letter=state.operationalRecords.find((record)=>record.title==='نامه نیازمند تأیید دوم')!;state=await service.transitionLetter(letter.id,letter.version,'submit_review');letter=state.operationalRecords.find((record)=>record.id===letter.id)!;
    await sessionAs(storage,'persona-product-owner');state=await service.loadState();letter=state.operationalRecords.find((record)=>record.id===letter.id)!;await expect(service.transitionLetter(letter.id,letter.version,'approve')).rejects.toThrow('۴ رقم');
    for(let attempt=0;attempt<5;attempt+=1)await expect(service.transitionLetter(letter.id,letter.version,'approve','1112')).rejects.toThrow(attempt===4?'۱۵ دقیقه':'صحیح نیست');
    await expect(service.transitionLetter(letter.id,letter.version,'approve','5938')).rejects.toThrow('موقتاً قفل');expect((await storage.get<OperationalRecord>('letters',letter.id))?.status).toBe('in_review');
  });
});
