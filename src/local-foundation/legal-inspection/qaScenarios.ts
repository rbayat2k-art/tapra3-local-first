export interface LegalQaScenarioBlueprint {id:string;title:string;caseType:string;partyRole:'complainant'|'buyer'|'payer'|'cardholder'|'representative'|'counterparty'|'other';withBankAccount:boolean;companyLinkCount:number;}

const CASE_TYPES=['شکایت آزمایشی','ابلاغ آزمایشی','مسدودی آزمایشی','بازرسی آزمایشی','سازش آزمایشی'] as const;
const PARTY_ROLES=['complainant','buyer','payer','cardholder','representative','counterparty','other'] as const;

/** Fifty deterministic, synthetic-only acceptance blueprints; no real identity or bank value is embedded. */
export function buildLegalQaScenarioBlueprints():LegalQaScenarioBlueprint[]{
  return Array.from({length:50},(_,index)=>({
    id:`LEGAL-QA-${String(index+1).padStart(2,'0')}`,
    title:`سناریوی کاملاً مصنوعی حقوقی ${String(index+1).padStart(2,'0')}`,
    caseType:CASE_TYPES[index%CASE_TYPES.length],
    partyRole:PARTY_ROLES[index%PARTY_ROLES.length],
    withBankAccount:index%2===0,
    companyLinkCount:index%3,
  }));
}
