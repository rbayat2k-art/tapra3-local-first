import React from 'react';
import { Loader2, AlertTriangle, Inbox as InboxIcon, type LucideIcon } from 'lucide-react';

// ============================================================
// Shared Presentation Primitives (مأموریت بازطراحی UI Foundation، مرحلهٔ ۲) — فقط Primitiveهایی
// که واقعاً در حداقل دو صفحه استفاده می‌شوند اینجا هستند؛ هیچ‌کدام رفتار/State/Handler ندارند،
// فقط Props دریافت و رندر می‌کنند. همه از Design Token های معنایی (index.css) استفاده می‌کنند،
// نه رنگ خام Tailwind — تا با Accent/Theme واقعی هماهنگ بمانند.
// ============================================================

type ButtonVariant = 'primary' | 'secondary' | 'danger';
type ButtonSize = 'sm' | 'md';

interface ButtonBaseProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  size?: ButtonSize;
  className?: string;
  children?: React.ReactNode;
}

const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white shadow-sm',
  secondary: 'bg-[var(--surface-muted)] hover:bg-[var(--border)] text-[var(--text-primary)]',
  danger: 'bg-[var(--danger)] hover:opacity-90 text-white shadow-sm'
};

function ButtonBase({ variant, icon: Icon, size = 'md', className = '', children, ...rest }: ButtonBaseProps & { variant: ButtonVariant }) {
  const sizeClasses = size === 'sm' ? 'px-3 py-1.5 text-[12px]' : 'px-4 py-2 text-[13px]';
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-bold transition active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${sizeClasses} ${BUTTON_VARIANT_CLASSES[variant]} ${className}`}
    >
      {Icon && <Icon className="w-4 h-4 shrink-0" />}
      {children}
    </button>
  );
}

export const PrimaryButton: React.FC<ButtonBaseProps> = (props) => <ButtonBase variant="primary" {...props} />;
export const SecondaryButton: React.FC<ButtonBaseProps> = (props) => <ButtonBase variant="secondary" {...props} />;
export const DangerButton: React.FC<ButtonBaseProps> = (props) => <ButtonBase variant="danger" {...props} />;

export const IconButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; tone?: 'neutral' | 'danger' }> = ({
  icon: Icon, label, tone = 'neutral', className = '', ...rest
}) => (
  <button
    {...rest}
    title={label}
    aria-label={label}
    className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
      tone === 'danger' ? 'text-[var(--danger)] hover:bg-[var(--danger-soft)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
    } ${className}`}
  >
    <Icon className="w-4 h-4" />
  </button>
);

// ------------------------------------------------------------
// StatusBadge — وضعیت هرگز فقط با رنگ منتقل نمی‌شود؛ همیشه متن دارد (بند ۸ مأموریت).
// ------------------------------------------------------------
export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-[var(--surface-muted)] text-[var(--text-secondary)]',
  success: 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)]',
  warning: 'bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)]',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)]',
  info: 'bg-[color-mix(in_srgb,var(--info)_15%,transparent)] text-[var(--info)]'
};

export const StatusBadge: React.FC<{ label: string; tone: StatusTone; icon?: LucideIcon; className?: string }> = ({ label, tone, icon: Icon, className = '' }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_TONE_CLASSES[tone]} ${className}`}>
    {Icon && <Icon className="w-3 h-3" />}
    {label}
  </span>
);

// ------------------------------------------------------------
// SectionCard — جایگزین rounded-3xl/rounded-2xl پراکنده؛ Radius یکپارچه (14px)، Shadow ملایم.
// ------------------------------------------------------------
export const SectionCard: React.FC<{ title?: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; noPadding?: boolean }> = ({
  title, description, actions, children, className = '', noPadding = false
}) => (
  <div className={`bg-[var(--surface)] border border-[var(--border)] rounded-[14px] shadow-sm ${className}`}>
    {(title || actions) && (
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
        <div className="min-w-0">
          {title && <h3 className="text-[13.5px] font-extrabold text-[var(--text-primary)] truncate">{title}</h3>}
          {description && <p className="text-[11.5px] text-[var(--text-muted)] mt-0.5">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    )}
    <div className={noPadding ? '' : 'p-4'}>{children}</div>
  </div>
);

// ------------------------------------------------------------
// PageHeader — عنوان صفحه/Toolbar یکپارچه — جایگزین بنرهای rounded-3xl gradient پراکنده.
// ------------------------------------------------------------
export const PageHeader: React.FC<{ icon?: LucideIcon; title: string; description?: string; actions?: React.ReactNode; badge?: string }> = ({
  icon: Icon, title, description, actions, badge
}) => (
  <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 bg-[var(--surface)] border border-[var(--border)] rounded-[14px]">
    <div className="flex items-center gap-3 min-w-0">
      {Icon && (
        <div className="w-10 h-10 rounded-xl bg-[var(--primary-soft)] text-[var(--primary)] flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-[15px] font-extrabold text-[var(--text-primary)] truncate">{title}</h2>
          {badge && <StatusBadge label={badge} tone="info" />}
        </div>
        {description && <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{description}</p>}
      </div>
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

// ------------------------------------------------------------
// PageToolbar — ردیف Search/Filter/Actions ثابت بالای جدول‌ها.
// ------------------------------------------------------------
export const PageToolbar: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`flex flex-wrap items-center gap-2 ${className}`}>{children}</div>
);

// ------------------------------------------------------------
// Empty / Loading / Error States — ظاهر یکسان در همهٔ صفحات (بند ۱۰ مأموریت).
// ------------------------------------------------------------
export const EmptyState: React.FC<{ icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode }> = ({
  icon: Icon = InboxIcon, title, description, action
}) => (
  <div className="flex flex-col items-center justify-center text-center py-10 px-4 gap-2">
    <div className="w-12 h-12 rounded-2xl bg-[var(--surface-muted)] text-[var(--text-muted)] flex items-center justify-center mb-1">
      <Icon className="w-6 h-6" />
    </div>
    <p className="text-[13px] font-bold text-[var(--text-primary)]">{title}</p>
    {description && <p className="text-[12px] text-[var(--text-muted)] max-w-sm">{description}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

export const LoadingState: React.FC<{ label?: string }> = ({ label = 'در حال بارگذاری...' }) => (
  <div className="flex flex-col items-center justify-center text-center py-10 gap-2 text-[var(--text-muted)]">
    <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
    <p className="text-[12px] font-bold">{label}</p>
  </div>
);

export const ErrorState: React.FC<{ title?: string; description?: string; action?: React.ReactNode }> = ({
  title = 'خطایی رخ داد', description, action
}) => (
  <div className="flex flex-col items-center justify-center text-center py-10 px-4 gap-2">
    <div className="w-12 h-12 rounded-2xl bg-[var(--danger-soft)] text-[var(--danger)] flex items-center justify-center mb-1">
      <AlertTriangle className="w-6 h-6" />
    </div>
    <p className="text-[13px] font-bold text-[var(--text-primary)]">{title}</p>
    {description && <p className="text-[12px] text-[var(--text-muted)] max-w-sm">{description}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);
