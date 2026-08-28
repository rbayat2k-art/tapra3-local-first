import type {LocalUser, OperationalRecord, SecurityRole} from '../model';
import type {
  BankInstitution,
  CompanyBankAccountDetail,
  LegalCase,
  LegalCaseCompanyLink,
  LegalCaseHistory,
  LegalCaseParty,
  LegalEntity,
  LegalInspectionProjection,
  LegalPartyProfile,
  LegalPartyProjection,
  LegalProceeding,
  LegalNotice,
  LegalDeadline,
  LegalDocumentMetadata,
} from './model';
import {LEGAL_PERMISSIONS, legalAllowed, legalBankAccountResource, legalCaseResource, legalEntityResource} from './policy';

export interface LegalProjectionSource {
  activeUser: LocalUser;
  users: LocalUser[];
  roles: SecurityRole[];
  legalEntities: LegalEntity[];
  bankInstitutions: BankInstitution[];
  bankAccounts: CompanyBankAccountDetail[];
  cases: LegalCase[];
  companyLinks: LegalCaseCompanyLink[];
  parties: LegalPartyProfile[];
  caseParties: LegalCaseParty[];
  history: LegalCaseHistory[];
  proceedings?: LegalProceeding[];
  notices?: LegalNotice[];
  deadlines?: LegalDeadline[];
  documents?: LegalDocumentMetadata[];
  operationalRecords?:OperationalRecord[];
}

export function emptyLegalInspectionProjection(): LegalInspectionProjection {
  return {syntheticDataOnly:true,legalEntities:[],bankInstitutions:[],bankAccounts:[],cases:[],companyLinks:[],parties:[],caseParties:[],history:[],proceedings:[],notices:[],deadlines:[],documents:[],invoiceSummaries:[]};
}

export function projectLegalInspection(source: LegalProjectionSource): LegalInspectionProjection {
  const visibleCases = source.cases.filter((record) => record.companyId===source.activeUser.companyId
    && record.tenantId===source.activeUser.companyId
    && legalAllowed(
      source.activeUser,
      source.roles,
      LEGAL_PERMISSIONS.caseView,
      legalCaseResource(record, source.users),
    )).map((record)=>{
    const account=record.bankAccountId?source.bankAccounts.find((item)=>item.id===record.bankAccountId):undefined;
    const mayViewMasked=Boolean(account&&legalAllowed(source.activeUser,source.roles,LEGAL_PERMISSIONS.bankMaskedView,legalBankAccountResource(account)));
    if(mayViewMasked)return record;
    const {bankAccountId:_bankAccountId,bankSnapshotMasked:_bankSnapshotMasked,...redacted}=record;
    return redacted;
  });
  const visibleCaseIds = new Set(visibleCases.map((record) => record.id));
  const tenantEntities=source.legalEntities.filter((entity)=>entity.companyId===source.activeUser.companyId&&entity.tenantId===source.activeUser.companyId);
  const tenantEntityIds=new Set(tenantEntities.map((entity)=>entity.id));
  const visibleCompanyLinks = source.companyLinks.filter((link) => visibleCaseIds.has(link.caseId)&&tenantEntityIds.has(link.legalEntityId));
  const visibleEntityIds = new Set([
    ...visibleCases.map((record) => record.owningLegalEntityId),
    ...visibleCompanyLinks.map((link) => link.legalEntityId),
  ]);
  const legalEntities = tenantEntities.filter((entity) => entity.companyId === source.activeUser.companyId
    && (visibleEntityIds.has(entity.id) || legalAllowed(source.activeUser, source.roles, LEGAL_PERMISSIONS.masterDataView, legalEntityResource(entity))));

  const tenantPartyIds=new Set(source.parties.filter((party)=>party.companyId===source.activeUser.companyId&&party.tenantId===source.activeUser.companyId).map((party)=>party.id));
  const visibleCaseParties = source.caseParties.filter((link) => visibleCaseIds.has(link.caseId)&&tenantPartyIds.has(link.partyId));
  const visiblePartyIds = new Set(visibleCaseParties.map((link) => link.partyId));
  const partyCaseResources = new Map<string, LegalCase[]>();
  for (const link of visibleCaseParties) {
    const record = visibleCases.find((item) => item.id === link.caseId);
    if (record) partyCaseResources.set(link.partyId, [...(partyCaseResources.get(link.partyId) ?? []), record]);
  }
  const parties: LegalPartyProjection[] = source.parties
    .filter((party) => party.companyId === source.activeUser.companyId && party.tenantId===source.activeUser.companyId && visiblePartyIds.has(party.id))
    .map((party) => {
      const mayViewIdentity = (partyCaseResources.get(party.id) ?? []).some((record) => legalAllowed(
        source.activeUser,
        source.roles,
        LEGAL_PERMISSIONS.partyIdentityView,
        legalCaseResource(record, source.users),
      ));
      return mayViewIdentity
        ? {...party}
        : {
            id: party.id,
            companyId: party.companyId,
            kind: party.kind,
            displayName: party.displayName,
            contactMasked: party.contactMasked,
            status: party.status,
            qaDatasetId:party.qaDatasetId,
            version: party.version,
          };
    });

  const validBankIds=new Set(source.bankInstitutions.filter((bank)=>bank.status==='active'&&bank.companyId===source.activeUser.companyId&&bank.tenantId===source.activeUser.companyId).map((bank)=>bank.id));
  const bankAccounts = source.bankAccounts
    .filter((account) => account.companyId === source.activeUser.companyId
      && account.tenantId===source.activeUser.companyId
      && validBankIds.has(account.bankInstitutionId)
      && legalAllowed(source.activeUser, source.roles, LEGAL_PERMISSIONS.bankMaskedView, legalBankAccountResource(account)))
    .map((account) => {
      return {
        id: account.id,
        companyId: account.companyId,
        legalEntityId: account.legalEntityId,
        bankInstitutionId: account.bankInstitutionId,
        maskedAccountNumber: account.maskedAccountNumber,
        maskedIban: account.maskedIban,
        maskedCardNumber: account.maskedCardNumber,
        last4: account.last4,
        status: account.status,
        qaDatasetId:account.qaDatasetId,
        version: account.version,
      };
    });
  const visibleBankIds = new Set(bankAccounts.map((account) => account.bankInstitutionId));

  const mayViewInvoiceSummary=legalAllowed(source.activeUser,source.roles,LEGAL_PERMISSIONS.invoiceSummaryView,{id:'legal-invoice-summary',companyId:source.activeUser.companyId,createdBy:'system',state:'active'},'view');
  const invoiceSummaries=mayViewInvoiceSummary?(source.operationalRecords??[]).filter((record)=>record.moduleId==='invoice'&&record.companyId===source.activeUser.companyId).map((record)=>({id:record.id,trackingCode:record.trackingCode,title:record.title,status:record.status,amountRial:record.amountRial,createdAt:record.createdAt,updatedAt:record.updatedAt})):[];
  const visibleCaseById=new Map(visibleCases.map((record)=>[record.id,record]));
  const childVisible=(item:{caseId:string;companyId:string;tenantId:string},permission:typeof LEGAL_PERMISSIONS[keyof typeof LEGAL_PERMISSIONS])=>{
    const record=visibleCaseById.get(item.caseId);
    return Boolean(record
      && item.companyId===record.companyId
      && item.tenantId===record.tenantId
      && item.companyId===source.activeUser.companyId
      && item.tenantId===source.activeUser.companyId
      && legalAllowed(source.activeUser,source.roles,permission,legalCaseResource(record,source.users),'view'));
  };
  const proceedings=(source.proceedings??[]).filter((item)=>childVisible(item,LEGAL_PERMISSIONS.proceedingView));
  const visibleProceedingById=new Map(proceedings.map((item)=>[item.id,item]));
  const visibleProceedingIds=new Set(proceedings.map((item)=>item.id));
  const notices=(source.notices??[]).filter((item)=>{
    const proceeding=visibleProceedingById.get(item.proceedingId);
    return childVisible(item,LEGAL_PERMISSIONS.noticeView)&&Boolean(proceeding&&proceeding.caseId===item.caseId&&proceeding.companyId===item.companyId&&proceeding.tenantId===item.tenantId);
  });
  const visibleNoticeById=new Map(notices.map((item)=>[item.id,item]));
  const visibleNoticeIds=new Set(notices.map((item)=>item.id));
  const deadlines=(source.deadlines??[]).filter((item)=>{
    const sourceItem=item.sourceKind==='notice'?visibleNoticeById.get(item.sourceId):visibleProceedingById.get(item.sourceId);
    return childVisible(item,LEGAL_PERMISSIONS.deadlineView)&&Boolean(sourceItem&&sourceItem.caseId===item.caseId&&sourceItem.companyId===item.companyId&&sourceItem.tenantId===item.tenantId);
  });
  const visibleDeadlineIds=new Set(deadlines.map((item)=>item.id));
  const documents=(source.documents??[]).filter((item)=>{
    const owner=item.ownerKind==='notice'?visibleNoticeById.get(item.ownerId):item.ownerKind==='proceeding'?visibleProceedingById.get(item.ownerId):visibleCaseById.get(item.ownerId);
    return childVisible(item,LEGAL_PERMISSIONS.documentMetadataView)&&Boolean(owner&&owner.id===item.ownerId&&('caseId' in owner?owner.caseId===item.caseId:owner.id===item.caseId)&&owner.companyId===item.companyId&&owner.tenantId===item.tenantId);
  });
  const visibleDocumentIds=new Set(documents.map((item)=>item.id));
  const visibleHistory=source.history.filter((entry)=>{
    if(!visibleCaseIds.has(entry.caseId))return false;
    if(!entry.resourceKind||entry.resourceKind==='case')return true;
    if(!entry.resourceId)return false;
    if(entry.resourceKind==='proceeding')return visibleProceedingIds.has(entry.resourceId);
    if(entry.resourceKind==='notice')return visibleNoticeIds.has(entry.resourceId);
    if(entry.resourceKind==='deadline')return visibleDeadlineIds.has(entry.resourceId);
    if(entry.resourceKind==='document')return visibleDocumentIds.has(entry.resourceId);
    return false;
  });
  return {
    syntheticDataOnly: true,
    legalEntities,
    bankInstitutions: source.bankInstitutions.filter((bank) => bank.companyId===source.activeUser.companyId && bank.tenantId===source.activeUser.companyId && bank.status === 'active' && (visibleBankIds.has(bank.id) || legalAllowed(
      source.activeUser,
      source.roles,
      LEGAL_PERMISSIONS.masterDataView,
      {id:bank.id,companyId:source.activeUser.companyId,createdBy:'system',state:bank.status},
    ))),
    bankAccounts,
    cases: visibleCases,
    companyLinks: visibleCompanyLinks,
    parties,
    caseParties: visibleCaseParties,
    history:visibleHistory,
    proceedings,
    notices,
    deadlines,
    documents,
    invoiceSummaries,
  };
}
