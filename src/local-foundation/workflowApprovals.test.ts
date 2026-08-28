import 'fake-indexeddb/auto';
import {describe, expect, it} from 'vitest';
import {permissionFor} from './erpCatalog';
import type {LocalUser, OperationalRecord, SecurityRole, WorkflowApprovalStageDefinition, WorkflowDefinition} from './model';
import {createSeedData, resolveUserAccess} from './seed';
import {
  appendApprovalVote,
  approvalRoundProgress,
  createApprovalRound,
  replaceApprovalElectorateMember,
  resolveApprovalElectorate,
  castApprovalVoteInTransaction,
} from './workflowApprovals';
import {IndexedDBAdapter} from './storage';

const now='2026-08-28T10:00:00.000Z';

function fixture(mode:'ANY'|'ALL'|'N_OF_M'='ANY',requiredApprovals?:number){
  const seed=createSeedData();
  const roles=seed.security_roles as SecurityRole[];
  const resolved=(seed.users as LocalUser[]).map((user)=>resolveUserAccess(user,roles));
  const permission=permissionFor('purchase-request','approve');
  const base=resolved.find((user)=>user.status==='active'&&user.permissions.includes(permission)&&user.roleIds.some((roleId)=>roles.some((role)=>role.id===roleId&&role.status==='active')))!;
  const roleId=base.roleIds.find((candidate)=>roles.some((role)=>role.id===candidate&&role.status==='active'&&role.permissions.includes(permission)))!;
  const voters=[0,1,2].map((index)=>({...base,id:`approval-user-${index+1}`,actorId:`approval-actor-${index+1}`,username:`approval.user.${index+1}`,roleId,roleIds:[roleId]}) satisfies LocalUser);
  const stage:WorkflowApprovalStageDefinition={id:'purchase-review-stage',title:'تأیید خرید',stateId:'purchase_review',roleIds:[roleId],scope:'COMPANY',decisions:['approve','reject','needs_correction'],required:true,allowSelfApproval:false,assignmentMode:'role_queue',approvalMode:mode,requiredApprovals};
  const record:OperationalRecord={id:'purchase-multi-approval',moduleId:'purchase-request',domain:'procurement',trackingCode:'PR-MULTI',title:'درخواست چندتأییدی',description:'',status:'purchase_review',priority:'normal',companyId:base.companyId,unitId:base.unitId,createdByActorId:'maker-actor',createdByUserId:'maker-user',updatedByActorId:'maker-actor',workflowVersion:7,workflowRouteId:'base',version:4,payload:{},createdAt:now,updatedAt:now};
  const state={users:voters,roles,units:seed.organizational_units,personnel:seed.personnel,workflows:seed.workflow_definitions,workflowVersions:seed.workflow_versions} as never;
  const electorate=resolveApprovalElectorate(state,record,stage);
  return {roles,voters,stage,record,state,electorate};
}

describe('versioned workflow approval rounds',()=>{
  it('keeps legacy stages bound to their concrete assignee instead of widening ANY authority',()=>{
    const {stage,record,state,voters}=fixture();
    const legacy={...stage,approvalMode:undefined,requiredApprovals:undefined};
    const assigned={...record,assigneeUserId:voters[1].id};
    expect(resolveApprovalElectorate(state,assigned,legacy).map((user)=>user.id)).toEqual([voters[1].id]);
  });

  it.each(['SELF','UNIT','BRANCH'] as const)('enforces %s scope against the real record instead of a synthetic assignee',(scope)=>{
    const {stage,record,state,voters}=fixture();
    const candidate={...voters[0]!,unitId:'unit-other',branchUnitId:'branch-other',advanceBranchIds:['branch-other']};
    const scopedStage={...stage,scope,approvalMode:'ALL' as const};
    const scopedRecord={...record,unitId:'unit-record',branchUnitId:'branch-record',createdByUserId:'maker-user',ownerPersonnelId:undefined,assigneeUserId:candidate.id};
    const scopedState={...(state as unknown as Record<string,unknown>),users:[candidate]} as never;
    expect(resolveApprovalElectorate(scopedState,scopedRecord,scopedStage)).toEqual([]);
  });

  it('uses the specialized advance branch-manager policy for electorate scope',()=>{
    const seed=createSeedData();const roles=seed.security_roles as SecurityRole[];
    const manager=resolveUserAccess((seed.users as LocalUser[]).find((user)=>user.id==='persona-advance-branch-manager')!,roles);
    const workflow=(seed.workflow_definitions as WorkflowDefinition[]).find((item)=>item.moduleId==='employee-advance')!;
    const stage=workflow.approvalStages!.find((item)=>item.stateId==='branch_review')!;
    const record:OperationalRecord={...fixture().record,id:'advance-scope',moduleId:'employee-advance',domain:'hr',status:'branch_review',branchUnitId:'unit-branch-poonak',unitId:'unit-sales',workflowVersion:workflow.version,payload:{branchUnitId:'unit-branch-poonak',unitId:'unit-sales',beneficiaryUserId:'persona-seller'}};
    const state={users:[manager],roles,units:seed.organizational_units,personnel:seed.personnel,workflows:[workflow],workflowVersions:seed.workflow_versions} as never;
    expect(resolveApprovalElectorate(state,record,stage)).toEqual([]);
  });

  it.each([
    ['ANY',undefined,1],
    ['ALL',undefined,3],
    ['N_OF_M',2,2],
  ] as const)('freezes %s with the correct threshold',(mode,requiredApprovals,expected)=>{
    const {stage,record,electorate}=fixture(mode,requiredApprovals);
    const round=createApprovalRound({id:`round-${mode}`,record,stage,electorate,now});
    expect(round.eligibleUserIds).toEqual([...round.eligibleUserIds].sort());
    expect(round.requiredCount).toBe(expected);
    expect(round.entryRecordVersion).toBe(record.version);
  });

  it('completes ALL and N_OF_M only at the configured positive threshold',()=>{
    const {stage,record,electorate}=fixture('N_OF_M',2);
    const round=createApprovalRound({id:'round-threshold',record,stage,electorate,now});
    const first=appendApprovalVote({round,user:electorate[0],decision:'approve',reason:'تأیید اول',commandId:'vote-one',voteId:'vote-1',now});
    expect(first.completed).toBe(false);
    expect(approvalRoundProgress(first.round)).toMatchObject({approvedCount:1,requiredCount:2,status:'open'});
    const second=appendApprovalVote({round:first.round,user:electorate[1],decision:'approve',reason:'تأیید دوم',commandId:'vote-two',voteId:'vote-2',now});
    expect(second.completed).toBe(true);
    expect(second.round.status).toBe('approved');
  });

  it('replays the same vote and conflicts on changed command payload',()=>{
    const {stage,record,electorate}=fixture('ALL');
    const round=createApprovalRound({id:'round-replay',record,stage,electorate,now});
    const first=appendApprovalVote({round,user:electorate[0],decision:'approve',reason:'همان دلیل',commandId:'same-command',voteId:'vote-replay',now});
    const replay=appendApprovalVote({round:first.round,user:electorate[0],decision:'approve',reason:'همان دلیل',commandId:'same-command',voteId:'ignored',now});
    expect(replay.replayed).toBe(true);
    expect(replay.round.votes).toHaveLength(1);
    expect(()=>appendApprovalVote({round:first.round,user:electorate[0],decision:'reject',reason:'دلیل دیگر',commandId:'same-command',voteId:'ignored',now})).toThrow(/محتوای دیگری/);
  });

  it.each([['reject','rejected'],['needs_correction','correction']] as const)('%s closes the round immediately',(decision,status)=>{
    const {stage,record,electorate}=fixture('ALL');
    const round=createApprovalRound({id:`round-${decision}`,record,stage,electorate,now});
    const result=appendApprovalVote({round,user:electorate[0],decision,reason:'تصمیم فوری',commandId:`command-${decision}`,voteId:`vote-${decision}`,now});
    expect(result.completed).toBe(true);
    expect(result.round.status).toBe(status);
  });

  it.each([['reject','rejected'],['needs_correction','correction']] as const)('%s closes an ALL round after a prior approval without comparing positive intent',(decision,status)=>{
    const {stage,record,electorate}=fixture('ALL');
    const round=createApprovalRound({id:`round-positive-then-${decision}`,record,stage,electorate,now,completionIntentHash:'positive-intent'});
    const first=appendApprovalVote({round,user:electorate[0],decision:'approve',reason:'تأیید اولیه',commandId:`positive-before-${decision}`,voteId:`positive-vote-${decision}`,now}).round;
    const result=appendApprovalVote({round:first,user:electorate[1],decision,reason:'تصمیم منفی فوری',commandId:`negative-${decision}`,voteId:`negative-vote-${decision}`,now});
    expect(result.completed).toBe(true);expect(result.round.status).toBe(status);expect(result.round.votes).toHaveLength(2);
  });

  it('holds voting while continuity replacement is unresolved and preserves prior votes when replacing an empty seat',()=>{
    const {stage,record,electorate,voters}=fixture('ALL');
    const open=createApprovalRound({id:'round-replacement',record,stage,electorate,now});
    const first=appendApprovalVote({round:open,user:electorate[0],decision:'approve',reason:'ثبت شده',commandId:'vote-before-replacement',voteId:'vote-before',now}).round;
    const held={...first,status:'needs_reassignment' as const};
    expect(()=>appendApprovalVote({round:held,user:electorate[1],decision:'approve',reason:'نباید ثبت شود',commandId:'blocked',voteId:'blocked',now})).toThrow(/متوقف/);
    const replacement={...voters[2],id:'replacement-user',actorId:'replacement-actor'};
    const repaired=replaceApprovalElectorateMember({round:held,departingUserId:electorate[1].id,replacementUserId:replacement.id,now});
    expect(repaired.votes).toEqual(first.votes);
    expect(repaired.eligibleUserIds).toContain(replacement.id);
    expect(repaired.status).toBe('open');
  });

  it('does not reopen a round until every blocked seat has an independent replacement',()=>{
    const {stage,record,electorate,voters}=fixture('ALL');
    const held={...createApprovalRound({id:'round-multiple-blocked',record,stage,electorate,now}),status:'needs_reassignment' as const,blockedUserIds:[electorate[0].id,electorate[1].id]};
    expect(()=>replaceApprovalElectorateMember({round:held,departingUserId:electorate[0].id,replacementUserId:electorate[1].id,now})).toThrow();
    const first=replaceApprovalElectorateMember({round:held,departingUserId:electorate[0].id,replacementUserId:'replacement-one',now});
    expect(first.status).toBe('needs_reassignment');
    expect(first.blockedUserIds).toEqual([electorate[1].id]);
    const second=replaceApprovalElectorateMember({round:first,departingUserId:electorate[1].id,replacementUserId:'replacement-two',now});
    expect(second.status).toBe('open');
    expect(second.blockedUserIds).toEqual([]);
    expect(second.eligibleUserIds).toEqual(['replacement-one','replacement-two',voters[2].id]);
  });

  it('rejects an invalid N_OF_M threshold',()=>{
    const {stage,record,electorate}=fixture('N_OF_M',4);
    expect(()=>createApprovalRound({id:'round-invalid',record,stage,electorate,now})).toThrow(/حد نصاب/);
  });

  it('serializes simultaneous final N_OF_M votes and finalizes exactly once',async()=>{
    const {stage,record,electorate,state}=fixture('N_OF_M',2);
    const dbName=`approval-race-${crypto.randomUUID()}`;
    const firstAdapter=new IndexedDBAdapter(dbName);
    const secondAdapter=new IndexedDBAdapter(dbName);
    const roundId=`approval:${record.moduleId}:${record.id}:v${record.workflowVersion}:${record.workflowRouteId}:${stage.id}:entry-${record.version}`;
    const initial=createApprovalRound({id:roundId,record,stage,electorate,now});
    const withFirst=appendApprovalVote({round:initial,user:electorate[0],decision:'approve',reason:'رأی اولیه',commandId:'race-seed-vote',voteId:'race-seed',now}).round;
    await firstAdapter.put('workflow_approval_rounds',withFirst);

    const contend=(adapter:IndexedDBAdapter,user:LocalUser,index:number)=>adapter.transaction(['workflow_approval_rounds','meta'],'readwrite',async(tx)=>{
      const vote=await castApprovalVoteInTransaction({tx,state,record,stage,user,decision:'approve',reason:`رأی هم‌زمان ${index}`,commandId:`race-vote-${index}`,voteId:`race-vote-row-${index}`,now});
      if(vote.completed){
        const counter=await tx.get<{id:string;value:number}>('meta','approval-finalizations');
        await tx.put('meta',{id:'approval-finalizations',value:(counter?.value??0)+1});
      }
      return vote;
    });
    const outcomes=await Promise.allSettled([contend(firstAdapter,electorate[1],1),contend(secondAdapter,electorate[2],2)]);
    expect(outcomes.filter((item)=>item.status==='fulfilled')).toHaveLength(1);
    expect(outcomes.filter((item)=>item.status==='rejected')).toHaveLength(1);
    const persisted=await firstAdapter.get<typeof withFirst>('workflow_approval_rounds',withFirst.id);
    expect(persisted).toMatchObject({status:'approved'});
    expect(persisted?.votes).toHaveLength(2);
    expect(await firstAdapter.get('meta','approval-finalizations')).toEqual({id:'approval-finalizations',value:1});
  });
});
