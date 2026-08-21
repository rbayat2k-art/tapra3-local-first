import {CircleAlert} from 'lucide-react';
import type {ReactNode} from 'react';

export interface RequiredFieldCheck {
  label: string;
  value: unknown;
  valid?: (value: unknown) => boolean;
  message?: string;
}

export function validateRequired(fields: RequiredFieldCheck[]): string[] {
  return fields.flatMap((field) => {
    const filled = field.valid
      ? field.valid(field.value)
      : Array.isArray(field.value)
        ? field.value.length > 0
        : typeof field.value === 'string'
          ? field.value.trim().length > 0
          : field.value !== undefined && field.value !== null && field.value !== false;
    return filled ? [] : [field.message ?? `فیلد «${field.label}» الزامی است؛ لطفاً آن را تکمیل کنید.`];
  });
}

export function RequiredLabel({children}: {children: ReactNode}) {
  return <span className="field-label-status required-label"><span>{children}<i aria-hidden="true">*</i></span><em>الزامی</em></span>;
}

export function OptionalLabel({children}: {children: ReactNode}) {
  return <span className="field-label-status optional-label"><span>{children}</span><em>اختیاری</em></span>;
}

export function SystemLabel({children}: {children: ReactNode}) {
  return <span className="field-label-status system-label"><span>{children}</span><em>تولید خودکار</em></span>;
}

export function FormValidationSummary({errors}: {errors: string[]}) {
  if (!errors.length) return null;
  return <div className="form-validation-summary" role="alert" aria-live="assertive">
    <CircleAlert size={20} />
    <div><strong>فرم کامل نیست</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>
  </div>;
}
