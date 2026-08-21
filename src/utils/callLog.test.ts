import { describe, it, expect } from 'vitest';
import { recordCallOutcome, isLeadOverdue } from './callLog';
import type { Lead } from '../types';

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead_1', trackingCode: 'LD-0001', source: 'test', priority: 'normal',
    createdAt: 'x', createdByUserId: 'u', createdByUserName: 'u', status: 'pending_action', hadFirstContact: false,
    timeline: [], ...overrides
  };
}

describe('recordCallOutcome', () => {
  it('marks hadFirstContact true even for a no-answer attempt', () => {
    const lead = makeLead({ hadFirstContact: false });
    const { updatedLead } = recordCallOutcome(lead, 'no_answer', undefined, undefined, { id: 'sp', fullName: 'فروشنده' }, 't0', 't1');
    expect(updatedLead.hadFirstContact).toBe(true);
    expect(updatedLead.status).toBe('pending_action');
  });

  it('moves the lead out of the active queue on wrong_number', () => {
    const lead = makeLead();
    const { updatedLead } = recordCallOutcome(lead, 'wrong_number', undefined, undefined, { id: 'sp', fullName: 'فروشنده' }, 't0', 't1');
    expect(updatedLead.status).toBe('wrong_number');
  });

  it('blocks further sales action on a complaint outcome', () => {
    const lead = makeLead();
    const { updatedLead } = recordCallOutcome(lead, 'complaint', 'شکایت از تأخیر', undefined, { id: 'sp', fullName: 'فروشنده' }, 't0', 't1');
    expect(updatedLead.status).toBe('complaint_blocked');
  });

  it('schedules a callback and stores the requested callback date', () => {
    const lead = makeLead();
    const { updatedLead, callLogEntry } = recordCallOutcome(lead, 'callback_requested', undefined, '1403/05/10', { id: 'sp', fullName: 'فروشنده' }, 't0', 't1');
    expect(updatedLead.status).toBe('callback_scheduled');
    expect(updatedLead.actionDeadline).toBe('1403/05/10');
    expect(callLogEntry.callbackAt).toBe('1403/05/10');
  });

  it('preserves prior timeline entries and appends the call as a new one', () => {
    const priorEntry = { id: 't0', type: 'created', title: 'created', timestamp: 't0' };
    const lead = makeLead({ timeline: [priorEntry] });
    const { updatedLead } = recordCallOutcome(lead, 'real_conversation', undefined, undefined, { id: 'sp', fullName: 'فروشنده' }, 't0', 't1');
    expect(updatedLead.timeline).toHaveLength(2);
    expect(updatedLead.timeline[0]).toEqual(priorEntry);
    expect(updatedLead.status).toBe('in_negotiation');
  });

  it('produces a call log entry linked to the lead and salesperson', () => {
    const lead = makeLead();
    const { callLogEntry } = recordCallOutcome(lead, 'interested', 'خیلی علاقه‌مند بود', undefined, { id: 'sp_1', fullName: 'فروشنده' }, 't0', 't1');
    expect(callLogEntry.leadId).toBe('lead_1');
    expect(callLogEntry.salespersonUserId).toBe('sp_1');
    expect(callLogEntry.outcome).toBe('interested');
  });
});

describe('isLeadOverdue', () => {
  it('is false when there is no action deadline set', () => {
    expect(isLeadOverdue(makeLead({ status: 'pending_action' }), '1403/05/10')).toBe(false);
  });
  it('is true when the deadline has passed for a pending_action lead', () => {
    expect(isLeadOverdue(makeLead({ status: 'pending_action', actionDeadline: '1403/05/05' }), '1403/05/10')).toBe(true);
  });
  it('is false for a terminal-status lead even with a past deadline', () => {
    expect(isLeadOverdue(makeLead({ status: 'closed_won', actionDeadline: '1403/05/05' }), '1403/05/10')).toBe(false);
  });
});
