import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {PersianDateInput, formatPersianDate} from './PersianDate';

function DateExample({disabled = false, invalid = false}: {disabled?: boolean; invalid?: boolean}) {
  const [value, setValue] = useState('2025-03-20');
  return <label className="field" style={{width: 320}}><span>تاریخ شروع</span><PersianDateInput value={value} onChange={setValue} disabled={disabled} invalid={invalid} ariaLabel="تاریخ شروع" /><small>ذخیره ISO: <b dir="ltr">{value}</b> · نمایش: {formatPersianDate(value)}</small></label>;
}

const meta = {
  title: 'Local Foundation/Persian date',
  component: PersianDateInput,
  parameters: {
    docs: {
      description: {
        component: 'ورودی تاریخ فعال پروژه: نمایش شمسی با ذخیره تاریخ ISO.',
      },
    },
  },
} satisfies Meta<typeof PersianDateInput>;

export default meta;
type Story = StoryObj<typeof meta>;

const requiredArgs = {onChange: () => undefined};

export const Interactive: Story = {args: requiredArgs, render: () => <DateExample />};
export const Invalid: Story = {args: requiredArgs, render: () => <DateExample invalid />};
export const Disabled: Story = {args: requiredArgs, render: () => <DateExample disabled />};
