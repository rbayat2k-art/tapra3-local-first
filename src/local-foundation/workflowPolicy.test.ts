import {describe, expect, it} from 'vitest';
import {ERP_MODULES} from './erpCatalog';
import {createSeedData} from './seed';
import type {FoundationState, WorkflowApprovalStageDefinition, WorkflowDefinition, WorkflowRouteVariantDefinition} from './model';
import {activeWorkflowFor, approvalStagesFor, roleIdsForWorkflowState, selectWorkflowRoute, validateWorkflowPolicy, workflowForRecord, workflowStageAllows} from './workflowPolicy';
import {canSelfSubmitAdvance, resolveAdvanceStageAssignee} from './employeeAdvance';

describe('versioned workflow management policy', () => {
  it('seeds explicit, ordered approval routes for controlled workflows', () => {
    const seed = createSeedData();
    const workflows = seed.workflow_definitions as WorkflowDefinition[];
    const roles = seed.security_roles;
    const advance = workflows.find((item) => item.moduleId === 'employee-advance')!;
    expect(approvalStagesFor(advance, roles).map((stage) => stage.stateId)).toEqual([
      'branch_review','accounting_review','final_review','sent_to_treasury',
    ]);
    expect(roleIdsForWorkflowState({workflows, roles}, 'employee-advance', 'accounting_review', [])).toContain('role-advance-accounting-reviewer');
  });

  it('rejects an invalid stage before publication', () => {
    const seed = createSeedData();
    const workflow = (seed.workflow_definitions as WorkflowDefinition[]).find((item) => item.moduleId === 'purchase-request')!;
    const invalid: WorkflowApprovalStageDefinition[] = [{id:'duplicate',title:'',stateId:'unknown',roleIds:[],scope:'COMPANY',decisions:[],required:true,allowSelfApproval:false}];
    const errors = validateWorkflowPolicy(workflow, invalid, seed.security_roles);
    expect(errors.join(' ')).toContain('عنوان مرحله');
    expect(errors.join(' ')).toContain('ماشین وضعیت');
    expect(errors.join(' ')).toContain('حداقل یک نقش');
  });

  it('uses the persisted workflow as the runtime authority', () => {
    const module = ERP_MODULES.find((item) => item.id === 'purchase-request')!;
    const persisted = {...module.workflow, version: module.workflow.version + 7, assignmentPolicy:'نسخه ذخیره‌شده'};
    const resolved = activeWorkflowFor({workflows:[persisted]} as Pick<FoundationState,'workflows'>, module);
    expect(resolved.version).toBe(persisted.version);
    expect(resolved.assignmentPolicy).toBe('نسخه ذخیره‌شده');
  });

  it('keeps an in-flight record on the workflow version it started with', () => {
    const module = ERP_MODULES.find((item) => item.id === 'purchase-request')!;
    const versionOne = {...module.workflow, version: 1, assignmentPolicy:'مسیر نسخه یک'};
    const versionTwo = {...module.workflow, version: 2, assignmentPolicy:'مسیر نسخه دو'};
    const resolved = workflowForRecord({workflows:[versionTwo], workflowVersions:[versionOne]}, module, {workflowVersion:1});
    expect(resolved.version).toBe(1);
    expect(resolved.assignmentPolicy).toBe('مسیر نسخه یک');
  });

  it('enforces configured decisions and rejects an incompatible sequence', () => {
    const seed = createSeedData();
    const workflows = seed.workflow_definitions as WorkflowDefinition[];
    const workflow = workflows.find((item) => item.moduleId === 'employee-advance')!;
    expect(workflowStageAllows({workflows, roles:seed.security_roles}, 'employee-advance', 'final_review', 'return_previous', [])).toBe(true);
    const reversed = approvalStagesFor(workflow, seed.security_roles).reverse();
    expect(validateWorkflowPolicy(workflow, reversed, seed.security_roles).join(' ')).toContain('ترتیب مراحل مساعده');
  });

  it('selects an active branch route and keeps the base route for other branches', () => {
    const seed = createSeedData();
    const workflow = (seed.workflow_definitions as WorkflowDefinition[]).find((item) => item.moduleId === 'employee-advance')!;
    const base = approvalStagesFor(workflow, seed.security_roles);
    const variant: WorkflowRouteVariantDefinition = {
      id:'advance-poonak', title:'مسیر مساعده شعبه پونک', branchUnitIds:['unit-branch-poonak'], priority:10, status:'active',
      approvalStages:base.filter((stage) => stage.stateId !== 'branch_review'),
    };
    const configured = {...workflow, routeVariants:[variant]};
    expect(selectWorkflowRoute(configured, seed.security_roles, 'unit-branch-poonak').id).toBe(variant.id);
    expect(selectWorkflowRoute(configured, seed.security_roles, 'unit-branch-poonak').approvalStages.map((stage) => stage.stateId)).toEqual(['accounting_review','final_review','sent_to_treasury']);
    expect(selectWorkflowRoute(configured, seed.security_roles, 'unit-branch-central').id).toBe('base');
    expect(validateWorkflowPolicy(configured, base, seed.security_roles, [variant])).toEqual([]);
  });

  it('rejects overlapping active branch routes', () => {
    const seed = createSeedData();
    const workflow = (seed.workflow_definitions as WorkflowDefinition[]).find((item) => item.moduleId === 'employee-advance')!;
    const base = approvalStagesFor(workflow, seed.security_roles);
    const variants: WorkflowRouteVariantDefinition[] = [1,2].map((priority) => ({id:`route-${priority}`,title:`مسیر ${priority}`,branchUnitIds:['unit-branch-central'],priority,status:'active',approvalStages:clone(base)}));
    expect(validateWorkflowPolicy(workflow, base, seed.security_roles, variants).join(' ')).toContain('قبلاً در مسیر فعال');
  });

  it('resolves the registered manager of the same branch for a branch-manager stage', () => {
    const seed = createSeedData();
    const workflow = (seed.workflow_definitions as WorkflowDefinition[]).find((item) => item.moduleId === 'employee-advance')!;
    const state = {users:seed.users, units:seed.organizational_units, roles:seed.security_roles};
    const assignee = resolveAdvanceStageAssignee(state, workflow, 'base', 'branch_review', {
      branchUnitId:'unit-branch-central', unitId:'unit-sales', beneficiaryUserId:'persona-seller',
    });
    expect(assignee?.id).toBe('persona-advance-branch-manager');
  });

  it('supports a specific user assignment and fails closed when that user is inactive', () => {
    const seed = createSeedData();
    const workflow = (seed.workflow_definitions as WorkflowDefinition[]).find((item) => item.moduleId === 'employee-advance')!;
    const stages = approvalStagesFor(workflow, seed.security_roles).map((stage) => stage.stateId === 'accounting_review'
      ? {...stage, assignmentMode:'specific_user' as const, assigneeUserId:'persona-advance-accounting'}
      : stage);
    const configured = {...workflow, approvalStages:stages};
    const context = {branchUnitId:'unit-branch-central', unitId:'unit-sales', beneficiaryUserId:'persona-seller'};
    expect(resolveAdvanceStageAssignee({users:seed.users, units:seed.organizational_units, roles:seed.security_roles}, configured, 'base', 'accounting_review', context)?.id).toBe('persona-advance-accounting');
    const inactiveUsers = seed.users.map((user) => user.id === 'persona-advance-accounting' ? {...user, status:'inactive' as const} : user);
    expect(resolveAdvanceStageAssignee({users:inactiveUsers, units:seed.organizational_units, roles:seed.security_roles}, configured, 'base', 'accounting_review', context)).toBeUndefined();
  });

  it('applies branch self-service policy only to the matching active route', () => {
    const seed = createSeedData();
    const workflow = (seed.workflow_definitions as WorkflowDefinition[]).find((item) => item.moduleId === 'employee-advance')!;
    const variant: WorkflowRouteVariantDefinition = {id:'proxy-only',title:'فقط ثبت نیابتی',branchUnitIds:['unit-branch-central'],priority:10,status:'active',allowSelfSubmission:false,approvalStages:approvalStagesFor(workflow,seed.security_roles)};
    const configured = {...workflow, allowSelfSubmission:true, routeVariants:[variant]};
    const state = {workflows:[configured],roles:seed.security_roles};
    expect(canSelfSubmitAdvance('unit-branch-central', state)).toBe(false);
    expect(canSelfSubmitAdvance('unit-branch-poonak', state)).toBe(true);
    expect(selectWorkflowRoute(configured, seed.security_roles, 'unit-branch-central').allowSelfSubmission).toBe(false);
  });
});

const clone = (stages: WorkflowApprovalStageDefinition[]) => stages.map((stage) => ({...stage, roleIds:[...stage.roleIds], decisions:[...stage.decisions]}));
