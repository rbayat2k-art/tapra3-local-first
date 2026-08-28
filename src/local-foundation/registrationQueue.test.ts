import {describe, expect, it} from 'vitest';
import type {RegistrationRequest} from './model';
import {registrationQueueInsight} from './registrationQueue';

const request = (status: RegistrationRequest['status'], updatedAt = '2026-08-25T00:00:00.000Z'): RegistrationRequest => ({
  id: `registration-${status}`, trackingCode: 'REG-001', fullName: 'متقاضی نمونه', mobile: '09120000000', secondaryMobile: '09121111111',
  nationalId: '0012345678', gender: 'unspecified', province: 'تهران', city: 'تهران', address: 'نشانی', bankName: 'بانک',
  cardNumber: '6104337812345678', requestedUsername: 'sample.user', selfDeclaration: {}, status, version: 1,
  createdAt: updatedAt, updatedAt,
});

describe('registrationQueueInsight', () => {
  it('routes each state to the actor responsible for the next action', () => {
    expect(registrationQueueInsight(request('submitted')).lane).toBe('hr');
    expect(registrationQueueInsight(request('in_review')).lane).toBe('hr');
    expect(registrationQueueInsight(request('needs_correction')).lane).toBe('applicant');
    expect(registrationQueueInsight(request('approved')).lane).toBe('activation');
    expect(registrationQueueInsight(request('rejected')).lane).toBe('closed');
    expect(registrationQueueInsight(request('activated')).lane).toBe('closed');
  });

  it('flags only open requests that have remained unchanged for three days', () => {
    const now = new Date('2026-08-26T12:00:00.000Z');
    expect(registrationQueueInsight(request('submitted', '2026-08-22T00:00:00.000Z'), now).stale).toBe(true);
    expect(registrationQueueInsight(request('approved', '2026-08-25T00:00:00.000Z'), now).stale).toBe(false);
    expect(registrationQueueInsight(request('activated', '2026-08-20T00:00:00.000Z'), now).stale).toBe(false);
  });
});
