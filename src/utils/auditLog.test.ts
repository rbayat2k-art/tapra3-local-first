import { afterEach, describe, expect, it, vi } from 'vitest';
import { User } from '../types';
import { logAudit } from './auditLog';
import { storage } from './storage';

const effectiveUser = { id: 'sales_1', fullName: 'فروشنده یک' } as User;
const realAdmin = { id: 'admin_1', fullName: 'ادمین واقعی' } as User;

describe('append-only operational audit timestamp', () => {
  afterEach(() => vi.restoreAllMocks());

  it('records effective and real identities with a second-precision portal timestamp', () => {
    vi.spyOn(storage, 'getAuditLog').mockReturnValue([]);
    const save = vi.spyOn(storage, 'saveAuditLog').mockImplementation(() => undefined);

    logAudit({
      action: 'invoice_test_action', effectiveUser, impersonatorAdmin: realAdmin,
      roles: [], targetId: 'invoice_1', details: 'test'
    });

    const saved = save.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      action: 'invoice_test_action', effectiveUserId: 'sales_1', impersonatorAdminId: 'admin_1', targetId: 'invoice_1'
    });
    expect(saved[0].timestamp).toMatch(/^\d{4}\/\d{2}\/\d{2} - \d{2}:\d{2}:\d{2}$/);
  });
});
