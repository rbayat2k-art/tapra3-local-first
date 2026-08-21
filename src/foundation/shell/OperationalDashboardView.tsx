import { Building2, CheckCircle2, CircleAlert, LayoutGrid } from 'lucide-react';
import { getVisibleNavItems, type NavVisibilityContext } from '../../config/navigationRegistry';
import type { FoundationMembership } from '../api/contracts';
import { useFoundationSession } from '../auth/FoundationSessionContext';

interface OperationalDashboardViewProps {
  onNavigate(tabId: string, label?: string): void;
}

export function buildOperationalDashboardModel(active: FoundationMembership) {
  const visibility: NavVisibilityContext = {
    currentUser: null,
    effectivePermissions: [],
    isAdmin: false,
    foundationPermissions: active.permissions,
    activeCompanyId: active.company?.id ?? null,
  };
  return {
    contextLabel: active.company?.name ?? 'نمای کل مجموعه',
    needsCompanySelection: !active.company,
    metricState: 'UNAVAILABLE' as const,
    available: getVisibleNavItems(visibility).filter((item) => item.id !== 'dashboard'),
  };
}

export function OperationalDashboardView({ onNavigate }: OperationalDashboardViewProps) {
  const { session } = useFoundationSession();
  const active = session?.activeContext;
  if (!session || !active) return null;

  const model = buildOperationalDashboardModel(active);

  return (
    <div className="space-y-5 sm:space-y-6" dir="rtl">
      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-bold text-[var(--primary)]">
              <LayoutGrid className="h-4 w-4" />
              میز کار عملیاتی
            </div>
            <h2 className="text-xl font-black text-[var(--text-primary)] sm:text-2xl">
              خوش آمدید، {session.user.fullName}
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
              {active.company
                ? `اطلاعات و عملیات قابل مشاهده شما به شرکت «${active.company.name}» محدود است.`
                : `اکنون نمای کل مجموعه «${active.workspace.name}» فعال است.`}
            </p>
          </div>
          <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
            <Building2 className="h-5 w-5 shrink-0 text-[var(--primary)]" />
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-[var(--text-primary)]">{active.workspace.name}</p>
              <p className="truncate text-[11px] text-[var(--text-muted)]">{model.contextLabel}</p>
            </div>
          </div>
        </div>
      </section>

      {model.needsCompanySelection && (
        <section className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-100">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h3 className="text-sm font-black">برای عملیات وابسته به شرکت، یک شرکت را انتخاب کنید</h3>
            <p className="mt-1 text-xs leading-6 opacity-90">صف فروش، مشتریان، سرنخ‌ها و فاکتورها تا انتخاب شرکت باز نمی‌شوند و هیچ درخواست بی‌زمینه‌ای ارسال نخواهد شد.</p>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-[var(--success)]" />
          <div>
            <h3 className="text-sm font-black text-[var(--text-primary)]">قابلیت‌های عملیاتی در دسترس</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">این فهرست فقط از دسترسی فعال و قابلیت‌های متصل به سامانه ساخته می‌شود.</p>
          </div>
        </div>
        {model.available.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {model.available.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id, item.label)}
                className="flex min-h-20 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-right transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                <item.icon className="h-5 w-5 shrink-0 text-[var(--primary)]" />
                <span className="text-sm font-bold text-[var(--text-primary)]">{item.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-6 text-center text-sm text-[var(--text-secondary)]">
            برای این دسترسی، قابلیت عملیاتی دیگری در این محیط تعریف نشده است.
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-xs leading-6 text-[var(--text-secondary)]">
        آمار تجمیعی این داشبورد هنوز از منبع سروری معتبر دریافت نمی‌شود؛ بنابراین برای جلوگیری از نمایش اطلاعات قدیمی یا مربوط به شرکت دیگر، عدد ساختگی نمایش داده نمی‌شود.
      </section>
    </div>
  );
}
