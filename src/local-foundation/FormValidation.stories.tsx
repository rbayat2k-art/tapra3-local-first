import type {Meta, StoryObj} from '@storybook/react-vite';
import {FormValidationSummary, OptionalLabel, RequiredLabel, SystemLabel} from './FormValidation';

const meta = {
  title: 'Local Foundation/Form validation',
  component: FormValidationSummary,
  parameters: {
    docs: {
      description: {
        component: 'الگوهای فعال وضعیت فیلد و خلاصه خطا در فرم‌های Local Foundation.',
      },
    },
  },
} satisfies Meta<typeof FormValidationSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ValidationErrors: Story = {
  args: {
    errors: [
      'فیلد «نام و نام خانوادگی» الزامی است.',
      'شماره همراه باید ۱۱ رقم و با 09 شروع شود.',
    ],
  },
};

export const FieldLabels: Story = {
  args: {errors: []},
  render: () => (
    <div className="form-grid" style={{width: 520}}>
      <label className="field"><RequiredLabel>نام و نام خانوادگی</RequiredLabel><input placeholder="مثال: ایلیا بیات" /></label>
      <label className="field"><OptionalLabel>توضیحات</OptionalLabel><input placeholder="اختیاری" /></label>
      <label className="field"><SystemLabel>کد رهگیری</SystemLabel><input value="REQ-1405-001" readOnly /></label>
    </div>
  ),
};
