import type {BankInstitution, LegalBankAccountProjection, LegalEntity, LegalEntityOfficer, LegalEntityProfileHistory} from '../legal-inspection/model';

export interface TreasuryMasterProjection {
  syntheticDataOnly: true;
  legalEntities: LegalEntity[];
  legalEntityOfficers: LegalEntityOfficer[];
  legalEntityHistory: LegalEntityProfileHistory[];
  bankInstitutions: BankInstitution[];
  bankAccounts: LegalBankAccountProjection[];
}

export const emptyTreasuryMasterProjection = ():TreasuryMasterProjection => ({
  syntheticDataOnly:true,legalEntities:[],legalEntityOfficers:[],legalEntityHistory:[],bankInstitutions:[],bankAccounts:[],
});
