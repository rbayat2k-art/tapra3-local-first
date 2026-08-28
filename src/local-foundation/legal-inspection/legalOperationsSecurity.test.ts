import 'fake-indexeddb/auto';
import {describe, expect, it} from 'vitest';
import {createSeedData} from '../seed';
import {LocalFoundationService} from '../service';
import {IndexedDBAdapter, type StorageAdapter, type StorageTransaction} from '../storage';
import type {AuditEvent, FoundationStoreName, IdempotencyRecord, SecurityRole, SnapshotManifest} from '../model';
import type {LegalCase, LegalDeadline, LegalNotice, LegalProceeding} from './model';
import {LEGAL_PERMISSIONS} from './policy';

class BeforeWriteStorage implements StorageAdapter {
  beforeReadwrite?: () => Promise<void>;
  constructor(private readonly base: StorageAdapter) {}
  async transaction<T>(stores: FoundationStoreName[], mode: IDBTransactionMode, work: (transaction: StorageTransaction) => Promise<T>): Promise<T> {
    if (mode === 'readwrite' && this.beforeReadwrite) {
      const hook = this.beforeReadwrite;
      this.beforeReadwrite = undefined;
      await hook();
    }
    return this.base.transaction(stores, mode, work);
  }
  get<T>(store: FoundationStoreName, id: IDBValidKey) {return this.base.get<T>(store, id);}
  getAll<T>(store: FoundationStoreName) {return this.base.getAll<T>(store);}
  put<T>(store: FoundationStoreName, value: T) {return this.base.put(store, value);}
  delete(store: FoundationStoreName, id: IDBValidKey) {return this.base.delete(store, id);}
  replaceAll(stores: Record<FoundationStoreName, unknown[]>) {return this.base.replaceAll(stores);}
  exportSnapshot(): Promise<SnapshotManifest> {return this.base.exportSnapshot();}
  importSnapshot(snapshot: SnapshotManifest) {return this.base.importSnapshot(snapshot);}
}

async function setup() {
  const storage = new IndexedDBAdapter(`tapra-legal-operations-security-${crypto.randomUUID()}`);
  await storage.replaceAll(createSeedData());
  const service = new LocalFoundationService(storage);
  await service.createLegalEntity({displayName:'شخصیت حقوقی کاملاً مصنوعی SECURITY'}, 'security-entity');
  let state = await service.loadState();
  state = await service.createLegalCase({
    title:'پرونده کاملاً مصنوعی امنیت عملیات',
    caseType:'رسیدگی آزمایشی امنیتی',
    owningLegalEntityId:state.legalInspection!.legalEntities[0].id,
    parties:[
      {kind:'person', displayName:'شاکی مصنوعی امنیتی', role:'complainant'},
      {kind:'person', displayName:'پرداخت‌کننده مصنوعی امنیتی', role:'payer'},
    ],
  }, 'security-case');
  return {storage, service, state, record:state.legalInspection!.cases[0]};
}

async function createProceeding(service: LocalFoundationService, record: LegalCase, commandId='security-proceeding') {
  const state = await service.createLegalProceeding({caseId:record.id, authorityType:'court', authorityName:'مرجع کاملاً آزمایشی امنیتی', stage:'initial_review'}, record.version, commandId);
  return state.legalInspection!.proceedings[0];
}

describe('legal operation security boundaries', () => {
  it('rejects real-looking proceeding and document labels before any write', async () => {
    const {storage, service, record} = await setup();
    await expect(service.createLegalProceeding({caseId:record.id, authorityType:'court', authorityName:'شعبه دادگاه مرکزی', stage:'initial_review'}, record.version, 'real-proceeding')).rejects.toThrow('آزمایشی');
    expect(await storage.getAll<LegalProceeding>('legal_proceedings')).toEqual([]);
    const proceeding = await createProceeding(service, record);
    await expect(service.recordLegalNotice({caseId:record.id, proceedingId:proceeding.id, noticeType:'other', receivedAt:new Date().toISOString(), document:{documentType:'notice', classification:'internal', displayName:'ابلاغیه دادگاه'}}, proceeding.version, 'real-document')).rejects.toThrow('آزمایشی');
    expect(await storage.getAll<LegalNotice>('legal_notices')).toEqual([]);
  });

  it('revalidates the active specialized role inside the write transaction', async () => {
    const {storage, record} = await setup();
    const role = (await storage.getAll<SecurityRole>('security_roles')).find((item) => item.id === 'role-legal-manager')!;
    const hooked = new BeforeWriteStorage(storage);
    hooked.beforeReadwrite = () => storage.put('security_roles', {...role, permissions:role.permissions.filter((permission) => permission !== LEGAL_PERMISSIONS.proceedingManage), version:role.version + 1});
    await expect(new LocalFoundationService(hooked).createLegalProceeding({caseId:record.id, authorityType:'court', authorityName:'مرجع آزمایشی مسابقه نقش', stage:'hearing'}, record.version, 'revoked-role')).rejects.toThrow('مجوز فعال');
    expect(await storage.getAll<LegalProceeding>('legal_proceedings')).toEqual([]);
    expect((await storage.getAll<IdempotencyRecord>('idempotency_keys')).some((item) => item.id === 'revoked-role')).toBe(false);
  });

  it('keeps terminal case evidence immutable', async () => {
    const {storage, service, record} = await setup();
    const proceeding = await createProceeding(service, record);
    const state = await service.recordLegalNotice({caseId:record.id, proceedingId:proceeding.id, noticeType:'other', receivedAt:new Date().toISOString()}, proceeding.version, 'terminal-notice');
    const notice = state.legalInspection!.notices[0];
    await service.setLegalRecordStatus(record.id, record.version, 'void', 'entered_in_error', 'terminal-void');
    await expect(service.acknowledgeLegalNotice(notice.id, notice.version, 'terminal-ack')).rejects.toThrow('بسته یا باطل');
    await expect(service.closeLegalProceeding(proceeding.id, proceeding.version, 'terminal-close')).rejects.toThrow('بسته یا باطل');
    expect((await storage.get<LegalNotice>('legal_notices', notice.id))?.status).toBe('received');
    expect((await storage.get<LegalProceeding>('legal_proceedings', proceeding.id))?.status).toBe('active');
  });

  it('ignores foreign malformed children but blocks a valid direct proceeding deadline', async () => {
    const first = await setup();
    const proceeding = await createProceeding(first.service, first.record);
    const now = new Date().toISOString();
    await first.storage.put('legal_notices', {id:'foreign-notice', tenantId:'company-other', companyId:'company-other', caseId:'case-other', proceedingId:proceeding.id, noticeType:'other', receivedAt:now, status:'received', version:1, createdAt:now, updatedAt:now} satisfies LegalNotice);
    const closed = await first.service.closeLegalProceeding(proceeding.id, proceeding.version, 'foreign-child-close');
    expect(closed.legalInspection!.proceedings[0].status).toBe('closed');

    const second = await setup();
    const direct = await createProceeding(second.service, second.record, 'direct-deadline-proceeding');
    await second.storage.put('legal_deadlines', {id:'direct-deadline', tenantId:second.record.tenantId, companyId:second.record.companyId, caseId:second.record.id, sourceKind:'proceeding', sourceId:direct.id, dueAt:new Date(Date.now()+86_400_000).toISOString(), timezone:'Asia/Tehran', priority:'normal', assigneeUserId:second.state.activeUser.id, status:'open', version:1, createdAt:now, updatedAt:now} satisfies LegalDeadline);
    await expect(second.service.closeLegalProceeding(direct.id, direct.version, 'direct-deadline-close')).rejects.toThrow('مهلت باز');
    expect((await second.storage.get<LegalProceeding>('legal_proceedings', direct.id))?.status).toBe('active');
  });

  it('rejects a same-tenant child whose source belongs to a sibling case and redacts bundled audit flags', async () => {
    const {storage, service, state, record} = await setup();
    const proceeding = await createProceeding(service, record);
    const now = new Date().toISOString();
    await storage.put('legal_notices', {id:'cross-case-notice', tenantId:record.tenantId, companyId:record.companyId, caseId:record.id, proceedingId:'proceeding-in-sibling-case', noticeType:'other', receivedAt:now, status:'received', version:1, createdAt:now, updatedAt:now} satisfies LegalNotice);
    await expect(service.acknowledgeLegalNotice('cross-case-notice', 1, 'cross-case-transition')).rejects.toThrow('رابطه رکورد');

    await service.recordLegalNotice({caseId:record.id, proceedingId:proceeding.id, noticeType:'response_required', receivedAt:now, deadline:{dueAt:new Date(Date.now()+86_400_000).toISOString(), priority:'normal', assigneeUserId:state.activeUser.id}, document:{documentType:'notice', classification:'internal', displayName:'سند آزمایشی ممیزی'}}, proceeding.version, 'redacted-audit-notice');
    const role = (await storage.getAll<SecurityRole>('security_roles')).find((item) => item.id === 'role-legal-manager')!;
    await storage.put('security_roles', {...role, permissions:role.permissions.filter((permission) => ![LEGAL_PERMISSIONS.deadlineView, LEGAL_PERMISSIONS.documentMetadataView].includes(permission as never)), version:role.version + 1});
    const projected = await service.loadState();
    const audit = projected.audits.find((item: AuditEvent) => item.action === 'legal.notice.received');
    expect(audit?.metadata).not.toHaveProperty('hasDeadline');
    expect(audit?.metadata).not.toHaveProperty('hasDocumentMetadata');
  });
});
