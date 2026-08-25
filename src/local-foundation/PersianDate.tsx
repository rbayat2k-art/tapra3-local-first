import {useCallback, useEffect, useRef} from 'react';
import DatePicker, {type DateObject, type DatePickerRef} from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persianEn from 'react-date-object/locales/persian_en';
import {useRecordDialogPortal} from './recordDialogPortal';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string): Date {
  return DATE_ONLY.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
}

export function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayIsoDate(): string {
  return toIsoDate(new Date());
}

export function formatPersianDate(value?: string): string {
  if (!value) return 'ثبت نشده';
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit', calendar: 'persian',
  }).format(date);
}

export function formatPersianDateTime(value?: string): string {
  if (!value) return 'ثبت نشده';
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', calendar: 'persian',
  }).format(date);
}

interface PersianDateInputProps {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  ariaLabel?: string;
  min?: string;
}

export function PersianDateInput({value = '', onChange, disabled = false, required = false, invalid = false, ariaLabel = 'انتخاب تاریخ شمسی', min}: PersianDateInputProps) {
  const pickerValue = value && !Number.isNaN(parseDate(value).getTime()) ? parseDate(value) : null;
  const pickerRef = useRef<DatePickerRef>(null);
  const calendarOpenRef = useRef(false);
  const unregisterOverlayRef = useRef<(() => void) | null>(null);
  const dialogPortal = useRecordDialogPortal();
  const closeCalendar = useCallback(() => {
    pickerRef.current?.closeCalendar();
    requestAnimationFrame(() => pickerRef.current?.querySelector<HTMLElement>('input')?.focus());
  }, []);
  useEffect(() => {
    const closeCalendarBeforeParentDialog = (event: KeyboardEvent) => {
      const calendarVisible = pickerRef.current?.isOpen;
      if (event.key !== 'Escape' || (!calendarOpenRef.current && !calendarVisible)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeCalendar();
    };
    window.addEventListener('keydown', closeCalendarBeforeParentDialog, true);
    return () => {
      window.removeEventListener('keydown', closeCalendarBeforeParentDialog, true);
      unregisterOverlayRef.current?.();
    };
  }, [closeCalendar, dialogPortal?.portalTarget]);
  return <DatePicker
    ref={pickerRef}
    value={pickerValue}
    onChange={(selected: DateObject | null) => onChange(selected ? toIsoDate(selected.toDate()) : '')}
    calendar={persian}
    locale={persianEn}
    format="YYYY/MM/DD"
    calendarPosition="bottom-right"
    minDate={min && !Number.isNaN(parseDate(min).getTime()) ? parseDate(min) : undefined}
    containerClassName="persian-date-container"
    inputClass="persian-date-input"
    className="tapra-persian-calendar"
    placeholder="1403/01/01"
    disabled={disabled}
    editable={!disabled}
    portal
    portalTarget={dialogPortal?.portalTarget}
    onOpen={() => {
      calendarOpenRef.current = true;
      unregisterOverlayRef.current?.();
      unregisterOverlayRef.current = dialogPortal?.registerOverlay(closeCalendar) ?? null;
    }}
    onClose={() => {
      calendarOpenRef.current = false;
      unregisterOverlayRef.current?.();
      unregisterOverlayRef.current = null;
    }}
    aria-label={ariaLabel}
    aria-required={required}
    aria-invalid={invalid}
  />;
}
