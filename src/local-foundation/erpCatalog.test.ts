import {describe, expect, it} from 'vitest';
import {ERP_ADMIN_PERMISSIONS, ERP_MODULES, ERP_OPERATIONAL_STORES, ERP_ROLE_TEMPLATES, ERP_WORKFLOWS, permissionFor, seedOperationalRecords} from './erpCatalog';
import {FOUNDATION_STORES} from './model';

describe('complete local ERP catalog', () => {
  it('covers every approved product domain with a real workflow and store', () => {
    expect(ERP_MODULES.length).toBeGreaterThanOrEqual(65);
    expect(new Set(ERP_MODULES.map((item) => item.domain))).toEqual(new Set(['hr','crm','sales','marketing','catalog','procurement','supplier','finance','treasury','accounting','warehouse','logistics','service','support','contract','asset','task','communications','letter','document']));
    for (const module of ERP_MODULES) {
      expect(FOUNDATION_STORES).toContain(module.store);
      expect(module.workflow.initialState).toBeTruthy();
      expect(module.workflow.transitions.length).toBeGreaterThan(0);
      expect(permissionFor(module.id, 'view')).toMatch(/\.view$/);
    }
  });

  it('keeps maker/checker and sensitive approval rules explicit', () => {
    const protectedModules = ['payment','adjustment','count','finance-request','treasury-execution','support-transaction','service-evidence'];
    for (const id of protectedModules) {
      const workflow = ERP_WORKFLOWS.find((item) => item.moduleId === id);
      expect(workflow?.transitions.some((transition) => transition.makerChecker)).toBe(true);
    }
    expect(ERP_WORKFLOWS.flatMap((item) => item.transitions).some((transition) => transition.sensitive)).toBe(true);
  });

  it('has deterministic operational demo data and comprehensive roles', () => {
    const records = seedOperationalRecords();
    expect(Object.values(records).flat().length).toBeGreaterThanOrEqual(ERP_MODULES.length);
    expect(records.recruitment_cases).toHaveLength(5);
    expect(ERP_MODULES.every((module) => records[module.store].some((record) => record.moduleId === module.id))).toBe(true);
    expect(Object.keys(records).sort()).toEqual([...ERP_OPERATIONAL_STORES].sort());
    expect(ERP_ROLE_TEMPLATES.length).toBeGreaterThanOrEqual(50);
    expect(new Set(ERP_ADMIN_PERMISSIONS).size).toBe(ERP_ADMIN_PERMISSIONS.length);
  });
});
