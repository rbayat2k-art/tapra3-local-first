import {describe, expect, it} from 'vitest';
import type {OperationalRecord} from './model';
import {roleCartableCategories} from './cartableCategories';

const record = (status: string, assigneeUserId = 'user-current') => ({status, assigneeUserId} as OperationalRecord);

describe('role cartable categories', () => {
  it('separates requester work from approval, treasury and closed records', () => {
    const groups = roleCartableCategories('purchase-request', ['role-purchase-requester'], 'user-current');
    expect(groups.find((item) => item.id === 'requester-action')?.matches(record('needs_correction'))).toBe(true);
    expect(groups.find((item) => item.id === 'requester-approval')?.matches(record('submitted'))).toBe(true);
    expect(groups.find((item) => item.id === 'requester-treasury')?.matches(record('sent_to_treasury'))).toBe(true);
    expect(groups.find((item) => item.id === 'requester-closed')?.matches(record('rejected'))).toBe(true);
  });

  it('shows only directly assigned approval work in the approver action cartable', () => {
    const groups = roleCartableCategories('purchase-request', ['role-purchase-approver'], 'user-current');
    const action = groups.find((item) => item.id === 'approver-action')!;
    expect(action.matches(record('submitted', 'user-current'))).toBe(true);
    expect(action.matches(record('submitted', 'another-approver'))).toBe(false);
  });

  it('separates payer queue, recorded payments and completed payments', () => {
    const groups = roleCartableCategories('treasury-execution', ['role-treasury-executor-v1'], 'user-current');
    expect(groups.find((item) => item.id === 'payer-action')?.matches(record('queued'))).toBe(true);
    expect(groups.find((item) => item.id === 'payer-recorded')?.matches(record('payment_recorded'))).toBe(true);
    expect(groups.find((item) => item.id === 'payer-completed')?.matches(record('completed'))).toBe(true);
  });
});
