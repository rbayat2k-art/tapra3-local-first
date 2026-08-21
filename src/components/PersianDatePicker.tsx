import React from 'react';
import DatePicker, { DateObject } from 'react-multi-date-picker';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import { CalendarDays } from 'lucide-react';
import 'react-multi-date-picker/styles/colors/teal.css';

interface PersianDatePickerProps {
  value: string; // e.g. "1404/05/20", empty string if unset
  onChange: (value: string) => void;
  placeholder?: string;
}

// A calendar-only Jalali date picker (typing is disabled on purpose) so a value
// like "1405/50/20" (an impossible month) can never be entered by mistake.
export const PersianDatePicker: React.FC<PersianDatePickerProps> = ({ value, onChange, placeholder }) => {
  return (
    <div className="relative">
      <DatePicker
        calendar={persian}
        locale={persian_fa}
        value={value || undefined}
        onChange={(date) => {
          if (!date) { onChange(''); return; }
          const d = Array.isArray(date) ? date[0] : (date as DateObject);
          onChange(d ? d.format('YYYY/MM/DD') : '');
        }}
        editable={false}
        format="YYYY/MM/DD"
        placeholder={placeholder || 'انتخاب تاریخ'}
        inputClass="w-full bg-slate-800 border border-slate-700 rounded-xl pr-3 pl-9 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
        containerClassName="w-full"
      />
      <CalendarDays className="w-3.5 h-3.5 text-indigo-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
};
