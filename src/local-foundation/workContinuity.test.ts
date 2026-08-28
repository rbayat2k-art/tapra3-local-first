import {afterEach,describe,expect,it,vi} from 'vitest';
import type {
  FoundationSession,FoundationStoreName,LocalUser,OperationalRecord,PersonnelRecord,SecurityRole,SnapshotManifest,WorkflowApprovalRound,WorkflowDefinition,WorkContinuityPlan,
} from './model';
import {FOUNDATION_STORES} from './model';
import {COMPANY_ID,createSeedData} from './seed';
import {LocalFoundationService,userConcurrencyToken} from './service';
import type {StorageAdapter,StorageTransaction} from './storage';
import {todayIsoDate,toIsoDate} from './PersianDate';

class MemoryStorage implements StorageAdapter {
  private stores=new Map<FoundationStoreName,Map<IDBValidKey,unknown>>(FOUNDATION_STORES.map((store)=>[store,new Map()]));
  private failPutStore?:FoundationStoreName;
  failNextPut(store:FoundationStoreName){this.failPutStore=store;}
  async transaction<T>(stores:FoundationStoreName[],mode:IDBTransactionMode,work:(transaction:StorageTransaction)=>Promise<T>):Promise<T>{
    const working:Map<FoundationStoreName,Map<IDBValidKey,unknown>>=mode==='readwrite'
      ?new Map([...this.stores.entries()].map(([store,values])=>[store,stores.includes(store)?new Map([...values].map(([id,value])=>[id,structuredClone(value)])):values]))
      :this.stores;
    const tx:StorageTransaction={
      get:async<V>(store,id)=>working.get(store)?.get(id) as V|undefined,
      getAll:async<V>(store)=>[...(working.get(store)?.values()??[])] as V[],
      put:async(store,value)=>{if(this.failPutStore===store){this.failPutStore=undefined;throw new Error(`injected ${store} failure`);}working.get(store)!.set((value as {id:IDBValidKey}).id,structuredClone(value));},
      delete:async(store,id)=>{working.get(store)!.delete(id);},clear:async(store)=>{working.get(store)!.clear();},
    };
    const result=await work(tx);if(mode==='readwrite')for(const store of stores)this.stores.set(store,working.get(store)!);return result;
  }
  get<T>(store:FoundationStoreName,id:IDBValidKey){return this.transaction([store],'readonly',(tx)=>tx.get<T>(store,id));}
  getAll<T>(store:FoundationStoreName){return this.transaction([store],'readonly',(tx)=>tx.getAll<T>(store));}
  put<T>(store:FoundationStoreName,value:T){return this.transaction([store],'readwrite',(tx)=>tx.put(store,value));}
  delete(store:FoundationStoreName,id:IDBValidKey){return this.transaction([store],'readwrite',(tx)=>tx.delete(store,id));}
  async replaceAll(stores:Record<FoundationStoreName,unknown[]>){for(const store of FOUNDATION_STORES){this.stores.get(store)!.clear();for(const value of stores[store])this.stores.get(store)!.set((value as {id:IDBValidKey}).id,structuredClone(value));}}
  async exportSnapshot():Promise<SnapshotManifest>{throw new Error('not used');}async importSnapshot():Promise<void>{throw new Error('not used');}
}

async function setup(){
  const storage=new MemoryStorage();await storage.replaceAll(createSeedData());
  const [admin,seller,sellerPersonnel,baseRole]=await Promise.all([
    storage.get<LocalUser>('users','persona-product-owner'),storage.get<LocalUser>('users','persona-seller'),
    storage.get<PersonnelRecord>('personnel','personnel-arman'),storage.get<SecurityRole>('security_roles','role-organization-manager'),
  ]);
  const now='2026-08-28T00:00:00.000Z';
  await storage.put('security_roles',{...baseRole!,id:'role-approved-sales-manager',name:'مدیر مصوب واحد فروش',scope:'UNIT',status:'active',permissions:['organization.personnel.manage','organization.units.manage'],protected:false,createdAt:now,updatedAt:now});
  await storage.put('users',{...admin!,id:'persona-approved-manager',actorId:'actor-approved-manager',name:'مدیر مصوب فروش',username:'approved.manager',roleId:'role-approved-sales-manager',roleIds:['role-approved-sales-manager'],status:'active',isAdmin:false,unitId:'unit-sales',branchUnitId:'unit-branch-central',positionId:'position-manager',personnelId:'personnel-approved-manager',managerUserId:admin!.id,teamId:seller!.teamId,advanceBranchIds:['*'],permissions:[],scope:'UNIT'});
  await storage.put('personnel',{...sellerPersonnel!,id:'personnel-approved-manager',personnelCode:'P-TEST-MANAGER',firstName:'مدیر',lastName:'مصوب فروش',linkedUserId:'persona-approved-manager',positionId:'position-manager',managerPersonnelId:'personnel-admin',salesSupervisorPersonnelId:undefined,createdAt:now,updatedAt:now});
  return{storage,service:new LocalFoundationService(storage)};
}

async function switchActiveUser(storage:MemoryStorage,activeUserId:string){const session=await storage.get<FoundationSession>('sessions','active-session');await storage.put('sessions',{...session!,activeUserId,actingAdminUserId:undefined,signedOutAt:undefined,switchedAt:new Date().toISOString(),version:session!.version+1});}

async function addTwoManagerReports(storage:MemoryStorage){
  const [userTemplate,personTemplate]=await Promise.all([storage.get<LocalUser>('users','persona-approved-manager'),storage.get<PersonnelRecord>('personnel','personnel-approved-manager')]);const now='2026-08-28T07:00:00.000Z';
  for(const suffix of ['a','b']){
    await storage.put('users',{...userTemplate!,id:`persona-manager-${suffix}`,actorId:`actor-manager-${suffix}`,username:`manager.${suffix}`,personnelId:`personnel-manager-${suffix}`,managerUserId:'persona-seller'});
    await storage.put('personnel',{...personTemplate!,id:`personnel-manager-${suffix}`,personnelCode:`P-MANAGER-${suffix.toUpperCase()}`,linkedUserId:`persona-manager-${suffix}`,managerPersonnelId:'personnel-arman',salesSupervisorPersonnelId:undefined,createdAt:now,updatedAt:now});
  }
}

function record(id:string,moduleId:string,overrides:Partial<OperationalRecord>={}):OperationalRecord{
  return {id,moduleId,domain:'workflow',trackingCode:`TEST-${id}`,title:`مسئولیت ${id}`,description:'',status:'custom_open',priority:'normal',companyId:COMPANY_ID,unitId:'unit-sales',assigneeUserId:'persona-seller',createdByActorId:'actor-original',createdByUserId:'persona-system-admin',updatedByActorId:'actor-original',version:3,payload:{},createdAt:'2026-08-28T00:00:00.000Z',updatedAt:'2026-08-28T00:00:00.000Z',...overrides};
}

async function addResponsibilityFixtures(storage:MemoryStorage){
  const fixtures:Array<[FoundationStoreName,OperationalRecord]>=[
    ['projects',record('continuity-project','project',{assigneeUserId:'persona-seller',payload:{memberUserIds:['persona-seller','persona-system-admin']}})],
    ['tasks',record('continuity-task','task',{payload:{projectId:'continuity-project'}})],
    ['chats',record('continuity-chat','chat',{payload:{kind:'group',ownerUserId:'persona-seller',adminUserIds:['persona-seller'],memberUserIds:['persona-seller','persona-system-admin']}})],
    ['letters',record('continuity-letter','letter',{payload:{recipientUserIds:['persona-seller'],reviewerUserId:'persona-seller'}})],
    ['recruitment_cases',record('continuity-recruitment','recruitment-case',{status:'needs_correction',createdByUserId:'persona-seller'})],
    ['employee_advances',record('continuity-advance','employee-advance')],
    ['purchase_requests',record('continuity-purchase','purchase-request')],
    ['treasury_executions',record('continuity-treasury','treasury-execution')],
    ['offboarding_cases',record('continuity-offboarding','offboarding')],
  ];
  for(const [store,item] of fixtures)await storage.put(store,item);
}

async function makePlan(service:LocalFoundationService,targetUserId='persona-seller',replacementUserId?:string):Promise<WorkContinuityPlan>{
  const state=await service.loadState();const target=state.users.find((user)=>user.id===targetUserId)!;const preview=await service.previewWorkContinuity(targetUserId);
  const structural=new Set(['direct_report','personnel_manager','sales_supervisor','unit_manager','unit_acting_manager']);
  return {schemaVersion:1,targetUserId,targetUserVersionToken:userConcurrencyToken(target),generatedAt:preview.generatedAt,reason:'تحویل کنترل‌شده همه مسئولیت‌های باز',responsibilityIds:preview.responsibilities.map((item)=>item.id),resolutions:preview.responsibilities.map((item)=>({responsibilityId:item.id,action:item.mode==='replacement_required'?'replace':item.mode==='replacement_or_needs_reassignment'?'mark_needs_reassignment':item.mode==='return_to_role_queue'?'return_to_queue':'remove_membership',replacementUserId:item.mode==='replacement_required'?(replacementUserId??(structural.has(item.kind)?'persona-approved-manager':'persona-product-owner')):undefined}))};
}

describe('work continuity engine',()=>{
  afterEach(()=>vi.useRealTimers());
  it('fails closed when a user still owns responsibilities and no plan was approved',async()=>{
    const{storage,service}=await setup();const before=await storage.get<LocalUser>('users','persona-seller');const unit=await storage.get<{managerUserId?:string}>('organizational_units','unit-sales');
    await expect(service.setUserStatus('persona-seller',userConcurrencyToken(before!),'inactive')).rejects.toThrow('برنامه تداوم');
    expect((await storage.get<LocalUser>('users','persona-seller'))?.status).toBe('active');expect((await storage.get<{managerUserId?:string}>('organizational_units','unit-sales'))?.managerUserId).toBe(unit?.managerUserId);
  });

  it('rejects inactive, cross-company and out-of-scope replacements',async()=>{
    const{storage,service}=await setup();
    const admin=await storage.get<LocalUser>('users','persona-product-owner');
    await storage.put('users',{...admin!,id:'replacement-inactive',actorId:'actor-inactive',username:'inactive.replacement',status:'inactive',isAdmin:false});
    await expect(service.setUserStatus('persona-seller',userConcurrencyToken((await service.loadState()).users.find((user)=>user.id==='persona-seller')!),'inactive',await makePlan(service,'persona-seller','replacement-inactive'))).rejects.toThrow('فعال همان شرکت');
    await storage.put('users',{...admin!,id:'replacement-other-company',actorId:'actor-other-company',username:'other.replacement',companyId:'company-other',isAdmin:false});
    await expect(service.setUserStatus('persona-seller',userConcurrencyToken((await service.loadState()).users.find((user)=>user.id==='persona-seller')!),'inactive',await makePlan(service,'persona-seller','replacement-other-company'))).rejects.toThrow('فعال همان شرکت');
    await expect(service.setUserStatus('persona-seller',userConcurrencyToken((await service.loadState()).users.find((user)=>user.id==='persona-seller')!),'inactive',await makePlan(service,'persona-seller','persona-inventory-approver'))).rejects.toThrow(/محدوده|مجوز/);
  });

  it('rejects finance/purchase approvers and ordinary sellers as structural managers',async()=>{
    for(const candidateId of ['persona-purchase-approver','persona-sales-advance-approver','persona-laleh']){
      const{service}=await setup();const target=(await service.loadState()).users.find((user)=>user.id==='persona-seller')!;
      await expect(service.setUserStatus(target.id,userConcurrencyToken(target),'inactive',await makePlan(service,target.id,candidateId))).rejects.toThrow(/مدیریتی|مدیریت پرسنل|فعال همان شرکت|حلقه/);
    }
  });

  it('atomically transfers owners, removes memberships and flags exact responsibilities while preserving makers',async()=>{
    const{storage,service}=await setup();await addResponsibilityFixtures(storage);const plan=await makePlan(service);const target=(await service.loadState()).users.find((user)=>user.id==='persona-seller')!;
    const state=await service.setUserStatus(target.id,userConcurrencyToken(target),'inactive',plan);
    expect(state.users.find((user)=>user.id===target.id)?.status).toBe('inactive');
    expect(state.users.find((user)=>user.id==='persona-sales-senior')?.managerUserId).toBe('persona-approved-manager');
    expect(state.units.find((unit)=>unit.id==='unit-sales')?.managerUserId).toBe('persona-approved-manager');
    const project=await storage.get<OperationalRecord>('projects','continuity-project');expect(project?.assigneeUserId).toBe('persona-product-owner');expect(project?.payload.memberUserIds).not.toContain('persona-seller');
    const chat=await storage.get<OperationalRecord>('chats','continuity-chat');expect(chat?.payload.ownerUserId).toBe('persona-product-owner');expect(chat?.payload.memberUserIds).not.toContain('persona-seller');
    for(const [store,id] of [['tasks','continuity-task'],['letters','continuity-letter'],['recruitment_cases','continuity-recruitment'],['employee_advances','continuity-advance'],['purchase_requests','continuity-purchase'],['treasury_executions','continuity-treasury'],['offboarding_cases','continuity-offboarding']] as const){const item=await storage.get<OperationalRecord>(store,id);expect(item?.payload.needsReassignment).toBe(true);expect(item?.createdByActorId).toBe('actor-original');expect(item?.createdByUserId).toBe(id==='continuity-recruitment'?'persona-seller':'persona-system-admin');}
    const history=await storage.getAll<{recordId:string}>('workflow_history');expect(history.some((item)=>item.recordId==='continuity-task')).toBe(true);
  });

  it('returns role-based work to an eligible queue and refuses an empty queue',async()=>{
    const{storage,service}=await setup();
    await storage.put('employee_advances',record('continuity-queue','employee-advance',{status:'accounting_review',workflowVersion:2}));
    let target=(await service.loadState()).users.find((user)=>user.id==='persona-seller')!;await service.setUserStatus(target.id,userConcurrencyToken(target),'inactive',await makePlan(service));
    const queued=await storage.get<OperationalRecord>('employee_advances','continuity-queue');expect(queued?.assigneeUserId).toBeUndefined();expect(queued?.payload.continuityQueueReturnedAt).toBeTruthy();

    const fresh=await setup();await fresh.storage.put('employee_advances',record('continuity-empty-queue','employee-advance',{status:'accounting_review',workflowVersion:2}));
    const accounting=await fresh.storage.get<LocalUser>('users','persona-advance-accounting');await fresh.storage.put('users',{...accounting!,status:'inactive'});
    target=(await fresh.service.loadState()).users.find((user)=>user.id==='persona-seller')!;
    await expect(fresh.service.setUserStatus(target.id,userConcurrencyToken(target),'inactive',await makePlan(fresh.service))).rejects.toThrow('هیچ کاربر فعال و مجاز');
    expect((await fresh.storage.get<LocalUser>('users',target.id))?.status).toBe('active');
  });

  it('replaces only an unvoted frozen approval seat and preserves the existing vote trail atomically',async()=>{
    const{storage,service}=await setup();const now='2026-08-28T08:00:00.000Z';
    const target=(await storage.get<LocalUser>('users','persona-purchase-approver'))!;
    const targetPersonnel=(await storage.get<PersonnelRecord>('personnel',target.personnelId!))!;
    const replacement:LocalUser={...target,id:'persona-continuity-approval-replacement',actorId:'actor-continuity-approval-replacement',username:'continuity.approval.replacement',name:'جایگزین رأی خرید',personnelId:'personnel-continuity-approval-replacement'};
    await storage.put('users',replacement);await storage.put('personnel',{...targetPersonnel,id:replacement.personnelId!,personnelCode:'P-CONTINUITY-APPROVAL',linkedUserId:replacement.id,managerPersonnelId:targetPersonnel.managerPersonnelId,createdAt:now,updatedAt:now});
    const requester=(await storage.get<LocalUser>('users','persona-purchase-requester'))!;await storage.put('users',{...requester,managerUserId:'persona-product-owner'});
    const requesterPersonnel=(await storage.get<PersonnelRecord>('personnel','personnel-purchase-requester'))!;await storage.put('personnel',{...requesterPersonnel,managerPersonnelId:'personnel-admin',updatedAt:now});
    const administrationUnit=await storage.get<{id:string;managerUserId?:string;updatedAt:string}>('organizational_units','unit-administration');await storage.put('organizational_units',{...administrationUnit!,managerUserId:'persona-product-owner',updatedAt:now});
    const purchaseWorkflow=(await storage.getAll<WorkflowDefinition>('workflow_definitions')).find((item)=>item.moduleId==='purchase-request')!;
    const stage=purchaseWorkflow.approvalStages?.find((item)=>item.stateId==='submitted');
    expect(stage).toBeTruthy();
    if(!stage)throw new Error('مرحله تأیید درخواست خرید در داده آزمون پیدا نشد.');
    const approvalRecord=record('continuity-approval-record','purchase-request',{status:'submitted',assigneeUserId:undefined,workflowVersion:purchaseWorkflow.version,workflowRouteId:'base',version:4,unitId:target.unitId});
    await storage.put('purchase_requests',approvalRecord);
    const round:WorkflowApprovalRound={id:'approval:continuity-seat',recordId:approvalRecord.id,moduleId:approvalRecord.moduleId,companyId:approvalRecord.companyId,workflowVersion:purchaseWorkflow.version,workflowRouteId:'base',stageId:stage.id,stateId:'submitted',entryRecordVersion:approvalRecord.version,mode:'ALL',requiredCount:2,eligibleUserIds:[target.id,'persona-product-owner'],blockedUserIds:[target.id],votes:[{id:'existing-vote',userId:'persona-product-owner',actorId:'actor-product-owner',decision:'approve',reason:'رأی ثبت‌شده قبلی',occurredAt:now,commandId:'existing-vote-command'}],status:'needs_reassignment',version:2,createdAt:now,updatedAt:now};
    await storage.put('workflow_approval_rounds',round);
    const preview=await service.previewWorkContinuity(target.id);
    const seat=preview.responsibilities.find((item)=>item.kind==='workflow_approval_voter'&&item.approvalRoundId===round.id);
    expect(seat).toBeTruthy();
    const plan=await makePlan(service,target.id,replacement.id);
    const current=(await service.loadState()).users.find((user)=>user.id===target.id)!;
    await service.setUserStatus(target.id,userConcurrencyToken(current),'inactive',plan);
    const changed=(await storage.get<WorkflowApprovalRound>('workflow_approval_rounds',round.id))!;
    expect(changed.eligibleUserIds).toContain(replacement.id);expect(changed.eligibleUserIds).not.toContain(target.id);
    expect(changed.votes).toEqual(round.votes);expect(changed.status).toBe('open');
    const histories=await storage.getAll<{recordId:string;eventType:string}>('workflow_history');
    expect(histories.some((item)=>item.recordId===approvalRecord.id&&item.eventType==='approval_electorate_replaced')).toBe(true);
  });

  it('rolls every responsibility back when audit persistence fails',async()=>{
    const{storage,service}=await setup();await addResponsibilityFixtures(storage);const target=(await service.loadState()).users.find((user)=>user.id==='persona-seller')!;const plan=await makePlan(service);storage.failNextPut('audit_events');
    await expect(service.setUserStatus(target.id,userConcurrencyToken(target),'inactive',plan)).rejects.toThrow('injected audit_events failure');
    expect((await storage.get<LocalUser>('users',target.id))?.status).toBe('active');expect((await storage.get<{managerUserId?:string}>('organizational_units','unit-sales'))?.managerUserId).toBe('persona-seller');expect((await storage.get<OperationalRecord>('projects','continuity-project'))?.assigneeUserId).toBe('persona-seller');
  });

  it('re-scans due plans, invalidates the target session and executes exactly once',async()=>{
    const{storage,service}=await setup();const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);const initial=await service.loadState();const person=initial.personnel.find((item)=>item.id==='personnel-arman')!;const plan=await makePlan(service);
    await service.schedulePersonnelEnd(person.id,person.updatedAt,{effectiveDate:toIsoDate(tomorrow),departureInitiator:'organization',reason:'پایان همکاری زمان‌بندی‌شده',continuityPlan:plan});
    const session=await storage.get<FoundationSession>('sessions','active-session');await storage.put('sessions',{...session!,activeUserId:'persona-seller',signedOutAt:undefined,version:session!.version+1});
    vi.useFakeTimers();vi.setSystemTime(new Date(tomorrow.getFullYear(),tomorrow.getMonth(),tomorrow.getDate(),12));
    await service.initialize();await service.initialize();
    expect((await storage.get<LocalUser>('users','persona-seller'))?.status).toBe('inactive');expect((await storage.get<FoundationSession>('sessions','active-session'))?.signedOutAt).toBeTruthy();
    const audits=(await storage.getAll<{action:string;metadata?:Record<string,unknown>}>('audit_events')).filter((item)=>item.action==='organization.personnel.employment_ended_automatically'&&item.metadata?.personnelId===person.id);expect(audits).toHaveLength(1);
  });

  it('keeps a legacy due termination pending and emits one durable needs-action signal',async()=>{
    const{storage,service}=await setup();const person=await storage.get<PersonnelRecord>('personnel','personnel-arman');const now='2026-08-28T02:00:00.000Z';
    await storage.put('personnel',{...person!,employmentStatus:'ending_scheduled',pendingLifecycleChange:{kind:'end',effectiveDate:todayIsoDate(),departureInitiator:'organization',reason:'برنامه قدیمی بدون تحویل مسئولیت',scheduledByActorId:'actor-product-owner',scheduledByActorName:'ایلیا بیات',scheduledAt:now},updatedAt:now});
    await service.initialize();await service.initialize();
    expect((await storage.get<LocalUser>('users','persona-seller'))?.status).toBe('active');expect((await storage.get<PersonnelRecord>('personnel','personnel-arman'))?.pendingLifecycleChange).toBeTruthy();
    const audits=(await storage.getAll<{action:string;metadata?:Record<string,unknown>}>('audit_events')).filter((item)=>item.action==='organization.continuity.needs_action'&&item.metadata?.userId==='persona-seller');expect(audits).toHaveLength(1);
  });

  it('does not deliver a sensitive continuity alert through retained ids of inactive HR roles',async()=>{
    const{storage,service}=await setup();const person=await storage.get<PersonnelRecord>('personnel','personnel-arman');const now='2026-08-28T02:10:00.000Z';
    await storage.put('personnel',{...person!,employmentStatus:'ending_scheduled',pendingLifecycleChange:{kind:'end',effectiveDate:todayIsoDate(),departureInitiator:'organization',reason:'برنامه قدیمی برای آزمون گیرنده امن',scheduledByActorId:'actor-product-owner',scheduledByActorName:'ایلیا بیات',scheduledAt:now},updatedAt:now});
    for(const roleId of ['role-hr-manager','role-personnel-reviewer']){const role=await storage.get<SecurityRole>('security_roles',roleId);await storage.put('security_roles',{...role!,status:'inactive'});}
    await service.initialize();
    const notifications=await storage.getAll<{userId:string;dedupeKey?:string}>('notifications');
    expect(notifications.filter((item)=>item.dedupeKey?.startsWith('continuity-needs-action:persona-seller:')&&['persona-hr-manager','persona-personnel-reviewer'].includes(item.userId))).toEqual([]);
  });

  it('re-scans a pinned future plan and pauses safely when a new responsibility appeared',async()=>{
    const{storage,service}=await setup();const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);const state=await service.loadState();const person=state.personnel.find((item)=>item.id==='personnel-arman')!;const plan=await makePlan(service);
    await service.schedulePersonnelEnd(person.id,person.updatedAt,{effectiveDate:toIsoDate(tomorrow),departureInitiator:'organization',reason:'برنامه آتی نیازمند بازبینی',continuityPlan:plan});
    await storage.put('tasks',record('late-continuity-task','task',{payload:{projectId:'late-project'}}));
    vi.useFakeTimers();vi.setSystemTime(new Date(tomorrow.getFullYear(),tomorrow.getMonth(),tomorrow.getDate(),12));
    await service.initialize();await service.initialize();
    expect((await storage.get<LocalUser>('users','persona-seller'))?.status).toBe('active');expect((await storage.get<PersonnelRecord>('personnel','personnel-arman'))?.pendingLifecycleChange).toBeTruthy();
    const audits=(await storage.getAll<{action:string;metadata?:Record<string,unknown>}>('audit_events')).filter((item)=>item.action==='organization.continuity.needs_action'&&item.metadata?.userId==='persona-seller');expect(audits).toHaveLength(1);
  });

  it('never discovers or mutates a sent letter, including its reviewer and recipients',async()=>{
    const{storage,service}=await setup();
    const sent=record('continuity-sent-letter','letter',{status:'sent',assigneeUserId:'persona-seller',payload:{direction:'internal',classification:'normal',body:'متن قطعی نامه',recipientUserIds:['persona-seller'],reviewerUserId:'persona-seller',senderSignature:{kind:'system-sha256-v1',digestSha256:'fixed'}}});
    await storage.put('letters',sent);const before=structuredClone(await storage.get<OperationalRecord>('letters',sent.id));
    const preview=await service.previewWorkContinuity('persona-seller');
    expect(preview.responsibilities.some((item)=>item.resourceId===sent.id)).toBe(false);
    const target=(await service.loadState()).users.find((user)=>user.id==='persona-seller')!;
    await service.setUserStatus(target.id,userConcurrencyToken(target),'inactive',await makePlan(service));
    expect(await storage.get<OperationalRecord>('letters',sent.id)).toEqual(before);
  });

  it('never discovers or mutates a completed task',async()=>{
    const{storage,service}=await setup();const completed=record('continuity-done-task','task',{status:'done',payload:{projectId:'closed-project',checklist:[{id:'one',title:'پایان یافته',done:true}]}});
    await storage.put('tasks',completed);const before=structuredClone(await storage.get<OperationalRecord>('tasks',completed.id));
    expect((await service.previewWorkContinuity('persona-seller')).responsibilities.some((item)=>item.resourceId===completed.id)).toBe(false);
    const target=(await service.loadState()).users.find((user)=>user.id==='persona-seller')!;
    await service.setUserStatus(target.id,userConcurrencyToken(target),'inactive',await makePlan(service));
    expect(await storage.get<OperationalRecord>('tasks',completed.id)).toEqual(before);
  });

  it('rejects duplicate decisions and management cycles before writing anything',async()=>{
    const{storage,service}=await setup();const target=(await service.loadState()).users.find((user)=>user.id==='persona-seller')!;
    const duplicate=await makePlan(service);duplicate.resolutions.push({...duplicate.resolutions[0]});
    await expect(service.setUserStatus(target.id,userConcurrencyToken(target),'inactive',duplicate)).rejects.toThrow(/دقیقاً|تکراری/);
    const cyclic=await makePlan(service);const direct=(await service.previewWorkContinuity(target.id)).responsibilities.find((item)=>item.kind==='personnel_manager')!;
    const reportPersonnel=(await service.loadState()).personnel.find((person)=>person.id===direct.resourceId)!;
    const choice=cyclic.resolutions.find((item)=>item.responsibilityId===direct.id)!;choice.action='replace';choice.replacementUserId=reportPersonnel.linkedUserId;
    await expect(service.setUserStatus(target.id,userConcurrencyToken(target),'inactive',cyclic)).rejects.toThrow('حلقه');
    expect((await storage.get<LocalUser>('users',target.id))?.status).toBe('active');
  });

  it('rejects a mixed account/personnel/sales-supervisor management cycle',async()=>{
    const{storage,service}=await setup();const approved=await storage.get<PersonnelRecord>('personnel','personnel-approved-manager');
    await storage.put('personnel',{...approved!,salesSupervisorPersonnelId:'personnel-sales-senior',updatedAt:'2026-08-28T03:00:00.000Z'});
    const target=(await service.loadState()).users.find((user)=>user.id==='persona-seller')!;
    await expect(service.setUserStatus(target.id,userConcurrencyToken(target),'inactive',await makePlan(service))).rejects.toThrow('حلقه');
    expect((await storage.get<LocalUser>('users',target.id))?.status).toBe('active');
  });

  it('rejects a mixed cycle through an unlinked personnel report',async()=>{
    const{storage,service}=await setup();const state=await service.loadState();
    const sellerPersonnel=state.personnel.find((item)=>item.id==='personnel-arman')!;
    const approvedUser=state.users.find((item)=>item.id==='persona-approved-manager')!;
    const approvedPersonnel=state.personnel.find((item)=>item.id==='personnel-approved-manager')!;
    const now='2026-08-28T04:00:00.000Z';
    await storage.put('personnel',{...sellerPersonnel,id:'personnel-unlinked-report',personnelCode:'P-UNLINKED',linkedUserId:undefined,managerPersonnelId:sellerPersonnel.id,salesSupervisorPersonnelId:undefined,createdAt:now,updatedAt:now});
    await storage.put('users',{...approvedUser,id:'persona-cycle-manager',actorId:'actor-cycle-manager',username:'cycle.manager',personnelId:'personnel-cycle-manager'});
    await storage.put('personnel',{...approvedPersonnel,id:'personnel-cycle-manager',personnelCode:'P-CYCLE-MANAGER',linkedUserId:'persona-cycle-manager',salesSupervisorPersonnelId:'personnel-unlinked-report',createdAt:now,updatedAt:now});
    const preview=await service.previewWorkContinuity('persona-seller');const responsibility=preview.responsibilities.find((item)=>item.kind==='personnel_manager'&&item.resourceId==='personnel-unlinked-report')!;
    const plan=await makePlan(service);const choice=plan.resolutions.find((item)=>item.responsibilityId===responsibility.id)!;choice.action='replace';choice.replacementUserId='persona-cycle-manager';
    const target=(await service.loadState()).users.find((user)=>user.id==='persona-seller')!;
    await expect(service.setUserStatus(target.id,userConcurrencyToken(target),'inactive',plan)).rejects.toThrow('حلقه');
    expect((await storage.get<LocalUser>('users',target.id))?.status).toBe('active');
  });

  it('rejects a management cycle created only by the cumulative plan',async()=>{
    const{storage,service}=await setup();await addTwoManagerReports(storage);const preview=await service.previewWorkContinuity('persona-seller');const plan=await makePlan(service);
    const reportA=preview.responsibilities.find((item)=>item.kind==='personnel_manager'&&item.resourceId==='personnel-manager-a')!;const reportB=preview.responsibilities.find((item)=>item.kind==='personnel_manager'&&item.resourceId==='personnel-manager-b')!;
    const decisionA=plan.resolutions.find((item)=>item.responsibilityId===reportA.id)!;decisionA.action='replace';decisionA.replacementUserId='persona-manager-b';const decisionB=plan.resolutions.find((item)=>item.responsibilityId===reportB.id)!;decisionB.action='replace';decisionB.replacementUserId='persona-manager-a';
    const target=(await service.loadState()).users.find((item)=>item.id==='persona-seller')!;const beforeA=await storage.get<PersonnelRecord>('personnel','personnel-manager-a');const beforeB=await storage.get<PersonnelRecord>('personnel','personnel-manager-b');
    await expect(service.setUserStatus(target.id,userConcurrencyToken(target),'inactive',plan)).rejects.toThrow('حلقه');expect(await storage.get<PersonnelRecord>('personnel','personnel-manager-a')).toEqual(beforeA);expect(await storage.get<PersonnelRecord>('personnel','personnel-manager-b')).toEqual(beforeB);
  });

  it('accepts an acyclic cumulative management plan',async()=>{
    const{storage,service}=await setup();await addTwoManagerReports(storage);const preview=await service.previewWorkContinuity('persona-seller');const plan=await makePlan(service);
    for(const resourceId of ['personnel-manager-a','personnel-manager-b']){const responsibility=preview.responsibilities.find((item)=>item.kind==='personnel_manager'&&item.resourceId===resourceId)!;const decision=plan.resolutions.find((item)=>item.responsibilityId===responsibility.id)!;decision.action='replace';decision.replacementUserId='persona-approved-manager';}
    const target=(await service.loadState()).users.find((item)=>item.id==='persona-seller')!;await service.setUserStatus(target.id,userConcurrencyToken(target),'inactive',plan);
    expect((await storage.get<PersonnelRecord>('personnel','personnel-manager-a'))?.managerPersonnelId).toBe('personnel-approved-manager');expect((await storage.get<PersonnelRecord>('personnel','personnel-manager-b'))?.managerPersonnelId).toBe('personnel-approved-manager');
  });

  it('canonicalizes recruitment correction ownership and preserves a future financial correction recipient',async()=>{
    const{storage,service}=await setup();
    await storage.put('recruitment_cases',record('canonical-recruitment','recruitment-case',{status:'needs_correction',assigneeUserId:'persona-seller',createdByUserId:'persona-seller'}));
    await storage.put('employee_advances',record('future-correction','employee-advance',{status:'accounting_review',workflowVersion:2,assigneeUserId:'persona-advance-accounting',payload:{beneficiaryUserId:'persona-seller'}}));
    const preview=await service.previewWorkContinuity('persona-seller');
    expect(preview.responsibilities.filter((item)=>item.resourceId==='canonical-recruitment')).toHaveLength(1);
    expect(preview.responsibilities.find((item)=>item.resourceId==='canonical-recruitment')?.kind).toBe('recruitment_correction_recipient');
    const correction=preview.responsibilities.find((item)=>item.resourceId==='future-correction'&&item.kind==='workflow_correction_recipient');expect(correction).toBeTruthy();
    const plan=await makePlan(service);const resolution=plan.resolutions.find((item)=>item.responsibilityId===correction!.id)!;resolution.action='replace';resolution.replacementUserId='persona-product-owner';
    const target=(await service.loadState()).users.find((user)=>user.id==='persona-seller')!;await service.setUserStatus(target.id,userConcurrencyToken(target),'inactive',plan);
    const advance=await storage.get<OperationalRecord>('employee_advances','future-correction');expect(advance?.assigneeUserId).toBe('persona-advance-accounting');expect(advance?.payload.continuityCorrectionRecipientUserId).toBe('persona-product-owner');
  });

  it('does not let a maker satisfy an approval queue merely because it has the stage role',async()=>{
    const{storage,service}=await setup();
    await storage.put('employee_advances',record('maker-queue','employee-advance',{status:'accounting_review',workflowVersion:2,createdByActorId:'actor-advance-accounting'}));
    const target=(await service.loadState()).users.find((user)=>user.id==='persona-seller')!;
    await expect(service.setUserStatus(target.id,userConcurrencyToken(target),'inactive',await makePlan(service))).rejects.toThrow('هیچ کاربر فعال و مجاز');
    expect((await storage.get<OperationalRecord>('employee_advances','maker-queue'))?.assigneeUserId).toBe('persona-seller');
  });

  it('allows the explicit continuity successor to edit a draft without changing its maker',async()=>{
    const{storage,service}=await setup();
    await storage.put('letters',record('successor-letter','letter',{status:'draft',payload:{direction:'internal',classification:'normal',body:'متن اولیه نامه',recipientUserIds:['persona-laleh']}}));
    const plan=await makePlan(service);const preview=await service.previewWorkContinuity('persona-seller');const responsibility=preview.responsibilities.find((item)=>item.kind==='letter_assignee'&&item.resourceId==='successor-letter')!;
    const resolution=plan.resolutions.find((item)=>item.responsibilityId===responsibility.id)!;resolution.action='replace';resolution.replacementUserId='persona-product-owner';
    const target=(await service.loadState()).users.find((user)=>user.id==='persona-seller')!;await service.setUserStatus(target.id,userConcurrencyToken(target),'inactive',plan);
    const assigned=await storage.get<OperationalRecord>('letters','successor-letter');expect(assigned?.assigneeUserId).toBe('persona-product-owner');
    await service.updateLetter('successor-letter',assigned!.version,{direction:'internal',classification:'normal',subject:'نامه ویرایش‌شده جانشین',body:'متن کامل ویرایش‌شده توسط مسئول صریح جدید',recipientUserIds:['persona-laleh']});
    const edited=await storage.get<OperationalRecord>('letters','successor-letter');expect(edited?.title).toBe('نامه ویرایش‌شده جانشین');expect(edited?.createdByActorId).toBe('actor-original');
  });

  it('repairs a needs-reassignment hold atomically and the successor can act',async()=>{
    const{storage,service}=await setup();
    await storage.put('tasks',record('repairable-task','task',{status:'todo',payload:{}}));
    const plan=await makePlan(service);const preview=await service.previewWorkContinuity('persona-seller');const responsibility=preview.responsibilities.find((item)=>item.resourceId==='repairable-task')!;
    expect(plan.resolutions.find((item)=>item.responsibilityId===responsibility.id)?.action).toBe('mark_needs_reassignment');
    const target=(await service.loadState()).users.find((user)=>user.id==='persona-seller')!;await service.setUserStatus(target.id,userConcurrencyToken(target),'inactive',plan);
    let task=await storage.get<OperationalRecord>('tasks','repairable-task');expect(task?.payload.needsReassignment).toBe(true);expect(task?.assigneeUserId).toBeUndefined();
    const commandId='continuity-repair-task-stable';
    const beforeRepair=structuredClone(task);storage.failNextPut('audit_events');
    await expect(service.resolveContinuityReassignment('task',task!.id,'project_task_assignee','persona-product-owner',task!.version,'تعیین مسئول فعال پس از خروج',commandId)).rejects.toThrow('injected audit_events failure');
    expect(await storage.get<OperationalRecord>('tasks','repairable-task')).toEqual(beforeRepair);
    await service.resolveContinuityReassignment('task',task!.id,'project_task_assignee','persona-product-owner',task!.version,'تعیین مسئول فعال پس از خروج',commandId);
    await expect(service.resolveContinuityReassignment('task',task!.id,'project_task_assignee','persona-product-owner',task!.version,'تعیین مسئول فعال پس از خروج',commandId)).resolves.toBeTruthy();
    task=await storage.get<OperationalRecord>('tasks','repairable-task');expect(task?.payload.needsReassignment).toBe(false);expect(task?.assigneeUserId).toBe('persona-product-owner');
    await service.updateOperationalRecord('task',task!.id,task!.version,{title:'کار ادامه‌یافته توسط جانشین',description:'',priority:'normal'},'continuity-repair-task-act');
    expect((await storage.get<OperationalRecord>('tasks','repairable-task'))?.title).toBe('کار ادامه‌یافته توسط جانشین');
  });

  it('keeps continuity holds and protected markers immutable through generic edits and assignments',async()=>{
    const{storage,service}=await setup();
    const held=record('generic-held-task','task',{status:'todo',assigneeUserId:'persona-training-yasin',payload:{needsReassignment:true,previousAssigneeUserId:'persona-seller',nested:{continuityCorrectionRecipientUserId:'persona-seller'}}});
    await storage.put('tasks',held);const before=structuredClone(held);
    await switchActiveUser(storage,'persona-training-yasin');
    await expect(service.updateOperationalRecord('task',held.id,held.version,{title:'تلاش برای پاک‌کردن توقف',payload:{needsReassignment:false,previousAssigneeUserId:null}},'generic-hold-marker-bypass')).rejects.toThrow('فیلدهای سیستمی تداوم');
    await expect(service.updateOperationalRecord('task',held.id,held.version,{title:'تلاش برای ویرایش در حالت توقف'},'generic-hold-edit-bypass')).rejects.toThrow('تعیین همه مسئولان');
    await expect(service.updateOperationalRecord('task',held.id,held.version,{title:'تلاش بازگشتی',payload:{safe:{continuitySpecificAssigneeUserId:'persona-training-yasin'}}},'generic-hold-nested-bypass')).rejects.toThrow('فیلدهای سیستمی تداوم');
    const transition=(await service.loadState()).workflows.find((item)=>item.moduleId==='task')!.transitions.find((item)=>item.from.includes('todo'))!;
    await expect(service.transitionOperationalRecord('task',held.id,transition.id,'تلاش تغییر وضعیت در حالت توقف','generic-hold-transition-bypass')).rejects.toThrow('تعیین همه مسئولان');
    expect(await storage.get<OperationalRecord>('tasks',held.id)).toEqual(before);
    await switchActiveUser(storage,'persona-product-owner');
    await expect(service.assignOperationalRecord('task',held.id,'persona-product-owner','تلاش تخصیص از مسیر عمومی',held.version,'generic-hold-assign-bypass')).rejects.toThrow('تعیین همه مسئولان');
    expect(await storage.get<OperationalRecord>('tasks',held.id)).toEqual(before);
  });

  it('does not let ordinary project-task editing clear a continuity hold or change its assignee',async()=>{
    const{storage,service}=await setup();
    const project=record('held-edit-project','project',{assigneeUserId:'persona-product-owner',payload:{memberUserIds:['persona-product-owner','persona-seller']}});await storage.put('projects',project);
    const task=record('held-edit-project-task','task',{assigneeUserId:'persona-seller',payload:{projectId:project.id,needsReassignment:true,previousAssigneeUserId:'persona-former',labels:['مهم']}});await storage.put('tasks',task);const before=structuredClone(task);
    await expect(service.updateProjectTask(task.id,{title:'ویرایش دورزننده وظیفه',description:'نباید ذخیره شود',priority:'high',assigneeUserId:'persona-product-owner',labels:['تغییریافته']},task.version)).rejects.toThrow('تعیین همه مسئولان');
    expect(await storage.get<OperationalRecord>('tasks',task.id)).toEqual(before);
  });

  it('repairs pending letter recipient and reviewer references without changing its maker or unrelated assignee',async()=>{
    const{storage,service}=await setup();
    const letter=record('repair-letter','letter',{status:'in_review',assigneeUserId:'persona-advance-accounting',payload:{needsReassignment:true,previousRecipientUserId:'persona-seller',previousReviewerUserId:'persona-seller',recipientUserIds:[],reviewerUserId:null}});
    await storage.put('letters',letter);
    await service.resolveContinuityReassignment('letter',letter.id,'letter_recipient','persona-product-owner',letter.version,'تعیین گیرنده فعال نامه');
    const recipientRepaired=await storage.get<OperationalRecord>('letters',letter.id);
    expect(recipientRepaired?.payload.recipientUserIds).toEqual(['persona-product-owner']);
    expect(recipientRepaired?.payload.reviewerUserId).toBeNull();
    expect(recipientRepaired?.payload.previousReviewerUserId).toBe('persona-seller');
    expect(recipientRepaired?.payload.needsReassignment).toBe(true);
    await service.resolveContinuityReassignment('letter',letter.id,'letter_reviewer','persona-product-owner',recipientRepaired!.version,'تعیین بازبین فعال نامه');
    const repaired=await storage.get<OperationalRecord>('letters',letter.id);
    expect(repaired?.payload.reviewerUserId).toBe('persona-product-owner');
    expect(repaired?.payload.needsReassignment).toBe(false);
    expect(repaired?.assigneeUserId).toBe('persona-advance-accounting');
    expect(repaired?.createdByActorId).toBe('actor-original');
  });

  it('repairs independent correction and assignee markers without widening authority',async()=>{
    const{storage,service}=await setup();const state=await service.loadState();
    const advance=record('multi-marker-advance','employee-advance',{status:'accounting_review',assigneeUserId:undefined,workflowVersion:state.workflows.find((item)=>item.moduleId==='employee-advance')?.version,payload:{needsReassignment:true,previousAssigneeUserId:'persona-seller',previousCorrectionRecipientUserId:'persona-seller',continuityCorrectionRecipientUserId:null,beneficiaryUserId:'persona-seller',beneficiaryPersonnelId:'personnel-arman',branchUnitId:'unit-branch-central',unitId:'unit-sales'}});
    await storage.put('employee_advances',advance);
    await service.resolveContinuityReassignment('employee-advance',advance.id,'workflow_correction_recipient','persona-product-owner',advance.version,'تعیین مسئول مستقل اصلاح');
    const correction=await storage.get<OperationalRecord>('employee_advances',advance.id);
    expect(correction?.payload.continuityCorrectionRecipientUserId).toBe('persona-product-owner');expect(correction?.assigneeUserId).toBeUndefined();expect(correction?.payload.previousAssigneeUserId).toBe('persona-seller');expect(correction?.payload.needsReassignment).toBe(true);
    await service.resolveContinuityReassignment('employee-advance',advance.id,'workflow_assignee','persona-advance-accounting',correction!.version,'تعیین مسئول مستقل مرحله');
    const repaired=await storage.get<OperationalRecord>('employee_advances',advance.id);expect(repaired?.assigneeUserId).toBe('persona-advance-accounting');expect(repaired?.payload.continuityCorrectionRecipientUserId).toBe('persona-product-owner');expect(repaired?.payload.needsReassignment).toBe(false);
  });

  it('aligns a repaired recruitment correction recipient with the actionable assignee',async()=>{
    const{storage,service}=await setup();const recruitment=record('repair-recruitment-correction','recruitment-case',{status:'needs_correction',unitId:'unit-human-resources',assigneeUserId:undefined,createdByUserId:'persona-seller',payload:{needsReassignment:true,previousCorrectionRecipientUserId:'persona-seller',continuityCorrectionRecipientUserId:null,candidateName:'متقاضی آزمون تداوم'}});await storage.put('recruitment_cases',recruitment);
    await switchActiveUser(storage,'persona-callcenter-a');expect((await service.loadState()).operationalRecords.some((item)=>item.id===recruitment.id)).toBe(false);await expect(service.transitionRecruitmentCase(recruitment.id,'recruitment-case.submitted','اقدام نامجاز')).rejects.toThrow();
    await switchActiveUser(storage,'persona-product-owner');await service.resolveContinuityReassignment('recruitment-case',recruitment.id,'recruitment_correction_recipient','persona-hr-operator',recruitment.version,'تعیین جانشین اصلاح پرونده جذب');
    const repaired=await storage.get<OperationalRecord>('recruitment_cases',recruitment.id);expect(repaired?.assigneeUserId).toBe('persona-hr-operator');expect(repaired?.payload.continuityCorrectionRecipientUserId).toBe('persona-hr-operator');expect(repaired?.createdByActorId).toBe('actor-original');expect(repaired?.createdByUserId).toBe('persona-seller');
    await switchActiveUser(storage,'persona-hr-operator');const successorState=await service.loadState();const visible=successorState.operationalRecords.find((item)=>item.id===recruitment.id);expect(visible).toBeTruthy();const workflow=successorState.workflows.find((item)=>item.moduleId==='recruitment-case')!;const transition=workflow.transitions.find((item)=>item.from.includes('needs_correction'))!;
    await service.transitionRecruitmentCase(recruitment.id,transition.id,'اصلاح پرونده توسط جانشین مجاز');const transitioned=await storage.get<OperationalRecord>('recruitment_cases',recruitment.id);expect(transitioned?.status).toBe(transition.to);expect(transitioned?.createdByActorId).toBe('actor-original');expect(transitioned?.createdByUserId).toBe('persona-seller');
  });

  it('rejects repair of terminal records and blocks business transitions until repair',async()=>{
    const{storage,service}=await setup();const state=await service.loadState();
    const sent=record('terminal-repair-letter','letter',{status:'sent',assigneeUserId:undefined,payload:{needsReassignment:true,previousRecipientUserId:'persona-seller',recipientUserIds:[]}});await storage.put('letters',sent);const sentBefore=structuredClone(sent);
    await expect(service.resolveContinuityReassignment('letter',sent.id,'letter_recipient','persona-product-owner',sent.version,'تلاش تعمیر نامه نهایی')).rejects.toThrow('نهایی');expect(await storage.get<OperationalRecord>('letters',sent.id)).toEqual(sentBefore);
    const project=record('repair-project-parent','project',{assigneeUserId:'persona-product-owner',payload:{memberUserIds:['persona-product-owner','persona-seller']}});await storage.put('projects',project);
    const taskWorkflow=state.workflowVersions.find((item)=>item.moduleId==='task')!;
    const held=record('held-task-transition','task',{status:'in_progress',workflowVersion:taskWorkflow.version,payload:{projectId:project.id,needsReassignment:true,previousAssigneeUserId:'persona-former',checklist:[]}});await storage.put('tasks',held);const heldBefore=structuredClone(held);
    await expect(service.transitionProjectTask(held.id,'done','تلاش پایان پیش از تعمیر',held.version)).rejects.toThrow('تعیین همه مسئولان');expect(await storage.get<OperationalRecord>('tasks',held.id)).toEqual(heldBefore);
    const done={...held,id:'terminal-task-repair',status:'done'};await storage.put('tasks',done);const doneBefore=structuredClone(done);
    await expect(service.resolveContinuityReassignment('task',done.id,'project_task_assignee','persona-product-owner',done.version,'تلاش تعمیر کار نهایی')).rejects.toThrow('نهایی');expect(await storage.get<OperationalRecord>('tasks',done.id)).toEqual(doneBefore);
  });

  it('requires project membership for both repair actor and replacement',async()=>{
    const{storage,service}=await setup();
    const project=record('repair-member-project','project',{assigneeUserId:'persona-product-owner',payload:{memberUserIds:['persona-product-owner','persona-seller']}});await storage.put('projects',project);
    const task=record('repair-member-task','task',{assigneeUserId:undefined,payload:{projectId:project.id,needsReassignment:true,previousAssigneeUserId:'persona-seller'}});await storage.put('tasks',task);
    await expect(service.resolveContinuityReassignment('task',task.id,'project_task_assignee','persona-advance-accounting',task.version,'نامزد بیرون از پروژه')).rejects.toThrow('مرحله و محدوده');
    await service.resolveContinuityReassignment('task',task.id,'project_task_assignee','persona-product-owner',task.version,'عضو مجاز پروژه');
    expect((await storage.get<OperationalRecord>('tasks',task.id))?.assigneeUserId).toBe('persona-product-owner');
  });

  it('uses canonical branch-manager mode and validates against the post-plan unit handover',async()=>{
    const{storage,service}=await setup();const state=await service.loadState();const baseUser=state.users.find((item)=>item.id==='persona-advance-branch-manager')!;const basePersonnel=state.personnel.find((item)=>item.id==='personnel-advance-branch-manager')!;const now='2026-08-28T05:00:00.000Z';
    await storage.put('users',{...baseUser,id:'persona-departing-branch-manager',actorId:'actor-departing-branch-manager',username:'departing.branch.manager',personnelId:'personnel-departing-branch-manager'});
    await storage.put('personnel',{...basePersonnel,id:'personnel-departing-branch-manager',personnelCode:'P-DEPART-BRANCH',linkedUserId:'persona-departing-branch-manager',createdAt:now,updatedAt:now});
    const branch=state.units.find((item)=>item.id==='unit-branch-central')!;await storage.put('organizational_units',{...branch,managerUserId:'persona-departing-branch-manager',updatedAt:now});
    const workflow=state.workflows.find((item)=>item.moduleId==='employee-advance')!;const withoutMode:WorkflowDefinition={...workflow,approvalStages:workflow.approvalStages?.map((stage)=>stage.stateId==='branch_review'?{...stage,assignmentMode:undefined}:stage)};await storage.put('workflow_definitions',withoutMode);
    const advance=record('branch-manager-handover','employee-advance',{status:'branch_review',workflowVersion:withoutMode.version,branchUnitId:branch.id,assigneeUserId:'persona-departing-branch-manager',payload:{beneficiaryUserId:'persona-seller',beneficiaryPersonnelId:'personnel-arman',branchUnitId:branch.id,unitId:'unit-sales'}});await storage.put('employee_advances',advance);
    const preview=await service.previewWorkContinuity('persona-departing-branch-manager');expect(preview.responsibilities.find((item)=>item.resourceId===advance.id)?.mode).toBe('replacement_or_needs_reassignment');
    const target=(await service.loadState()).users.find((item)=>item.id==='persona-departing-branch-manager')!;const plan=await makePlan(service,target.id);for(const resolution of plan.resolutions){const responsibility=preview.responsibilities.find((item)=>item.id===resolution.responsibilityId);if(responsibility?.kind==='unit_manager'||responsibility?.resourceId===advance.id){resolution.action='replace';resolution.replacementUserId='persona-advance-branch-manager';}}
    await service.setUserStatus(target.id,userConcurrencyToken(target),'inactive',plan);
    expect((await storage.get<{managerUserId?:string}>('organizational_units',branch.id))?.managerUserId).toBe('persona-advance-branch-manager');expect((await storage.get<OperationalRecord>('employee_advances',advance.id))?.assigneeUserId).toBe('persona-advance-branch-manager');
  });

  it('requires explicit repair for a departing specific-user stage and keeps the successor operable',async()=>{
    const{storage,service}=await setup();const state=await service.loadState();const now='2026-08-28T06:00:00.000Z';const seller=state.users.find((item)=>item.id==='persona-seller')!;
    await storage.put('users',{...seller,id:'persona-specific-stage-owner',actorId:'actor-specific-stage-owner',username:'specific.stage.owner',personnelId:undefined,managerUserId:'persona-product-owner'});
    const workflow=state.workflows.find((item)=>item.moduleId==='employee-advance')!;const specific:WorkflowDefinition={...workflow,approvalStages:workflow.approvalStages?.map((stage)=>stage.stateId==='accounting_review'?{...stage,assignmentMode:'specific_user',assigneeUserId:'persona-specific-stage-owner'}:stage),updatedAt:now};await storage.put('workflow_definitions',specific);
    const advance=record('specific-stage-advance','employee-advance',{status:'accounting_review',workflowVersion:specific.version,assigneeUserId:'persona-specific-stage-owner',amountRial:'1000000',payload:{beneficiaryUserId:'persona-seller',beneficiaryPersonnelId:'personnel-arman',branchUnitId:'unit-branch-central',unitId:'unit-sales'}});await storage.put('employee_advances',advance);
    const preview=await service.previewWorkContinuity('persona-specific-stage-owner');const responsibility=preview.responsibilities.find((item)=>item.resourceId===advance.id&&item.kind==='workflow_assignee')!;expect(responsibility.mode).toBe('replacement_required');
    const target=(await service.loadState()).users.find((item)=>item.id==='persona-specific-stage-owner')!;const plan=await makePlan(service,target.id);const resolution=plan.resolutions.find((item)=>item.responsibilityId===responsibility.id)!;resolution.action='replace';resolution.replacementUserId='persona-advance-accounting';await service.setUserStatus(target.id,userConcurrencyToken(target),'inactive',plan);
    const handed=await storage.get<OperationalRecord>('employee_advances',advance.id);expect(handed?.payload.continuitySpecificAssigneeUserId).toBe('persona-advance-accounting');expect(handed?.payload.continuitySpecificAssigneeState).toBe('accounting_review');await switchActiveUser(storage,'persona-advance-accounting');
    await service.decideEmployeeAdvance(advance.id,'needs_correction','بازگشت کنترل‌شده برای اصلاح',undefined,handed!.version,'specific-stage-successor-decision');expect((await storage.get<OperationalRecord>('employee_advances',advance.id))?.status).toBe('needs_correction');
  });

  it('uses specialized stage eligibility when repairing advance, purchase and treasury holds',async()=>{
    const{storage,service}=await setup();const state=await service.loadState();
    const advance=record('repair-advance','employee-advance',{status:'accounting_review',assigneeUserId:undefined,workflowVersion:state.workflows.find((item)=>item.moduleId==='employee-advance')?.version,payload:{needsReassignment:true,previousAssigneeUserId:'persona-seller',beneficiaryUserId:'persona-seller',beneficiaryPersonnelId:'personnel-arman',branchUnitId:'unit-branch-central',unitId:'unit-sales'}});
    await storage.put('employee_advances',advance);
    await expect(service.resolveContinuityReassignment('employee-advance',advance.id,'workflow_assignee','persona-product-owner',advance.version,'جانشین نامعتبر مرحله حسابداری')).rejects.toThrow('مرحله و محدوده');
    await service.resolveContinuityReassignment('employee-advance',advance.id,'workflow_assignee','persona-advance-accounting',advance.version,'جانشین معتبر مرحله حسابداری');
    expect((await storage.get<OperationalRecord>('employee_advances',advance.id))?.assigneeUserId).toBe('persona-advance-accounting');

    const purchase=(await storage.get<OperationalRecord>('purchase_requests','demo-purchase-request-1'))!;
    const waitingPurchase={...purchase,status:'submitted',assigneeUserId:undefined,version:purchase.version+1,payload:{...purchase.payload,needsReassignment:true,previousAssigneeUserId:'persona-purchase-approver'}};
    await storage.put('purchase_requests',waitingPurchase);
    await service.resolveContinuityReassignment('purchase-request',purchase.id,'workflow_assignee','persona-purchase-approver',waitingPurchase.version,'تعیین تأییدکننده مجاز خرید');
    expect((await storage.get<OperationalRecord>('purchase_requests',purchase.id))?.assigneeUserId).toBe('persona-purchase-approver');

    const treasury=record('repair-treasury','treasury-execution',{status:'queued',assigneeUserId:undefined,workflowVersion:state.workflows.find((item)=>item.moduleId==='treasury-execution')?.version,payload:{needsReassignment:true,previousAssigneeUserId:'persona-seller'}});
    await storage.put('treasury_executions',treasury);
    await expect(service.resolveContinuityReassignment('treasury-execution',treasury.id,'treasury_executor','persona-purchase-approver',treasury.version,'مجری نامعتبر خزانه')).rejects.toThrow('مرحله و محدوده');
    await service.resolveContinuityReassignment('treasury-execution',treasury.id,'treasury_executor','persona-treasury-executor',treasury.version,'مجری معتبر خزانه');
    expect((await storage.get<OperationalRecord>('treasury_executions',treasury.id))?.assigneeUserId).toBe('persona-treasury-executor');
  });
});
