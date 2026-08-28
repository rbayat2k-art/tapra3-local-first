import 'fake-indexeddb/auto';
import {describe, expect, it} from 'vitest';
import {can} from './authorization';
import type {AuditEvent, CustomerImportJob, CustomerRecord, FoundationSession, FoundationStoreName, LocalUser, OperationalRecord, OperationalRecordHistory, OrganizationalPosition, OrganizationalUnit, PersonnelProfileChangeRequest, PersonnelRecord, RegistrationRequest, SalesStructure, SecurityRole, SnapshotManifest, WorkflowApprovalRound, WorkflowApprovalStageDefinition, WorkflowDefinition} from './model';
import {createSeedData} from './seed';
import {LocalFoundationService, userConcurrencyToken, type CustomerImportRow} from './service';
import {decryptSnapshot, IndexedDBAdapter, type StorageAdapter, type StorageTransaction} from './storage';
import {permissionFor} from './erpCatalog';
import {todayIsoDate} from './PersianDate';
import {createApprovalRound} from './workflowApprovals';

class InterceptingStorage implements StorageAdapter {
  beforeNextReadwrite?: () => Promise<void>;
  failNextPutStore?: FoundationStoreName;
  failReadAfterCommandId?:string;
  private failNextReadonly=false;

  constructor(readonly base: StorageAdapter) {}

  private rejectInjectedReadonly<T>():Promise<T>|undefined {
    if(!this.failNextReadonly)return undefined;
    this.failNextReadonly=false;
    return Promise.reject(new Error('injected post-commit read failure'));
  }

  async transaction<T>(stores: FoundationStoreName[], mode: IDBTransactionMode, work: (transaction: StorageTransaction) => Promise<T>): Promise<T> {
    if(mode==='readonly'&&this.failNextReadonly){this.failNextReadonly=false;throw new Error('injected post-commit read failure');}
    if (mode === 'readwrite' && this.beforeNextReadwrite) {
      const before = this.beforeNextReadwrite;
      this.beforeNextReadwrite = undefined;
      await before();
    }
    return this.base.transaction(stores, mode, (transaction) => work({
      ...transaction,
      put: async (store, value) => {
        if (this.failNextPutStore === store) {
          this.failNextPutStore = undefined;
          throw new Error('injected atomic handoff failure');
        }
        await transaction.put(store, value);
        if(store==='idempotency_keys'&&(value as {id?:string}).id===this.failReadAfterCommandId){this.failReadAfterCommandId=undefined;this.failNextReadonly=true;}
      },
    }));
  }

  get<T>(store: FoundationStoreName, id: IDBValidKey) { return this.rejectInjectedReadonly<T|undefined>() ?? this.base.get<T>(store, id); }
  getAll<T>(store: FoundationStoreName) { return this.rejectInjectedReadonly<T[]>() ?? this.base.getAll<T>(store); }
  put<T>(store: FoundationStoreName, value: T) { return this.base.put(store, value); }
  delete(store: FoundationStoreName, id: IDBValidKey) { return this.base.delete(store, id); }
  replaceAll(stores: Record<FoundationStoreName, unknown[]>) { return this.base.replaceAll(stores); }
  exportSnapshot(): Promise<SnapshotManifest> { return this.base.exportSnapshot(); }
  importSnapshot(snapshot: SnapshotManifest) { return this.base.importSnapshot(snapshot); }
}

async function setup(label: string) {
  const base = new IndexedDBAdapter(`shahrah-concurrency-${label}-${crypto.randomUUID()}`);
  await base.replaceAll(createSeedData());
  const storage = new InterceptingStorage(base);
  const service = new LocalFoundationService(storage);
  await service.loadState();
  return {base, storage, service};
}

describe('generic operational concurrency contract', () => {
  it('serializes acting-manager boundary reconciliation across tabs with one durable outcome',async()=>{
    const {base}=await setup('acting-boundary-tabs');
    await switchIdentity(base,'persona-seller');
    const creator=new LocalFoundationService(base);
    const created=await creator.createEmployeeAdvance({beneficiaryPersonnelId:'personnel-arman',amountRial:'60000000',note:'مرز هم‌زمان چند تب',signatureAccepted:true},'acting-boundary-advance');
    const record=created.operationalRecords.find((item)=>item.moduleId==='employee-advance'&&item.createdByUserId==='persona-seller')!;
    const permanent=await base.get<LocalUser>('users','persona-advance-branch-manager');
    const permanentPerson=await base.get<PersonnelRecord>('personnel','personnel-advance-branch-manager');
    const branch=await base.get<OrganizationalUnit>('organizational_units','unit-branch-central');
    const acting:LocalUser={...permanent!,id:'persona-boundary-acting',actorId:'actor-boundary-acting',name:'جانشین مرز چندتب',username:'boundary.acting',personnelId:'personnel-boundary-acting',unitId:'unit-management',branchUnitId:undefined,advanceBranchIds:[]};
    const actingPerson:PersonnelRecord={...permanentPerson!,id:'personnel-boundary-acting',personnelCode:'P-BOUNDARY-ACTING',firstName:'جانشین',lastName:'مرز چندتب',linkedUserId:acting.id,unitId:'unit-management',branchUnitId:undefined,salesBranchUnitId:undefined};
    await base.put('users',acting);await base.put('personnel',actingPerson);
    const today=todayIsoDate();
    await base.put('organizational_units',{...branch!,actingManager:{userId:acting.id,reason:'رقابت چند تب',startsOn:today,endsOn:today,assignedAt:new Date().toISOString(),assignedByActorId:'actor-product-owner'}} satisfies OrganizationalUnit);

    await Promise.all(Array.from({length:5},()=>new LocalFoundationService(base).reconcileActingManagerBoundaries()));
    const current=await base.get<OperationalRecord>('employee_advances',record.id);
    expect(current).toMatchObject({assigneeUserId:acting.id,version:record.version+1});
    const audits=await base.getAll<AuditEvent>('audit_events');
    expect(audits.filter((item)=>item.action==='organization.unit.acting_manager_activated'&&item.metadata?.unitId===branch!.id)).toHaveLength(1);
    expect((await base.getAll<{relatedRecordId?:string;userId:string}>('notifications')).filter((item)=>item.relatedRecordId===record.id&&item.userId===acting.id)).toHaveLength(1);
  });

  it('lets exactly one of ten contenders update the same expected version', async () => {
    const {base, service} = await setup('cas');
    const state = await service.createOperationalRecord('support-case', {title:'پرونده رقابت هم‌زمان'}, 'create-cas-record');
    const record = state.operationalRecords.find((item) => item.moduleId === 'support-case' && item.title === 'پرونده رقابت هم‌زمان')!;
    const contenders = Array.from({length:10}, (_, index) => new LocalFoundationService(base)
      .updateOperationalRecord('support-case', record.id, record.version, {title:`ویرایش رقابتی ${index + 1}`}, `cas-update-${index + 1}`));
    const outcomes = await Promise.allSettled(contenders);
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((item) => item.status === 'rejected')).toHaveLength(9);
    const current = await base.get<OperationalRecord>('support_cases', record.id);
    expect(current?.version).toBe(record.version + 1);
    expect((await base.getAll('workflow_history')).filter((item) => (item as {recordId?:string}).recordId === record.id)).toHaveLength(2);
  });

  it('commits only one transition when ten tabs act on the same stage', async () => {
    const {base, service} = await setup('transition-cas');
    const state = await service.createOperationalRecord('support-case', {title:'مرحله رقابتی'}, 'transition-race-create');
    const record = state.operationalRecords.find((item) => item.moduleId === 'support-case' && item.title === 'مرحله رقابتی')!;
    const outcomes = await Promise.allSettled(Array.from({length:10}, (_, index) => new LocalFoundationService(base)
      .transitionOperationalRecord('support-case', record.id, 'support-case.in_review', `بررسی رقابتی ${index + 1}`, `transition-race-${index + 1}`)));
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((item) => item.status === 'rejected')).toHaveLength(9);
    const current = await base.get<OperationalRecord>('support_cases', record.id);
    expect(current).toMatchObject({status:'in_review',version:record.version + 1});
    expect((await base.getAll<{recordId:string}>('workflow_history')).filter((item) => item.recordId === record.id)).toHaveLength(2);
  });

  it('keeps a generic ALL approval on the same record version until the final voter completes it', async () => {
    const {base, service} = await setup('generic-all-approval');
    const state = await service.loadState();
    const workflow = (await base.getAll<WorkflowDefinition>('workflow_definitions')).find((item) => item.moduleId === 'payment')!;
    const approvalRole: SecurityRole = {
      id:'role-payment-all-reviewer',name:'بازبین چندتأییدی پرداخت',description:'نقش آزمون حد نصاب عمومی',status:'active',protected:false,scope:'COMPANY',
      permissions:[permissionFor('payment','view'),permissionFor('payment','approve')],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),version:1,
    };
    const approvalStages = [{id:'payment-submitted-approval',title:'تأیید پرداخت',stateId:'submitted',roleIds:[approvalRole.id],scope:'COMPANY' as const,decisions:['approve','reject','needs_correction'] as const,required:true,allowSelfApproval:false,assignmentMode:'role_queue' as const,approvalMode:'ALL' as const,requiredApprovals:undefined}];
    const configured = {...workflow,approvalStages,transitions:[...workflow.transitions,{id:'payment.approved',from:['submitted'],to:'approved',label:'تأیید پرداخت',permission:permissionFor('payment','approve'),makerChecker:true}]};
    await base.put('security_roles',approvalRole);
    await base.put('workflow_definitions',configured);
    const historical = await base.get<WorkflowDefinition>('workflow_versions',`${workflow.id}-v${workflow.version}`);
    if (historical) await base.put('workflow_versions',{...historical,approvalStages,transitions:configured.transitions});
    const voters = [1,2].map((index) => ({
      ...state.activeUser,id:`payment-all-voter-${index}`,actorId:`actor-payment-all-voter-${index}`,username:`payment.all.${index}`,
      name:`بازبین پرداخت ${index}`,isAdmin:false,roleId:approvalRole.id,roleIds:[approvalRole.id],roles:[approvalRole.name],scope:'COMPANY' as const,
      permissions:[...approvalRole.permissions],permissionEntitlements:undefined,permissionGrants:undefined,permissionDenials:undefined,
    }) satisfies LocalUser);
    await Promise.all(voters.map((voter) => base.put('users',voter)));

    const createdState = await service.createOperationalRecord('payment',{title:'پرداخت با دو تأیید'},'generic-all-create');
    const created = createdState.operationalRecords.find((item) => item.moduleId === 'payment' && item.title === 'پرداخت با دو تأیید')!;
    expect(created.status).toBe('submitted');

    await switchIdentity(base,voters[0].id);
    await new LocalFoundationService(base).transitionOperationalRecord('payment',created.id,'payment.approved','رأی بازبین اول','generic-all-vote-1');
    const afterFirst = await base.get<OperationalRecord>('payments',created.id);
    expect(afterFirst).toEqual(created);
    const openRound = (await base.getAll<{recordId:string;status:string;votes:unknown[]}>('workflow_approval_rounds')).find((round) => round.recordId === created.id)!;
    expect(openRound).toMatchObject({status:'open'});
    expect(openRound.votes).toHaveLength(1);

    await switchIdentity(base,voters[1].id);
    await new LocalFoundationService(base).transitionOperationalRecord('payment',created.id,'payment.approved','رأی بازبین دوم','generic-all-vote-2');
    const completed = await base.get<OperationalRecord>('payments',created.id);
    expect(completed).toMatchObject({status:'approved',version:created.version+1});
    const closedRound = (await base.getAll<{recordId:string;status:string;votes:unknown[]}>('workflow_approval_rounds')).find((round) => round.recordId === created.id)!;
    expect(closedRound).toMatchObject({status:'approved'});
    expect(closedRound.votes).toHaveLength(2);
    expect((await base.getAll<OperationalRecordHistory>('workflow_history')).filter((item) => item.recordId === created.id && item.eventType === 'transitioned')).toHaveLength(1);

    await switchIdentity(base,state.activeUser.id);
    const negativeState=await new LocalFoundationService(base).createOperationalRecord('payment',{title:'پرداخت مثبت سپس رد'},'generic-negative-create');
    const negative=negativeState.operationalRecords.find((item)=>item.moduleId==='payment'&&item.title==='پرداخت مثبت سپس رد')!;
    await switchIdentity(base,voters[0].id);await new LocalFoundationService(base).transitionOperationalRecord('payment',negative.id,'payment.approved','تأیید اولیه','generic-positive-before-reject');
    await switchIdentity(base,voters[1].id);await new LocalFoundationService(base).transitionOperationalRecord('payment',negative.id,'payment.rejected','رد فوری پس از رأی مثبت','generic-negative-after-approve');
    expect(await base.get<OperationalRecord>('payments',negative.id)).toMatchObject({status:'rejected',version:negative.version+1});
    const rejectedRound=(await base.getAll<WorkflowApprovalRound>('workflow_approval_rounds')).find((round)=>round.recordId===negative.id)!;
    expect(rejectedRound.status).toBe('rejected');expect(rejectedRound.votes.map((vote)=>vote.decision)).toEqual(['approve','reject']);
  });

  it('replays the same command payload and rejects command-id reuse with another payload', async () => {
    const {base, service} = await setup('idempotency');
    const first = await service.createOperationalRecord('support-case', {title:'فرمان یکتا'}, 'same-command');
    const second = await service.createOperationalRecord('support-case', {title:'فرمان یکتا'}, 'same-command');
    expect(first.operationalRecords.filter((item) => item.moduleId === 'support-case' && item.title === 'فرمان یکتا')).toHaveLength(1);
    expect(second.operationalRecords.filter((item) => item.moduleId === 'support-case' && item.title === 'فرمان یکتا')).toHaveLength(1);
    await expect(service.createOperationalRecord('support-case', {title:'محتوای متفاوت'}, 'same-command')).rejects.toThrow('شناسه این فرمان');
    expect((await base.getAll<OperationalRecord>('support_cases')).filter((item) => ['فرمان یکتا','محتوای متفاوت'].includes(item.title))).toHaveLength(1);
  });

  it('does not accept the known FNV-32 collision as the same command payload', async () => {
    const {base, service} = await setup('sha-collision');
    await service.createOperationalRecord('support-case', {title:'collision-5379'}, 'collision-command');
    await expect(service.createOperationalRecord('support-case', {title:'collision-61124'}, 'collision-command')).rejects.toThrow('شناسه این فرمان');
    const created = (await base.getAll<OperationalRecord>('support_cases')).filter((item) => item.title.startsWith('collision-'));
    expect(created.map((item) => item.title)).toEqual(['collision-5379']);
  });

  it('replays update, transition, assignment and handoff commands after their record version changed', async () => {
    const {base, service} = await setup('all-replays');
    let state = await service.createOperationalRecord('support-case', {title:'بازپخش ویرایش'}, 'replay-update-create');
    let support = state.operationalRecords.find((item) => item.title === 'بازپخش ویرایش')!;
    await service.updateOperationalRecord('support-case', support.id, support.version, {title:'ویرایش ثبت‌شده'}, 'replay-update');
    await expect(service.updateOperationalRecord('support-case', support.id, support.version, {title:'ویرایش ثبت‌شده'}, 'replay-update')).resolves.toBeTruthy();

    state = await service.createOperationalRecord('support-case', {title:'بازپخش انتقال'}, 'replay-transition-create');
    support = state.operationalRecords.find((item) => item.title === 'بازپخش انتقال')!;
    await service.transitionOperationalRecord('support-case', support.id, 'support-case.in_review', 'بررسی بازپخش', 'replay-transition');
    await expect(service.transitionOperationalRecord('support-case', support.id, 'support-case.in_review', 'بررسی بازپخش', 'replay-transition')).resolves.toBeTruthy();

    state = await service.createOperationalRecord('document', {title:'بازپخش تخصیص'}, 'replay-assign-create');
    const document = state.operationalRecords.find((item) => item.title === 'بازپخش تخصیص')!;
    const target: LocalUser = {...state.activeUser,id:'eligible-document-target',actorId:'actor-eligible-document-target',name:'مسئول مجاز سند',username:'eligible.document.target'};
    await base.put('users', target);
    await service.assignOperationalRecord('document', document.id, target.id, 'ارجاع بازپخش', document.version, 'replay-assign');
    await expect(service.assignOperationalRecord('document', document.id, target.id, 'ارجاع بازپخش', document.version, 'replay-assign')).resolves.toBeTruthy();

    state = await service.createOperationalRecord('quote', {title:'بازپخش تحویل'}, 'replay-handoff-create');
    let quote = state.operationalRecords.find((item) => item.title === 'بازپخش تحویل')!;
    state = await service.transitionOperationalRecord('quote', quote.id, 'quote.sent', '', 'replay-handoff-send');
    quote = state.operationalRecords.find((item) => item.id === quote.id)!;
    await service.transitionOperationalRecord('quote', quote.id, 'quote.accepted', '', 'replay-handoff');
    await expect(service.transitionOperationalRecord('quote', quote.id, 'quote.accepted', '', 'replay-handoff')).resolves.toBeTruthy();
    expect((await base.getAll<OperationalRecord>('sales')).filter((item) => item.relatedRecordId === quote.id)).toHaveLength(1);
  });

  it('replays transition and assignment after commit succeeds but refreshing state fails', async () => {
    const {base, storage, service} = await setup('post-commit-record-actions');
    let state = await service.createOperationalRecord('support-case', {title:'انتقال با پاسخ مبهم'}, 'ambiguous-transition-create');
    const support = state.operationalRecords.find((item) => item.title === 'انتقال با پاسخ مبهم')!;
    storage.failReadAfterCommandId = 'ambiguous-transition';
    await expect(service.transitionOperationalRecord('support-case', support.id, 'support-case.in_review', 'بررسی پاسخ مبهم', 'ambiguous-transition')).rejects.toThrow('post-commit');
    await expect(service.transitionOperationalRecord('support-case', support.id, 'support-case.in_review', 'بررسی پاسخ مبهم', 'ambiguous-transition')).resolves.toBeTruthy();
    const transitioned = await base.get<OperationalRecord>('support_cases', support.id);
    expect(transitioned).toMatchObject({status:'in_review', version:support.version + 1});
    expect((await base.getAll<OperationalRecordHistory>('workflow_history')).filter((item) => item.recordId === support.id && item.eventType === 'transitioned')).toHaveLength(1);

    state = await service.createOperationalRecord('document', {title:'ارجاع با پاسخ مبهم'}, 'ambiguous-assign-create');
    const document = state.operationalRecords.find((item) => item.title === 'ارجاع با پاسخ مبهم')!;
    const target: LocalUser = {...state.activeUser,id:'ambiguous-assign-target',actorId:'actor-ambiguous-assign-target',name:'مسئول مجاز ارجاع',username:'ambiguous.assign.target'};
    await base.put('users', target);
    storage.failReadAfterCommandId = 'ambiguous-assign';
    await expect(service.assignOperationalRecord('document', document.id, target.id, 'ارجاع پاسخ مبهم', document.version, 'ambiguous-assign')).rejects.toThrow('post-commit');
    await expect(service.assignOperationalRecord('document', document.id, target.id, 'ارجاع پاسخ مبهم', document.version, 'ambiguous-assign')).resolves.toBeTruthy();
    const assigned = await base.get<OperationalRecord>('documents', document.id);
    expect(assigned).toMatchObject({assigneeUserId:target.id, version:document.version + 1});
    expect((await base.getAll<OperationalRecordHistory>('workflow_history')).filter((item) => item.recordId === document.id && item.eventType === 'assigned')).toHaveLength(1);
  });

  it('allocates ten unique tracking numbers inside serialized write transactions', async () => {
    const {base} = await setup('tracking');
    const outcomes = await Promise.all(Array.from({length:10}, (_, index) => new LocalFoundationService(base)
      .createOperationalRecord('support-case', {title:`ثبت هم‌زمان ${index + 1}`}, `tracking-create-${index + 1}`)));
    expect(outcomes).toHaveLength(10);
    const created = (await base.getAll<OperationalRecord>('support_cases')).filter((item) => item.title.startsWith('ثبت هم‌زمان'));
    expect(created).toHaveLength(10);
    expect(new Set(created.map((item) => item.trackingCode)).size).toBe(10);
  });

  it('rolls source and destination back together when an atomic handoff fails', async () => {
    const {base, storage, service} = await setup('handoff');
    let state = await service.createOperationalRecord('quote', {title:'پیش‌فاکتور اتمیک'}, 'quote-create');
    let quote = state.operationalRecords.find((item) => item.moduleId === 'quote' && item.title === 'پیش‌فاکتور اتمیک')!;
    state = await service.transitionOperationalRecord('quote', quote.id, 'quote.sent', '', 'quote-send');
    quote = state.operationalRecords.find((item) => item.id === quote.id)!;
    const before = structuredClone(quote);
    const beforeHistoryCount = (await base.getAll<{recordId:string}>('workflow_history')).filter((item) => item.recordId === quote.id).length;
    storage.failNextPutStore = 'sales';
    await expect(service.transitionOperationalRecord('quote', quote.id, 'quote.accepted', '', 'quote-accept')).rejects.toThrow('injected atomic handoff failure');
    expect(await base.get<OperationalRecord>('quotes', quote.id)).toEqual(before);
    expect((await base.getAll<OperationalRecord>('sales')).some((item) => item.relatedRecordId === quote.id)).toBe(false);
    expect((await base.getAll<{recordId:string}>('workflow_history')).filter((item) => item.recordId === quote.id)).toHaveLength(beforeHistoryCount);
    expect(await base.get('idempotency_keys', 'quote-accept')).toBeUndefined();
  });

  it('pins the published destination workflow version, initial state and route on handoff', async () => {
    const {base, service} = await setup('handoff-workflow-pin');
    const saleWorkflow = (await base.getAll<WorkflowDefinition>('workflow_definitions')).find((item) => item.moduleId === 'sale')!;
    const versioned: WorkflowDefinition = {
      ...saleWorkflow, version:77, status:'published', initialState:'custom_intake',
      stateLabels:{...saleWorkflow.stateLabels,custom_intake:'پذیرش سفارشی'}, updatedAt:new Date().toISOString(),
    };
    await base.put('workflow_definitions', versioned);
    await base.put('workflow_versions', {...versioned,id:`${versioned.id}-v77`});
    let state = await service.createOperationalRecord('quote', {title:'تحویل نسخه‌دار'}, 'versioned-quote-create');
    let quote = state.operationalRecords.find((item) => item.title === 'تحویل نسخه‌دار')!;
    state = await service.transitionOperationalRecord('quote', quote.id, 'quote.sent', '', 'versioned-quote-send');
    quote = state.operationalRecords.find((item) => item.id === quote.id)!;
    await service.transitionOperationalRecord('quote', quote.id, 'quote.accepted', '', 'versioned-quote-accept');
    const sale = (await base.getAll<OperationalRecord>('sales')).find((item) => item.relatedRecordId === quote.id)!;
    expect(sale).toMatchObject({status:'custom_intake',workflowVersion:77,workflowRouteId:'base'});
  });

  it('rejects cross-unit create and cross-company or inactive create targets inside the transaction', async () => {
    const {base} = await setup('create-target-scope');
    const rawActor = (await base.getAll<LocalUser>('users')).find((item) => !item.isAdmin && item.status === 'active' && item.unitId)!;
    const otherUnit = (await base.getAll<{id:string;status:string}>('organizational_units')).find((item) => item.status === 'active' && item.id !== rawActor.unitId)!;
    const role: SecurityRole = {id:'role-unit-create-test',name:'ثبت واحدی آزمون',description:'',status:'active',protected:false,scope:'UNIT',permissions:[permissionFor('support-case','view'),permissionFor('support-case','create'),permissionFor('support-case','edit')],createdAt:'',updatedAt:'',version:1};
    await base.put('security_roles', role);
    await base.put('users', {...rawActor,isAdmin:false,roleId:role.id,roleIds:[role.id],permissionGrants:[],permissionDenials:[]} satisfies LocalUser);
    await switchIdentity(base, rawActor.id);
    const actorService = new LocalFoundationService(base);
    await actorService.loadState();
    await expect(actorService.createOperationalRecord('support-case',{title:'خارج از واحد',unitId:otherUnit.id},'unit-create-denied')).rejects.toThrow('محدوده');
    expect((await base.getAll<OperationalRecord>('support_cases')).some((item) => item.title === 'خارج از واحد')).toBe(false);
    await actorService.createOperationalRecord('support-case',{title:'داخل واحد',unitId:rawActor.unitId},'unit-create-allowed');
    const ownRecord = (await base.getAll<OperationalRecord>('support_cases')).find((item) => item.title === 'داخل واحد')!;
    await expect(actorService.updateOperationalRecord('support-case',ownRecord.id,ownRecord.version,{unitId:otherUnit.id},'unit-update-denied')).rejects.toThrow('محدوده');
    expect((await base.get<OperationalRecord>('support_cases',ownRecord.id))?.unitId).toBe(rawActor.unitId);

    await switchIdentity(base, (await base.getAll<LocalUser>('users')).find((item) => item.isAdmin)!.id);
    const adminService = new LocalFoundationService(base);
    const targets = (await base.getAll<LocalUser>('users')).filter((item) => item.status === 'active').slice(0,2);
    await base.put('users',{...targets[0],companyId:'other-company'} satisfies LocalUser);
    await base.put('users',{...targets[1],status:'inactive'} satisfies LocalUser);
    await expect(adminService.createOperationalRecord('support-case',{title:'مقصد شرکت دیگر',assigneeUserId:targets[0].id},'cross-company-target')).rejects.toThrow('شرکت');
    await expect(adminService.createOperationalRecord('support-case',{title:'مقصد غیرفعال',assigneeUserId:targets[1].id},'inactive-target')).rejects.toThrow('فعال');
  });

  it('uses durable team provenance for create, update and projection scope', async () => {
    const {base}=await setup('team-provenance');
    const seller=(await base.get<LocalUser>('users','persona-seller'))!;
    const role:SecurityRole={id:'role-team-support-test',name:'پشتیبانی تیمی آزمون',description:'',status:'active',protected:false,scope:'TEAM',permissions:[permissionFor('support-case','view'),permissionFor('support-case','create'),permissionFor('support-case','edit')],createdAt:'',updatedAt:'',version:1};
    await base.put('security_roles',role);
    await base.put('users',{...seller,roleId:role.id,roleIds:[role.id],permissionGrants:[],permissionDenials:[]} satisfies LocalUser);
    await switchIdentity(base,seller.id);
    const service=new LocalFoundationService(base);
    let state=await service.createOperationalRecord('support-case',{title:'پرونده تیم خود',payload:{teamId:seller.teamId!}},'team-own-create');
    const own=state.operationalRecords.find((item)=>item.title==='پرونده تیم خود')!;
    expect(own.payload.teamId).toBe(seller.teamId);
    await expect(service.createOperationalRecord('support-case',{title:'پرونده تیم دیگر',payload:{teamId:'team-other'}},'team-other-create')).rejects.toThrow('محدوده');
    await expect(service.updateOperationalRecord('support-case',own.id,own.version,{payload:{teamId:'team-other'}},'team-other-update')).rejects.toThrow('مجوز مدیریت');
    expect((await base.get<OperationalRecord>('support_cases',own.id))?.payload.teamId).toBe(seller.teamId);
  });

  it('revalidates customer, related record and purchase allocation references inside the write transaction', async () => {
    const {base,storage,service}=await setup('relation-validation');
    let state=await service.createOperationalRecord('support-case',{title:'رکورد مرجع معتبر'},'relation-source');
    const source=state.operationalRecords.find((item)=>item.title==='رکورد مرجع معتبر')!;
    state=await service.createOperationalRecord('followup',{title:'پیگیری مرتبط معتبر',relatedRecordId:source.id,customerId:'customer-ava'},'relation-valid');
    expect(state.operationalRecords.some((item)=>item.title==='پیگیری مرتبط معتبر')).toBe(true);
    await expect(service.createOperationalRecord('followup',{title:'پیگیری مرجع مفقود',relatedRecordId:'missing-related'},'relation-missing')).rejects.toThrow('رکورد مرتبط');

    const rawPurchase=(await base.get<OperationalRecord>('purchase_requests','demo-purchase-request-1'))!;
    const allocation=((rawPurchase.payload.allocations as Array<{branchUnitId:string}>)[0]);
    storage.beforeNextReadwrite=async()=>{const unit=await base.get<{id:string;status:string}>('organizational_units',allocation.branchUnitId);await base.put('organizational_units',{...unit!,status:'inactive'});};
    await expect(service.createOperationalRecord('purchase-request',{title:'خرید با تخصیص منقضی',description:rawPurchase.description,payload:rawPurchase.payload},'purchase-allocation-race')).rejects.toThrow('هنگام ثبت نهایی');
    expect((await base.getAll<OperationalRecord>('purchase_requests')).some((item)=>item.title==='خرید با تخصیص منقضی')).toBe(false);
  });

  it('projects personnel details by self, HR and banking entitlements and scopes CRM customers per entitlement', async () => {
    const {base}=await setup('personnel-customer-projection');
    const viewer=(await base.get<LocalUser>('users','persona-user-manager'))!;
    const own=(await base.get<PersonnelRecord>('personnel',viewer.personnelId!))!;
    const other=(await base.get<PersonnelRecord>('personnel','personnel-arman'))!;
    await base.put('personnel',{...own,nationalId:'0011223344',bankName:'بانک خود',cardNumber:'6219861000001111',salesCompensationHistory:[{id:'comp-own',mode:'fixed_salary',commissionBasis:'invoice_collection',effectiveFrom:'2026-01-01',monthlyFixedSalaryRial:'100',reason:'secret',recordedAt:'2026-01-01',actorId:'actor',actorName:'آزمون'}]} as PersonnelRecord);
    await base.put('personnel',{...other,nationalId:'0099887766',primaryMobile:'09120000000',address:'نشانی محرمانه',bankName:'بانک دیگر',iban:'IR-secret',salesCompensationHistory:[{id:'comp-other',mode:'fixed_salary',commissionBasis:'invoice_collection',effectiveFrom:'2026-01-01',monthlyFixedSalaryRial:'200',reason:'secret',recordedAt:'2026-01-01',actorId:'actor',actorName:'آزمون'}]} as PersonnelRecord);
    const basic:SecurityRole={id:'role-directory-basic',name:'دایرکتوری پایه',description:'',status:'active',protected:false,scope:'COMPANY',permissions:['foundation.dashboard.view'],createdAt:'',updatedAt:'',version:1};
    await base.put('security_roles',basic);await base.put('users',{...viewer,isAdmin:false,roleId:basic.id,roleIds:[basic.id],permissionGrants:[],permissionDenials:[]} satisfies LocalUser);await switchIdentity(base,viewer.id);
    let state=await new LocalFoundationService(base).loadState();
    const ownProjected=state.personnel.find((person)=>person.id===own.id)!;const otherProjected=state.personnel.find((person)=>person.id===other.id)!;
    expect(ownProjected.nationalId).toBe('0011223344');expect(ownProjected.cardNumber).toBeUndefined();expect(ownProjected.salesCompensationHistory).toBeUndefined();
    expect(otherProjected.nationalId).toBeUndefined();expect(otherProjected.primaryMobile).toBe('');expect(otherProjected.address).toBeUndefined();expect(otherProjected.iban).toBeUndefined();expect(otherProjected.salesCompensationHistory).toBeUndefined();
    const hr:SecurityRole={...basic,id:'role-directory-hr-full',name:'منابع انسانی کامل',permissions:['organization.personnel.view','organization.personnel.banking.view']};
    await base.put('security_roles',hr);await base.put('users',{...viewer,isAdmin:false,roleId:hr.id,roleIds:[hr.id]} satisfies LocalUser);
    state=await new LocalFoundationService(base).loadState();const hrOther=state.personnel.find((person)=>person.id===other.id)!;
    expect(hrOther.nationalId).toBe('0099887766');expect(hrOther.iban).toBe('IR-secret');expect(hrOther.salesCompensationHistory).toHaveLength(1);

    const unrelated:SecurityRole={...basic,id:'role-unrelated-company',name:'مجوز نامرتبط شرکتی',scope:'COMPANY',permissions:['foundation.dashboard.view']};
    const crmSelf:SecurityRole={...basic,id:'role-crm-self-test',name:'مشتری خود',scope:'SELF',permissions:['crm.customers.view',permissionFor('followup','view'),permissionFor('followup','create')]};
    await base.put('security_roles',unrelated);await base.put('security_roles',crmSelf);
    const seller=(await base.get<LocalUser>('users','persona-seller'))!;await base.put('users',{...seller,isAdmin:false,roleId:unrelated.id,roleIds:[unrelated.id,crmSelf.id],permissionGrants:[],permissionDenials:[]} satisfies LocalUser);
    const ownImport:CustomerImportJob={id:'import-own',companyId:seller.companyId,unitId:seller.unitId,ownerPersonnelId:seller.personnelId,fileName:'own.xlsx',totalRows:1,importedRows:1,duplicateRows:0,invalidRows:0,actorName:seller.name,createdAt:new Date().toISOString()};
    const otherImport:CustomerImportJob={...ownImport,id:'import-other',unitId:'unit-management',ownerPersonnelId:'personnel-admin',fileName:'other.xlsx'};await base.put('customer_imports',ownImport);await base.put('customer_imports',otherImport);await switchIdentity(base,seller.id);
    const sellerService=new LocalFoundationService(base);state=await sellerService.loadState();
    expect(state.customers.map((customer)=>customer.id)).toContain('customer-ava');expect(state.customers.map((customer)=>customer.id)).not.toContain('customer-kiana');
    expect(state.customerImports.map((job)=>job.id)).toEqual(['import-own']);
    await expect(sellerService.createOperationalRecord('followup',{title:'پیگیری مشتری دیگر',customerId:'customer-kiana'},'crm-other-customer')).rejects.toThrow('مشتری');
    await expect(sellerService.createOperationalRecord('followup',{title:'پیگیری مشتری خود',customerId:'customer-ava'},'crm-own-customer')).resolves.toBeTruthy();
  });

  it('filters tenant directories and scopes organization audit details to the target resource', async () => {
    const {base}=await setup('tenant-audit-projection');
    const templateUser=(await base.get<LocalUser>('users','persona-user-manager'))!;
    const outsiderUser={...templateUser,id:'persona-outsider',actorId:'actor-outsider',username:'outsider',companyId:'company-other',unitId:'unit-outsider',personnelId:undefined} satisfies LocalUser;
    const outsiderUnit:OrganizationalUnit={id:'unit-outsider',companyId:'company-other',name:'واحد بیرونی',type:'واحد',status:'active',order:999,description:'',createdAt:'',updatedAt:''};
    const outsiderPosition:OrganizationalPosition={id:'position-outsider',title:'سمت بیرونی',description:'',unitIds:[outsiderUnit.id],status:'active',createdAt:'',updatedAt:''};
    const seedStructure=(await base.getAll<SalesStructure>('sales_structures'))[0];const outsiderStructure:SalesStructure={...seedStructure,id:'sales-structure-outsider',code:'OUT',branchUnitId:outsiderUnit.id};
    await base.put('users',outsiderUser);await base.put('organizational_units',outsiderUnit);await base.put('organizational_positions',outsiderPosition);await base.put('sales_structures',outsiderStructure);await switchIdentity(base,templateUser.id);
    let state=await new LocalFoundationService(base).loadState();
    expect(state.users.some((user)=>user.id===outsiderUser.id)).toBe(false);expect(state.units.some((unit)=>unit.id===outsiderUnit.id)).toBe(false);expect(state.positions.some((position)=>position.id===outsiderPosition.id)).toBe(false);expect(state.salesStructures.some((structure)=>structure.id===outsiderStructure.id)).toBe(false);

    const auditRole:SecurityRole={id:'role-unit-audit-test',name:'ممیزی واحدی',description:'',status:'active',protected:false,scope:'UNIT',permissions:['foundation.audit.view','organization.personnel.view','foundation.users.view','organization.positions.view','organization.roles.view','organization.registrations.view'],createdAt:'',updatedAt:'',version:1};
    await base.put('security_roles',auditRole);await base.put('users',{...templateUser,isAdmin:false,roleId:auditRole.id,roleIds:[auditRole.id],permissionGrants:[],permissionDenials:[]} satisfies LocalUser);
    const ownTarget=(await base.get<PersonnelRecord>('personnel',templateUser.personnelId!))!;const otherTarget=(await base.get<PersonnelRecord>('personnel','personnel-arman'))!;
    const baseAudit={companyId:templateUser.companyId,category:'system' as const,actorId:templateUser.actorId,actorName:templateUser.name,effectiveUserId:templateUser.id,occurredAt:new Date().toISOString(),summary:'رویداد سازمانی',outcome:'success' as const,correlationId:'audit-scope-test'};
    await base.put('audit_events',{...baseAudit,id:'audit-own-profile',sequence:9001,action:'organization.personnel.updated',metadata:{personnelId:ownTarget.id}} satisfies AuditEvent);
    await base.put('audit_events',{...baseAudit,id:'audit-own-compensation',sequence:9002,action:'organization.personnel.sales_compensation_changed',metadata:{personnelId:ownTarget.id,monthlyFixedSalaryRial:'999999'}} satisfies AuditEvent);
    await base.put('audit_events',{...baseAudit,id:'audit-other-profile',sequence:9003,action:'organization.personnel.updated',metadata:{personnelId:otherTarget.id}} satisfies AuditEvent);
    await base.put('audit_events',{...baseAudit,id:'audit-missing-personnel',sequence:9004,action:'organization.personnel.updated',metadata:{}} satisfies AuditEvent);
    const ownPosition:OrganizationalPosition={id:'position-own-audit',title:'سمت ممیزی واحد',description:'',unitIds:[templateUser.unitId!],status:'active',createdAt:'',updatedAt:''};
    await base.put('organizational_positions',ownPosition);
    const ownRegistration:RegistrationRequest={id:'registration-own-audit',trackingCode:'REG-AUDIT-OWN',fullName:templateUser.name,mobile:'09000000001',secondaryMobile:'',nationalId:'0011111111',gender:'unspecified',province:'تهران',city:'تهران',address:'',bankName:'',cardNumber:'',requestedUsername:'audit.own',selfDeclaration:{},status:'in_review',linkedUserId:templateUser.id,version:1,createdAt:'',updatedAt:''};
    const otherRegistration:RegistrationRequest={...ownRegistration,id:'registration-other-audit',trackingCode:'REG-AUDIT-OTHER',fullName:outsiderUser.name,mobile:'09000000002',nationalId:'0022222222',requestedUsername:'audit.other',linkedUserId:outsiderUser.id};
    await base.put('registration_requests',ownRegistration);await base.put('registration_requests',otherRegistration);
    const extraAudits:AuditEvent[]=[
      {...baseAudit,id:'audit-session-own',sequence:9010,action:'organization.session.password_changed',metadata:{userId:templateUser.id}},
      {...baseAudit,id:'audit-session-other',sequence:9011,action:'organization.session.password_changed',metadata:{userId:outsiderUser.id}},
      {...baseAudit,id:'audit-session-missing',sequence:9012,action:'organization.session.password_changed',metadata:{}},
      {...baseAudit,id:'audit-position-own',sequence:9013,action:'organization.position.updated',metadata:{positionId:ownPosition.id}},
      {...baseAudit,id:'audit-position-missing',sequence:9014,action:'organization.position.updated',metadata:{}},
      {...baseAudit,id:'audit-registration-own',sequence:9015,action:'organization.registration.reviewed',metadata:{registrationId:ownRegistration.id}},
      {...baseAudit,id:'audit-registration-other',sequence:9016,action:'organization.registration.reviewed',metadata:{registrationId:otherRegistration.id}},
      {...baseAudit,id:'audit-role-scoped',sequence:9017,action:'organization.role.updated',metadata:{roleId:auditRole.id}},
      {...baseAudit,id:'audit-role-missing',sequence:9018,action:'organization.role.updated',metadata:{}},
      {...baseAudit,id:'audit-unknown-prefix',sequence:9019,action:'organization.future.unspecified',metadata:{userId:templateUser.id}},
    ];
    for(const event of extraAudits)await base.put('audit_events',event);
    state=await new LocalFoundationService(base).loadState();
    const visibleUnitAuditIds=state.audits.map((event)=>event.id);
    expect(visibleUnitAuditIds).toEqual(expect.arrayContaining(['audit-own-profile','audit-session-own','audit-position-own','audit-registration-own']));
    expect(visibleUnitAuditIds).not.toEqual(expect.arrayContaining(['audit-own-compensation','audit-other-profile','audit-missing-personnel','audit-session-other','audit-session-missing','audit-position-missing','audit-registration-other','audit-role-scoped','audit-role-missing','audit-unknown-prefix']));
    await base.put('security_roles',{...auditRole,scope:'COMPANY',version:2});
    state=await new LocalFoundationService(base).loadState();
    expect(state.audits.map((event)=>event.id)).toContain('audit-role-scoped');
    expect(state.audits.map((event)=>event.id)).not.toContain('audit-role-missing');
  });

  it('keeps inactive tenant organization catalogs visible so managers can reactivate them', async () => {
    const {base,service}=await setup('inactive-tenant-catalog');
    let state=await service.createUnit({name:'واحد چرخه وضعیت',type:'اداره',description:'آزمون مشاهده رکورد غیرفعال'});
    let unit=state.units.find((item)=>item.name==='واحد چرخه وضعیت')!;
    expect((await base.get<OrganizationalUnit>('organizational_units',unit.id))?.companyId).toBe(state.activeUser.companyId);
    state=await service.setUnitStatus(unit.id,unit.updatedAt,'inactive');
    unit=state.units.find((item)=>item.id===unit.id)!;expect(unit.status).toBe('inactive');
    state=await service.setUnitStatus(unit.id,unit.updatedAt,'active');
    unit=state.units.find((item)=>item.id===unit.id)!;expect(unit.status).toBe('active');

    state=await service.createPosition({title:'سمت چرخه وضعیت',description:'',unitIds:[unit.id]});
    let position=state.positions.find((item)=>item.title==='سمت چرخه وضعیت')!;
    state=await service.setPositionStatus(position.id,position.updatedAt,'inactive');
    position=state.positions.find((item)=>item.id===position.id)!;expect(position.status).toBe('inactive');
    state=await service.setPositionStatus(position.id,position.updatedAt,'active');
    position=state.positions.find((item)=>item.id===position.id)!;expect(position.status).toBe('active');

    let structure=state.salesStructures.find((item)=>item.status==='active')!;
    state=await service.setSalesStructureStatus(structure.id,structure.updatedAt,'inactive');
    structure=state.salesStructures.find((item)=>item.id===structure.id)!;expect(structure.status).toBe('inactive');
    state=await service.setSalesStructureStatus(structure.id,structure.updatedAt,'active');
    expect(state.salesStructures.find((item)=>item.id===structure.id)?.status).toBe('active');
  });

  it('rejects assignment when the target role is revoked immediately before commit', async () => {
    const {base,storage,service}=await setup('assignee-role-revoke');
    let state=await service.createOperationalRecord('document',{title:'سند ارجاع امن'},'assignee-role-create');
    const record=state.operationalRecords.find((item)=>item.title==='سند ارجاع امن')!;
    const seedTarget=state.users.find((item)=>item.id!==state.activeUser.id&&item.status==='active')!;
    const role:SecurityRole={id:'role-document-target-test',name:'مسئول سند آزمون',description:'',status:'active',protected:false,scope:'COMPANY',permissions:[permissionFor('document','view')],createdAt:'',updatedAt:'',version:1};
    await base.put('security_roles',role);
    await base.put('users',{...(await base.get<LocalUser>('users',seedTarget.id))!,isAdmin:false,roleId:role.id,roleIds:[role.id],permissionGrants:[],permissionDenials:[]} satisfies LocalUser);
    const before=await base.get<OperationalRecord>('documents',record.id);
    storage.beforeNextReadwrite=async()=>{await base.put('security_roles',{...role,status:'inactive',version:2});};
    await expect(service.assignOperationalRecord('document',record.id,seedTarget.id,'ارجاع پس از لغو نقش',record.version,'assignee-role-command')).rejects.toThrow('نقش لازم');
    expect(await base.get<OperationalRecord>('documents',record.id)).toEqual(before);
    expect(await base.get('idempotency_keys','assignee-role-command')).toBeUndefined();
  });

  it('requires encryption for purchase quotations and treasury receipts and preserves them in encrypted backup', async () => {
    const {base,service}=await setup('encrypted-sensitive-backup');
    const purchase=(await base.get<OperationalRecord>('purchase_requests','demo-purchase-request-1'))!;
    const quotation='data:application/pdf;base64,U0hBSFJBSC1RVU9UQVRJT04=';
    await base.put('purchase_requests',{...purchase,payload:{...purchase.payload,quotationAttachments:[{id:'quotation-backup',fileName:'quote.pdf',mimeType:'application/pdf',size:24,dataUrl:quotation,uploadedAt:'2026-08-28T00:00:00.000Z'}]}});
    const treasury=(await base.getAll<OperationalRecord>('treasury_executions'))[0]??{...purchase,id:'treasury-backup',moduleId:'treasury-execution',domain:'treasury',trackingCode:'TRY-BACKUP',relatedRecordId:purchase.id};
    const receipt='data:image/png;base64,U0hBSFJBSC1SRUNFSVBU';
    await base.put('treasury_executions',{...treasury,id:'treasury-backup',moduleId:'treasury-execution',payload:{...treasury.payload,payment:{receipt:{fileName:'receipt.png',dataUrl:receipt}}}});
    await expect(service.exportSnapshot()).rejects.toThrow('رمزگذاری');
    const encrypted=await service.exportSnapshot('strong-backup-password');
    expect('format' in encrypted&&encrypted.format).toBe('tapra2-local-snapshot-encrypted');
    const restored=await decryptSnapshot(encrypted as import('./model').EncryptedSnapshot,'strong-backup-password');
    expect(JSON.stringify(restored.stores.purchase_requests)).toContain(quotation);
    expect(JSON.stringify(restored.stores.treasury_executions)).toContain(receipt);
  });

  it('requires the UI record version for assignment and rejects a stale version without writing', async () => {
    const {base, service} = await setup('assign-stale');
    let state = await service.createOperationalRecord('document',{title:'ارجاع نسخه‌دار'},'assign-stale-create');
    const original = state.operationalRecords.find((item) => item.title === 'ارجاع نسخه‌دار')!;
    state = await service.updateOperationalRecord('document',original.id,original.version,{description:'نسخه تازه'},'assign-stale-update');
    const current = state.operationalRecords.find((item) => item.id === original.id)!;
    const target = state.users.find((item) => item.status === 'active' && item.id !== state.activeUser.id)!;
    await expect(service.assignOperationalRecord('document',current.id,target.id,'ارجاع با نسخه قدیمی',original.version,'assign-stale-command')).rejects.toThrow('هم‌زمان');
    expect(await base.get<OperationalRecord>('documents',current.id)).toEqual(current);
    expect(await base.get('idempotency_keys','assign-stale-command')).toBeUndefined();
  });

  it('blocks every generic mutation while an admin is viewing as another identity', async () => {
    const {base, service} = await setup('qa-readonly');
    let state = await service.createOperationalRecord('support-case',{title:'فقط خواندنی QA'},'qa-seed');
    const record = state.operationalRecords.find((item) => item.title === 'فقط خواندنی QA')!;
    const target = state.users.find((item) => item.status === 'active' && item.id !== state.activeUser.id)!;
    const session = (await base.get<FoundationSession>('sessions','active-session'))!;
    await base.put('sessions',{...session,actingAdminUserId:state.activeUser.id,version:session.version+1,switchedAt:new Date().toISOString()} satisfies FoundationSession);
    const qaService = new LocalFoundationService(base);
    await qaService.loadState();
    const before = structuredClone(await base.get<OperationalRecord>('support_cases',record.id));
    await expect(qaService.createOperationalRecord('support-case',{title:'QA create'},'qa-create')).rejects.toThrow('مشاهده آزمایشی');
    await expect(qaService.updateOperationalRecord('support-case',record.id,record.version,{title:'QA update'},'qa-update')).rejects.toThrow('مشاهده آزمایشی');
    await expect(qaService.transitionOperationalRecord('support-case',record.id,'support-case.in_review','QA transition','qa-transition')).rejects.toThrow('مشاهده آزمایشی');
    await expect(qaService.assignOperationalRecord('support-case',record.id,target.id,'QA assign',record.version,'qa-assign')).rejects.toThrow('مشاهده آزمایشی');
    expect(await base.get<OperationalRecord>('support_cases',record.id)).toEqual(before);
  });

  it.each(['letter','treasury-execution','asset-transfer','offboarding','employee-advance','personnel-document','project','chat','message','recruitment-case'])('keeps %s behind its specialized mutation API', async (moduleId) => {
    const {base, service} = await setup(`specialized-${moduleId}`);
    const storesBefore = await base.exportSnapshot();
    await expect(service.createOperationalRecord(moduleId,{title:'دورزدن مسیر تخصصی'},`specialized-create-${moduleId}`)).rejects.toThrow('مسیر تخصصی');
    await expect(service.updateOperationalRecord(moduleId,'missing',1,{title:'دورزدن'},`specialized-update-${moduleId}`)).rejects.toThrow('مسیر تخصصی');
    await expect(service.transitionOperationalRecord(moduleId,'missing','missing.transition','',`specialized-transition-${moduleId}`)).rejects.toThrow('مسیر تخصصی');
    await expect(service.assignOperationalRecord(moduleId,'missing','missing-user','دورزدن',1,`specialized-assign-${moduleId}`)).rejects.toThrow('مسیر تخصصی');
    expect((await base.exportSnapshot()).stores).toEqual(storesBefore.stores);
  });

  it('fails closed if the browser-profile identity changes after command preparation', async () => {
    const {base, storage, service} = await setup('session');
    const state = await service.createOperationalRecord('support-case', {title:'آزمون نشست قدیمی'}, 'session-create');
    const record = state.operationalRecords.find((item) => item.moduleId === 'support-case' && item.title === 'آزمون نشست قدیمی')!;
    const before = structuredClone(await base.get<OperationalRecord>('support_cases', record.id));
    const target = state.users.find((user) => user.status === 'active' && user.id !== state.activeUser.id)!;
    storage.beforeNextReadwrite = async () => {
      const session = (await base.get<FoundationSession>('sessions','active-session'))!;
      await base.put('sessions', {...session, activeUserId: target.id, actingAdminUserId: undefined, signedOutAt: undefined, switchedAt:new Date().toISOString(), version:session.version + 1} satisfies FoundationSession);
    };
    await expect(service.updateOperationalRecord('support-case', record.id, record.version, {title:'نباید ثبت شود'}, 'stale-session-update')).rejects.toThrow('نشست کاربری در تب دیگری تغییر کرده');
    expect(await base.get<OperationalRecord>('support_cases', record.id)).toEqual(before);
    expect(await base.get('idempotency_keys','stale-session-update')).toBeUndefined();
  });

  it('rechecks current roles inside the write transaction before committing', async () => {
    const {base, storage, service} = await setup('role-revoke');
    const initial = await service.loadState();
    const moduleId = ['lead','support-case','followup'].find((candidate) => initial.users.some((user) => !user.isAdmin && user.status === 'active' && can(user, permissionFor(candidate,'transition'))));
    expect(moduleId).toBeTruthy();
    const actor = initial.users.find((user) => !user.isAdmin && user.status === 'active' && can(user, permissionFor(moduleId!,'transition')))!;
    let state = await service.createOperationalRecord(moduleId!, {title:'آزمون لغو نقش', unitId:actor.unitId, branchUnitId:actor.branchUnitId, assigneeUserId:actor.id}, 'role-revoke-create');
    const record = state.operationalRecords.find((item) => item.moduleId === moduleId && item.title === 'آزمون لغو نقش')!;
    const session = (await base.get<FoundationSession>('sessions','active-session'))!;
    await base.put('sessions', {...session,activeUserId:actor.id,actingAdminUserId:undefined,signedOutAt:undefined,switchedAt:new Date().toISOString(),version:session.version + 1} satisfies FoundationSession);
    const actorService = new LocalFoundationService(storage);
    state = await actorService.loadState();
    const workflow = state.workflows.find((item) => item.moduleId === moduleId)!;
    const transition = workflow.transitions.find((item) => item.from.includes(record.status))!;
    const before = structuredClone(await base.get<OperationalRecord>(recordStore(moduleId!), record.id));
    storage.beforeNextReadwrite = async () => {
      await base.transaction(['security_roles'],'readwrite',async(tx)=>{
        for(const roleId of actor.roleIds){const role=await tx.get<SecurityRole>('security_roles',roleId);if(role)await tx.put('security_roles',{...role,status:'inactive',version:(role.version??1)+1});}
      });
    };
    await expect(actorService.transitionOperationalRecord(moduleId!,record.id,transition.id,'دلیل آزمون','role-revoke-transition')).rejects.toThrow();
    expect(await base.get<OperationalRecord>(recordStore(moduleId!),record.id)).toEqual(before);
    expect(await base.get('idempotency_keys','role-revoke-transition')).toBeUndefined();
  });

  it('projects generic records, history and record-bound audits through the same view scope', async () => {
    const {base, service} = await setup('projection-scope');
    const createdState = await service.createOperationalRecord('support-case',{title:'رکورد پنهان محدوده'},'projection-hidden-create');
    const hidden = createdState.operationalRecords.find((item) => item.title === 'رکورد پنهان محدوده')!;
    const viewer = createdState.users.find((item) => !item.isAdmin && item.status === 'active' && item.id !== createdState.activeUser.id)!;
    const role:SecurityRole={id:'role-self-projection-test',name:'مشاهده فقط خود',description:'',status:'active',protected:false,scope:'SELF',permissions:[permissionFor('support-case','view'),'foundation.audit.view'],createdAt:'',updatedAt:'',version:1};
    await base.put('security_roles',role);
    const rawViewer=(await base.get<LocalUser>('users',viewer.id))!;
    await base.put('users',{...rawViewer,isAdmin:false,roleId:role.id,roleIds:[role.id],permissionGrants:[],permissionDenials:[]} satisfies LocalUser);
    await switchIdentity(base,viewer.id);
    const projected=await new LocalFoundationService(base).loadState();
    expect(projected.operationalRecords.some((item)=>item.id===hidden.id)).toBe(false);
    expect(projected.operationalHistory.some((item)=>item.recordId===hidden.id)).toBe(false);
    expect(projected.audits.some((item)=>item.metadata?.recordId===hidden.id)).toBe(false);

    const incomplete:AuditEvent={id:'audit-incomplete-record-bound',sequence:999999,companyId:viewer.companyId,category:'system',action:'support.support-case.edited',actorId:viewer.actorId,actorName:viewer.name,effectiveUserId:viewer.id,occurredAt:new Date().toISOString(),summary:'نباید بدون شناسه رکورد دیده شود',outcome:'success',correlationId:'projection-incomplete'};
    await base.put('audit_events',incomplete);
    expect((await new LocalFoundationService(base).loadState()).audits.some((item)=>item.id===incomplete.id)).toBe(false);
  });

  it('returns metadata-only sanitized history while keeping the raw business history unchanged', async () => {
    const {base,service}=await setup('history-sanitizer');
    const state=await service.createOperationalRecord('support-case',{title:'سنتینل تاریخچه'},'history-sanitizer-create');
    const record=state.operationalRecords.find((item)=>item.title==='سنتینل تاریخچه')!;
    const history=(await base.getAll<OperationalRecordHistory>('workflow_history')).find((item)=>item.recordId===record.id)!;
    const canary='CANARY-6219861984162049';
    const unsafe:OperationalRecordHistory={...history,snapshot:{...history.snapshot,nested:{cardNumber:canary,iban:'IR-CANARY',neutralBase64:'Q'.repeat(256)},attachment:{fileName:'evidence.pdf',mimeType:'application/pdf',size:42,dataUrl:`data:application/pdf;base64,${canary}`,fileRef:'secret-file-ref'}}};
    await base.put('workflow_history',unsafe);
    const projected=await service.loadState();
    const projectedHistory=projected.operationalHistory.find((item)=>item.id===history.id)!;
    const projectedText=JSON.stringify(projectedHistory.snapshot);
    expect(projectedText).not.toContain(canary);
    expect(projectedText).not.toContain('secret-file-ref');
    expect(projectedText).toContain('evidence.pdf');
    expect((await base.get<OperationalRecordHistory>('workflow_history',history.id))?.snapshot).toEqual(unsafe.snapshot);
  });

  it('revalidates invoice payment dependencies inside the transition transaction', async () => {
    const {base,storage,service}=await setup('invoice-dependency');
    let state=await service.createOperationalRecord('invoice',{title:'فاکتور وابستگی',amountRial:'100'},'invoice-dep-create');
    let invoice=state.operationalRecords.find((item)=>item.title==='فاکتور وابستگی')!;
    state=await service.createOperationalRecord('payment',{title:'پرداخت وابستگی',amountRial:'100',relatedRecordId:invoice.id},'payment-dep-create');
    const payment=state.operationalRecords.find((item)=>item.title==='پرداخت وابستگی')!;
    await base.put('payments',{...payment,status:'approved',version:payment.version+1});
    state=await service.transitionOperationalRecord('invoice',invoice.id,'invoice.issued','','invoice-dep-issued');invoice=state.operationalRecords.find((item)=>item.id===invoice.id)!;
    state=await service.transitionOperationalRecord('invoice',invoice.id,'invoice.payment_review','','invoice-dep-review');invoice=state.operationalRecords.find((item)=>item.id===invoice.id)!;
    const reviewer=state.users.find((item)=>!item.isAdmin&&item.status==='active')!;
    const reviewerRole:SecurityRole={id:'role-invoice-dependency-reviewer',name:'بازبین فاکتور آزمون',description:'',status:'active',protected:false,scope:'COMPANY',permissions:[permissionFor('invoice','view'),permissionFor('invoice','approve')],createdAt:'',updatedAt:'',version:1};
    await base.put('security_roles',reviewerRole);const rawReviewer=(await base.get<LocalUser>('users',reviewer.id))!;await base.put('users',{...rawReviewer,roleId:reviewerRole.id,roleIds:[reviewerRole.id],permissionGrants:[],permissionDenials:[]} satisfies LocalUser);await switchIdentity(base,reviewer.id);
    const reviewerService=new LocalFoundationService(storage);await reviewerService.loadState();
    storage.beforeNextReadwrite=async()=>{const current=(await base.get<OperationalRecord>('payments',payment.id))!;await base.put('payments',{...current,status:'rejected',version:current.version+1});};
    await expect(reviewerService.transitionOperationalRecord('invoice',invoice.id,'invoice.financially_cleared','','invoice-dep-final')).rejects.toThrow('دقیقاً برابر');
    expect((await base.get<OperationalRecord>('invoices',invoice.id))?.status).toBe('payment_review');
  });

  it('revalidates reservation invoice and support financial rows inside their transitions', async () => {
    const {base,storage,service}=await setup('related-dependencies');
    let state=await service.createOperationalRecord('invoice',{title:'فاکتور رزرو',amountRial:'50'},'reservation-invoice-create');
    const invoice=state.operationalRecords.find((item)=>item.title==='فاکتور رزرو')!;
    await base.put('invoices',{...invoice,status:'financially_cleared',version:invoice.version+1});
    state=await service.createOperationalRecord('reservation',{title:'رزرو وابسته',relatedRecordId:invoice.id,quantity:'1'},'reservation-create');
    const reservation=state.operationalRecords.find((item)=>item.title==='رزرو وابسته')!;
    storage.beforeNextReadwrite=async()=>{const current=(await base.get<OperationalRecord>('invoices',invoice.id))!;await base.put('invoices',{...current,status:'issued',version:current.version+1});};
    await expect(service.transitionOperationalRecord('reservation',reservation.id,'reservation.allocated','','reservation-allocate')).rejects.toThrow('تأیید مالی');

    state=await service.createOperationalRecord('support-case',{title:'پشتیبانی وابستگی'},'support-dep-create');
    let support=state.operationalRecords.find((item)=>item.title==='پشتیبانی وابستگی')!;
    state=await service.createOperationalRecord('support-transaction',{title:'ردیف مالی وابسته',relatedRecordId:support.id,amountRial:'10'},'support-row-create');
    const row=state.operationalRecords.find((item)=>item.title==='ردیف مالی وابسته')!;
    await base.put('support_transactions',{...row,status:'paid',version:row.version+1});
    for(const transitionId of ['support-case.in_review','support-case.waiting_customer','support-case.resolved']){state=await service.transitionOperationalRecord('support-case',support.id,transitionId,'دلیل مرحله',`support-dep-${transitionId}`);support=state.operationalRecords.find((item)=>item.id===support.id)!;}
    storage.beforeNextReadwrite=async()=>{const current=(await base.get<OperationalRecord>('support_transactions',row.id))!;await base.put('support_transactions',{...current,status:'pending_financial_approval',version:current.version+1});};
    await expect(service.transitionOperationalRecord('support-case',support.id,'support-case.closed','دلیل بستن','support-dep-close')).rejects.toThrow('ردیف‌های مالی');
    expect((await base.get<OperationalRecord>('support_cases',support.id))?.status).toBe('resolved');
  });

  it('rechecks the secondary shipment-manage permission inside the transaction', async () => {
    const {base,service}=await setup('shipment-secondary-permission');
    const initial=await service.loadState();
    const actor=initial.users.find((item)=>!item.isAdmin&&item.status==='active'&&item.unitId)!;
    const role:SecurityRole={id:'role-shipment-transition-only',name:'ارسال بدون مدیریت',description:'',status:'active',protected:false,scope:'UNIT',permissions:[permissionFor('shipment','view'),permissionFor('shipment','transition')],createdAt:'',updatedAt:'',version:1};
    await base.put('security_roles',role);
    const raw=(await base.get<LocalUser>('users',actor.id))!;await base.put('users',{...raw,roleId:role.id,roleIds:[role.id],permissionGrants:[],permissionDenials:[]} satisfies LocalUser);
    const state=await service.createOperationalRecord('shipment',{title:'ارسال تفکیکی کنترل‌شده',unitId:actor.unitId,assigneeUserId:actor.id,payload:{splitShipment:true}},'shipment-secondary-create');
    const shipment=state.operationalRecords.find((item)=>item.title==='ارسال تفکیکی کنترل‌شده')!;
    await switchIdentity(base,actor.id);
    const actorService=new LocalFoundationService(base);await actorService.loadState();
    await expect(actorService.transitionOperationalRecord('shipment',shipment.id,'shipment.ready_to_ship','دلیل تفکیک','shipment-secondary-transition')).rejects.toThrow('مجوز مستقل مدیریت');
    expect((await base.get<OperationalRecord>('shipments',shipment.id))?.status).toBe('draft');
  });

  it('keeps personnel compensation atomic and rejects an assignment after the session changes', async () => {
    const {base,storage,service}=await setup('personnel-secure-writes');
    const state=await service.loadState();
    const seller=(await base.getAll<PersonnelRecord>('personnel')).find((person)=>person.employmentStatus==='active'&&Boolean(person.salesHierarchyLevel))!;
    expect(seller).toBeTruthy();
    const beforeSeller=structuredClone(seller);
    storage.failNextPutStore='audit_events';
    await expect(service.addSalesCompensation(seller.id,{mode:'fixed_salary_plus_commission',monthlyFixedSalaryRial:'45000000',commissionPercent:'7.5',effectiveFrom:'2026-09-01',reason:'مصوبه جدید فروش'})).rejects.toThrow('injected');
    expect(await base.get<PersonnelRecord>('personnel',seller.id)).toEqual(beforeSeller);
    await service.addSalesCompensation(seller.id,{mode:'fixed_salary_plus_commission',monthlyFixedSalaryRial:'45000000',commissionPercent:'7.5',effectiveFrom:'2026-09-01',reason:'مصوبه جدید فروش'});
    const compensationAudit=(await base.getAll<AuditEvent>('audit_events')).find((audit)=>audit.action==='organization.personnel.sales_compensation_changed'&&audit.metadata?.personnelId===seller.id)!;
    expect(JSON.stringify(compensationAudit.metadata)).not.toContain('45000000');
    expect(JSON.stringify(compensationAudit.metadata)).not.toContain('7.5');

    const personnel=(await base.getAll<PersonnelRecord>('personnel')).find((person)=>person.employmentStatus==='active'&&!person.salesHierarchyLevel)!;
    const branch=(await base.getAll<OrganizationalUnit>('organizational_units')).find((unit)=>unit.companyId===state.activeUser.companyId&&unit.status==='active'&&unit.id!==personnel.branchUnitId&&unit.type.includes('شعبه'))!;
    expect(personnel&&branch).toBeTruthy();
    const before=structuredClone(personnel);
    storage.beforeNextReadwrite=async()=>{const session=(await base.get<FoundationSession>('sessions','active-session'))!;const other=state.users.find((user)=>user.status==='active'&&user.id!==state.activeUser.id)!;await base.put('sessions',{...session,activeUserId:other.id,version:session.version+1,switchedAt:new Date().toISOString()} satisfies FoundationSession);};
    await expect(service.changePersonnelAssignment(personnel.id,{kind:'branch_transfer',targetId:branch.id,effectiveDate:'2026-09-01',previousEndDate:personnel.branchUnitId?'2026-08-31':undefined,newStartDate:'2026-09-01',reason:'انتقال آزمایشی شعبه'})).rejects.toThrow('نشست کاربری');
    expect(await base.get<PersonnelRecord>('personnel',personnel.id)).toEqual(before);
  });

  it('rechecks CRM role, session and exact unit scope before customer writes', async () => {
    const {base,storage}=await setup('crm-secure-writes');
    const seedState=await new LocalFoundationService(base).loadState();
    const actor=seedState.users.find((user)=>!user.isAdmin&&user.status==='active'&&Boolean(user.unitId)&&Boolean(user.personnelId))!;
    const role:SecurityRole={id:'role-crm-unit-secure-test',name:'CRM واحدی آزمون',description:'',status:'active',protected:false,scope:'UNIT',permissions:['crm.customers.view','crm.customers.edit','crm.customers.status.manage','crm.customers.merge'],createdAt:'',updatedAt:'',version:1};
    await base.put('security_roles',role);const rawActor=(await base.get<LocalUser>('users',actor.id))!;await base.put('users',{...rawActor,roleId:role.id,roleIds:[role.id],permissionGrants:[],permissionDenials:[]} satisfies LocalUser);
    const template=(await base.getAll<CustomerRecord>('customers'))[0];
    const own:CustomerRecord={...template,id:'customer-crm-unit-own',companyId:actor.companyId,unitId:actor.unitId,ownerPersonnelId:actor.personnelId,displayName:'مشتری واحد خود',updatedAt:'2026-08-28T00:00:00.000Z'};
    const otherUnit=seedState.units.find((unit)=>unit.companyId===actor.companyId&&unit.status==='active'&&unit.id!==actor.unitId)!;
    const hidden:CustomerRecord={...own,id:'customer-crm-unit-hidden',unitId:otherUnit.id,ownerPersonnelId:undefined,displayName:'مشتری واحد دیگر'};
    await base.put('customers',own);await base.put('customers',hidden);await switchIdentity(base,actor.id);
    const service=new LocalFoundationService(storage);await service.loadState();
    const input={type:own.type,firstName:own.firstName,lastName:own.lastName,legalName:own.legalName,nationalId:own.nationalId,businessId:own.businessId,economicCode:own.economicCode,status:own.status,phones:own.phones,email:own.email,addresses:own.addresses,source:own.source,provenance:own.provenance,ownerPersonnelId:own.ownerPersonnelId,notes:'ویرایش امن',relationships:own.relationships};
    storage.beforeNextReadwrite=async()=>{await base.put('security_roles',{...role,status:'inactive',version:2});};
    await expect(service.updateCustomer(own.id,input)).rejects.toThrow('دسترسی یا محدوده');
    expect(await base.get<CustomerRecord>('customers',own.id)).toEqual(own);
    await base.put('security_roles',role);
    const sessionBefore=(await base.get<FoundationSession>('sessions','active-session'))!;
    storage.beforeNextReadwrite=async()=>{const admin=seedState.users.find((user)=>user.isAdmin)!;await base.put('sessions',{...sessionBefore,activeUserId:admin.id,version:sessionBefore.version+1,switchedAt:new Date().toISOString()} satisfies FoundationSession);};
    await expect(service.setCustomerStatus(own.id,'inactive')).rejects.toThrow('نشست کاربری');
    expect((await base.get<CustomerRecord>('customers',own.id))?.status).toBe(own.status);
    await switchIdentity(base,actor.id);
    await expect(new LocalFoundationService(base).updateCustomer(hidden.id,{...input,ownerPersonnelId:undefined})).rejects.toThrow('پیدا نشد');
    expect(await base.get<CustomerRecord>('customers',hidden.id)).toEqual(hidden);
  });

  it('imports customers atomically, detects batch duplicates, and replays only the same SHA request', async()=>{
    const {base,storage,service}=await setup('customer-import-atomic');
    const initial=await service.loadState();
    const template=(await base.getAll<CustomerRecord>('customers'))[0];
    await base.put('customers',{...template,id:'customer-import-existing',companyId:initial.activeUser.companyId,displayName:'مشتری موجود ورود',nationalId:undefined,businessId:undefined,phones:[{id:'existing-phone',label:'اصلی',number:'09121110000',primary:true}],updatedAt:'2026-08-28T00:00:00.000Z'} satisfies CustomerRecord);
    const rows:CustomerImportRow[]=[
      {name:'ملیکا آزمون',phone:'09122220000',source:'آزمون'},
      {name:'ملیکا تکراری',phone:'09122220000',source:'آزمون'},
      {name:'مشتری موجود',phone:'09121110000',source:'آزمون'},
      {name:'',phone:'09123330000',source:'آزمون'},
    ];
    storage.failNextPutStore='audit_events';
    await expect(service.importCustomers(rows,'atomic.csv','customer-import-atomic-command')).rejects.toThrow('injected');
    expect((await base.getAll<CustomerRecord>('customers')).some((customer)=>customer.displayName==='ملیکا آزمون')).toBe(false);
    expect((await base.getAll<CustomerImportJob>('customer_imports')).some((job)=>job.fileName==='atomic.csv')).toBe(false);
    expect(await base.get('idempotency_keys','customer-import-atomic-command')).toBeUndefined();

    storage.failReadAfterCommandId='customer-import-atomic-command';
    await expect(service.importCustomers(rows,'atomic.csv','customer-import-atomic-command')).rejects.toThrow('post-commit');
    let state=await service.importCustomers(rows,'atomic.csv','customer-import-atomic-command');
    expect(state.customers.filter((customer)=>customer.displayName==='ملیکا آزمون')).toHaveLength(1);
    const job=state.customerImports.find((item)=>item.fileName==='atomic.csv')!;
    expect(job).toMatchObject({totalRows:4,importedRows:1,duplicateRows:2,invalidRows:1});
    state=await service.importCustomers(rows,'atomic.csv','customer-import-atomic-command');
    expect(state.customers.filter((customer)=>customer.displayName==='ملیکا آزمون')).toHaveLength(1);
    expect(state.customerImports.filter((item)=>item.fileName==='atomic.csv')).toHaveLength(1);
    await expect(service.importCustomers(rows,'different.csv','customer-import-atomic-command')).rejects.toThrow('شناسه این فرمان');

    const actor=state.users.find((user)=>!user.isAdmin&&user.status==='active'&&Boolean(user.personnelId)&&Boolean(user.unitId))!;
    const role:SecurityRole={id:'role-customer-import-unit-race',name:'ورود مشتری واحدی',description:'',status:'active',protected:false,scope:'UNIT',permissions:['crm.customers.view','crm.customers.import'],createdAt:'',updatedAt:'',version:1};
    await base.put('security_roles',role);const rawActor=(await base.get<LocalUser>('users',actor.id))!;await base.put('users',{...rawActor,roleId:role.id,roleIds:[role.id],permissionGrants:[],permissionDenials:[]} satisfies LocalUser);await switchIdentity(base,actor.id);
    const actorService=new LocalFoundationService(storage);await actorService.loadState();
    storage.beforeNextReadwrite=async()=>{await base.put('security_roles',{...role,status:'inactive',version:2});};
    await expect(actorService.importCustomers([{name:'نقش لغوشده',phone:'09124440000'}],'revoked.csv','customer-import-role-race')).rejects.toThrow(/نقش|دسترسی|مجوز/);
    expect((await base.getAll<CustomerRecord>('customers')).some((customer)=>customer.displayName==='نقش لغوشده')).toBe(false);
  });

  it('projects personnel change requests and CRM audits only for exact UNIT resources',async()=>{
    const {base}=await setup('profile-crm-audit-scope');
    const viewer=(await base.get<LocalUser>('users','persona-user-manager'))!;
    const ownTarget=(await base.get<PersonnelRecord>('personnel',viewer.personnelId!))!;
    const otherTarget=(await base.getAll<PersonnelRecord>('personnel')).find((person)=>person.unitId!==viewer.unitId&&person.employmentStatus==='active')!;
    const role:SecurityRole={id:'role-unit-profile-crm-auditor',name:'بازبین واحدی پرونده و مشتری',description:'',status:'active',protected:false,scope:'UNIT',permissions:['foundation.audit.view','organization.personnel.changes.review','crm.customers.view'],createdAt:'',updatedAt:'',version:1};
    await base.put('security_roles',role);await base.put('users',{...viewer,isAdmin:false,roleId:role.id,roleIds:[role.id],permissionGrants:[],permissionDenials:[]} satisfies LocalUser);
    const requestBase={trackingCode:'PCR-SCOPE',status:'submitted' as const,beforeValues:{city:'تهران',primaryMobile:'09120000000'},requestedValues:{city:'شیراز',primaryMobile:'09129999999'},reason:'اصلاح اطلاعات',version:1,createdAt:'2026-08-28T00:00:00.000Z',updatedAt:'2026-08-28T00:00:00.000Z'};
    const ownRequest:PersonnelProfileChangeRequest={...requestBase,id:'profile-request-own-unit',personnelId:ownTarget.id,requesterUserId:'requester-own-unit',requesterName:'درخواست‌کننده واحد خود'};
    const hiddenRequest:PersonnelProfileChangeRequest={...requestBase,id:'profile-request-other-unit',personnelId:otherTarget.id,requesterUserId:'requester-other-unit',requesterName:'درخواست‌کننده واحد دیگر'};
    const selfHiddenRequest:PersonnelProfileChangeRequest={...requestBase,id:'profile-request-self-other-unit',personnelId:otherTarget.id,requesterUserId:viewer.id,requesterName:viewer.name};
    await base.put('personnel_profile_change_requests',ownRequest);await base.put('personnel_profile_change_requests',hiddenRequest);await base.put('personnel_profile_change_requests',selfHiddenRequest);

    const template=(await base.getAll<CustomerRecord>('customers'))[0];
    const ownCustomer:CustomerRecord={...template,id:'customer-audit-own-unit',companyId:viewer.companyId,unitId:viewer.unitId,ownerPersonnelId:viewer.personnelId,displayName:'مشتری واحد مجاز'};
    const otherCustomer:CustomerRecord={...template,id:'customer-audit-other-unit',companyId:viewer.companyId,unitId:otherTarget.unitId,ownerPersonnelId:otherTarget.id,displayName:'مشتری محرمانه واحد دیگر'};
    const ownImport:CustomerImportJob={id:'import-audit-own-unit',companyId:viewer.companyId,unitId:viewer.unitId,ownerPersonnelId:viewer.personnelId,fileName:'own-visible.csv',totalRows:1,importedRows:1,duplicateRows:0,invalidRows:0,actorName:viewer.name,createdAt:'2026-08-28T00:00:00.000Z'};
    const otherImport:CustomerImportJob={...ownImport,id:'import-audit-other-unit',unitId:otherTarget.unitId,ownerPersonnelId:otherTarget.id,fileName:'other-secret.csv'};
    await base.put('customers',ownCustomer);await base.put('customers',otherCustomer);await base.put('customer_imports',ownImport);await base.put('customer_imports',otherImport);
    const auditBase={companyId:viewer.companyId,category:'data' as const,actorId:viewer.actorId,actorName:viewer.name,effectiveUserId:viewer.id,occurredAt:'2026-08-28T00:00:00.000Z',outcome:'success' as const,correlationId:'crm-scope-audit'};
    const audits:AuditEvent[]=[
      {...auditBase,id:'audit-crm-own-customer',sequence:9601,action:'crm.customer.updated',summary:'مشتری واحد مجاز',metadata:{customerId:ownCustomer.id}},
      {...auditBase,id:'audit-crm-other-customer',sequence:9602,action:'crm.customer.updated',summary:'مشتری محرمانه واحد دیگر',metadata:{customerId:otherCustomer.id}},
      {...auditBase,id:'audit-crm-own-import',sequence:9603,action:'crm.customer.imported',summary:'فایل own-visible.csv',metadata:{importJobId:ownImport.id}},
      {...auditBase,id:'audit-crm-other-import',sequence:9604,action:'crm.customer.imported',summary:'فایل other-secret.csv',metadata:{importJobId:otherImport.id}},
      {...auditBase,id:'audit-crm-missing-resource',sequence:9605,action:'crm.customer.updated',summary:'نام بدون شناسه',metadata:{}},
    ];
    for(const audit of audits)await base.put('audit_events',audit);
    await switchIdentity(base,viewer.id);const state=await new LocalFoundationService(base).loadState();
    expect(state.personnelProfileChangeRequests.find((request)=>request.id===ownRequest.id)?.requestedValues.city).toBe('شیراز');
    expect(state.personnelProfileChangeRequests.some((request)=>request.id===hiddenRequest.id)).toBe(false);
    expect(state.personnelProfileChangeRequests.find((request)=>request.id===selfHiddenRequest.id)).toMatchObject({beforeValues:{},requestedValues:{}});
    const auditIds=state.audits.map((audit)=>audit.id);expect(auditIds).toEqual(expect.arrayContaining(['audit-crm-own-customer','audit-crm-own-import']));
    expect(auditIds).not.toEqual(expect.arrayContaining(['audit-crm-other-customer','audit-crm-other-import','audit-crm-missing-resource']));
    expect(JSON.stringify(state.audits)).not.toMatch(/مشتری محرمانه واحد دیگر|other-secret\.csv|نام بدون شناسه/);
  });

  it('rejects a role or scope mutation that would strand an unvoted frozen approval seat',async()=>{
    const {base,service}=await setup('approval-seat-role-mutation');
    const workflow=(await base.getAll<WorkflowDefinition>('workflow_definitions')).find((item)=>item.moduleId==='purchase-request')!;
    const stage=workflow.approvalStages!.find((item)=>item.stateId==='submitted')!;
    const approver=(await base.get<LocalUser>('users','persona-purchase-approver'))!;
    const record:OperationalRecord={id:'purchase-open-seat',moduleId:'purchase-request',domain:'procurement',trackingCode:'PRQ-SEAT',title:'درخواست با رأی باز',description:'',status:'submitted',priority:'normal',companyId:approver.companyId,unitId:'unit-sales',assigneeUserId:approver.id,createdByActorId:'actor-purchase-requester',createdByUserId:'persona-purchase-requester',updatedByActorId:'actor-purchase-requester',workflowVersion:workflow.version,workflowRouteId:'base',version:3,payload:{},createdAt:'2026-08-28T00:00:00.000Z',updatedAt:'2026-08-28T00:00:00.000Z'};
    const round=createApprovalRound({id:`approval:purchase-request:${record.id}:v${workflow.version}:base:${stage.id}:entry-${record.version}`,record,stage,electorate:[approver],now:'2026-08-28T00:00:00.000Z'});
    await base.put('purchase_requests',record);await base.put('workflow_approval_rounds',round);
    const role=(await base.get<SecurityRole>('security_roles','role-purchase-approver'))!;
    await expect(service.setRoleStatus(role.id,role.version??1,'inactive')).rejects.toThrow(/جایگاه رأی باز/);
    expect((await base.get<SecurityRole>('security_roles',role.id))?.status).toBe('active');
    expect(await base.get<WorkflowApprovalRound>('workflow_approval_rounds',round.id)).toEqual(round);
    await expect(service.updateRole(role.id,role.version??1,{name:role.name,description:role.description,scope:'UNIT',permissions:role.permissions})).rejects.toThrow(/جایگاه رأی باز/);
    expect((await base.get<SecurityRole>('security_roles',role.id))?.scope).toBe(role.scope);
  });

  it('publishes workflow policy atomically with replay, CAS, stale-session and rollback protection',async()=>{
    const first=await setup('workflow-policy-command');
    const workflow=(await first.base.getAll<WorkflowDefinition>('workflow_definitions')).find((item)=>item.moduleId==='purchase-request')!;
    const input={queueStrategy:workflow.queueStrategy,assignmentPolicy:'سیاست نسخه‌دار و اتمیک درخواست خرید',approvalPolicyId:workflow.approvalPolicyId,approvalStages:workflow.approvalStages!,routeVariants:workflow.routeVariants??[],changeSummary:'فعال‌سازی قانون چندتأییدی کنترل‌شده'};
    let state=await first.service.updateWorkflowPolicy('purchase-request',workflow.version,input,'workflow-policy-stable-command');
    expect(state.workflows.find((item)=>item.moduleId==='purchase-request')?.version).toBe(workflow.version+1);
    state=await first.service.updateWorkflowPolicy('purchase-request',workflow.version,input,'workflow-policy-stable-command');
    expect(state.workflows.find((item)=>item.moduleId==='purchase-request')?.version).toBe(workflow.version+1);
    await expect(first.service.updateWorkflowPolicy('purchase-request',workflow.version,{...input,changeSummary:'محتوای متفاوت برای همان فرمان'},'workflow-policy-stable-command')).rejects.toThrow(/شناسه فرمان/);

    const race=await setup('workflow-policy-race');const raceWorkflow=(await race.base.getAll<WorkflowDefinition>('workflow_definitions')).find((item)=>item.moduleId==='purchase-request')!;
    const raceInput={queueStrategy:raceWorkflow.queueStrategy,assignmentPolicy:'سیاست اتمیک گردش نامه سازمانی',approvalPolicyId:raceWorkflow.approvalPolicyId,approvalStages:raceWorkflow.approvalStages!,routeVariants:raceWorkflow.routeVariants??[],changeSummary:'انتشار هم‌زمان سیاست نامه'};
    const outcomes=await Promise.allSettled([
      new LocalFoundationService(race.base).updateWorkflowPolicy('purchase-request',raceWorkflow.version,raceInput,'workflow-policy-race-a'),
      new LocalFoundationService(race.base).updateWorkflowPolicy('purchase-request',raceWorkflow.version,{...raceInput,changeSummary:'انتشار رقیب سیاست نامه'},'workflow-policy-race-b'),
    ]);
    const rejectedReasons=outcomes.filter((item):item is PromiseRejectedResult=>item.status==='rejected').map((item)=>item.reason instanceof Error?item.reason.message:String(item.reason));
    expect(outcomes.filter((item)=>item.status==='fulfilled'),rejectedReasons.join(' | ')).toHaveLength(1);expect(outcomes.filter((item)=>item.status==='rejected')).toHaveLength(1);
    expect((await race.base.getAll<WorkflowDefinition>('workflow_versions')).filter((item)=>item.id===`${raceWorkflow.id}-v${raceWorkflow.version}`)).toHaveLength(1);

    const stale=await setup('workflow-policy-stale-session');const staleWorkflow=(await stale.base.getAll<WorkflowDefinition>('workflow_definitions')).find((item)=>item.moduleId==='employee-advance')!;
    const staleInput={queueStrategy:staleWorkflow.queueStrategy,assignmentPolicy:'سیاست معتبر ولی با نشست منقضی',approvalPolicyId:staleWorkflow.approvalPolicyId,approvalStages:staleWorkflow.approvalStages!,routeVariants:staleWorkflow.routeVariants??[],changeSummary:'آزمون تغییر نشست پیش از ثبت'};
    stale.storage.beforeNextReadwrite=async()=>switchIdentity(stale.base,'persona-seller');
    await expect(stale.service.updateWorkflowPolicy('employee-advance',staleWorkflow.version,staleInput,'workflow-policy-stale')).rejects.toThrow(/نشست|هویت/);
    expect((await stale.base.get<WorkflowDefinition>('workflow_definitions',staleWorkflow.id))?.version).toBe(staleWorkflow.version);

    const rollback=await setup('workflow-policy-rollback');const rollbackWorkflow=(await rollback.base.getAll<WorkflowDefinition>('workflow_definitions')).find((item)=>item.moduleId==='purchase-request')!;
    rollback.storage.failNextPutStore='audit_events';
    await expect(rollback.service.updateWorkflowPolicy('purchase-request',rollbackWorkflow.version,{queueStrategy:rollbackWorkflow.queueStrategy,assignmentPolicy:'سیاست نامه با rollback کامل',approvalPolicyId:rollbackWorkflow.approvalPolicyId,approvalStages:rollbackWorkflow.approvalStages!,routeVariants:rollbackWorkflow.routeVariants??[],changeSummary:'آزمون خطای ممیزی اتمیک'},'workflow-policy-rollback')).rejects.toThrow('injected');
    expect((await rollback.base.get<WorkflowDefinition>('workflow_definitions',rollbackWorkflow.id))?.version).toBe(rollbackWorkflow.version);
    expect(await rollback.base.get('idempotency_keys','workflow-policy-rollback')).toBeUndefined();
  });

  it('publishes the seeded letter workflow without repairing its default stages first',async()=>{
    const {base,service}=await setup('letter-policy-default-publish');
    const workflow=(await base.getAll<WorkflowDefinition>('workflow_definitions')).find((item)=>item.moduleId==='letter')!;
    expect(workflow.approvalStages).toMatchObject([{stateId:'in_review',roleIds:['role-letter-reviewer']}]);
    const state=await service.updateWorkflowPolicy('letter',workflow.version,{queueStrategy:workflow.queueStrategy,assignmentPolicy:`${workflow.assignmentPolicy} — انتشار آزمایشی`,approvalPolicyId:workflow.approvalPolicyId,approvalStages:workflow.approvalStages!,routeVariants:workflow.routeVariants??[],changeSummary:'انتشار سیاست معتبر نامه بدون ترمیم دستی'},'letter-policy-default-command');
    expect(state.workflows.find((item)=>item.moduleId==='letter')).toMatchObject({version:workflow.version+1,assignmentPolicy:`${workflow.assignmentPolicy} — انتشار آزمایشی`});
    expect(await base.get('idempotency_keys','letter-policy-default-command')).toBeTruthy();
  });

  it.each([
    ['purchase-request','submitted','purchase_requests'],
    ['letter','in_review','letters'],
    ['employee-advance','accounting_review','employee_advances'],
  ] as const)('blocks a personnel transfer that would invalidate an open %s UNIT/specific approval seat and allows an eligible transfer',async(moduleId,stateId,store)=>{
    const {base,service}=await setup(`personnel-seat-transfer-${moduleId}`);
    const user=(await base.get<LocalUser>('users','persona-purchase-approver'))!;
    const personnel=(await base.get<PersonnelRecord>('personnel',user.personnelId!))!;
    const role:SecurityRole={id:`role-${moduleId}-unit-seat-test`,name:`کرسی واحدی ${moduleId}`,description:'آزمون انتقال سازمانی امن',status:'active',protected:false,scope:'UNIT',permissions:[permissionFor(moduleId,'view'),permissionFor(moduleId,'approve')],createdAt:'2026-08-28T00:00:00.000Z',updatedAt:'2026-08-28T00:00:00.000Z',version:1};
    await base.put('security_roles',role);
    await base.put('users',{...user,roleId:role.id,roleIds:[role.id],permissionGrants:[],permissionDenials:[]} satisfies LocalUser);
    const workflow=(await base.getAll<WorkflowDefinition>('workflow_definitions')).find((item)=>item.moduleId===moduleId)!;
    const stage:WorkflowApprovalStageDefinition={id:`${moduleId}-transfer-seat`,title:'تأیید واحد فعلی',stateId,roleIds:[role.id],scope:'UNIT',decisions:['approve','reject','needs_correction'],required:true,allowSelfApproval:false,assignmentMode:'specific_user',assigneeUserId:user.id,approvalMode:'ANY'};
    const configured={...workflow,approvalStages:[stage]};
    await base.put('workflow_definitions',configured);await base.put('workflow_versions',{...configured,id:`${workflow.id}-v${workflow.version}`,workflowId:workflow.id});
    const record:OperationalRecord={id:`${moduleId}-personnel-seat`,moduleId,domain:moduleId==='letter'?'letter':moduleId==='employee-advance'?'hr':'procurement',trackingCode:`SEAT-${moduleId}`,title:'پرونده دارای کرسی باز واحدی',description:'',status:stateId,priority:'normal',companyId:user.companyId,unitId:user.unitId,assigneeUserId:user.id,createdByActorId:'actor-seat-maker',createdByUserId:'persona-product-owner',updatedByActorId:'actor-seat-maker',workflowVersion:workflow.version,workflowRouteId:'base',version:2,payload:moduleId==='employee-advance'?{unitId:user.unitId,branchUnitId:'unit-branch-central',beneficiaryUserId:'persona-seller'}:{},createdAt:'2026-08-28T00:00:00.000Z',updatedAt:'2026-08-28T00:00:00.000Z'};
    const round=createApprovalRound({id:`approval:${moduleId}:${record.id}:transfer`,record,stage,electorate:[user],now:'2026-08-28T00:00:00.000Z'});
    await base.put(store,record);await base.put('workflow_approval_rounds',round);
    const beforePersonnel=structuredClone(personnel);const beforeUser=await base.get<LocalUser>('users',user.id);const beforeAudits=(await base.getAll('audit_events')).length;const beforeEvents=(await base.getAll('domain_events')).length;
    const movement={kind:'unit_change' as const,targetId:'unit-it',targetPositionId:'position-specialist',effectiveDate:'2026-09-01',reason:'انتقال کنترل‌شده کرسی رأی'};
    await expect(service.changePersonnelAssignment(personnel.id,movement)).rejects.toThrow(/جایگاه رأی باز|تداوم مسئولیت/);
    expect(await base.get<PersonnelRecord>('personnel',personnel.id)).toEqual(beforePersonnel);expect(await base.get<LocalUser>('users',user.id)).toEqual(beforeUser);expect((await base.getAll('audit_events')).length).toBe(beforeAudits);expect((await base.getAll('domain_events')).length).toBe(beforeEvents);

    const targetRecord={...record,unitId:'unit-it',payload:moduleId==='employee-advance'?{...record.payload,unitId:'unit-it'}:record.payload};
    await base.put(store,targetRecord);
    const result=await service.changePersonnelAssignment(personnel.id,movement);
    expect(result.personnel.find((item)=>item.id===personnel.id)).toMatchObject({unitId:'unit-it',positionId:'position-specialist'});
    expect(result.users.find((item)=>item.id===user.id)).toMatchObject({unitId:'unit-it',positionId:'position-specialist'});
  });

  it('rechecks role-assignment permission inside updateUser and rolls back when it is revoked before the transaction',async()=>{
    const {base,storage}=await setup('update-user-role-assign-revoke');
    const actor=(await base.getAll<LocalUser>('users')).find((item)=>item.roleIds.includes('role-user-manager'))!;
    const target=(await base.get<LocalUser>('users','persona-laleh'))!;
    await switchIdentity(base,actor.id);
    const service=new LocalFoundationService(storage);await service.loadState();
    const before=structuredClone(target);const beforeAudits=(await base.getAll('audit_events')).length;const beforeEvents=(await base.getAll('domain_events')).length;const beforeReceipts=(await base.getAll('idempotency_keys')).length;
    storage.beforeNextReadwrite=async()=>{const current=(await base.get<LocalUser>('users',actor.id))!;await base.put('users',{...current,permissionDenials:[...new Set([...(current.permissionDenials??[]),'organization.roles.assign'])]});};
    await expect(service.updateUser(target.id,userConcurrencyToken(target),{name:target.name,username:target.username,unitId:target.unitId,positionId:target.positionId,managerUserId:target.managerUserId,roleIds:target.roleIds,permissionDenials:['foundation.dashboard.view']})).rejects.toThrow(/انتساب نقش|ریزمجوز/);
    expect(await base.get<LocalUser>('users',target.id)).toEqual(before);expect((await base.getAll('audit_events')).length).toBe(beforeAudits);expect((await base.getAll('domain_events')).length).toBe(beforeEvents);expect((await base.getAll('idempotency_keys')).length).toBe(beforeReceipts);
  });

  it('projects approval rounds minimally and redacts another voter from requester history',async()=>{
    const {base}=await setup('approval-projection-redaction');
    const workflow=(await base.getAll<WorkflowDefinition>('workflow_definitions')).find((item)=>item.moduleId==='purchase-request')!;
    const stage={...workflow.approvalStages!.find((item)=>item.stateId==='submitted')!,approvalMode:'ALL' as const};
    const requester=(await base.get<LocalUser>('users','persona-purchase-requester'))!;const approver=(await base.get<LocalUser>('users','persona-purchase-approver'))!;
    const record:OperationalRecord={id:'purchase-projection-record',moduleId:'purchase-request',domain:'procurement',trackingCode:'PRQ-PROJECTION',title:'درخواست قابل مشاهده سازنده',description:'',status:'submitted',priority:'normal',companyId:requester.companyId,unitId:requester.unitId,assigneeUserId:approver.id,createdByActorId:requester.actorId,createdByUserId:requester.id,updatedByActorId:requester.actorId,workflowVersion:workflow.version,workflowRouteId:'base',version:2,payload:{},createdAt:'2026-08-28T00:00:00.000Z',updatedAt:'2026-08-28T00:00:00.000Z'};
    const round:WorkflowApprovalRound={...createApprovalRound({id:`approval:purchase-request:${record.id}:v${workflow.version}:base:${stage.id}:entry-${record.version}`,record,stage,electorate:[approver],now:'2026-08-28T00:00:00.000Z',completionIntentHash:'private-completion-hash'}),votes:[{id:'private-vote',userId:approver.id,actorId:approver.actorId,decision:'approve',reason:'دلیل محرمانه بازبین',occurredAt:'2026-08-28T00:01:00.000Z',commandId:'private-command'}],status:'approved',version:2,closedAt:'2026-08-28T00:01:00.000Z'};
    const history:OperationalRecordHistory={id:'approval-history-private',recordId:record.id,moduleId:record.moduleId,sequence:1,eventType:'approval_vote',actorId:approver.actorId,actorName:approver.name,effectiveUserId:approver.id,reason:'دلیل محرمانه بازبین',snapshot:{roundId:round.id,decision:'approve',approvedCount:1,requiredCount:1},occurredAt:'2026-08-28T00:01:00.000Z'};
    await base.put('purchase_requests',record);await base.put('workflow_approval_rounds',round);await base.put('workflow_history',history);await switchIdentity(base,requester.id);
    const state=await new LocalFoundationService(base).loadState();const projected=(state.approvalRounds??[]).find((item)=>item.id===round.id)!;
    expect(projected).toMatchObject({approvedCount:1,electorateSize:1,pendingUserIds:[]});
    expect(projected).not.toHaveProperty('votes');expect(projected).not.toHaveProperty('eligibleUserIds');expect(projected).not.toHaveProperty('completionIntentHash');
    const projectedHistory=state.operationalHistory.find((item)=>item.id===history.id)!;
    expect(projectedHistory).toMatchObject({actorId:'[redacted]',actorName:'تأییدکننده'});expect(projectedHistory.reason).toBeUndefined();expect(projectedHistory.effectiveUserId).toBeUndefined();
    expect(JSON.stringify({projected,projectedHistory})).not.toMatch(/private-command|private-completion-hash|دلیل محرمانه بازبین|actor-purchase-approver/);
  });
});

function recordStore(moduleId: string): FoundationStoreName {
  return ({lead:'leads','support-case':'support_cases',followup:'followups'} as Record<string,FoundationStoreName>)[moduleId];
}

async function switchIdentity(storage: StorageAdapter, activeUserId: string) {
  const session = (await storage.get<FoundationSession>('sessions','active-session'))!;
  await storage.put('sessions',{...session,activeUserId,actingAdminUserId:undefined,signedOutAt:undefined,switchedAt:new Date().toISOString(),version:session.version+1} satisfies FoundationSession);
}
