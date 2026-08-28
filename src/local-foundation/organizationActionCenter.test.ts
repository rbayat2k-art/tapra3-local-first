import {describe, expect, it} from 'vitest';
import {organizationActionItems} from './organizationActionCenter';
import {createSeedData, LOCAL_USERS} from './seed';
import type {FoundationState} from './model';

function seedState(): FoundationState {
  const seed = createSeedData();
  return {
    users: seed.users,
    activeUser: LOCAL_USERS.find((user) => user.id === 'persona-product-owner')!,
    session: seed.sessions[0],
    units: seed.organizational_units,
    positions: seed.organizational_positions,
    roles: seed.security_roles,
    personnel: seed.personnel,
    personnelProfileChangeRequests: seed.personnel_profile_change_requests,
    salesStructures: seed.sales_structures,
    customers: seed.customers,
    customerImports: seed.customer_imports,
    workflows: seed.workflow_definitions,
    workflowVersions: seed.workflow_versions,
    operationalRecords: [],
    operationalHistory: seed.workflow_history,
    notifications: seed.notifications,
    registrationRequests: seed.registration_requests,
    qaDataset: seed.qa_dataset_manifests[0],
    projections: seed.projections,
    audits: seed.audit_events,
    recordCount: 0,
    lastPersistedAt: seed.sessions[0].switchedAt,
  } as FoundationState;
}

describe('organization action center', () => {
  it('keeps every organization destination in one deterministic summary', () => {
    const items = organizationActionItems(seedState());
    expect(items.map((item) => item.id)).toEqual(['units','branches','positions','personnel','sales','users','roles','registrations']);
    expect(items.find((item) => item.id === 'branches')?.count).toBeGreaterThan(0);
    expect(items.find((item) => item.id === 'personnel')?.count).toBeGreaterThan(0);
  });

  it('does not treat merely unused sales routes as inconsistent', () => {
    expect(organizationActionItems(seedState()).find((item) => item.id === 'sales')?.count).toBe(0);
  });
});
