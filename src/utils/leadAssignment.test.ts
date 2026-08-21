import { describe, it, expect } from 'vitest';
import {
  isTerminalLeadStatus, generateLeadTrackingCode, buildLeadFromRawContact,
  canAssignLeadTo, canTransferLead, assignLead, drainSalespersonQueue
} from './leadAssignment';
import type { Lead, RawContact, Campaign, User } from '../types';

function makeUser(id: string, salesSupervisorId?: string, isActive = true): User {
  return {
    id, username: id, fullName: id, phone: '0912', email: `${id}@x.com`, role: 'requestor',
    roleTitle: 'فروشنده', isActive, salesSupervisorId
  };
}

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead_1', trackingCode: 'LD-0001', source: 'test', priority: 'normal',
    createdAt: 'x', createdByUserId: 'u', createdByUserName: 'u', status: 'new', hadFirstContact: false,
    timeline: [], ...overrides
  };
}

describe('generateLeadTrackingCode', () => {
  it('starts at LD-0001 with no existing leads', () => {
    expect(generateLeadTrackingCode([])).toBe('LD-0001');
  });
  it('increments past the highest existing numeric suffix', () => {
    const leads = [makeLead({ trackingCode: 'LD-0007' }), makeLead({ trackingCode: 'LD-0003' })];
    expect(generateLeadTrackingCode(leads)).toBe('LD-0008');
  });
});

describe('buildLeadFromRawContact', () => {
  it('creates a new Lead in status new, unassigned, with a creation timeline entry', () => {
    const raw: RawContact = {
      id: 'raw_1', primaryPhoneNormalized: '09120000000', primaryPhoneRaw: '09120000000',
      sourceFile: 'manual', importedAt: 'x', importedByUserId: 'u', importedByUserName: 'u', status: 'eligible_for_campaign',
      linkedCustomerId: 'cust_1'
    };
    const campaign: Campaign = {
      id: 'camp_1', name: 'کمپین تست', code: 'C1', channelType: 'sms', status: 'active',
      leadGenerationMode: 'manual', priority: 'normal', createdAt: 'x', createdByUserId: 'u', createdByUserName: 'u'
    };
    const lead = buildLeadFromRawContact(raw, campaign, 'ابراز علاقه', { id: 'actor_1', fullName: 'کاربر' }, 'now', []);
    expect(lead.status).toBe('new');
    expect(lead.hadFirstContact).toBe(false);
    expect(lead.customerId).toBe('cust_1');
    expect(lead.rawContactId).toBe('raw_1');
    expect(lead.trackingCode).toBe('LD-0001');
    expect(lead.timeline).toHaveLength(1);
  });
});

describe('isTerminalLeadStatus', () => {
  it('treats closed_won/closed_lost/wrong_number/complaint_blocked as terminal', () => {
    expect(isTerminalLeadStatus('closed_won')).toBe(true);
    expect(isTerminalLeadStatus('closed_lost')).toBe(true);
    expect(isTerminalLeadStatus('wrong_number')).toBe(true);
    expect(isTerminalLeadStatus('complaint_blocked')).toBe(true);
  });
  it('treats in_negotiation/ready_for_invoice as non-terminal', () => {
    expect(isTerminalLeadStatus('in_negotiation')).toBe(false);
    expect(isTerminalLeadStatus('ready_for_invoice')).toBe(false);
  });
});

describe('canAssignLeadTo — territorial assignment authority', () => {
  const manager = makeUser('mgr');
  const supervisor = makeUser('sup', 'mgr');
  const salesperson = makeUser('sp', 'sup');
  const outsider = makeUser('outsider');
  const allUsers = [manager, supervisor, salesperson, outsider];

  it('allows an unrestricted assigner (data manager/admin) to assign to anyone', () => {
    expect(canAssignLeadTo(manager, 'outsider', allUsers, true).ok).toBe(true);
  });

  it('allows a supervisor to assign within their own subtree', () => {
    expect(canAssignLeadTo(supervisor, 'sp', allUsers, false).ok).toBe(true);
  });

  it('denies assignment outside the assigners territory for a restricted assigner', () => {
    const result = canAssignLeadTo(supervisor, 'outsider', allUsers, false);
    expect(result.ok).toBe(false);
  });

  it('denies assignment to an inactive user even within territory', () => {
    const inactiveSp = makeUser('sp_inactive', 'sup', false);
    const result = canAssignLeadTo(supervisor, 'sp_inactive', [...allUsers, inactiveSp], false);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toMatch(/غیرفعال/);
  });
});

describe('canTransferLead — before vs after first contact', () => {
  it('allows transfer freely before the first call', () => {
    const lead = makeLead({ hadFirstContact: false });
    expect(canTransferLead(lead, false, undefined).ok).toBe(true);
  });

  it('denies transfer after first contact without the dedicated reassign permission', () => {
    const lead = makeLead({ hadFirstContact: true });
    const result = canTransferLead(lead, false, 'دلیل واقعی');
    expect(result.ok).toBe(false);
  });

  it('denies transfer after first contact without a reason, even with permission', () => {
    const lead = makeLead({ hadFirstContact: true });
    const result = canTransferLead(lead, true, '');
    expect(result.ok).toBe(false);
  });

  it('allows transfer after first contact with both permission and a reason', () => {
    const lead = makeLead({ hadFirstContact: true });
    expect(canTransferLead(lead, true, 'مشتری درخواست فروشندهٔ دیگر کرد').ok).toBe(true);
  });
});

describe('assignLead', () => {
  it('preserves prior timeline entries and appends a new one, never rewriting history', () => {
    const priorEntry = { id: 't0', type: 'created', title: 'created', timestamp: 't0' };
    const lead = makeLead({ timeline: [priorEntry] });
    const updated = assignLead(lead, 'sp', 'فروشنده جدید', { id: 'actor', fullName: 'مدیر' }, 'now');
    expect(updated.timeline).toHaveLength(2);
    expect(updated.timeline[0]).toEqual(priorEntry);
    expect(updated.currentOwnerUserId).toBe('sp');
  });

  it('promotes a new lead to pending_action on first assignment', () => {
    const lead = makeLead({ status: 'new' });
    const updated = assignLead(lead, 'sp', 'فروشنده', { id: 'actor', fullName: 'مدیر' }, 'now');
    expect(updated.status).toBe('pending_action');
  });
});

describe('drainSalespersonQueue', () => {
  it('reassigns only non-terminal leads owned by the departing salesperson', () => {
    const leads = [
      makeLead({ id: 'l1', currentOwnerUserId: 'sp_old', status: 'pending_action' }),
      makeLead({ id: 'l2', currentOwnerUserId: 'sp_old', status: 'closed_won' }),
      makeLead({ id: 'l3', currentOwnerUserId: 'other_sp', status: 'pending_action' })
    ];
    const { updatedLeads, drainedCount } = drainSalespersonQueue(leads, 'sp_old', 'sp_new', 'فروشندهٔ جدید', { id: 'actor', fullName: 'سرپرست' }, 'now');
    expect(drainedCount).toBe(1);
    expect(updatedLeads.find((l) => l.id === 'l1')!.currentOwnerUserId).toBe('sp_new');
    expect(updatedLeads.find((l) => l.id === 'l2')!.currentOwnerUserId).toBe('sp_old');
    expect(updatedLeads.find((l) => l.id === 'l3')!.currentOwnerUserId).toBe('other_sp');
  });
});
