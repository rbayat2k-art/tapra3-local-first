import type {LocalUser,SecurityRole} from '../model';
import type {BankInstitution,CompanyBankAccountDetail,LegalEntity,LegalEntityOfficer,LegalEntityProfileHistory} from '../legal-inspection/model';
import {TREASURY_MASTER_PERMISSIONS,treasuryMasterAllowed,treasuryMasterResource} from './policy';
import {emptyTreasuryMasterProjection,type TreasuryMasterProjection} from './model';

export function projectTreasuryMaster(input:{activeUser:LocalUser;roles:SecurityRole[];legalEntities:LegalEntity[];legalEntityOfficers:LegalEntityOfficer[];legalEntityHistory:LegalEntityProfileHistory[];bankInstitutions:BankInstitution[];bankAccounts:CompanyBankAccountDetail[]}):TreasuryMasterProjection{
  const aggregate=treasuryMasterResource('treasury-master',input.activeUser.companyId);
  if(!treasuryMasterAllowed(input.activeUser,input.roles,TREASURY_MASTER_PERMISSIONS.view,aggregate))return emptyTreasuryMasterProjection();
  const entities=input.legalEntities.filter((item)=>item.companyId===input.activeUser.companyId&&item.tenantId===input.activeUser.companyId);
  const entityIds=new Set(entities.map((item)=>item.id));
  const maySeeOfficers=treasuryMasterAllowed(input.activeUser,input.roles,TREASURY_MASTER_PERMISSIONS.officerView,aggregate);
  const officers=maySeeOfficers?input.legalEntityOfficers.filter((item)=>item.companyId===input.activeUser.companyId&&item.tenantId===input.activeUser.companyId&&entityIds.has(item.legalEntityId)):[];
  const history=maySeeOfficers?input.legalEntityHistory.filter((item)=>item.companyId===input.activeUser.companyId&&item.tenantId===input.activeUser.companyId&&entityIds.has(item.legalEntityId)):[];
  const validBankIds=new Set(input.bankInstitutions.filter((item)=>item.status==='active'&&item.companyId===input.activeUser.companyId&&item.tenantId===input.activeUser.companyId).map((item)=>item.id));
  const maySeeAccounts=treasuryMasterAllowed(input.activeUser,input.roles,TREASURY_MASTER_PERMISSIONS.bankMaskedView,aggregate);
  const accounts=maySeeAccounts?input.bankAccounts.filter((item)=>item.companyId===input.activeUser.companyId&&item.tenantId===input.activeUser.companyId&&validBankIds.has(item.bankInstitutionId)).map((item)=>({
    id:item.id,companyId:item.companyId,legalEntityId:item.legalEntityId,bankInstitutionId:item.bankInstitutionId,
    maskedAccountNumber:item.maskedAccountNumber,maskedIban:item.maskedIban,maskedCardNumber:item.maskedCardNumber,last4:item.last4,
    status:item.status,qaDatasetId:item.qaDatasetId,version:item.version,
  })):[];
  return {syntheticDataOnly:true,legalEntities:entities,legalEntityOfficers:officers,legalEntityHistory:history,bankInstitutions:input.bankInstitutions.filter((item)=>item.companyId===input.activeUser.companyId&&item.tenantId===input.activeUser.companyId),bankAccounts:accounts};
}
