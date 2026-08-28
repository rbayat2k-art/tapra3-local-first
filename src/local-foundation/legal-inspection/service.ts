import type {LegalEntityCaseRole, LegalPartyKind, LegalPartyRole, LegalStatusReasonCategory} from './model';
import {assertSyntheticLabel} from './feature';
import type {LegalEntityProfileInput} from '../treasury-master/entityProfile';

export const LEGAL_STATUS_REASON_CATEGORIES: ReadonlyArray<LegalStatusReasonCategory> = [
  'qa_lifecycle','duplicate_synthetic','entered_in_error','scenario_completed',
];

export function assertLegalStatusReasonCategory(value: string): asserts value is LegalStatusReasonCategory {
  if (!LEGAL_STATUS_REASON_CATEGORIES.includes(value as LegalStatusReasonCategory)) throw new Error('دسته دلیل تغییر وضعیت معتبر نیست.');
}

export interface LegalCasePartyInput {
  existingPartyId?: string;
  kind: LegalPartyKind;
  displayName: string;
  role: LegalPartyRole;
  nationalId?: string;
  mobile?: string;
  address?: string;
}

export interface LegalCaseUpdateInput {
  title: string;
  caseType: string;
  companyLinks?: LegalCaseCompanyInput[];
  bankAccountId?: string;
  invoiceIds?: string[];
}

export interface LegalCaseCompanyInput {
  legalEntityId: string;
  role: LegalEntityCaseRole;
}

export interface LegalCaseInput {
  title: string;
  caseType: string;
  owningLegalEntityId: string;
  companyLinks?: LegalCaseCompanyInput[];
  parties?: LegalCasePartyInput[];
  bankAccountId?: string;
  invoiceIds?: string[];
}

export type LegalEntityInput = LegalEntityProfileInput;

export interface LegalBankInput {
  code: string;
  displayName: string;
}

export interface LegalBankAccountInput {
  legalEntityId: string;
  bankInstitutionId: string;
  accountNumber?: string;
  iban?: string;
  cardNumber?: string;
}

const digits = (value?: string) => (value ?? '').replace(/\D/g, '');

export function normalizeLegalCaseInput(input: LegalCaseInput): LegalCaseInput {
  const title = input.title.trim().replace(/\s+/g, ' ');
  const caseType = input.caseType.trim().replace(/\s+/g, ' ');
  if (title.length < 3 || title.length > 160) throw new Error('عنوان پرونده باید بین ۳ تا ۱۶۰ نویسه باشد.');
  if (caseType.length < 2 || caseType.length > 80) throw new Error('نوع پرونده معتبر نیست.');
  if (!input.owningLegalEntityId.trim()) throw new Error('شخصیت حقوقی مالک پرونده الزامی است.');
  assertSyntheticLabel(title, caseType);
  const companyLinks = [...new Map((input.companyLinks ?? []).map((item) => [`${item.legalEntityId}:${item.role}`, {...item, legalEntityId: item.legalEntityId.trim()}])).values()];
  const parties = (input.parties ?? []).map((party) => {
    const displayName = party.displayName.trim().replace(/\s+/g, ' ');
    if (displayName.length < 2 || displayName.length > 120) throw new Error('نام شخص مرتبط معتبر نیست.');
    if(!party.existingPartyId)assertSyntheticLabel(displayName);
    return {...party, existingPartyId:party.existingPartyId?.trim()||undefined, displayName, nationalId: digits(party.nationalId) || undefined, mobile: digits(party.mobile) || undefined, address: party.address?.trim() || undefined};
  });
  if(parties.length<2||new Set(parties.map((party)=>party.role)).size<2)throw new Error('حداقل دو شخص با دو نقش مستقل و ساختگی برای پرونده الزامی است.');
  const invoiceIds=[...new Set((input.invoiceIds??[]).map((id)=>id.trim()).filter(Boolean))];
  return {...input, title, caseType, owningLegalEntityId: input.owningLegalEntityId.trim(), bankAccountId: input.bankAccountId?.trim() || undefined, invoiceIds, companyLinks, parties};
}

export function maskSensitiveValue(value?: string, visible = 4): string | undefined {
  const normalized = digits(value);
  if (!normalized) return undefined;
  const keep = Math.min(visible, normalized.length);
  return `${'*'.repeat(Math.max(4, normalized.length - keep))}${normalized.slice(-keep)}`;
}

export function legalAccountLast4(input: LegalBankAccountInput): string {
  const source = digits(input.cardNumber) || digits(input.iban) || digits(input.accountNumber);
  if (source.length < 4) throw new Error('حداقل یکی از شناسه‌های معتبر حساب، شبا یا کارت الزامی است.');
  return source.slice(-4);
}

export function validateLegalBankAccountInput(input: LegalBankAccountInput): LegalBankAccountInput {
  const accountNumber = digits(input.accountNumber) || undefined;
  const iban = (input.iban ?? '').replace(/\s/g, '').toUpperCase() || undefined;
  const cardNumber = digits(input.cardNumber) || undefined;
  if (cardNumber && cardNumber.length !== 16) throw new Error('شماره کارت باید ۱۶ رقم باشد.');
  if (iban && !/^IR\d{24}$/.test(iban)) throw new Error('شماره شبا معتبر نیست.');
  if (!accountNumber && !iban && !cardNumber) throw new Error('حداقل یک شناسه حساب الزامی است.');
  return {...input, legalEntityId: input.legalEntityId.trim(), bankInstitutionId: input.bankInstitutionId.trim(), accountNumber, iban, cardNumber};
}

export function contactMask(mobile?: string): string | undefined {
  const value = digits(mobile);
  if (!value) return undefined;
  return value.length > 7 ? `${value.slice(0, 4)}***${value.slice(-4)}` : maskSensitiveValue(value, 2);
}

export function jalaliTrackingYear(date = new Date()): string {
  return new Intl.DateTimeFormat('en-US-u-ca-persian', {year: 'numeric', timeZone: 'Asia/Tehran'})
    .formatToParts(date).find((part) => part.type === 'year')?.value ?? String(date.getUTCFullYear());
}
