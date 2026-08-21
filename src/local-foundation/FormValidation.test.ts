import {describe, expect, it} from 'vitest';
import {validateRequired} from './FormValidation';

describe('required field validation', () => {
  it('returns a precise Persian message for each empty required field', () => {
    expect(validateRequired([
      {label: 'نام شعبه', value: ''},
      {label: 'نقش‌های دسترسی', value: []},
    ])).toEqual([
      'فیلد «نام شعبه» الزامی است؛ لطفاً آن را تکمیل کنید.',
      'فیلد «نقش‌های دسترسی» الزامی است؛ لطفاً آن را تکمیل کنید.',
    ]);
  });

  it('supports domain-specific rules and messages', () => {
    expect(validateRequired([{
      label: 'رمز عبور',
      value: '123',
      valid: (value) => String(value).length >= 8,
      message: 'رمز عبور باید حداقل ۸ نویسه داشته باشد.',
    }])).toEqual(['رمز عبور باید حداقل ۸ نویسه داشته باشد.']);
  });
});
