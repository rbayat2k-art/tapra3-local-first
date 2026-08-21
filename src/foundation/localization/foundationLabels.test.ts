import { describe, expect, it } from 'vitest';
import { organizationScopeLabels, permissionLabel, serviceKindLabels } from './foundationLabels';

describe('Foundation UI labels', () => {
  it('presents organization scopes and shared services in Persian', () => {
    expect(Object.values(organizationScopeLabels).join(' ')).not.toMatch(/Workspace|Company|Branch|Department|Team|Self/i);
    expect(Object.values(serviceKindLabels).join(' ')).not.toMatch(/Shared|Data|Other/i);
  });

  it('does not expose permission codes as ordinary labels', () => {
    const label = permissionLabel('sales.payment.review');
    expect(label).toBe('تأیید پرداخت یا بازگرداندن برای اصلاح');
    expect(label).not.toContain('sales.payment.review');
  });
});
