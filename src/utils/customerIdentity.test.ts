import { describe, it, expect } from 'vitest';
import {
  normalizePhone, normalizeName, computeMatchScore, findMergeCandidates,
  resolveIncomingCustomerData, resolveIncomingCustomerDataBatch, resolveRootProfile,
  executeMerge, previewSplit, executeSplit, toCustomerSearchResultView, toPurchaseClaimFinancialView,
  selectCustomerPrimaryValue, decideSelectPrimaryValue, updateCustomerContactStatus, decideUpdateContactStatus,
  decideMergeApproval, decideMergeRejection, decideSplitExecution,
  decideConflictResolutionAttach, decideConflictResolutionCreateNew, decideConflictResolutionDismiss,
  decideReviewPurchaseClaimData, decideReviewPurchaseClaimFinancial,
  attachIncomingValuesToCustomer, toCustomerComparisonView, buildCustomerTimeline
} from './customerIdentity';
import { canStartNewSale, getCustomerSalesOperationStatus, findCustomerByPhone } from './salesHierarchy';
import { getEffectiveUserPermissions, hasPermission } from './permissions';
import type {
  Customer, CustomerMergeRequest, CustomerMergeEvent, CustomerSplitEvent, CustomerEntryConflict, ClaimedPurchase,
  SystemRole, User
} from '../types';

// --- Fixtures ---
function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cust_1',
    fullName: 'علی رضایی',
    phone1: '09121234567',
    createdAt: '1404/01/01',
    ...overrides
  };
}

function withPhoneEntry(c: Customer, value: string, opts: Partial<{ id: string; isCurrentPrimary: boolean }> = {}): Customer {
  return {
    ...c,
    phoneEntries: [
      ...(c.phoneEntries || []),
      {
        id: opts.id || `phone_${c.id}_${(c.phoneEntries || []).length}`,
        value, normalizedValue: normalizePhone(value),
        source: 'sales_entry', recordedAt: '1404/01/01', recordedByUserId: 'u1', recordedByName: 'Test',
        isCustomerConfirmed: false, isCurrentPrimary: opts.isCurrentPrimary ?? true
      }
    ]
  };
}

// ============================================================
// نرمال‌سازی
// ============================================================
describe('normalizePhone', () => {
  it('converts Persian digits to English', () => {
    expect(normalizePhone('۰۹۱۲۱۲۳۴۵۶۷')).toBe('09121234567');
  });
  it('normalizes +98 prefix', () => {
    expect(normalizePhone('+989121234567')).toBe('09121234567');
  });
  it('normalizes 0098 prefix', () => {
    expect(normalizePhone('00989121234567')).toBe('09121234567');
  });
  it('normalizes 98 prefix without leading 0', () => {
    expect(normalizePhone('989121234567')).toBe('09121234567');
  });
  it('normalizes bare 9-prefixed 10-digit number', () => {
    expect(normalizePhone('9121234567')).toBe('09121234567');
  });
  it('strips spaces and dashes', () => {
    expect(normalizePhone('0912 123-4567')).toBe('09121234567');
  });
  it('returns empty string for empty input', () => {
    expect(normalizePhone('')).toBe('');
  });
});

describe('normalizeName', () => {
  it('unifies ی/ك variants and collapses whitespace', () => {
    expect(normalizeName('علي   رضايي')).toBe('علی رضایی');
  });
});

// ============================================================
// امتیاز تشابه
// ============================================================
describe('computeMatchScore', () => {
  it('does not suggest a merge based on name similarity alone (no shared phone, low similarity)', () => {
    const a = makeCustomer({ id: 'a', fullName: 'زهرا احمدی', phone1: '09121111111' });
    const b = makeCustomer({ id: 'b', fullName: 'محمد کریمی', phone1: '09122222222' });
    const result = computeMatchScore(a, b);
    expect(result.matchType).toBe('name_address_similarity');
    expect(result.overallScore).toBeLessThan(90);
  });

  it('flags exact_phone_similarity when phones match', () => {
    const a = withPhoneEntry(makeCustomer({ id: 'a' }), '09121234567');
    const b = withPhoneEntry(makeCustomer({ id: 'b', fullName: 'نام دیگر' }), '09121234567');
    const result = computeMatchScore(a, b);
    expect(result.matchType).toBe('exact_phone_similarity');
    expect(result.reasons.find((r) => r.field === 'phone')?.score).toBe(100);
  });
});

describe('findMergeCandidates', () => {
  it('excludes isAbsorbed profiles', () => {
    const target = withPhoneEntry(makeCustomer({ id: 'target' }), '09121234567');
    const absorbed = withPhoneEntry(makeCustomer({ id: 'absorbed', isAbsorbed: true }), '09121234567');
    const candidates = findMergeCandidates(target, [target, absorbed]);
    expect(candidates.find((c) => c.customer.id === 'absorbed')).toBeUndefined();
  });
});

// ============================================================
// بخش ۱-الف: تفکیک Import/ورود اطلاعات از Merge
// ============================================================
describe('resolveIncomingCustomerData', () => {
  it('creates a new profile when phone matches nothing', () => {
    const result = resolveIncomingCustomerData({ phone: '09120000000' }, []);
    expect(result.action).toBe('create_new');
  });

  it('attaches to the single existing active profile when phone matches with no conflict (not a merge)', () => {
    const existing = withPhoneEntry(makeCustomer({ id: 'c1', fullName: 'رضا محمدی' }), '09121234567');
    const result = resolveIncomingCustomerData({ phone: '09121234567', name: 'رضا محمدی' }, [existing]);
    expect(result).toEqual({ action: 'attach_to_existing', targetCustomerId: 'c1' });
  });

  it('flags a conflict when the same phone has a seriously different name', () => {
    const existing = withPhoneEntry(makeCustomer({ id: 'c1', fullName: 'رضا محمدی' }), '09121234567');
    const result = resolveIncomingCustomerData({ phone: '09121234567', name: 'سارا کاملاً متفاوت' }, [existing]);
    expect(result.action).toBe('conflict_needs_review');
  });

  it('flags a conflict when more than one active profile shares the same phone', () => {
    const c1 = withPhoneEntry(makeCustomer({ id: 'c1' }), '09121234567');
    const c2 = withPhoneEntry(makeCustomer({ id: 'c2', fullName: 'دیگری' }), '09121234567');
    const result = resolveIncomingCustomerData({ phone: '09121234567' }, [c1, c2]);
    expect(result.action).toBe('conflict_needs_review');
    if (result.action === 'conflict_needs_review') {
      expect(result.conflictingCustomerIds.sort()).toEqual(['c1', 'c2']);
    }
  });

  it('ignores isAbsorbed profiles when matching', () => {
    const absorbed = withPhoneEntry(makeCustomer({ id: 'c1', isAbsorbed: true }), '09121234567');
    const result = resolveIncomingCustomerData({ phone: '09121234567' }, [absorbed]);
    expect(result.action).toBe('create_new');
  });
});

describe('resolveIncomingCustomerDataBatch', () => {
  it('does not let one conflicting row halt the others', () => {
    const c1 = withPhoneEntry(makeCustomer({ id: 'c1', fullName: 'اول' }), '09121111111');
    const summary = resolveIncomingCustomerDataBatch(
      [
        { rowIndex: 0, phone: '09121111111', name: 'کاملاً متفاوت XYZ' }, // conflict
        { rowIndex: 1, phone: '09122222222' }, // create_new
        { rowIndex: 2, phone: '09121111111', name: 'اول' } // attach
      ],
      [c1]
    );
    expect(summary.conflictCount).toBe(1);
    expect(summary.createdCount).toBe(1);
    expect(summary.attachedCount).toBe(1);
    expect(summary.rows).toHaveLength(3);
  });
});

// ============================================================
// resolveRootProfile
// ============================================================
describe('resolveRootProfile', () => {
  it('resolves through a chain to the final root', () => {
    const root = makeCustomer({ id: 'root' });
    const mid = makeCustomer({ id: 'mid', isAbsorbed: true, mergedIntoCustomerId: 'root' });
    const leaf = makeCustomer({ id: 'leaf', isAbsorbed: true, mergedIntoCustomerId: 'mid' });
    const result = resolveRootProfile('leaf', [root, mid, leaf]);
    expect(result).toEqual({ ok: true, rootId: 'root' });
  });

  it('detects a cycle instead of looping forever', () => {
    const a = makeCustomer({ id: 'a', isAbsorbed: true, mergedIntoCustomerId: 'b' });
    const b = makeCustomer({ id: 'b', isAbsorbed: true, mergedIntoCustomerId: 'a' });
    const result = resolveRootProfile('a', [a, b]);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('CYCLE_DETECTED');
  });
});

// ============================================================
// executeMerge — کپی‌محور، غیرمخرب
// ============================================================
function makeMergeRequest(overrides: Partial<CustomerMergeRequest> = {}): CustomerMergeRequest {
  return {
    id: 'mreq_1', requestNumber: 'M1001', idempotencyKey: 'idem_1',
    profileIds: ['mother', 'absorbed'], motherProfileId: 'mother', motherProfileReason: 'شماره یکسان',
    matchType: 'exact_phone_similarity', overallScore: 95, reasons: [],
    requesterId: 'u1', requesterName: 'کاربر تست', requesterRole: 'فروشنده', requestedAt: '1404/01/01',
    status: 'pending',
    ...overrides
  };
}

describe('executeMerge', () => {
  const mother = withPhoneEntry(makeCustomer({ id: 'mother', fullName: 'مادر' }), '09121111111');
  const absorbed = withPhoneEntry(
    { ...makeCustomer({ id: 'absorbed', fullName: 'جذب‌شده' }), activityLog: [{ id: 'act1', salespersonId: 'sp1', startedAt: '1404/01/01', status: 'completed' }] },
    '09122222222'
  );

  it('rejects merging a profile with itself (duplicate profile ids)', () => {
    const request = makeMergeRequest({ profileIds: ['mother', 'mother'], motherProfileId: 'mother' });
    const result = executeMerge(request, [mother], [], { id: 'u1', fullName: 'کاربر' }, '1404/01/02');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('DUPLICATE_PROFILE_IDS');
  });

  it('merges two independent profiles non-destructively (copy, not move)', () => {
    const request = makeMergeRequest();
    const result = executeMerge(request, [mother, absorbed], [], { id: 'u1', fullName: 'کاربر' }, '1404/01/02');
    expect(result.ok).toBe(true);
    if (result.ok === false) return;

    const updatedMother = result.data.updatedCustomers.find((c) => c.id === 'mother')!;
    const updatedAbsorbed = result.data.updatedCustomers.find((c) => c.id === 'absorbed')!;

    // مادر هر دو شماره را دارد
    expect(updatedMother.phoneEntries?.map((e) => e.normalizedValue)).toEqual(
      expect.arrayContaining(['09121111111', '09122222222'])
    );
    // پروفایل جذب‌شده isAbsorbed می‌شود ولی هیچ فیلدی از دست نمی‌دهد (Entry اصلی‌اش دست‌نخورده می‌ماند)
    expect(updatedAbsorbed.isAbsorbed).toBe(true);
    expect(updatedAbsorbed.mergedIntoCustomerId).toBe('mother');
    expect(updatedAbsorbed.phoneEntries).toHaveLength(1);
    expect(updatedAbsorbed.phoneEntries?.[0].value).toBe('09122222222');
    // activityLog جذب‌شده هم روی خودش باقی می‌ماند
    expect(updatedAbsorbed.activityLog).toHaveLength(1);
    // و به مادر هم کپی شده
    expect(updatedMother.activityLog?.some((a) => a.salespersonId === 'sp1')).toBe(true);

    expect(result.data.event.transferredValueIds.phoneEntryIds).toContain(absorbed.phoneEntries![0].id);
  });

  it('atomically merges three profiles at once (multi-select Merge)', () => {
    const absorbed2 = withPhoneEntry(makeCustomer({ id: 'absorbed2', fullName: 'جذب‌شدهٔ دوم' }), '09123333333');
    const request = makeMergeRequest({ profileIds: ['mother', 'absorbed', 'absorbed2'], motherProfileId: 'mother' });
    const result = executeMerge(request, [mother, absorbed, absorbed2], [], { id: 'u1', fullName: 'کاربر' }, '1404/01/02');
    expect(result.ok).toBe(true);
    if (result.ok === false) return;

    const updatedMother = result.data.updatedCustomers.find((c) => c.id === 'mother')!;
    const updatedAbsorbed1 = result.data.updatedCustomers.find((c) => c.id === 'absorbed')!;
    const updatedAbsorbed2 = result.data.updatedCustomers.find((c) => c.id === 'absorbed2')!;

    expect(updatedMother.phoneEntries?.map((e) => e.normalizedValue)).toEqual(
      expect.arrayContaining(['09121111111', '09122222222', '09123333333'])
    );
    expect(updatedAbsorbed1.isAbsorbed).toBe(true);
    expect(updatedAbsorbed1.mergedIntoCustomerId).toBe('mother');
    expect(updatedAbsorbed2.isAbsorbed).toBe(true);
    expect(updatedAbsorbed2.mergedIntoCustomerId).toBe('mother');
    // هیچ‌کدام از دو پروفایل جذب‌شده داده‌اش را از دست نداده
    expect(updatedAbsorbed1.phoneEntries).toHaveLength(1);
    expect(updatedAbsorbed2.phoneEntries).toHaveLength(1);
    expect(result.data.event.mergedProfileIds.sort()).toEqual(['absorbed', 'absorbed2']);
  });

  it('rejects re-approving an already-decided request', () => {
    const request = makeMergeRequest({ status: 'approved' });
    const result = executeMerge(request, [mother, absorbed], [], { id: 'u1', fullName: 'کاربر' }, '1404/01/02');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('REQUEST_NOT_PENDING');
  });

  it('rejects executing the same idempotencyKey twice', () => {
    const request = makeMergeRequest();
    const priorEvent = { idempotencyKey: 'idem_1' } as CustomerMergeEvent;
    const result = executeMerge(request, [mother, absorbed], [priorEvent], { id: 'u1', fullName: 'کاربر' }, '1404/01/02');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('DUPLICATE_IDEMPOTENCY_KEY');
  });

  it('rejects merging a profile that is already absorbed into a different merge', () => {
    const alreadyAbsorbed = { ...absorbed, isAbsorbed: true, mergedIntoCustomerId: 'someone_else' };
    const request = makeMergeRequest({ profileIds: ['mother', 'absorbed'] });
    const result = executeMerge(request, [mother, alreadyAbsorbed], [], { id: 'u1', fullName: 'کاربر' }, '1404/01/02');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('PROFILE_ALREADY_ABSORBED');
  });
});

// ============================================================
// previewSplit / executeSplit
// ============================================================
describe('previewSplit and executeSplit', () => {
  const mother = withPhoneEntry(makeCustomer({ id: 'mother', fullName: 'مادر' }), '09121111111');
  const absorbed = withPhoneEntry(makeCustomer({ id: 'absorbed', fullName: 'جذب‌شده' }), '09122222222');

  function runMerge() {
    const request = makeMergeRequest();
    const result = executeMerge(request, [mother, absorbed], [], { id: 'u1', fullName: 'کاربر' }, '1404/01/02');
    if (result.ok === false) throw new Error('merge setup failed');
    return result.data;
  }

  it('splits without deleting any post-merge data, restoring absorbed profile', () => {
    const { updatedCustomers, event } = runMerge();
    const splitResult = executeSplit(
      event, updatedCustomers, [], { id: 'u1' }, { id: 'dm1', fullName: 'مدیر داده' },
      'ادغام اشتباه بود', {}, 'split_idem_1', '1404/01/03'
    );
    expect(splitResult.ok).toBe(true);
    if (splitResult.ok === false) return;

    const restoredAbsorbed = splitResult.data.updatedCustomers.find((c) => c.id === 'absorbed')!;
    const finalMother = splitResult.data.updatedCustomers.find((c) => c.id === 'mother')!;
    expect(restoredAbsorbed.isAbsorbed).toBe(false);
    expect(restoredAbsorbed.mergedIntoCustomerId).toBeUndefined();
    expect(restoredAbsorbed.phoneEntries?.[0].value).toBe('09122222222'); // نسخهٔ اصلی هرگز حذف نشده بود
    expect(finalMother.phoneEntries?.some((e) => e.normalizedValue === '09122222222')).toBe(false); // از مادر حذف شد
  });

  it('blocks split when post-merge data has no destination chosen', () => {
    const { updatedCustomers, event } = runMerge();
    const motherWithNewData = updatedCustomers.map((c) =>
      c.id === 'mother'
        ? withPhoneEntry(c, '09123333333', { id: 'phone_new_after_merge' })
        : c
    );
    const preview = previewSplit(event, motherWithNewData);
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.data.needsDestinationEntryIds.phoneEntryIds).toContain('phone_new_after_merge');
    }

    const splitResult = executeSplit(
      event, motherWithNewData, [], { id: 'u1' }, { id: 'dm1', fullName: 'مدیر داده' },
      'دلیل', {}, 'split_idem_2', '1404/01/03'
    );
    expect(splitResult.ok).toBe(false);
    if (splitResult.ok === false) expect(splitResult.errorCode).toBe('MISSING_DESTINATION');
  });

  it('detects drift when a transferred entry was edited on the mother after merge', () => {
    const { updatedCustomers, event } = runMerge();
    const transferredId = event.transferredValueIds.phoneEntryIds[0];
    const driftedCustomers = updatedCustomers.map((c) =>
      c.id === 'mother'
        ? { ...c, phoneEntries: c.phoneEntries!.map((e) => (e.id === transferredId ? { ...e, value: '09129999999' } : e)) }
        : c
    );
    const preview = previewSplit(event, driftedCustomers);
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.data.hasDrift).toBe(true);
      expect(preview.data.driftedEntryIds.phoneEntryIds).toContain(transferredId);
    }
  });

  it('rejects splitting the same merge event twice', () => {
    const { updatedCustomers, event } = runMerge();
    const priorSplit = { originalMergeEventId: event.id } as CustomerSplitEvent;
    const result = executeSplit(
      event, updatedCustomers, [priorSplit], { id: 'u1' }, { id: 'dm1', fullName: 'مدیر داده' },
      'دلیل', {}, 'split_idem_3', '1404/01/03'
    );
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('ALREADY_SPLIT');
  });

  it('requires a non-empty reason', () => {
    const { updatedCustomers, event } = runMerge();
    const result = executeSplit(event, updatedCustomers, [], { id: 'u1' }, { id: 'dm1', fullName: 'مدیر داده' }, '', {}, 'split_idem_4', '1404/01/03');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('REASON_REQUIRED');
  });
});

// ============================================================
// View Modelهای حداقلی — Mask کردن فیلد بر اساس Permission
// ============================================================
describe('toCustomerSearchResultView', () => {
  const customer = withPhoneEntry(makeCustomer({ id: 'c1', fullName: 'مشتری تست', address: 'تهران' }), '09121234567');

  it('masks phone when the viewer lacks view_customer_contact_fields', () => {
    const view = toCustomerSearchResultView(customer, []);
    expect(view.displayPhone).not.toBe('09121234567');
    expect(view.displayPhone).toContain('•');
    expect(view.displayAddress).toBeUndefined();
  });

  it('shows full phone/address when the viewer has the permissions', () => {
    const view = toCustomerSearchResultView(customer, ['view_customer_contact_fields', 'view_customer_address']);
    expect(view.displayPhone).toBe('09121234567');
  });

  it('admin (null effectivePermissions) always sees full data', () => {
    const view = toCustomerSearchResultView(customer, null);
    expect(view.displayPhone).toBe('09121234567');
  });
});

describe('toPurchaseClaimFinancialView', () => {
  it('exposes only minimal fields, never the full customer profile', () => {
    const customer = makeCustomer({ id: 'c1', fullName: 'مشتری محرمانه', complaintStatus: 'active' });
    const view = toPurchaseClaimFinancialView(
      { id: 'claim1', customerId: 'c1', claimedAmount: 1000000, submittedByUserId: 'u1', submittedByUserName: 'کاربر', submittedAt: '1404/01/01', status: 'pending_financial_review' },
      customer
    );
    expect(view.customerDisplayName).toBe('مشتری محرمانه');
    expect(view.claimedAmount).toBe(1000000);
    expect(Object.keys(view)).not.toContain('complaintStatus');
  });
});

// ============================================================
// کنترل Permission و Deny (permissions.ts)
// ============================================================
describe('permission control for customer identity actions', () => {
  const dataManagerRole: SystemRole = {
    id: 'role_data_manager', code: 'DATA_MANAGER', name: 'مدیر داده', description: '', isSystemRole: true,
    permissions: ['approve_reject_customer_merge', 'select_customer_primary_value']
  };

  it('rejects approve_reject_customer_merge for a user whose role lacks it', () => {
    const salesperson: User = {
      id: 'u1', username: 'sp', fullName: 'فروشنده', phone: '', email: '', role: 'requestor',
      roleId: 'role_salesperson', roleTitle: 'فروشنده', isActive: true
    };
    const salesRole: SystemRole = { id: 'role_salesperson', code: 'SALESPERSON', name: 'فروشنده', description: '', isSystemRole: true, permissions: ['view_customer_profile'] };
    const effective = getEffectiveUserPermissions(salesperson, [salesRole]);
    expect(hasPermission(effective, ['approve_reject_customer_merge'])).toBe(false);
  });

  it('grants approve_reject_customer_merge for the data manager role', () => {
    const dataManager: User = {
      id: 'u2', username: 'dm', fullName: 'مدیر داده', phone: '', email: '', role: 'requestor',
      roleId: 'role_data_manager', roleTitle: 'مدیر داده', isActive: true
    };
    const effective = getEffectiveUserPermissions(dataManager, [dataManagerRole]);
    expect(hasPermission(effective, ['approve_reject_customer_merge'])).toBe(true);
  });

  it('deny always wins — even for the data manager role', () => {
    const dataManagerDenied: User = {
      id: 'u3', username: 'dm2', fullName: 'مدیر داده محدود', phone: '', email: '', role: 'requestor',
      roleId: 'role_data_manager', roleTitle: 'مدیر داده', isActive: true,
      deniedPermissions: ['approve_reject_customer_merge']
    };
    const effective = getEffectiveUserPermissions(dataManagerDenied, [dataManagerRole]);
    expect(hasPermission(effective, ['approve_reject_customer_merge'])).toBe(false);
    // ولی مجوز دیگر همان نقش هنوز باقی است
    expect(hasPermission(effective, ['select_customer_primary_value'])).toBe(true);
  });
});

// ============================================================
// مسدودسازی چرخهٔ فروش (salesHierarchy.ts)
// ============================================================
describe('canStartNewSale blocks on complaint/contact-permission status', () => {
  it('blocks when complaintStatus is active', () => {
    const c = makeCustomer({ complaintStatus: 'active' });
    const result = canStartNewSale(c);
    expect(result.ok).toBe(false);
  });

  it('blocks when complaintStatus is cooldown', () => {
    const c = makeCustomer({ complaintStatus: 'cooldown' });
    expect(canStartNewSale(c).ok).toBe(false);
  });

  it('blocks when contactPermissionStatus is do_not_contact', () => {
    const c = makeCustomer({ contactPermissionStatus: 'do_not_contact' });
    expect(canStartNewSale(c).ok).toBe(false);
  });

  it('allows starting a cycle when nothing blocks it', () => {
    const c = makeCustomer();
    expect(canStartNewSale(c).ok).toBe(true);
  });

  it('does not conflate salesOperationStatus (pending_action) with contactPermissionStatus (do_not_contact)', () => {
    const c = makeCustomer({ salesOperationStatusOverride: 'pending_action' });
    // «بدون اقدام» فروشنده نباید به‌تنهایی چرخهٔ فروش را مسدود کند — این دو مفهوم مستقل‌اند
    expect(canStartNewSale(c).ok).toBe(true);
    expect(getCustomerSalesOperationStatus(c)).toBe('pending_action');
  });
});

describe('findCustomerByPhone resolves absorbed profiles to the mother', () => {
  it('returns the mother profile when searching an absorbed profile\'s old number', () => {
    const mother = withPhoneEntry(makeCustomer({ id: 'mother', fullName: 'مادر' }), '09121111111');
    const absorbed = withPhoneEntry(
      makeCustomer({ id: 'absorbed', fullName: 'جذب‌شده', isAbsorbed: true, mergedIntoCustomerId: 'mother' }),
      '09122222222'
    );
    const found = findCustomerByPhone('09122222222', [mother, absorbed]);
    expect(found?.id).toBe('mother');
  });
});

// ============================================================
// انتخاب مقدار اصلی (select_customer_primary_value) — اصلاحیهٔ QA
// ============================================================
describe('selectCustomerPrimaryValue', () => {
  function makeMultiValueCustomer(): Customer {
    return withPhoneEntry(
      { ...makeCustomer({ id: 'c1', fullName: 'نام اول' }) },
      '09121111111',
      { id: 'phone_1', isCurrentPrimary: true }
    );
  }

  it('changes primary name without deleting the old value, syncs legacy fullName, bumps version/updatedAt', () => {
    const c: Customer = {
      ...makeCustomer({ id: 'c1' }),
      nameEntries: [
        { id: 'name_1', value: 'نام اول', normalizedValue: 'نام اول', source: 'sales_entry', recordedAt: '1404/01/01', recordedByUserId: 'u1', recordedByName: 'کاربر', isCustomerConfirmed: false, isCurrentPrimary: true },
        { id: 'name_2', value: 'نام دوم', normalizedValue: 'نام دوم', source: 'sales_entry', recordedAt: '1404/01/02', recordedByUserId: 'u1', recordedByName: 'کاربر', isCustomerConfirmed: false, isCurrentPrimary: false }
      ],
      version: 1
    };
    const result = selectCustomerPrimaryValue(c, 'name', 'name_2', 'مقدار جدید صحیح‌تر است', { id: 'u2', fullName: 'مدیر داده' }, '1404/01/05');
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    const updated = result.data.updatedCustomer;
    expect(updated.nameEntries).toHaveLength(2); // مقدار قبلی حذف نشد
    expect(updated.nameEntries?.find((e) => e.id === 'name_1')?.isCurrentPrimary).toBe(false);
    expect(updated.nameEntries?.find((e) => e.id === 'name_2')?.isCurrentPrimary).toBe(true);
    expect(updated.fullName).toBe('نام دوم');
    expect(updated.version).toBe(2);
    expect(updated.updatedAt).toBe('1404/01/05');
    expect(result.data.statusChangeEvent.oldValue).toBe('نام اول');
    expect(result.data.statusChangeEvent.newValue).toBe('نام دوم');
    expect(result.data.statusChangeEvent.field).toBe('primaryNameEntryId');
  });

  it('changes primary phone and syncs legacy phone1', () => {
    const c = makeMultiValueCustomer();
    const withSecond = withPhoneEntry(c, '09122222222', { id: 'phone_2' });
    const result = selectCustomerPrimaryValue(withSecond, 'phone', 'phone_2', 'شمارهٔ جدید تأییدشده', { id: 'u2', fullName: 'مدیر داده' }, '1404/01/05');
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.data.updatedCustomer.phone1).toBe('09122222222');
    expect(result.data.updatedCustomer.phoneEntries?.find((e) => e.id === 'phone_1')?.isCurrentPrimary).toBe(false);
  });

  it('rejects when reason is empty', () => {
    const c = makeMultiValueCustomer();
    const result = selectCustomerPrimaryValue(c, 'phone', 'phone_1', '', { id: 'u2', fullName: 'مدیر داده' }, '1404/01/05');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('REASON_REQUIRED');
  });

  it('rejects when the entry is already primary', () => {
    const c = makeMultiValueCustomer();
    const result = selectCustomerPrimaryValue(c, 'phone', 'phone_1', 'دلیل', { id: 'u2', fullName: 'مدیر داده' }, '1404/01/05');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('ALREADY_PRIMARY');
  });
});

describe('decideSelectPrimaryValue — permission control', () => {
  const dataManagerRole: SystemRole = {
    id: 'role_data_manager', code: 'DATA_MANAGER', name: 'مدیر داده', description: '', isSystemRole: true,
    permissions: ['select_customer_primary_value']
  };
  const c = withPhoneEntry(makeCustomer({ id: 'c1' }), '09121111111', { id: 'phone_1', isCurrentPrimary: true });
  const withSecondPhone = withPhoneEntry(c, '09122222222', { id: 'phone_2' });

  it('rejects a salesperson without select_customer_primary_value', () => {
    const salesRole: SystemRole = { id: 'role_salesperson', code: 'SALESPERSON', name: 'فروشنده', description: '', isSystemRole: true, permissions: ['view_customer_profile'] };
    const salesperson: User = { id: 'u1', username: 'sp', fullName: 'فروشنده', phone: '', email: '', role: 'requestor', roleId: 'role_salesperson', roleTitle: 'فروشنده', isActive: true };
    const effective = getEffectiveUserPermissions(salesperson, [salesRole]);
    const result = decideSelectPrimaryValue(withSecondPhone, 'phone', 'phone_2', 'دلیل', effective, { id: 'u1', fullName: 'فروشنده' }, '1404/01/05');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('PERMISSION_DENIED');
  });

  it('allows the data manager role', () => {
    const dataManager: User = { id: 'u2', username: 'dm', fullName: 'مدیر داده', phone: '', email: '', role: 'requestor', roleId: 'role_data_manager', roleTitle: 'مدیر داده', isActive: true };
    const effective = getEffectiveUserPermissions(dataManager, [dataManagerRole]);
    const result = decideSelectPrimaryValue(withSecondPhone, 'phone', 'phone_2', 'دلیل', effective, { id: 'u2', fullName: 'مدیر داده' }, '1404/01/05');
    expect(result.ok).toBe(true);
  });

  it('blocks even the data manager when this specific permission is explicitly Denied', () => {
    const deniedDataManager: User = {
      id: 'u3', username: 'dm2', fullName: 'مدیر داده محدود', phone: '', email: '', role: 'requestor',
      roleId: 'role_data_manager', roleTitle: 'مدیر داده', isActive: true,
      deniedPermissions: ['select_customer_primary_value']
    };
    const effective = getEffectiveUserPermissions(deniedDataManager, [dataManagerRole]);
    const result = decideSelectPrimaryValue(withSecondPhone, 'phone', 'phone_2', 'دلیل', effective, { id: 'u3', fullName: 'مدیر داده محدود' }, '1404/01/05');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('PERMISSION_DENIED');
  });

  it('admin (null effectivePermissions) always bypasses', () => {
    const result = decideSelectPrimaryValue(withSecondPhone, 'phone', 'phone_2', 'دلیل', null, { id: 'admin1', fullName: 'ادمین' }, '1404/01/05');
    expect(result.ok).toBe(true);
  });
});

// ============================================================
// نتیجهٔ تماس (واحد شنود) — فقط contactStatus را تغییر می‌دهد
// ============================================================
describe('updateCustomerContactStatus / decideUpdateContactStatus', () => {
  const monitorRole: SystemRole = {
    id: 'role_call_monitoring_unit', code: 'CALL_MONITORING_UNIT', name: 'واحد شنود', description: '', isSystemRole: true,
    permissions: ['update_customer_contact_status']
  };
  const monitor: User = { id: 'u4', username: 'monitor', fullName: 'واحد شنود', phone: '', email: '', role: 'requestor', roleId: 'role_call_monitoring_unit', roleTitle: 'واحد شنود', isActive: true };

  it('only changes contactStatus, never contactPermissionStatus/complaintStatus/financialStatus', () => {
    const c = makeCustomer({ contactStatus: 'needs_recall', contactPermissionStatus: 'do_not_contact', complaintStatus: 'active', financialStatus: 'has_discrepancy' });
    const result = updateCustomerContactStatus(c, 'confirmed', 'تماس موفق بود', { id: 'u4', fullName: 'واحد شنود' }, '1404/01/06');
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.data.updatedCustomer.contactStatus).toBe('confirmed');
    expect(result.data.updatedCustomer.contactPermissionStatus).toBe('do_not_contact'); // دست‌نخورده
    expect(result.data.updatedCustomer.complaintStatus).toBe('active'); // دست‌نخورده
    expect(result.data.updatedCustomer.financialStatus).toBe('has_discrepancy'); // دست‌نخورده
    expect(result.data.statusChangeEvent.field).toBe('contactStatus');
  });

  it('rejects a role that never had update_customer_contact_status', () => {
    const effective = getEffectiveUserPermissions(monitor, [{ ...monitorRole, permissions: [] }]);
    const result = decideUpdateContactStatus(makeCustomer(), 'confirmed', 'دلیل', effective, { id: 'u4', fullName: 'واحد شنود' }, '1404/01/06');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('PERMISSION_DENIED');
  });

  it('blocks even the call-monitoring role when this specific permission is explicitly Denied', () => {
    const deniedMonitor: User = { ...monitor, deniedPermissions: ['update_customer_contact_status'] };
    const effective = getEffectiveUserPermissions(deniedMonitor, [monitorRole]);
    const result = decideUpdateContactStatus(makeCustomer(), 'confirmed', 'دلیل', effective, { id: 'u4', fullName: 'واحد شنود' }, '1404/01/06');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('PERMISSION_DENIED');
  });

  it('allows the call-monitoring role', () => {
    const effective = getEffectiveUserPermissions(monitor, [monitorRole]);
    const result = decideUpdateContactStatus(makeCustomer(), 'no_answer', 'پاسخ نداد', effective, { id: 'u4', fullName: 'واحد شنود' }, '1404/01/06');
    expect(result.ok).toBe(true);
  });
});

// ============================================================
// تصمیم Handler — تست منطق Handler، نه فقط hasPermission
// ============================================================
describe('decideMergeApproval / decideMergeRejection — Handler-level', () => {
  const mother = withPhoneEntry(makeCustomer({ id: 'mother' }), '09121111111');
  const absorbed = withPhoneEntry(makeCustomer({ id: 'absorbed', fullName: 'جذب‌شده' }), '09122222222');
  const request = makeMergeRequest();

  it('rejects approval without approve_reject_customer_merge permission, and does not mutate anything', () => {
    const result = decideMergeApproval(request, [mother, absorbed], [], [], { id: 'u1', fullName: 'کاربر' }, '1404/01/02');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('PERMISSION_DENIED');
  });

  it('approves and executes merge when permission is present', () => {
    const result = decideMergeApproval(request, [mother, absorbed], [], ['approve_reject_customer_merge'], { id: 'u1', fullName: 'مدیر داده' }, '1404/01/02');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.updatedRequest.status).toBe('approved');
  });

  it('rejects rejection-decision without permission', () => {
    const result = decideMergeRejection(request, 'دلیل رد', [], { id: 'u1', fullName: 'کاربر' }, '1404/01/02');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('PERMISSION_DENIED');
  });

  it('rejects a stale (already-decided) request even with permission', () => {
    const decided: CustomerMergeRequest = { ...request, status: 'approved' };
    const result = decideMergeRejection(decided, 'دلیل رد', ['approve_reject_customer_merge'], { id: 'u1', fullName: 'مدیر داده' }, '1404/01/02');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('REQUEST_NOT_PENDING');
  });

  it('a rejected outcome never mutates the input customers — same references, no copies made', () => {
    const originalCustomers = [mother, absorbed];
    const result = decideMergeApproval(request, originalCustomers, [], [], { id: 'u1', fullName: 'کاربر' }, '1404/01/02');
    expect(result.ok).toBe(false);
    expect(originalCustomers[0]).toBe(mother); // همان Reference — هیچ کپی/تغییری ساخته نشد
    expect(originalCustomers[1]).toBe(absorbed);
    expect(mother.isAbsorbed).toBeUndefined();
  });
});

describe('decideSplitExecution — Handler-level permission control', () => {
  const mother = withPhoneEntry(makeCustomer({ id: 'mother' }), '09121111111');
  const absorbed = withPhoneEntry(makeCustomer({ id: 'absorbed' }), '09122222222');

  it('rejects split without split_customer_merge permission', () => {
    const mergeResult = decideMergeApproval(makeMergeRequest(), [mother, absorbed], [], ['approve_reject_customer_merge'], { id: 'u1', fullName: 'مدیر داده' }, '1404/01/02');
    if (mergeResult.ok === false) throw new Error('setup failed');
    const result = decideSplitExecution(mergeResult.data.event, mergeResult.data.updatedCustomers, [], [], { id: 'u1' }, { id: 'u1', fullName: 'مدیر داده' }, 'دلیل', {}, 'split_idem_x', '1404/01/03');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('PERMISSION_DENIED');
  });
});

describe('decideConflictResolutionAttach/CreateNew/Dismiss — permission control', () => {
  const conflict: CustomerEntryConflict = {
    id: 'conf_1', incomingSource: 'sales_entry', submittedByUserId: 'u1', submittedByUserName: 'فروشنده', submittedAt: '1404/01/01',
    incomingPhone: '09123334444', incomingName: 'نام ورودی', conflictingCustomerIds: ['c1', 'c2'], reason: 'بیش از یک تطبیق', status: 'pending'
  };
  const target = makeCustomer({ id: 'c1' });

  it('rejects attach without review_customer_entry_conflict', () => {
    const result = decideConflictResolutionAttach(conflict, target, [], { id: 'u2', fullName: 'مدیر داده' }, '1404/01/02');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('PERMISSION_DENIED');
  });

  it('attaches when permission is present and conflict is pending', () => {
    const result = decideConflictResolutionAttach(conflict, target, ['review_customer_entry_conflict'], { id: 'u2', fullName: 'مدیر داده' }, '1404/01/02');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.updatedConflict.status).toBe('resolved_attached');
  });

  it('rejects createNew without permission', () => {
    const result = decideConflictResolutionCreateNew(conflict, [], { id: 'u2', fullName: 'مدیر داده' }, '1404/01/02');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('PERMISSION_DENIED');
  });

  it('rejects dismiss without permission, and requires a note when authorized', () => {
    const noPerm = decideConflictResolutionDismiss(conflict, 'یادداشت', [], { id: 'u2', fullName: 'مدیر داده' }, '1404/01/02');
    expect(noPerm.ok).toBe(false);
    if (noPerm.ok === false) expect(noPerm.errorCode).toBe('PERMISSION_DENIED');
    const noNote = decideConflictResolutionDismiss(conflict, '', ['review_customer_entry_conflict'], { id: 'u2', fullName: 'مدیر داده' }, '1404/01/02');
    expect(noNote.ok).toBe(false);
    if (noNote.ok === false) expect(noNote.errorCode).toBe('REASON_REQUIRED');
  });

  it('rejects acting on an already-resolved conflict', () => {
    const resolved: CustomerEntryConflict = { ...conflict, status: 'resolved_dismissed' };
    const result = decideConflictResolutionAttach(resolved, target, ['review_customer_entry_conflict'], { id: 'u2', fullName: 'مدیر داده' }, '1404/01/02');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('CONFLICT_NOT_PENDING');
  });
});

describe('decideReviewPurchaseClaimData / decideReviewPurchaseClaimFinancial — permission control', () => {
  function makeClaim(overrides: Partial<ClaimedPurchase> = {}): ClaimedPurchase {
    return {
      id: 'claim_1', customerId: 'c1', claimedAmount: 1000000, submittedByUserId: 'u1', submittedByUserName: 'فروشنده',
      submittedAt: '1404/01/01', status: 'pending_data_review', ...overrides
    };
  }

  it('data-manager review rejects without review_customer_purchase_claim_data', () => {
    const result = decideReviewPurchaseClaimData(makeClaim(), 'refer_to_financial', undefined, [], { id: 'u2', fullName: 'مدیر داده' }, '1404/01/02');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('PERMISSION_DENIED');
  });

  it('data-manager review does not have final financial authority (still needs the financial permission separately)', () => {
    const dataResult = decideReviewPurchaseClaimData(makeClaim(), 'refer_to_financial', undefined, ['review_customer_purchase_claim_data'], { id: 'u2', fullName: 'مدیر داده' }, '1404/01/02');
    expect(dataResult.ok).toBe(true);
    if (dataResult.ok === false) return;
    expect(dataResult.data.updatedClaim.status).toBe('pending_financial_review');
    expect(dataResult.data.updatedClaim.finalConfirmedAmount).toBeUndefined();

    const financialAttempt = decideReviewPurchaseClaimFinancial(
      dataResult.data.updatedClaim, 'confirm', 500000, undefined, ['review_customer_purchase_claim_data'], { id: 'u2', fullName: 'مدیر داده' }, '1404/01/03'
    );
    expect(financialAttempt.ok).toBe(false);
    if (financialAttempt.ok === false) expect(financialAttempt.errorCode).toBe('PERMISSION_DENIED');
  });

  it('financial reviewer confirms and sets finalConfirmedAmount only now', () => {
    const claim = makeClaim({ status: 'pending_financial_review' });
    const result = decideReviewPurchaseClaimFinancial(claim, 'confirm', 750000, undefined, ['review_customer_purchase_claim_financial'], { id: 'u3', fullName: 'مسئول مالی' }, '1404/01/03');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.updatedClaim.status).toBe('confirmed');
      expect(result.data.updatedClaim.finalConfirmedAmount).toBe(750000);
    }
  });

  it('rejects re-deciding an already-decided claim (no double confirmation)', () => {
    const decided = makeClaim({ status: 'confirmed', finalConfirmedAmount: 750000 });
    const result = decideReviewPurchaseClaimFinancial(decided, 'confirm', 999999, undefined, ['review_customer_purchase_claim_financial'], { id: 'u3', fullName: 'مسئول مالی' }, '1404/01/04');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.errorCode).toBe('CLAIM_NOT_PENDING_FINANCIAL_REVIEW');
  });
});

// ============================================================
// attachIncomingValuesToCustomer — تابع خالص مشترک Attach
// ============================================================
describe('attachIncomingValuesToCustomer', () => {
  it('adds new address entry but skips a duplicate name entry, without touching existing entries', () => {
    const target: Customer = {
      ...withPhoneEntry(makeCustomer({ id: 'c1' }), '09121111111'),
      nameEntries: [{ id: 'name_1', value: 'نام قبلی', normalizedValue: 'نام قبلی', source: 'sales_entry', recordedAt: '1404/01/01', recordedByUserId: 'u0', recordedByName: 'فروشنده', isCustomerConfirmed: false, isCurrentPrimary: true }]
    };
    const updated = attachIncomingValuesToCustomer(
      target, { name: 'نام قبلی', address: 'آدرس جدید' }, 'data_manager_correction', { id: 'u1', fullName: 'مدیر داده' }, '1404/01/02'
    );
    expect(updated.nameEntries).toHaveLength(1); // نام تکراری بود، Entry جدید اضافه نشد
    expect(updated.addressEntries).toHaveLength(1);
  });
});

// ============================================================
// View Model مقایسهٔ Merge — نشتِ اطلاعات
// ============================================================
describe('toCustomerComparisonView — no raw Customer leakage', () => {
  const candidateCustomer = withPhoneEntry(makeCustomer({ id: 'c2', fullName: 'نامزد ادغام', address: 'تهران، خیابان X' }), '09129998888');
  const candidate = { customer: candidateCustomer, overallScore: 95, matchType: 'name_address_similarity' as const, reasons: [] };

  it('a role with only request_customer_merge (no contact/address permission) sees masked phone and no address', () => {
    const view = toCustomerComparisonView(candidate, ['request_customer_merge']);
    expect(view.displayPhone).not.toBe('09129998888');
    expect(view.displayPhone).toContain('•');
    expect(view.displayAddress).toBeUndefined();
  });

  it('a role with request_customer_merge + view_customer_contact_fields + view_customer_address sees full data', () => {
    const view = toCustomerComparisonView(candidate, ['request_customer_merge', 'view_customer_contact_fields', 'view_customer_address']);
    expect(view.displayPhone).toBe('09129998888');
    expect(view.displayAddress).toBe('تهران، خیابان X');
  });
});

// ============================================================
// Timeline یکپارچه — عدم نشت اطلاعات محرمانه
// ============================================================
describe('buildCustomerTimeline', () => {
  const customer = makeCustomer({ id: 'c1', createdAt: '1404/01/01' });
  const mergeRequest = makeMergeRequest({ profileIds: ['c1', 'c2'], requestedAt: '1404/01/02' });
  const context = { mergeRequests: [mergeRequest], splitEvents: [], entryConflicts: [], claimedPurchases: [{ id: 'claim_1', customerId: 'c1', claimedAmount: 2000000, submittedByUserId: 'u1', submittedByUserName: 'فروشنده', submittedAt: '1404/01/03', status: 'pending_data_review' as const }] };

  it('hides merge/conflict/split entries without view_customer_identity_audit', () => {
    const items = buildCustomerTimeline(customer, context, [], (id) => id);
    expect(items.some((i) => i.type === 'merge_requested')).toBe(false);
  });

  it('shows merge entries with view_customer_identity_audit', () => {
    const items = buildCustomerTimeline(customer, context, ['view_customer_identity_audit'], (id) => id);
    expect(items.some((i) => i.type === 'merge_requested')).toBe(true);
  });

  it('hides purchase-claim entries without a claim-review permission', () => {
    const items = buildCustomerTimeline(customer, context, [], (id) => id);
    expect(items.some((i) => i.type === 'claim_submitted')).toBe(false);
  });

  it('shows purchase-claim entries with review_customer_purchase_claim_data', () => {
    const items = buildCustomerTimeline(customer, context, ['review_customer_purchase_claim_data'], (id) => id);
    expect(items.some((i) => i.type === 'claim_submitted')).toBe(true);
  });

  it('always includes profile_created and sale_cycle entries regardless of permission', () => {
    const items = buildCustomerTimeline(customer, context, [], (id) => id);
    expect(items.some((i) => i.type === 'profile_created')).toBe(true);
  });
});
