import {describe, expect, it} from 'vitest';
import type {FoundationSession, FoundationStoreName, LocalUser, OperationalRecord, SecurityRole, SnapshotManifest, UserNotification} from './model';
import {FOUNDATION_STORES} from './model';
import {chatPreferenceId, projectChatId, projectMemberUserIds, taskChecklist, taskLabels, taskProjectId} from './collaborationDomain';
import {createSeedData} from './seed';
import {LocalFoundationService} from './service';
import type {StorageAdapter, StorageTransaction} from './storage';
import {permissionFor} from './erpCatalog';
import {isWorkspaceRecordVisible} from './ErpWorkspacePage';

class MemoryStorage implements StorageAdapter {
  private stores = new Map<FoundationStoreName, Map<IDBValidKey, unknown>>(FOUNDATION_STORES.map((store)=>[store,new Map()]));
  failReadAfterCommandId?:string;
  private failNextReadonly=false;
  async transaction<T>(stores:FoundationStoreName[],_mode:IDBTransactionMode,work:(transaction:StorageTransaction)=>Promise<T>):Promise<T>{if(_mode==='readonly'&&this.failNextReadonly){this.failNextReadonly=false;throw new Error('injected post-commit read failure');}const snapshots=new Map(stores.map((store)=>[store,new Map(this.stores.get(store)!)]));const tx:StorageTransaction={get:async<V>(store,id)=>this.stores.get(store)?.get(id) as V|undefined,getAll:async<V>(store)=>[...(this.stores.get(store)?.values()??[])] as V[],put:async(store,value)=>{this.stores.get(store)!.set((value as {id:IDBValidKey}).id,structuredClone(value));if(store==='idempotency_keys'&&(value as {id?:string}).id===this.failReadAfterCommandId){this.failReadAfterCommandId=undefined;this.failNextReadonly=true;}},delete:async(store,id)=>{this.stores.get(store)!.delete(id);},clear:async(store)=>{this.stores.get(store)!.clear();}};try{return await work(tx);}catch(error){for(const [store,snapshot] of snapshots)this.stores.set(store,snapshot);throw error;}}
  get<T>(store:FoundationStoreName,id:IDBValidKey){return this.transaction([store],'readonly',(tx)=>tx.get<T>(store,id));}
  getAll<T>(store:FoundationStoreName){return this.transaction([store],'readonly',(tx)=>tx.getAll<T>(store));}
  put<T>(store:FoundationStoreName,value:T){return this.transaction([store],'readwrite',(tx)=>tx.put(store,value));}
  delete(store:FoundationStoreName,id:IDBValidKey){return this.transaction([store],'readwrite',(tx)=>tx.delete(store,id));}
  async replaceAll(stores:Record<FoundationStoreName,unknown[]>){for(const store of FOUNDATION_STORES){this.stores.get(store)!.clear();for(const value of stores[store])this.stores.get(store)!.set((value as {id:IDBValidKey}).id,structuredClone(value));}}
  async exportSnapshot():Promise<SnapshotManifest>{throw new Error('not used');} async importSnapshot():Promise<void>{throw new Error('not used');}
}

async function sessionAs(storage:MemoryStorage,userId:string){const session=await storage.get<FoundationSession>('sessions','active-session');await storage.put('sessions',{...session!,activeUserId:userId,actingAdminUserId:undefined,signedOutAt:undefined});}
async function addRole(storage:MemoryStorage,userId:string,roleId:string){const user=await storage.get<LocalUser>('users',userId);await storage.put('users',{...user!,roleId,roleIds:[roleId]});}
async function appendRole(storage:MemoryStorage,userId:string,roleId:string){const user=await storage.get<LocalUser>('users',userId);await storage.put('users',{...user!,roleIds:[...new Set([...(user!.roleIds??[user!.roleId]),roleId])]});}

describe('collaboration project domain',()=>{
  it('replays project and group creation after a post-commit state refresh failure',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);await sessionAs(storage,'persona-product-owner');
    const projectInput={title:'پروژه فرمان پایدار',memberUserIds:['persona-system-admin'],createChat:true};
    storage.failReadAfterCommandId='project-stable-command';
    await expect(service.createProject(projectInput,'project-stable-command')).rejects.toThrow('post-commit');
    await expect(service.createProject(projectInput,'project-stable-command')).resolves.toBeTruthy();
    expect((await storage.getAll<OperationalRecord>('projects')).filter((item)=>item.title===projectInput.title)).toHaveLength(1);

    const groupInput={kind:'group' as const,title:'گروه فرمان پایدار',memberUserIds:['persona-system-admin']};
    storage.failReadAfterCommandId='group-stable-command';
    await expect(service.createChatConversation(groupInput,'group-stable-command')).rejects.toThrow('post-commit');
    await expect(service.createChatConversation(groupInput,'group-stable-command')).resolves.toBeTruthy();
    expect((await storage.getAll<OperationalRecord>('chats')).filter((item)=>item.title===groupInput.title)).toHaveLength(1);

    const project=(await storage.getAll<OperationalRecord>('projects')).find((item)=>item.title===projectInput.title)!;
    const taskInput={title:'وظیفه فرمان پایدار',projectId:project.id,assigneeUserIds:['persona-product-owner'],labels:['ایمن']};
    storage.failReadAfterCommandId='task-batch-stable-command';
    await expect(service.createProjectTasksBatch(taskInput,'task-batch-stable-command')).rejects.toThrow('post-commit');
    await expect(service.createProjectTasksBatch(taskInput,'task-batch-stable-command')).resolves.toBeTruthy();
    expect((await storage.getAll<OperationalRecord>('tasks')).filter((item)=>item.title===taskInput.title)).toHaveLength(1);
    await expect(service.createProjectTasksBatch({...taskInput,title:'استفاده متفاوت از فرمان'},'task-batch-stable-command')).rejects.toThrow('شناسه این فرمان');
  });

  it('creates a private project and optional chat atomically and removes future access with membership',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    await sessionAs(storage,'persona-product-owner');
    let state=await service.createProject({title:'طرح محرمانه محصول',memberUserIds:['persona-system-admin'],unitId:'unit-management',createChat:true});
    let project=state.operationalRecords.find((record)=>record.moduleId==='project'&&record.title==='طرح محرمانه محصول')!;
    const chatId=projectChatId(project)!;
    expect(projectMemberUserIds(project)).toEqual(['persona-product-owner','persona-system-admin']);
    expect(state.operationalRecords.some((record)=>record.id===chatId&&record.relatedRecordId===project.id)).toBe(true);
    expect((await storage.getAll<UserNotification>('notifications')).some((item)=>item.userId==='persona-system-admin'&&item.relatedRecordId===project.id)).toBe(true);

    state=await service.updateProject(project.id,{title:project.title,memberUserIds:['persona-user-manager'],unitId:'unit-management'},project.version);
    project=state.operationalRecords.find((record)=>record.id===project.id)!;
    expect(projectMemberUserIds(project)).toEqual(['persona-product-owner','persona-user-manager']);

    await sessionAs(storage,'persona-system-admin');state=await service.loadState();
    expect(state.operationalRecords.some((record)=>record.id===project.id||record.id===chatId)).toBe(false);
    expect(state.operationalHistory.some((item)=>item.recordId===project.id||item.recordId===chatId)).toBe(false);
    await sessionAs(storage,'persona-user-manager');state=await service.loadState();
    expect(state.operationalRecords.some((record)=>record.id===project.id)).toBe(false);
    await appendRole(storage,'persona-user-manager','role-project-member');state=await service.loadState();
    expect(state.operationalRecords.some((record)=>record.id===project.id)).toBe(true);
    expect(state.operationalRecords.some((record)=>record.id===chatId)).toBe(true);
  });

  it('enforces the project lifecycle and stores each multi-assignee task independently',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);await sessionAs(storage,'persona-product-owner');
    let state=await service.createProject({title:'راه‌اندازی همکاری',memberUserIds:['persona-system-admin'],createChat:false});let project=state.operationalRecords.find((record)=>record.moduleId==='project'&&record.title==='راه‌اندازی همکاری')!;
    state=await service.transitionProject(project.id,'active','',project.version);project=state.operationalRecords.find((record)=>record.id===project.id)!;
    await expect(service.transitionProject(project.id,'archived','بایگانی زودهنگام',project.version)).rejects.toThrow('انتقال');
    state=await service.createProjectTasksBatch({title:'بازبینی خروجی',projectId:project.id,assigneeUserIds:['persona-product-owner','persona-system-admin'],labels:['فوری',' فنی ','فوری'],checklist:[{title:'بررسی محتوا'},{title:'تأیید نهایی'}],reminderAt:'2026-09-01T08:00:00.000Z'});
    const tasks=state.operationalRecords.filter((record)=>record.moduleId==='task'&&taskProjectId(record)===project.id&&record.title==='بازبینی خروجی');
    expect(tasks).toHaveLength(2);expect(new Set(tasks.map((task)=>task.assigneeUserId))).toEqual(new Set(['persona-product-owner','persona-system-admin']));
    expect(new Set(tasks.map((task)=>task.payload.assignmentBatchId)).size).toBe(1);
    expect(tasks.every((task)=>task.relatedRecordId===undefined)).toBe(true);expect(taskLabels(tasks[0])).toEqual(['فوری','فنی']);expect(taskChecklist(tasks[0])).toHaveLength(2);
    expect((await storage.getAll<UserNotification>('notifications')).some((item)=>item.userId==='persona-system-admin'&&item.relatedRecordId===tasks.find((task)=>task.assigneeUserId==='persona-system-admin')?.id)).toBe(true);
    const mine=tasks.find((task)=>task.assigneeUserId==='persona-product-owner')!;const item=taskChecklist(mine)[0];
    state=await service.setTaskChecklistItem(mine.id,item.id,true,mine.version);expect(taskChecklist(state.operationalRecords.find((record)=>record.id===mine.id)!)[0]).toMatchObject({completed:true,completedByUserId:'persona-product-owner'});
  });

  it('keeps the owner, reserves project transitions for managers, and scopes task completion to the assignee',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);
    await appendRole(storage,'persona-user-manager','role-project-member');
    await sessionAs(storage,'persona-product-owner');
    let state=await service.createProject({title:'کنترل مسئولیت پروژه',memberUserIds:['persona-user-manager'],createChat:false});
    let project=state.operationalRecords.find((record)=>record.moduleId==='project'&&record.title==='کنترل مسئولیت پروژه')!;
    state=await service.updateProject(project.id,{title:project.title,memberUserIds:['persona-user-manager']},project.version);
    project=state.operationalRecords.find((record)=>record.id===project.id)!;
    expect(projectMemberUserIds(project)).toContain('persona-product-owner');
    state=await service.createProjectTasksBatch({title:'کار کنترل‌شده',projectId:project.id,assigneeUserIds:['persona-product-owner','persona-user-manager'],checklist:[{title:'تأیید خروجی'}]});
    const ownerTask=state.operationalRecords.find((record)=>record.moduleId==='task'&&record.assigneeUserId==='persona-product-owner'&&record.title==='کار کنترل‌شده')!;
    let memberTask=state.operationalRecords.find((record)=>record.moduleId==='task'&&record.assigneeUserId==='persona-user-manager'&&record.title==='کار کنترل‌شده')!;

    await sessionAs(storage,'persona-user-manager');
    await expect(service.transitionProject(project.id,'active','',project.version)).rejects.toThrow();
    await expect(service.transitionProjectTask(ownerTask.id,'in_progress','',ownerTask.version)).rejects.toThrow();
    await expect(service.transitionOperationalRecord('task',memberTask.id,'task.in_progress')).rejects.toThrow('میز همکاری');
    await expect(service.updateOperationalRecord('task',memberTask.id,memberTask.version,{title:'دورزدن ویرایش'})).rejects.toThrow('میز همکاری');
    state=await service.transitionProjectTask(memberTask.id,'in_progress','',memberTask.version);
    memberTask=state.operationalRecords.find((record)=>record.id===memberTask.id)!;
    state=await service.transitionProjectTask(memberTask.id,'blocked','در انتظار پاسخ واحد مالی',memberTask.version);memberTask=state.operationalRecords.find((record)=>record.id===memberTask.id)!;
    expect(memberTask.status).toBe('blocked');expect(memberTask.payload.waitingReason).toBe('در انتظار پاسخ واحد مالی');
    state=await service.transitionProjectTask(memberTask.id,'in_progress','پاسخ واحد مالی دریافت شد',memberTask.version);memberTask=state.operationalRecords.find((record)=>record.id===memberTask.id)!;
    expect(memberTask.payload.waitingReason).toBeNull();
    await expect(service.transitionProjectTask(memberTask.id,'done','',memberTask.version)).rejects.toThrow('چک');
    const checklistItem=taskChecklist(memberTask)[0];
    state=await service.setTaskChecklistItem(memberTask.id,checklistItem.id,true,memberTask.version);
    memberTask=state.operationalRecords.find((record)=>record.id===memberTask.id)!;
    state=await service.transitionProjectTask(memberTask.id,'done','',memberTask.version);
    expect(state.operationalRecords.find((record)=>record.id===memberTask.id)?.status).toBe('done');
  });

  it('keeps pin and mute preferences per member and fails closed for non-members',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);await sessionAs(storage,'persona-product-owner');
    let state=await service.createProject({title:'پروژه تنظیم گفتگو',memberUserIds:['persona-system-admin'],createChat:true});const project=state.operationalRecords.find((record)=>record.moduleId==='project'&&record.title==='پروژه تنظیم گفتگو')!;const chatId=projectChatId(project)!;
    state=await service.updateChatPreference(chatId,{pinned:true,muted:true},0);expect(state.chatPreferences).toEqual([expect.objectContaining({id:chatPreferenceId(chatId,'persona-product-owner'),pinned:true,muted:true,version:1})]);
    await expect(service.updateChatPreference(chatId,{pinned:false,muted:false},0)).rejects.toThrow('هم‌زمان');
    await addRole(storage,'persona-purchase-requester','role-project-manager');await sessionAs(storage,'persona-purchase-requester');
    await expect(service.transitionProject(project.id,'active','',project.version)).rejects.toThrow('در دسترس');
    await expect(service.updateChatPreference(chatId,{pinned:true,muted:false},0)).rejects.toThrow('در دسترس');
  });

  it('hides a linked project chat and rejects direct commands when project view is denied',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);await sessionAs(storage,'persona-product-owner');
    let state=await service.createProject({title:'پروژه با گفت‌وگوی محدود',memberUserIds:['persona-user-manager'],createChat:true});const project=state.operationalRecords.find((record)=>record.moduleId==='project'&&record.title==='پروژه با گفت‌وگوی محدود')!;const chatId=projectChatId(project)!;
    await service.sendChatMessage({conversationId:chatId,body:'پیام پروژه محدود'});
    await appendRole(storage,'persona-user-manager','role-project-member');await sessionAs(storage,'persona-user-manager');await service.sendChatMessage({conversationId:chatId,body:'پیام عضو پروژه'});
    const ownMessage=(await storage.getAll<OperationalRecord>('messages')).find((record)=>record.createdByUserId==='persona-user-manager'&&record.relatedRecordId===chatId)!;
    const member=await storage.get<LocalUser>('users','persona-user-manager');await storage.put('users',{...member!,permissionDenials:[...new Set([...(member!.permissionDenials??[]),'project.project.view'])]});
    await sessionAs(storage,'persona-user-manager');state=await service.loadState();
    expect(state.operationalRecords.some((record)=>record.id===project.id||record.id===chatId||record.relatedRecordId===chatId)).toBe(false);
    await expect(service.sendChatMessage({conversationId:chatId,body:'دورزدن با شناسه قدیمی'})).rejects.toThrow('در دسترس');
    await expect(service.updateChatPreference(chatId,{pinned:true,muted:false},0)).rejects.toThrow('در دسترس');
    await expect(service.editChatMessage(ownMessage.id,'ویرایش دورزننده',ownMessage.version)).rejects.toThrow('پروژه');
    await expect(service.deleteChatMessage(ownMessage.id,ownMessage.version)).rejects.toThrow('پروژه');
    const rawChat=(await storage.get<OperationalRecord>('chats',chatId))!;
    await expect(service.hideChatForMe(chatId,rawChat.version)).rejects.toThrow('پروژه');
    await expect(service.markChatRead(chatId)).rejects.toThrow('پروژه');
    await expect(service.updateChatGroup(chatId,{title:rawChat.title,memberUserIds:projectMemberUserIds(project),adminUserIds:['persona-product-owner']},rawChat.version)).rejects.toThrow('پروژه');
  });

  it('requires visible parent access to create a task and prevents an ordinary assignee from reassigning it',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);await sessionAs(storage,'persona-product-owner');
    let state=await service.createProject({title:'پروژه کنترل واگذاری',memberUserIds:['persona-user-manager','persona-system-admin'],createChat:false});const project=state.operationalRecords.find((record)=>record.moduleId==='project'&&record.title==='پروژه کنترل واگذاری')!;
    await appendRole(storage,'persona-user-manager','role-project-manager');await sessionAs(storage,'persona-user-manager');
    const userManager=await storage.get<LocalUser>('users','persona-user-manager');await storage.put('users',{...userManager!,permissionDenials:[...new Set([...(userManager!.permissionDenials??[]),'project.project.view'])]});
    await expect(service.createProjectTask({title:'کار با پروژه پنهان',projectId:project.id,assigneeUserId:'persona-user-manager'})).rejects.toThrow('در دسترس');
    await storage.put('users',{...userManager!,roleIds:[...new Set([...(userManager!.roleIds??[]),'role-project-member'])],permissionDenials:[]});
    await sessionAs(storage,'persona-product-owner');state=await service.createProjectTask({title:'کار بدون اختیار واگذاری',projectId:project.id,assigneeUserId:'persona-user-manager'});const task=state.operationalRecords.find((record)=>record.moduleId==='task'&&record.title==='کار بدون اختیار واگذاری')!;
    await addRole(storage,'persona-user-manager','role-project-member');await sessionAs(storage,'persona-user-manager');
    await expect(service.updateProjectTask(task.id,{title:task.title,assigneeUserId:'persona-system-admin'},task.version)).rejects.toThrow('مسئول');
  });

  it('does not expose confidential project chat audit summaries to a non-member auditor',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);await sessionAs(storage,'persona-product-owner');
    const secretTitle='گفت‌وگوی فوق محرمانه پروژه';let state=await service.createProject({title:secretTitle,memberUserIds:[],createChat:true});const project=state.operationalRecords.find((record)=>record.moduleId==='project'&&record.title===secretTitle)!;
    await service.sendChatMessage({conversationId:projectChatId(project)!,body:'پیام خصوصی'});
    await sessionAs(storage,'persona-system-admin');state=await service.loadState();
    expect(JSON.stringify(state.audits)).not.toContain(secretTitle);expect(state.audits.some((event)=>event.action.startsWith('communications.'))).toBe(false);
  });

  it('marks tasks for reassignment when a member is removed and can create project chat later',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);await sessionAs(storage,'persona-product-owner');
    let state=await service.createProject({title:'پروژه تعیین تکلیف اعضا',memberUserIds:['persona-system-admin'],createChat:false});let project=state.operationalRecords.find((record)=>record.moduleId==='project'&&record.title==='پروژه تعیین تکلیف اعضا')!;
    state=await service.createProjectTask({title:'کار عضو حذف‌شونده',projectId:project.id,assigneeUserId:'persona-system-admin'});let task=state.operationalRecords.find((record)=>record.moduleId==='task'&&record.title==='کار عضو حذف‌شونده')!;
    state=await service.updateProject(project.id,{title:project.title,memberUserIds:['persona-product-owner'],createChat:true},project.version);project=state.operationalRecords.find((record)=>record.id===project.id)!;
    task=(await storage.get<OperationalRecord>('tasks',task.id))!;
    expect(task.payload).toMatchObject({needsReassignment:true,removedAssigneeUserId:'persona-system-admin'});expect(projectChatId(project)).toBeTruthy();
    await expect(service.updateProjectTask(task.id,{title:task.title,assigneeUserId:'persona-product-owner'},task.version)).rejects.toThrow('تعیین همه مسئولان');
    state=await service.resolveContinuityReassignment('task',task.id,'project_task_assignee','persona-product-owner',task.version,'تعیین مسئول تازه پس از حذف عضو پروژه');task=state.operationalRecords.find((record)=>record.id===task.id)!;
    expect(task.assigneeUserId).toBe('persona-product-owner');expect(task.payload.needsReassignment).toBe(false);expect(task.payload.removedAssigneeUserId).toBeNull();
  });

  it('fails closed for project tasks whose parent is missing or no longer visible',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);await sessionAs(storage,'persona-product-owner');
    let state=await service.createProject({title:'پروژه والد وظیفه',memberUserIds:[],createChat:false});const project=state.operationalRecords.find((record)=>record.moduleId==='project'&&record.title==='پروژه والد وظیفه')!;
    state=await service.createProjectTask({title:'وظیفه با والد حذف‌شده',projectId:project.id,assigneeUserId:'persona-product-owner',checklist:[{title:'ردیف'}]});const task=state.operationalRecords.find((record)=>record.moduleId==='task'&&record.title==='وظیفه با والد حذف‌شده')!;
    await storage.delete('projects',project.id);
    await expect(service.updateProjectTask(task.id,{title:task.title},task.version)).rejects.toThrow('در دسترس');
    await expect(service.setTaskChecklistItem(task.id,taskChecklist(task)[0].id,true,task.version)).rejects.toThrow('در دسترس');
    await expect(service.transitionProjectTask(task.id,'in_progress','',task.version)).rejects.toThrow('در دسترس');
  });

  it('records metadata-only audit entries for project and task mutations',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);await sessionAs(storage,'persona-product-owner');
    await service.createProject({title:'عبارت بسیار حساس داخلی',description:'متن بسیار حساس داخلی',memberUserIds:[],createChat:false});
    const audits=await storage.getAll<{action:string;summary:string;metadata?:Record<string,unknown>}>('audit_events');const created=audits.find((item)=>item.action==='project.project.created')!;
    expect(JSON.stringify(created)).not.toContain('عبارت بسیار حساس داخلی');expect(JSON.stringify(created)).not.toContain('متن بسیار حساس داخلی');expect(created.metadata).toMatchObject({memberCount:1,chatCreated:false});
  });

  it('blocks every generic ERP path that could bypass collaboration policy',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);await sessionAs(storage,'persona-product-owner');
    let state=await service.createProject({title:'پروژه مسیرهای تخصصی',memberUserIds:['persona-system-admin'],createChat:true});
    const project=state.operationalRecords.find((record)=>record.moduleId==='project'&&record.title==='پروژه مسیرهای تخصصی')!;
    const chat=state.operationalRecords.find((record)=>record.id===projectChatId(project))!;
    state=await service.createProjectTask({title:'کار مسیر تخصصی',projectId:project.id,assigneeUserId:'persona-product-owner'});
    const task=state.operationalRecords.find((record)=>record.moduleId==='task'&&record.title==='کار مسیر تخصصی')!;

    await expect(service.createOperationalRecord('project',{title:'پروژه دورزننده'})).rejects.toThrow('مسیر تخصصی');
    await expect(service.createOperationalRecord('chat',{title:'گفت‌وگوی دورزننده'})).rejects.toThrow('مسیر تخصصی');
    await expect(service.createOperationalRecord('message',{title:'پیام دورزننده'})).rejects.toThrow('مسیر تخصصی');
    await expect(service.createOperationalRecord('task',{title:'کار دورزننده',payload:{projectId:project.id}})).rejects.toThrow('میز همکاری');
    await expect(service.createOperationalRecord('document',{title:'سند دورزننده',payload:{projectId:project.id}})).rejects.toThrow('پیوند پروژه');
    state=await service.createOperationalRecord('document',{title:'سند بدون پیوند'});
    const document=state.operationalRecords.find((record)=>record.moduleId==='document'&&record.title==='سند بدون پیوند')!;
    await expect(service.updateOperationalRecord('project',project.id,project.version,{title:'ویرایش دورزننده'})).rejects.toThrow('مسیر تخصصی');
    await expect(service.updateOperationalRecord('chat',chat.id,chat.version,{title:'ویرایش دورزننده'})).rejects.toThrow('مسیر تخصصی');
    await expect(service.updateOperationalRecord('task',task.id,task.version,{title:'ویرایش دورزننده'})).rejects.toThrow('میز همکاری');
    await expect(service.updateOperationalRecord('document',document.id,document.version,{payload:{...document.payload,projectId:project.id}})).rejects.toThrow('پرونده پروژه');
    await expect(service.transitionOperationalRecord('project',project.id,'project.activate')).rejects.toThrow('مسیر تخصصی');
    await expect(service.transitionOperationalRecord('task',task.id,'task.in_progress')).rejects.toThrow('میز همکاری');
    await expect(service.assignOperationalRecord('project',project.id,'persona-system-admin','دورزدن مالکیت',project.version)).rejects.toThrow('مسیر تخصصی');
    await expect(service.assignOperationalRecord('task',task.id,'persona-system-admin','دورزدن عضویت',task.version)).rejects.toThrow('میز همکاری');
  });

  it('rejects mismatched, out-of-scope, and cross-company generic assignments and direct record opening',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);await sessionAs(storage,'persona-product-owner');
    let state=await service.createOperationalRecord('document',{title:'سند کنترل محدوده ارجاع'});
    let document=state.operationalRecords.find((record)=>record.moduleId==='document'&&record.title==='سند کنترل محدوده ارجاع')!;

    await expect(service.assignOperationalRecord('task',document.id,'persona-system-admin','ماژول اشتباه',document.version)).rejects.toThrow('معتبر نیست');
    expect((await storage.getAll<OperationalRecord>('tasks')).some((record)=>record.id===document.id)).toBe(false);

    const target=await storage.get<LocalUser>('users','persona-system-admin');
    await storage.put('users',{...target!,companyId:'other-company'});
    await expect(service.assignOperationalRecord('document',document.id,'persona-system-admin','شرکت دیگر',document.version)).rejects.toThrow('معتبر نیست');
    await storage.put('users',target!);

    const role:SecurityRole={id:'role-unit-document-manager-test',name:'مدیر سند واحدی آزمون',description:'آزمون محدوده واحد',status:'active',protected:false,scope:'UNIT',permissions:[permissionFor('document','view'),permissionFor('document','manage')],createdAt:'2026-08-27T00:00:00.000Z',updatedAt:'2026-08-27T00:00:00.000Z',version:1};
    await storage.put('security_roles',role);await addRole(storage,'persona-user-manager',role.id);
    document={...document,unitId:'unit-sales',version:document.version+1,updatedAt:'2026-08-27T00:00:00.000Z'};
    await storage.put('documents',document);await sessionAs(storage,'persona-user-manager');state=await service.loadState();
    expect(isWorkspaceRecordVisible(document,state,['document'])).toBe(false);
    await expect(service.assignOperationalRecord('document',document.id,'persona-user-manager','خارج از واحد',document.version)).rejects.toThrow('محدوده');

    const ownUnitDocument={...document,id:'document-own-unit',unitId:state.activeUser.unitId,trackingCode:'DOC-OWN-UNIT'};
    expect(isWorkspaceRecordVisible(ownUnitDocument,state,['document'])).toBe(true);
  });

  it('does not expose linked-record audit metadata to a non-member audit viewer',async()=>{
    const storage=new MemoryStorage();await storage.replaceAll(createSeedData());const service=new LocalFoundationService(storage);await sessionAs(storage,'persona-product-owner');
    let state=await service.createProject({title:'پروژه محرمانه پیوند',memberUserIds:[],createChat:false});
    const project=state.operationalRecords.find((record)=>record.moduleId==='project'&&record.title==='پروژه محرمانه پیوند')!;
    state=await service.createOperationalRecord('document',{title:'سند داخلی پروژه'});
    let document=state.operationalRecords.find((record)=>record.moduleId==='document'&&record.title==='سند داخلی پروژه')!;
    state=await service.linkRecordToProject(document.id,project.id,document.version);
    document=state.operationalRecords.find((record)=>record.id===document.id)!;
    await service.linkRecordToProject(document.id,undefined,document.version);

    await sessionAs(storage,'persona-system-admin');state=await service.loadState();
    expect(state.operationalRecords.some((record)=>record.id===project.id)).toBe(false);
    expect(state.audits.some((event)=>event.action.startsWith('collaboration.record.')&&(event.metadata?.projectId===project.id||event.metadata?.previousProjectId===project.id||event.metadata?.recordId===document.id))).toBe(false);
  });
});
