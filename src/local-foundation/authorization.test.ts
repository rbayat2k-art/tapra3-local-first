import {describe, expect, it} from 'vitest';
import {authorize, operationalRecordResource} from './authorization';
import type {OperationalRecord} from './model';
import {QA_PERSONAS} from './seed';

const persona = (id: string) => QA_PERSONAS.find((item) => item.id === id)!;

describe('local permission engine', () => {
  it('allows a granted foundation permission', () => {
    const result = authorize({persona: persona('persona-seller'), permission: 'foundation.dashboard.view'});
    expect(result.allowed).toBe(true);
    expect(result.code).toBe('authorization.allowed');
  });

  it('denies every permission when the account is inactive, including an admin account', () => {
    const inactiveAdmin = {...persona('persona-product-owner'), status: 'inactive' as const};
    const result = authorize({persona: inactiveAdmin, permission: 'foundation.dashboard.view'});
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('account.inactive');
  });

  it('lets a SELF-scoped assignee see work assigned to them without changing the immutable creator', () => {
    const seller = persona('persona-seller');
    const record: OperationalRecord = {
      id: 'assigned-work', moduleId: 'sale', domain: 'sales', trackingCode: 'SALE-TEST-1',
      title: 'کار ارجاع‌شده', description: '', status: 'open', priority: 'normal',
      companyId: seller.companyId, unitId: seller.unitId, assigneeUserId: seller.id,
      createdByActorId: 'actor-another-user', createdByUserId: 'persona-another-user',
      updatedByActorId: 'actor-another-user', version: 1, payload: {},
      createdAt: '2026-08-23T08:00:00.000Z', updatedAt: '2026-08-23T08:00:00.000Z',
    };
    const resource = operationalRecordResource(seller, record);
    const result = authorize({persona: seller, permission: 'foundation.dashboard.view', action: 'view', resource});
    expect(result.allowed).toBe(true);
    expect(resource.ownerId).toBe(seller.actorId);
    expect(resource.createdBy).toBe('actor-another-user');
  });

  it('models the protected admin exception explicitly without granting it to similar roles', () => {
    const adminResult = authorize({persona: persona('persona-product-owner'), permission: 'business.request.approve'});
    const systemAdminResult = authorize({persona: persona('persona-system-admin'), permission: 'business.request.approve'});
    expect(adminResult.allowed).toBe(true);
    expect(systemAdminResult.allowed).toBe(false);
    expect(systemAdminResult.code).toBe('permission.missing');
  });

  it('keeps the personnel change queue behind its independent review permission', () => {
    const adminResult = authorize({persona: persona('persona-product-owner'), permission: 'organization.personnel.changes.review'});
    const sellerResult = authorize({persona: persona('persona-seller'), permission: 'organization.personnel.changes.review'});
    expect(adminResult.allowed).toBe(true);
    expect(sellerResult.allowed).toBe(false);
    expect(sellerResult.code).toBe('permission.missing');
  });

  it('fails closed across company boundaries', () => {
    const result = authorize({
      persona: persona('persona-product-owner'),
      permission: 'foundation.dashboard.view',
      resource: {id: 'outside', companyId: 'another-company', createdBy: 'another-actor', state: 'DRAFT'},
      action: 'view',
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('scope.denied');
  });

  it('blocks self approval even with permission and matching scope', () => {
    const approver = persona('persona-branch-approver');
    const result = authorize({
      persona: approver,
      permission: 'business.request.approve',
      resource: {
        id: 'own-request', companyId: approver.companyId, unitId: approver.unitId,
        ownerId: approver.actorId, createdBy: approver.actorId, state: 'PENDING_APPROVAL',
      },
      action: 'approve',
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('resource.self_approval_denied');
  });

  it('allows an inventory approver to approve another actors submitted adjustment', () => {
    const approver = persona('persona-inventory-approver');
    const result = authorize({
      persona: approver,
      permission: 'business.inventory.approve',
      resource: {
        id: 'adjustment', companyId: approver.companyId, unitId: approver.unitId,
        ownerId: 'actor-inventory-maker', createdBy: 'actor-inventory-maker', state: 'SUBMITTED',
      },
      action: 'approve',
      targetState: 'APPROVED',
      allowedTransitions: {SUBMITTED: ['APPROVED', 'RETURNED']},
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks a transition absent from the workflow definition', () => {
    const approver = persona('persona-inventory-approver');
    const result = authorize({
      persona: approver,
      permission: 'business.inventory.approve',
      resource: {
        id: 'adjustment', companyId: approver.companyId, unitId: approver.unitId,
        createdBy: 'actor-inventory-maker', state: 'SUBMITTED',
      },
      action: 'transition',
      targetState: 'POSTED',
      allowedTransitions: {SUBMITTED: ['APPROVED', 'RETURNED']},
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('workflow.transition_denied');
  });
});
