import {describe, expect, it} from 'vitest';
import type {OperationalRecord} from './model';
import {
  financialPaymentProgress, fiscalPeriodForPayment, nextFinancialDocumentNumber, normalizePaymentReference, normalizeRialAmount, paymentReferenceKey,
  readFinancialObligation, requirePositiveRialAmount, validateFinancialPayment,
} from './financialCore';

const record=(input:Partial<OperationalRecord>={}):OperationalRecord=>({id:'treasury-1',moduleId:'treasury-execution',domain:'treasury',trackingCode:'TRY-1',title:'پرداخت',description:'',status:'queued',priority:'normal',companyId:'company-1',relatedRecordId:'source-1',amountRial:'۱۰۰٬۰۰۰',createdByActorId:'actor-1',createdByUserId:'user-1',updatedByActorId:'actor-1',version:1,payload:{},createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',...input});

describe('shared financial core',()=>{
  it('normalizes IRR amounts without floating point and rejects malformed or non-positive values',()=>{
    expect(normalizeRialAmount(' ۱۲۳٬۴۵۶ ')).toBe('123456');
    expect(requirePositiveRialAmount('00042')).toBe('42');
    expect(()=>normalizeRialAmount('12.5')).toThrow('عدد صحیح');
    expect(()=>requirePositiveRialAmount('۰')).toThrow('بیشتر از صفر');
  });

  it('normalizes payment references for company-wide duplicate detection',()=>{
    expect(normalizePaymentReference(' trx ۱۲۳ ')).toBe('TRX123');
    expect(paymentReferenceKey('company-1',' trx ۱۲۳ ')).toBe('company-1:TRX123');
    expect(paymentReferenceKey('company-1','')).toBeUndefined();
  });

  it('validates payment evidence at the shared boundary',()=>{
    expect(validateFinancialPayment({paidAt:'2026-08-26',paymentReference:' trx 1 ',note:'  پرداخت  '})).toEqual({paidAt:'2026-08-26',paymentReference:'TRX1',note:'پرداخت',receipt:undefined});
    expect(()=>validateFinancialPayment({paidAt:'',paymentReference:'',note:''})).toThrow('تاریخ پرداخت');
    expect(()=>validateFinancialPayment({paidAt:'2026-02-31',paymentReference:'',note:''})).toThrow('معتبر');
    expect(()=>validateFinancialPayment({paidAt:'2026-08-26',paymentReference:'',note:'',receipt:{id:'r',fileName:'x.svg',mimeType:'image/svg+xml',size:20,dataUrl:'data:image/svg+xml;base64,AAAA'}})).toThrow('JPG');
  });

  it('assigns deterministic fiscal periods and sequential internal document numbers',()=>{
    expect(fiscalPeriodForPayment('2026-08-27')).toBe('2026-08');
    expect(nextFinancialDocumentNumber('2026-08-27',['PAY-2025-0099','PAY-2026-0002','PAY-2026-0010'])).toBe('PAY-2026-0011');
  });

  it('reads a versioned obligation and derives exact multi-part payment progress',()=>{
    const source=record({id:'source-1',moduleId:'purchase-request',domain:'procurement',amountRial:'100000',payload:{}});
    const first=record({id:'t-1',amountRial:'60000',status:'payment_recorded',payload:{payment:{paidAt:'2026-08-26'}}});
    const second=record({id:'t-2',amountRial:'40000'});
    expect(readFinancialObligation({...first,payload:{financialObligation:{schemaVersion:1,currency:'IRR',obligationId:'allocation-1',sourceModuleId:'purchase-request',sourceRecordId:'source-1',amountRial:'60000',beneficiaryName:'فروشنده'}}}).obligationId).toBe('allocation-1');
    expect(financialPaymentProgress(source,[first,second])).toEqual({obligationCount:2,paidCount:1,totalRial:'100000',paidRial:'60000',complete:false});
    expect(financialPaymentProgress(source,[first,{...second,status:'payment_recorded',payload:{payment:{paidAt:'2026-08-26'}}}]).complete).toBe(true);
  });
});
