import {describe,expect,it} from 'vitest';
import {normalizeLegalEntityProfileInput} from './entityProfile';

describe('legal entity profile normalization',()=>{
  it('normalizes the complete synthetic company and officer structure',()=>{
    const result=normalizeLegalEntityProfileInput({displayName:'  شرکت   کاملاً آزمایشی QA-01 ',legalForm:'private_joint_stock',nationalIdentifier:'000-00000000',registrationNumber:' ۱۱۱۱۱۱ ',registeredAt:'2026-08-28',registeredAddress:'تهران، نشانی کاملاً ساختگی شماره ۱',postalCode:'0000000000',officers:[{displayName:'مدیرعامل کاملاً ساختگی QA-01',nationalId:'0000000000',role:'chief_executive',unlimitedTenure:true}]});
    expect(result).toMatchObject({displayName:'شرکت کاملاً آزمایشی QA-01',nationalIdentifier:'00000000000',registrationNumber:'111111',postalCode:'0000000000'});expect(result.officers?.[0]).toMatchObject({nationalId:'0000000000',unlimitedTenure:true,appointmentEndDate:undefined});
  });
  it('rejects invalid identity lengths, date order and duplicate principal roles',()=>{
    expect(()=>normalizeLegalEntityProfileInput({displayName:'شرکت کاملاً آزمایشی INVALID',nationalIdentifier:'123'})).toThrow('۱۱ رقم');
    expect(()=>normalizeLegalEntityProfileInput({displayName:'شرکت کاملاً آزمایشی DATES',officers:[{displayName:'عضو کاملاً ساختگی A',role:'board_member',appointmentStartDate:'2026-02-02',appointmentEndDate:'2026-01-01'}]})).toThrow('پیش از شروع');
    expect(()=>normalizeLegalEntityProfileInput({displayName:'شرکت کاملاً آزمایشی DUPLICATE',officers:[{displayName:'مدیرعامل کاملاً ساختگی A',role:'chief_executive'},{displayName:'مدیرعامل کاملاً ساختگی B',role:'chief_executive'}]})).toThrow('فقط یک فرد');
    expect(()=>normalizeLegalEntityProfileInput({displayName:'نام واقعی شرکت آزمایشی',registeredAddress:'نشانی واقعی کاربر'})).toThrow('الگوی رزروشده');
    expect(()=>normalizeLegalEntityProfileInput({displayName:'شرکت کاملاً آزمایشی ADDRESS',registeredAddress:'نشانی واقعی کاربر'})).toThrow('نشانی‌های ساختگی');
    expect(()=>normalizeLegalEntityProfileInput({displayName:'شرکت کاملاً آزمایشی IDS',nationalIdentifier:'14000000000'})).toThrow('رقم‌های تکراری');
  });
  it('rejects the same existing officer id twice',()=>{expect(()=>normalizeLegalEntityProfileInput({displayName:'شرکت کاملاً آزمایشی OFFICER-ID',officers:[{id:'officer-1',displayName:'مدیرعامل کاملاً ساختگی A',role:'chief_executive'},{id:'officer-1',displayName:'رئیس کاملاً ساختگی B',role:'board_chair'}]})).toThrow('بیش از یک‌بار');});
});
