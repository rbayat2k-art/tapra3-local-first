import {describe, expect, it} from 'vitest';
import {createSeedData} from './seed';
import type {FoundationState, OperationalRecord} from './model';
import {collaborationSummary, progressForProject} from './collaborationSelectors';

function record(input: Partial<OperationalRecord> & Pick<OperationalRecord, 'id' | 'moduleId' | 'status'>): OperationalRecord {
  return {
    domain: input.moduleId === 'project' ? 'project' : input.moduleId === 'task' ? 'task' : input.moduleId === 'chat' ? 'communications' : 'letter',
    trackingCode: input.id,
    title: input.id,
    description: '',
    priority: 'normal',
    companyId: 'company-tapra',
    createdByActorId: 'actor-admin',
    createdByUserId: 'persona-product-owner',
    updatedByActorId: 'actor-admin',
    version: 1,
    payload: {},
    createdAt: '2026-08-20T08:00:00.000Z',
    updatedAt: '2026-08-20T08:00:00.000Z',
    ...input,
  };
}

function stateWith(records: OperationalRecord[]): FoundationState {
  const seed = createSeedData();
  const activeUser = seed.users.find((user) => user.id === 'persona-product-owner')!;
  return {
    users: seed.users,
    activeUser,
    session: seed.sessions[0],
    units: seed.organizational_units,
    positions: seed.organizational_positions,
    roles: seed.security_roles,
    personnel: seed.personnel,
    personnelProfileChangeRequests: [],
    salesStructures: seed.sales_structures,
    customers: seed.customers,
    customerImports: seed.customer_imports,
    workflows: seed.workflow_definitions,
    workflowVersions: seed.workflow_versions,
    operationalRecords: records,
    operationalHistory: [],
    chatPreferences: [],
    notifications: [],
    registrationRequests: seed.registration_requests,
    qaDataset: {id: 'large-qa', status: 'empty', roleCount: 0, userCount: 0, seed: 'tapra2-large-qa-v1'},
    projections: [],
    audits: [],
    recordCount: records.length,
    lastPersistedAt: '2026-08-20T08:00:00.000Z',
  };
}

describe('collaboration selectors', () => {
  it('computes the personal dashboard without counting terminal tasks', () => {
    const records = [
      record({id: 'p1', moduleId: 'project', status: 'active', payload: {memberUserIds: ['persona-product-owner']}}),
      record({id: 'today', moduleId: 'task', status: 'todo', assigneeUserId: 'persona-product-owner', dueAt: '2026-08-27T09:00:00.000Z'}),
      record({id: 'late', moduleId: 'task', status: 'in_progress', assigneeUserId: 'persona-product-owner', dueAt: '2026-08-25T09:00:00.000Z'}),
      record({id: 'done', moduleId: 'task', status: 'done', assigneeUserId: 'persona-product-owner', dueAt: '2026-08-25T09:00:00.000Z'}),
      record({id: 'waiting', moduleId: 'task', status: 'todo', assigneeUserId: 'persona-seller', createdByUserId: 'persona-product-owner'}),
      record({id: 'letter', moduleId: 'letter', status: 'in_review', assigneeUserId: 'persona-product-owner'}),
    ];
    expect(collaborationSummary(stateWith(records), new Date('2026-08-27T12:00:00'))).toMatchObject({
      activeProjects: 1,
      todayTasks: 1,
      overdueTasks: 1,
      waitingOnOthers: 1,
      actionableLetters: 1,
    });
  });

  it('derives project progress only from linked tasks', () => {
    const records = [
      record({id: 'task-1', moduleId: 'task', status: 'done', payload: {projectId: 'project-a'}}),
      record({id: 'task-2', moduleId: 'task', status: 'todo', payload: {projectId: 'project-a'}}),
      record({id: 'task-3', moduleId: 'task', status: 'done', payload: {projectId: 'project-b'}}),
    ];
    expect(progressForProject(stateWith(records), 'project-a')).toEqual({completed: 1, total: 2, percent: 50});
  });
});
